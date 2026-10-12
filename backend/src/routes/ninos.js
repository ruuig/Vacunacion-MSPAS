const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS, OPERATIVOS } = require('../middleware/auth');
const {
  validarAplicacion, dosisQueCumpleProducto, esRecuperacion, grupoInfluenza, mesesEntre, temporadaDe,
} = require('../motor/motorEsquema');
const esq = require('../servicios/esquema');
const { guardarResponsable } = require('./responsables');

const NOMBRES = ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido'];
const CAMPOS_NINO = [...NOMBRES, 'cuaderno_id', 'fila', 'cui', 'fecha_nacimiento', 'nacimiento_departamento',
  'nacimiento_municipio', 'nacimiento_comunidad', 'sexo', 'pueblo', 'comunidad_linguistica', 'nombre_padre',
  'numero_registro_carne', 'fecha_registro_carne'];
const { hoy } = require('../fecha');

const MOTIVOS_NO_APLICADA = ['contraindicacion', 'desabastecimiento', 'rechazo', 'falsa_contraindicacion', 'posterga_personal', 'otro'];

/** Visita del niño al servicio (niño, fecha, lugar y jornada): la reutiliza si ya existe ese día. */
async function obtenerVisita(c, { ninoId, fecha, establecimientoId, jornadaId, usuarioId, tipo }) {
  const { rows: [v] } = await c.query(
    `SELECT * FROM visita WHERE nino_id = $1 AND fecha = $2 AND establecimiento_id IS NOT DISTINCT FROM $3
       AND jornada_id IS NOT DISTINCT FROM $4 ORDER BY id LIMIT 1`, [ninoId, fecha, establecimientoId || null, jornadaId || null]);
  if (v) {
    if (tipo === 'vacunacion' && v.tipo !== 'vacunacion') await c.query("UPDATE visita SET tipo = 'vacunacion' WHERE id = $1", [v.id]);
    return v;
  }
  const { rows: [nueva] } = await c.query(
    'INSERT INTO visita (nino_id, fecha, establecimiento_id, jornada_id, usuario_id, tipo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [ninoId, fecha, establecimientoId || null, jornadaId || null, usuarioId, tipo]);
  return nueva;
}

/** Limpia los datos del niño: vacíos a null, nombres en mayúsculas, lingüística 23 si no es maya. */
function normalizarNino(datos, campos) {
  const o = {};
  for (const k of campos) if (datos[k] !== undefined) o[k] = datos[k] === '' ? null : datos[k];
  for (const k of NOMBRES) if (o[k]) o[k] = o[k].trim().toUpperCase();
  if (o.pueblo != null && Number(o.pueblo) !== 2) o.comunidad_linguistica = 23;
  if ((o.cuaderno_id == null) !== (o.fila == null)) { o.cuaderno_id = null; o.fila = null; }
  return o;
}

const insertar = (tabla, o) => [
  `INSERT INTO ${tabla} (${Object.keys(o)}) VALUES (${Object.keys(o).map((_, i) => '$' + (i + 1))}) RETURNING *`,
  Object.values(o)];

// Búsqueda: nombre del niño o del responsable (aproximada), CUI de cualquiera, No. de registro del carné o fecha
router.get('/', permitir(...TODOS), async (req, res) => {
  const { q = '', comunidad, estado } = req.query;
  const { rows } = await pool.query(`
    SELECT n.id, n.nombre_completo, n.cui, n.fecha_nacimiento, n.estado, n.fila, c.nombre AS comunidad,
           cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio, r.nombre_completo AS responsable,
           GREATEST(similarity(f_unaccent(n.nombre_completo), f_unaccent($1)),
                    similarity(f_unaccent(coalesce(r.nombre_completo, '')), f_unaccent($1))) AS sim
    FROM nino n JOIN comunidad c ON c.id = n.comunidad_id
    LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal
    LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE ($1 = '' OR n.cui = $1 OR r.cui = $1 OR n.numero_registro_carne = $1 OR n.fecha_nacimiento::text = $1
           OR f_unaccent(n.nombre_completo) % f_unaccent($1) OR f_unaccent(n.nombre_completo) ILIKE '%' || f_unaccent($1) || '%'
           OR f_unaccent(r.nombre_completo) % f_unaccent($1) OR f_unaccent(r.nombre_completo) ILIKE '%' || f_unaccent($1) || '%')
      AND ($2::int IS NULL OR n.comunidad_id = $2) AND ($3::text IS NULL OR n.estado = $3)
    ORDER BY sim DESC, n.primer_apellido LIMIT 50`, [q.trim().toUpperCase(), comunidad || null, estado || null]);
  res.json(rows);
});

// Duplicados: mismo CUI; o nombre aproximado con la misma fecha; o mismo responsable con un niño de fecha cercana
router.get('/duplicados', permitir(...TODOS), async (req, res) => {
  const { nombre = '', fechaNac, cui, cuiResponsable } = req.query;
  const { rows } = await pool.query(`
    SELECT DISTINCT n.id, n.nombre_completo, n.fecha_nacimiento, n.fila, c.nombre AS comunidad,
           cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio
    FROM nino n JOIN comunidad c ON c.id = n.comunidad_id
    LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE ($3::text IS NOT NULL AND n.cui = $3)
       OR (f_unaccent(n.nombre_completo) % f_unaccent($1) AND n.fecha_nacimiento = $2::date)
       OR ($4::text IS NOT NULL AND r.cui = $4 AND abs(n.fecha_nacimiento - $2::date) <= 60)
    LIMIT 10`, [nombre.toUpperCase(), fechaNac || null, cui || null, cuiResponsable || null]);
  res.json(rows);
});

// Registrar niño con su responsable principal (páginas 1 y 2 del 5a)
router.post('/', permitir(...OPERATIVOS), async (req, res) => {
  const { responsable, parentesco, ...datos } = req.body || {};
  if (!responsable) return res.status(400).json({ error: 'Faltan los datos de la madre, padre o responsable.' });
  if (!['madre', 'padre', 'otro'].includes(parentesco)) return res.status(400).json({ error: 'Indique el parentesco.' });
  if (datos.fecha_nacimiento && mesesEntre(datos.fecha_nacimiento, hoy()) >= 84)
    return res.status(400).json({ error: 'El cuaderno SIGSA 5a registra niñas y niños menores de 7 años.' });

  const nino = await transaccion(async (c) => {
    const r = await guardarResponsable(c, req, responsable);
    const o = { ...normalizarNino(datos, CAMPOS_NINO), comunidad_id: r.comunidad_id, creado_por: req.usuario.id };
    const { rows: [n] } = await c.query(...insertar('nino', o));
    await c.query('INSERT INTO nino_responsable (nino_id, responsable_id, parentesco, es_principal) VALUES ($1,$2,$3,true)',
      [n.id, r.id, parentesco]);
    await registrarBitacora(c, req, 'crear', 'nino', n.id, null, n);
    await esq.sincronizarAlertas(c, n);
    return n;
  });
  res.status(201).json(nino);
});

// Ficha: datos, responsables, cuaderno, celdas del cuaderno, historial y alertas
// Niños activos con próxima cita entre dos fechas (calculada por el motor), por comunidad
router.get('/citas', permitir(...TODOS), async (req, res) => {
  const { desde = hoy(), hasta, comunidad } = req.query;
  if (!hasta) return res.status(400).json({ error: 'Indique hasta qué fecha.' });
  const { rows } = await pool.query(`
    SELECT n.id, n.nombre_completo, n.fecha_nacimiento, n.fila, c.nombre AS comunidad, cu.numero AS cuaderno_numero,
           cu.anio AS cuaderno_anio, r.nombre_completo AS responsable, r.telefono
    FROM nino n JOIN comunidad c ON c.id = n.comunidad_id LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE n.estado = 'activo' AND ($1::int IS NULL OR n.comunidad_id = $1)`, [comunidad || null]);
  const ctx = { catalogo: await esq.cargarCatalogo(pool), params: await esq.cargarParametros(pool) };
  const citas = [];
  for (const n of rows) {
    const e = await esq.calcularNino(pool, n, hoy(), ctx);
    if (e.proximaCita && e.proximaCita >= desde && e.proximaCita <= hasta)
      citas.push({ ...n, proxima_cita: e.proximaCita, vacunas: e.proximaCitaVacunas, estado_esquema: e.estadoNino,
        // Su "cita" es hoy porque ya venció: también está en Pendientes
        atrasada: e.dosis.some((d) => d.estado === 'atrasada' && e.proximaCitaVacunas.includes(d.etiqueta)) });
  }
  citas.sort((a, b) => a.proxima_cita.localeCompare(b.proxima_cita) || a.nombre_completo.localeCompare(b.nombre_completo));
  res.json(citas);
});

router.get('/:id', permitir(...TODOS), async (req, res) => {
  const { rows: [n] } = await pool.query(`
    SELECT n.*, c.nombre AS comunidad, s.nombre AS sector, cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio,
           cu.tipo AS cuaderno_tipo
    FROM nino n JOIN comunidad c ON c.id = n.comunidad_id LEFT JOIN sector s ON s.id = c.sector_id
    LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id WHERE n.id = $1`, [req.params.id]);
  if (!n) return res.status(404).json({ error: 'Niño no encontrado.' });

  const [responsables, aplicaciones, dosis, alertas, columnas] = await Promise.all([
    pool.query(`SELECT r.*, nr.parentesco, nr.es_principal, c.nombre AS comunidad FROM nino_responsable nr
                JOIN responsable r ON r.id = nr.responsable_id JOIN comunidad c ON c.id = r.comunidad_id
                WHERE nr.nino_id = $1 ORDER BY nr.es_principal DESC`, [n.id]),
    pool.query(`SELECT a.*, p.nombre AS producto, p.codigo AS producto_codigo, e.nombre AS establecimiento,
                       u.nombre AS responsable_informacion, u.cargo
                FROM aplicacion a JOIN producto p ON p.id = a.producto_id
                LEFT JOIN establecimiento e ON e.id = a.establecimiento_id LEFT JOIN usuario u ON u.id = a.creado_por
                WHERE a.nino_id = $1 ORDER BY a.fecha_aplicacion, a.id`, [n.id]),
    pool.query(`SELECT ad.*, d.etiqueta FROM aplicacion_dosis ad JOIN esquema_dosis d ON d.id = ad.esquema_dosis_id
                WHERE ad.nino_id = $1 AND NOT ad.anulada`, [n.id]),
    pool.query(`SELECT a.*, d.etiqueta FROM alerta a LEFT JOIN esquema_dosis d ON d.id = a.esquema_dosis_id
                WHERE a.nino_id = $1 AND a.estado IN ('abierta','en_seguimiento')`, [n.id]),
    esq.cargarColumnas(pool),
  ]);

  // Celdas llenas del cuaderno: cada dosis cumplida en su columna impresa
  const porId = new Map(aplicaciones.rows.map((a) => [a.id, a]));
  const celdas = dosis.rows.map((ad) => {
    const a = porId.get(ad.aplicacion_id);
    const col = esq.ubicarColumna(columnas, { ...a, esquema_dosis_id: ad.esquema_dosis_id });
    return { columna_id: col?.id, esquema_dosis_id: ad.esquema_dosis_id, aplicacion_id: a.id, fecha: a.fecha_aplicacion,
      producto_codigo: a.producto_codigo, digitado_desde_cuaderno: a.digitado_desde_cuaderno };
  });
  const aps = aplicaciones.rows.map((a) => ({ ...a, dosis: dosis.rows.filter((d) => d.aplicacion_id === a.id).map((d) => d.etiqueta) }));
  res.json({ ...n, responsables: responsables.rows, aplicaciones: aps, celdas, alertas: alertas.rows });
});

// Editar datos del niño; solo la enfermera cambia el estado (falleció, emigró, trasladado)
router.put('/:id', permitir(...OPERATIVOS), async (req, res) => {
  const campos = [...CAMPOS_NINO, ...(req.usuario.rol === 'enfermera' ? ['estado'] : [])];
  const o = normalizarNino(req.body || {}, campos);
  if (!Object.keys(o).length) return res.status(400).json({ error: 'Nada que actualizar.' });
  const n = await transaccion(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM nino WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!antes) return null;
    const { rows: [despues] } = await c.query(
      `UPDATE nino SET ${Object.keys(o).map((k, i) => `${k} = $${i + 2}`)} WHERE id = $1 RETURNING *`,
      [req.params.id, ...Object.values(o)]);
    await registrarBitacora(c, req, 'editar', 'nino', despues.id, antes, despues);
    await esq.sincronizarAlertas(c, despues);
    return despues;
  });
  n ? res.json(n) : res.status(404).json({ error: 'Niño no encontrado.' });
});

// Estado del esquema a una fecha (hoy o la de una jornada)
router.get('/:id/esquema', permitir(...TODOS), async (req, res) => {
  const { rows: [n] } = await pool.query('SELECT id, fecha_nacimiento FROM nino WHERE id = $1', [req.params.id]);
  if (!n) return res.status(404).json({ error: 'Niño no encontrado.' });
  res.json(await esq.calcularNino(pool, n, req.query.fecha || hoy()));
});

/**
 * Registrar dosis. modo:
 *  - 'atencion'   (defecto): las reglas bloquean.
 *  - 'cuaderno'   digitación desde el 5a: las reglas solo advierten.
 *  - 'antecedente' dosis tomada del carné u otro servicio: solo advierten.
 * El producto decide qué columnas cumple; al guardar se devuelve dónde anotar y la próxima cita.
 */
router.post('/:id/aplicaciones', permitir(...OPERATIVOS), async (req, res) => {
  const { producto_id, fecha_aplicacion, establecimiento_id, jornada_id, formulacion, observacion,
    modo = 'atencion', esquema_dosis_ids, lote_id } = req.body || {};
  let lote = req.body?.lote;
  if (!producto_id || !fecha_aplicacion) return res.status(400).json({ error: 'Indique vacuna y fecha de aplicación.' });
  if (fecha_aplicacion > hoy()) return res.status(400).json({ error: 'La fecha de aplicación no puede ser futura.' });
  if (jornada_id) {
    const { rows: [j] } = await pool.query('SELECT estado FROM jornada WHERE id = $1', [jornada_id]);
    if (!j || j.estado !== 'en_curso') {
      return res.status(409).json({ error: j?.estado === 'planificada' ? 'Primero inicie la jornada.' : 'La jornada ya está cerrada o cancelada.' });
    }
    if (!(await require('./jornadas').esDelEquipo(pool, jornada_id, req.usuario))) {
      return res.status(403).json({ error: 'Esta jornada no está asignada a usted.' });
    }
  }

  const r = await transaccion(async (c) => {
    const { rows: [n] } = await c.query(`SELECT n.*, cu.numero AS cu_numero, cu.anio AS cu_anio, cu.tipo AS cu_tipo
      FROM nino n LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id WHERE n.id = $1 FOR UPDATE OF n`, [req.params.id]);
    if (!n) return { status: 404, body: { error: 'Niño no encontrado.' } };
    // Lote registrado: debe ser de la misma vacuna y no estar vencido el día de la aplicación
    if (lote_id) {
      const { rows: [l] } = await c.query('SELECT * FROM lote WHERE id = $1', [lote_id]);
      if (!l || l.producto_id !== Number(producto_id)) return { status: 400, body: { error: 'El lote no corresponde a esta vacuna.' } };
      if (fecha_aplicacion > l.fecha_vencimiento) {
        return { status: 422, body: { error: `El lote ${l.codigo} venció el ${l.fecha_vencimiento}; use otro lote.` } };
      }
      lote = l.codigo;
    }
    // Secuencial: un cliente de transacción no admite consultas en paralelo
    const catalogo = await esq.cargarCatalogo(c);
    const params = await esq.cargarParametros(c);
    const aplicaciones = await esq.cargarAplicaciones(c, n.id);
    const columnas = await esq.cargarColumnas(c);
    const { rows: series } = await c.query(
      'SELECT s.codigo FROM producto_serie ps JOIN serie s ON s.id = ps.serie_id WHERE ps.producto_id = $1', [producto_id]);

    const destino = esquema_dosis_ids?.length
      ? esquema_dosis_ids.map((id) => ({ esquemaDosisId: id,
        temporada: catalogo.find((d) => d.id === id)?.estacional ? temporadaDe(fecha_aplicacion) : 0 }))
      : dosisQueCumpleProducto({ seriesProducto: series.map((s) => s.codigo), catalogo, aplicaciones,
        fechaNacimiento: n.fecha_nacimiento, fecha: fecha_aplicacion });
    if (!destino.length) return { status: 422, body: { error: 'El niño ya tiene registradas las dosis que cumple esta vacuna.' } };

    const dosisCat = destino.map((x) => catalogo.find((d) => d.id === x.esquemaDosisId));
    const esInfluenza = dosisCat.some((d) => d.estacional);
    const form = esInfluenza ? (formulacion || params.influenza_formulacion) : null;
    if (esInfluenza && !['sur', 'norte'].includes(form)) return { status: 400, body: { error: 'Indique la formulación de influenza: Sur o Norte.' } };
    const grupo = esInfluenza ? grupoInfluenza(n.fecha_nacimiento, fecha_aplicacion) : null;

    // Validación: en atención bloquea; en carga histórica solo advierte (salvo repetida o antes del nacimiento)
    const advertencias = [];
    for (const d of dosisCat) {
      const v = validarAplicacion({ fechaNacimiento: n.fecha_nacimiento, aplicaciones, catalogo, esquemaDosisId: d.id, fecha: fecha_aplicacion });
      if (v.ok) continue;
      const grave = /ya está registrada|anterior al nacimiento/.test(v.error);
      if (modo === 'atencion' || grave) return { status: 422, body: { error: v.error } };
      advertencias.push(v.error);
    }
    if (esInfluenza && !grupo && modo === 'atencion') return { status: 422, body: { error: 'La influenza pediátrica se aplica de 6 a 35 meses.' } };

    const recuperacion = dosisCat.some((d) => esRecuperacion(d, n.fecha_nacimiento, fecha_aplicacion));
    const visita = modo === 'antecedente' ? null : await obtenerVisita(c, { ninoId: n.id, fecha: fecha_aplicacion,
      establecimientoId: establecimiento_id, jornadaId: jornada_id, usuarioId: req.usuario.id, tipo: 'vacunacion' });
    const { rows: [a] } = await c.query(
      `INSERT INTO aplicacion (nino_id, producto_id, fecha_aplicacion, lote, establecimiento_id, jornada_id, origen,
         fuente_primaria, digitado_desde_cuaderno, es_recuperacion, formulacion, grupo_influenza, observacion, creado_por, visita_id, lote_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [n.id, producto_id, fecha_aplicacion, lote ? String(lote).trim() : null, establecimiento_id || null, jornada_id || null,
        n.cu_tipo || 'produccion_cobertura', modo !== 'antecedente', modo === 'cuaderno', recuperacion, form, grupo,
        observacion || null, req.usuario.id, visita?.id || null, lote_id || null]);
    for (const x of destino)
      await c.query('INSERT INTO aplicacion_dosis (aplicacion_id, esquema_dosis_id, nino_id, temporada) VALUES ($1,$2,$3,$4)',
        [a.id, x.esquemaDosisId, n.id, x.temporada]);
    await registrarBitacora(c, req, 'crear', 'aplicacion', a.id, null, { ...a, dosis: destino });

    const cols = destino.map((x) => esq.ubicarColumna(columnas, { ...a, esquema_dosis_id: x.esquemaDosisId }));
    const donde = esq.dondeAnotar(n.cuaderno_id && { numero: n.cu_numero, anio: n.cu_anio }, n.fila, cols);
    const e = await esq.sincronizarAlertas(c, n, { catalogo, params });
    return { status: 201, body: {
      aplicacion: a, dosis: dosisCat.map((d) => d.etiqueta), advertencias, dondeAnotar: donde,
      proximaCita: e.proximaCita, proximaCitaVacunas: e.proximaCitaVacunas } };
  });
  res.status(r.status).json(r.body);
});

/**
 * Atención sin vacuna o vacunas que tocaban y no se aplicaron, con su motivo (oportunidad perdida, OPS).
 * Se llama al terminar de registrar las dosis de la visita, o sola si el niño vino y no se vacunó.
 */
router.post('/:id/visitas', permitir(...OPERATIVOS), async (req, res) => {
  const { fecha = hoy(), establecimiento_id, jornada_id, no_aplicadas = [] } = req.body || {};
  if (fecha > hoy()) return res.status(400).json({ error: 'La fecha no puede ser futura.' });
  if (!no_aplicadas.length) return res.status(400).json({ error: 'Indique qué vacunas no se aplicaron y por qué.' });
  const malo = no_aplicadas.find((x) => !x.esquema_dosis_id || !MOTIVOS_NO_APLICADA.includes(x.motivo));
  if (malo) return res.status(400).json({ error: 'Cada vacuna no aplicada necesita un motivo de la lista.' });
  const v = await transaccion(async (c) => {
    const { rows: [n] } = await c.query('SELECT id FROM nino WHERE id = $1', [req.params.id]);
    if (!n) return null;
    const visita = await obtenerVisita(c, { ninoId: n.id, fecha, establecimientoId: establecimiento_id, jornadaId: jornada_id,
      usuarioId: req.usuario.id, tipo: 'sin_vacuna' });
    for (const x of no_aplicadas) {
      await c.query(`INSERT INTO dosis_no_aplicada (visita_id, nino_id, esquema_dosis_id, motivo, detalle) VALUES ($1,$2,$3,$4,$5)
                     ON CONFLICT (visita_id, esquema_dosis_id) DO UPDATE SET motivo = EXCLUDED.motivo, detalle = EXCLUDED.detalle`,
      [visita.id, n.id, x.esquema_dosis_id, x.motivo, x.detalle || null]);
    }
    await registrarBitacora(c, req, 'crear', 'visita', visita.id, null, { visita, no_aplicadas });
    return visita;
  });
  v ? res.status(201).json(v) : res.status(404).json({ error: 'Niño no encontrado.' });
});

module.exports = router;
