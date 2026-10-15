// Casos de seguimiento: un caso = un niño con alertas abiertas (análisis del flujo operativo, F3).
// El contacto se registra una vez por niño; la asignación define "Mis casos"; el escalamiento sale de los intentos.
const router = require('express').Router();
const { SQL_TERRITORIO, soloSuSector } = require('../territorio');
router.param('ninoId', soloSuSector('ninoId'));
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS, OPERATIVOS } = require('../middleware/auth');
const esq = require('../servicios/esquema');
const { calcularEsquema } = require('../motor/motorEsquema');
const fecha = require('../fecha');

const GRAVEDAD = ['dosis_cero', 'abandono', 'atrasada', 'inasistencia', 'proxima'];

// Bandeja agrupada por niño, con escalamiento calculado
router.get('/', permitir(...TODOS), async (req, res) => {
  const { tipo, comunidad, prioridad, asignado } = req.query;
  const params = await esq.cargarParametros(pool);
  const intentosEscalar = Number(params.intentos_escalamiento) || 3;
  let { rows } = await pool.query(`
    SELECT a.id, a.nino_id, a.tipo, a.prioridad, a.estado, a.fecha_generada, a.esquema_dosis_id, d.etiqueta,
           n.nombre_completo, n.fecha_nacimiento, n.sexo, n.fila, c.id AS comunidad_id, c.nombre AS comunidad, s.nombre AS sector,
           cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio,
           r.nombre_completo AS responsable, r.telefono, r.idioma_preferente,
           ca.usuario_id AS asignado_id, ua.nombre AS asignado_nombre
    FROM alerta a JOIN nino n ON n.id = a.nino_id JOIN comunidad c ON c.id = n.comunidad_id
    LEFT JOIN sector s ON s.id = c.sector_id LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id
    LEFT JOIN esquema_dosis d ON d.id = a.esquema_dosis_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
    LEFT JOIN caso_asignacion ca ON ca.nino_id = n.id LEFT JOIN usuario ua ON ua.id = ca.usuario_id
    WHERE a.estado IN ('abierta','en_seguimiento')
      AND ($1::text IS NULL OR a.nino_id IN (SELECT nino_id FROM alerta WHERE tipo = $1 AND estado IN ('abierta','en_seguimiento')))
      AND ($2::int IS NULL OR n.comunidad_id = $2)
      AND ($3::text IS NULL OR a.nino_id IN (SELECT nino_id FROM alerta WHERE prioridad = $3 AND estado IN ('abierta','en_seguimiento')))
      AND ($4::int IS NULL OR ca.usuario_id = $4)
    ORDER BY n.id, d.orden NULLS LAST`,
    [tipo || null, comunidad || null, prioridad || null, asignado === 'yo' ? req.usuario.id : asignado ? Number(asignado) : null]);

  // El personal de un puesto o barrio solo ve su sector y los niños que le asignaron
  const alcance = await require('../territorio').alcanceDe(pool, req.usuario);
  if (alcance) { const sector = new Set(alcance); rows = rows.filter((r) => sector.has(r.comunidad_id)); }
  // Historial de contactos de los niños de la bandeja (para escalamiento y último contacto)
  const ids = [...new Set(rows.map((r) => r.nino_id))];
  const { rows: contactos } = ids.length ? await pool.query(`
    SELECT s.nino_id, s.fecha, s.medio, s.resultado, s.fecha_compromiso FROM seguimiento s
    WHERE s.nino_id = ANY($1) ORDER BY s.fecha DESC, s.id DESC`, [ids]) : { rows: [] };

  const casos = new Map();
  for (const r of rows) {
    if (!casos.has(r.nino_id)) {
      casos.set(r.nino_id, {
        nino_id: r.nino_id, nombre_completo: r.nombre_completo, fecha_nacimiento: r.fecha_nacimiento, sexo: r.sexo,
        comunidad_id: r.comunidad_id, comunidad: r.comunidad, sector: r.sector, fila: r.fila,
        cuaderno_numero: r.cuaderno_numero, cuaderno_anio: r.cuaderno_anio, responsable: r.responsable, telefono: r.telefono,
        idioma_preferente: r.idioma_preferente, asignado_id: r.asignado_id, asignado_nombre: r.asignado_nombre, alertas: [],
      });
    }
    casos.get(r.nino_id).alertas.push({ id: r.id, tipo: r.tipo, prioridad: r.prioridad, estado: r.estado, etiqueta: r.etiqueta, fecha_generada: r.fecha_generada, esquema_dosis_id: r.esquema_dosis_id });
  }
  const hoy = fecha.hoy();
  const atraso = await atrasoPorNino(pool, [...casos.values()], hoy);
  const lista = [...casos.values()].map((c) => {
    // Cada vacuna lleva su fecha programada: "atrasada desde" es la del carné, no el día en que se generó la alerta
    const porDosis = atraso.get(c.nino_id) || new Map();
    for (const a of c.alertas) Object.assign(a, porDosis.get(a.esquema_dosis_id) || {});
    const vencidas = c.alertas.filter((a) => a.dias_atraso > 0);
    c.alertas.sort((x, y) => GRAVEDAD.indexOf(x.tipo) - GRAVEDAD.indexOf(y.tipo));
    const desde = c.alertas.reduce((m, a) => (a.fecha_generada < m ? a.fecha_generada : m), c.alertas[0].fecha_generada);
    const mios = contactos.filter((s) => s.nino_id === c.nino_id && s.fecha >= desde);
    const noLocalizado = mios.filter((s) => s.resultado === 'no_localizado').length;
    const rechazos = mios.filter((s) => s.resultado === 'rechazo').length;
    const compromiso = mios.find((s) => s.fecha_compromiso)?.fecha_compromiso || null;
    const avisos = [];
    if (compromiso && compromiso < hoy) avisos.push({ tipo: 'compromiso_vencido', texto: 'No llegó en la fecha acordada' });
    if (noLocalizado >= intentosEscalar) avisos.push({ tipo: 'visitar', texto: `${noLocalizado} intentos sin localizar: visitar o pedir apoyo al líder` });
    if (rechazos >= 2) avisos.push({ tipo: 'rechazo', texto: 'Rechazó 2 veces: consejería con la enfermera jefa' });
    return {
      ...c, peor: c.alertas[0].tipo, desde, intentos: mios.length, ultimo_contacto: mios[0] || null, compromiso,
      en_seguimiento: mios.length > 0, avisos,
      atrasado_desde: vencidas.reduce((m, a) => (!m || a.programada < m ? a.programada : m), null),
      dias_atraso: vencidas.reduce((m, a) => Math.max(m, a.dias_atraso), 0),
    };
  }).sort((a, b) => (b.avisos.length > 0) - (a.avisos.length > 0)
    || GRAVEDAD.indexOf(a.peor) - GRAVEDAD.indexOf(b.peor) || b.dias_atraso - a.dias_atraso);
  res.json(lista);
});

/** Fecha programada y días de atraso de cada dosis pendiente, por niño (una sola consulta de aplicaciones). */
async function atrasoPorNino(db, ninos, hoy) {
  if (!ninos.length) return new Map();
  const [catalogo, params] = await Promise.all([esq.cargarCatalogo(db), esq.cargarParametros(db)]);
  const { rows: apps } = await db.query(`
    SELECT ad.nino_id, ad.esquema_dosis_id AS "esquemaDosisId", a.fecha_aplicacion AS fecha, ad.temporada
    FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id
    WHERE ad.nino_id = ANY($1) AND NOT ad.anulada`, [ninos.map((n) => n.nino_id)]);
  const out = new Map();
  for (const n of ninos) {
    const r = calcularEsquema({ fechaNacimiento: n.fecha_nacimiento, aplicaciones: apps.filter((x) => x.nino_id === n.nino_id),
      catalogo, fechaRef: hoy, params });
    out.set(n.nino_id, new Map(r.dosis.filter((d) => d.fechaProgramada)
      .map((d) => [d.esquemaDosisId, { programada: d.fechaProgramada, dias_atraso: d.diasAtraso }])));
  }
  return out;
}

// Cuántos niños hay por contactar (sin contar "próxima dosis", que aún no requiere acción): número del menú
router.get('/conteo', permitir(...TODOS), async (req, res) => {
  const { rows: [r] } = await pool.query(`
    SELECT count(DISTINCT a.nino_id)::int AS total,
           count(DISTINCT a.nino_id) FILTER (WHERE ca.usuario_id = $1 OR n.comunidad_id IN (${SQL_TERRITORIO}))::int AS mios
    FROM alerta a JOIN nino n ON n.id = a.nino_id LEFT JOIN caso_asignacion ca ON ca.nino_id = a.nino_id
    WHERE a.estado IN ('abierta','en_seguimiento') AND a.tipo <> 'proxima'`, [req.usuario.id]);
  res.json(r);
});

router.get('/:ninoId/seguimientos', permitir(...TODOS), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, u.nombre AS usuario FROM seguimiento s JOIN usuario u ON u.id = s.usuario_id
     WHERE s.nino_id = $1 ORDER BY s.fecha DESC, s.id DESC LIMIT 50`, [req.params.ninoId]);
  res.json(rows);
});

// Un contacto con la familia: se guarda una vez y marca en seguimiento todas las alertas abiertas del niño
router.post('/:ninoId/seguimientos', permitir(...OPERATIVOS), async (req, res) => {
  const { medio, resultado, fecha_compromiso, nota, fecha } = req.body || {};
  if (!medio || !resultado) return res.status(400).json({ error: 'Indique cómo se contactó y el resultado.' });
  const s = await transaccion(async (c) => {
    const { rows: abiertas } = await c.query(
      "SELECT id FROM alerta WHERE nino_id = $1 AND estado IN ('abierta','en_seguimiento') ORDER BY id", [req.params.ninoId]);
    if (!abiertas.length) return null;
    const { rows: [s] } = await c.query(
      `INSERT INTO seguimiento (nino_id, alerta_id, fecha, medio, resultado, fecha_compromiso, nota, usuario_id)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.ninoId, abiertas[0].id, fecha || null, medio, resultado, fecha_compromiso || null, nota || null, req.usuario.id]);
    await c.query("UPDATE alerta SET estado = 'en_seguimiento' WHERE nino_id = $1 AND estado = 'abierta'", [req.params.ninoId]);
    await registrarBitacora(c, req, 'crear', 'seguimiento', s.id, null, s);
    return s;
  });
  s ? res.status(201).json(s) : res.status(404).json({ error: 'El niño no tiene casos abiertos.' });
});

// Cerrar todas las alertas del niño sin vacunar (traslado, fallecido, rechazo definitivo): solo enfermera
router.post('/:ninoId/cerrar', permitir('enfermera'), async (req, res) => {
  const { motivo } = req.body || {};
  if (!motivo) return res.status(400).json({ error: 'Indique el motivo de cierre.' });
  const n = await transaccion(async (c) => {
    const { rows } = await c.query(
      `UPDATE alerta SET estado = 'cerrada', fecha_cierre = CURRENT_DATE, motivo_cierre = $2, cerrada_por = $3
       WHERE nino_id = $1 AND estado IN ('abierta','en_seguimiento') RETURNING id`, [req.params.ninoId, motivo, req.usuario.id]);
    if (rows.length) await registrarBitacora(c, req, 'cerrar', 'alerta', rows[0].id, null, { nino_id: req.params.ninoId, alertas: rows.length, motivo });
    await c.query('DELETE FROM caso_asignacion WHERE nino_id = $1', [req.params.ninoId]);
    return rows.length;
  });
  n ? res.json({ cerradas: n }) : res.status(404).json({ error: 'El niño no tiene casos abiertos.' });
});

// Asignar (o quitar, con usuario_id nulo) varios casos a una persona
router.post('/asignar', permitir('enfermera'), async (req, res) => {
  const { nino_ids = [], usuario_id } = req.body || {};
  if (!nino_ids.length) return res.status(400).json({ error: 'Elija al menos un caso.' });
  await transaccion(async (c) => {
    for (const id of nino_ids) {
      if (usuario_id) {
        await c.query(`INSERT INTO caso_asignacion (nino_id, usuario_id, asignado_por) VALUES ($1,$2,$3)
                       ON CONFLICT (nino_id) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, asignado_por = EXCLUDED.asignado_por, asignado_en = now()`,
        [id, usuario_id, req.usuario.id]);
      } else await c.query('DELETE FROM caso_asignacion WHERE nino_id = $1', [id]);
    }
    await registrarBitacora(c, req, 'editar', 'caso_asignacion', usuario_id || 0, null, { nino_ids, usuario_id });
  });
  res.json({ asignados: nino_ids.length });
});

// Personal operativo para asignar casos
router.get('/personal', permitir(...TODOS), async (req, res) => {
  // La Dirección ve a todo el personal; la enfermera encargada, a sí misma y al personal de vacunación (no a otras encargadas)
  const { rows } = await pool.query(
    `SELECT id, nombre, cargo, rol FROM usuario WHERE activo AND (rol = 'vacunador' OR ($1 AND rol = 'enfermera') OR id = $2) ORDER BY nombre`,
    [req.usuario.rol === 'administrador', req.usuario.id]);
  res.json(rows);
});

module.exports = router;
