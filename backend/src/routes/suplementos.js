// Suplementación: vitamina A, micronutrientes espolvoreados y desparasitante.
const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS, OPERATIVOS } = require('../middleware/auth');
const { calcularSuplementos } = require('../motor/suplementos');
const { hoy } = require('../fecha');
const { filtroTerritorio } = require('./seguimiento');

const INSUMO = { VIT_A: 'Vitamina A', MICRO: 'Micronutrientes', DESPARASITANTE: 'Desparasitante' };
const catalogo = async (db) => (await db.query('SELECT * FROM suplemento_dosis WHERE activo ORDER BY orden')).rows;
const entregasDe = async (db, ids) => (ids.length ? (await db.query(
  'SELECT id, nino_id, suplemento_dosis_id, fecha FROM suplementacion WHERE NOT anulada AND nino_id = ANY($1)', [ids])).rows : []);

// Suplementos de un niño: estado de cada dosis e historial
router.get('/nino/:id', permitir(...TODOS), async (req, res) => {
  const { rows: [n] } = await pool.query('SELECT id, fecha_nacimiento FROM nino WHERE id = $1', [req.params.id]);
  if (!n) return res.status(404).json({ error: 'Niño no encontrado.' });
  const [cat, entregas] = [await catalogo(pool), await entregasDe(pool, [n.id])];
  const { rows: historial } = await pool.query(`
    SELECT s.id, s.fecha, d.etiqueta, d.grupo, u.nombre AS registro FROM suplementacion s
    JOIN suplemento_dosis d ON d.id = s.suplemento_dosis_id LEFT JOIN usuario u ON u.id = s.creado_por
    WHERE s.nino_id = $1 AND NOT s.anulada ORDER BY s.fecha DESC`, [n.id]);
  res.json({ dosis: calcularSuplementos({ fechaNacimiento: n.fecha_nacimiento, catalogo: cat, entregas, fechaRef: hoy() }), historial });
});

// Entregar uno o varios suplementos el mismo día
router.post('/nino/:id', permitir(...OPERATIVOS), async (req, res) => {
  const { ids = [], fecha = hoy(), establecimiento_id, jornada_id } = req.body || {};
  if (!ids.length) return res.status(400).json({ error: 'Elija al menos un suplemento.' });
  if (fecha > hoy()) return res.status(400).json({ error: 'La fecha no puede ser futura.' });
  const r = await transaccion(async (c) => {
    const { rows: [n] } = await c.query('SELECT id, fecha_nacimiento FROM nino WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!n) return { status: 404, error: 'Niño no encontrado.' };
    const cat = await catalogo(c);
    const estados = calcularSuplementos({ fechaNacimiento: n.fecha_nacimiento, catalogo: cat, entregas: await entregasDe(c, [n.id]), fechaRef: fecha });
    const guardadas = [];
    for (const id of ids.map(Number)) {
      const e = estados.find((x) => x.id === id);
      if (!e) return { status: 400, error: 'Suplemento no válido.' };
      if (e.estado === 'aplicada') return { status: 409, error: `${e.etiqueta} ya está registrado.` };
      if (e.estado !== 'le_toca') {
        return { status: 422, error: e.estado === 'en_espera' ? `Primero se registra la dosis anterior de ${e.etiqueta.replace(/ 2a$/, '')}.`
          : `${e.etiqueta} no corresponde a la edad del niño en esa fecha${e.programada ? ` (desde el ${e.programada.split('-').reverse().join('/')})` : ''}.` };
      }
      const { rows: [s] } = await c.query(`INSERT INTO suplementacion (nino_id, suplemento_dosis_id, fecha, establecimiento_id, jornada_id, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [n.id, id, fecha, establecimiento_id || null, jornada_id || null, req.usuario.id]);
      await registrarBitacora(c, req, 'crear', 'suplementacion', s.id, null, s);
      guardadas.push(e.etiqueta);
    }
    return { status: 201, guardadas };
  });
  res.status(r.status).json(r.error ? { error: r.error } : { guardadas: r.guardadas });
});

router.post('/:id/anular', permitir('enfermera'), async (req, res) => {
  const { motivo } = req.body || {};
  if (!motivo) return res.status(400).json({ error: 'Indique el motivo de la anulación.' });
  const { rows: [s] } = await pool.query(
    'UPDATE suplementacion SET anulada = true, motivo_anulacion = $2 WHERE id = $1 AND NOT anulada RETURNING *', [req.params.id, motivo]);
  if (!s) return res.status(404).json({ error: 'Registro no encontrado.' });
  await registrarBitacora(pool, req, 'anular', 'suplementacion', s.id, null, s);
  res.json({ ok: true });
});

// Control del mes: a quién le toca un suplemento este mes (para llamar), quiénes lo recibieron y cuánto pedir
router.get('/mes', permitir(...TODOS), async (req, res) => {
  const anio = Number(req.query.anio) || Number(hoy().slice(0, 4));
  const mes = Number(req.query.mes) || Number(hoy().slice(5, 7));
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const corte = hasta < hoy() ? hasta : hoy();
  const comunidades = await filtroTerritorio(pool, req.query);
  const { rows: ninos } = await pool.query(`
    SELECT n.id, n.nombre_completo, n.fecha_nacimiento, n.comunidad_id, c.nombre AS comunidad, r.nombre_completo AS responsable, r.telefono
    FROM nino n JOIN comunidad c ON c.id = n.comunidad_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE n.estado = 'activo' AND n.fecha_nacimiento > $1::date - 1095 AND ($2::int[] IS NULL OR n.comunidad_id = ANY($2))`, [hasta, comunidades]);
  const cat = await catalogo(pool);
  const entregas = await entregasDe(pool, ninos.map((n) => n.id));
  const pendientes = [];
  const porInsumo = {};
  for (const n of ninos) {
    const mias = entregas.filter((e) => e.nino_id === n.id && e.fecha <= corte);
    const estados = calcularSuplementos({ fechaNacimiento: n.fecha_nacimiento, catalogo: cat, entregas: mias, fechaRef: corte });
    // Le toca en el mes: ya le correspondía o le corresponde antes de que termine el mes
    const toca = estados.filter((e) => ['le_toca', 'proxima', 'pendiente'].includes(e.estado) && e.programada <= hasta);
    if (!toca.length) continue;
    for (const e of toca) porInsumo[e.insumo] = (porInsumo[e.insumo] || 0) + 1;
    pendientes.push({ ...n, suplementos: toca.map((e) => ({ id: e.id, etiqueta: e.etiqueta, insumo: e.insumo, programada: e.programada, estado: e.estado })) });
  }
  pendientes.sort((a, b) => a.comunidad.localeCompare(b.comunidad) || a.nombre_completo.localeCompare(b.nombre_completo));
  const { rows: entregados } = await pool.query(`
    SELECT s.fecha, n.id AS nino_id, n.nombre_completo, c.nombre AS comunidad, d.etiqueta, d.insumo FROM suplementacion s
    JOIN nino n ON n.id = s.nino_id JOIN comunidad c ON c.id = n.comunidad_id JOIN suplemento_dosis d ON d.id = s.suplemento_dosis_id
    WHERE NOT s.anulada AND s.fecha BETWEEN $1 AND $2 AND ($3::int[] IS NULL OR n.comunidad_id = ANY($3))
    ORDER BY s.fecha DESC, c.nombre, n.nombre_completo`, [desde, hasta, comunidades]);
  res.json({ anio, mes, pendientes, entregados, insumos: Object.entries(INSUMO).map(([k, nombre]) => ({ insumo: k, nombre, pendientes: porInsumo[k] || 0,
    entregados: entregados.filter((e) => e.insumo === k).length })) });
});

module.exports = router;
