const router = require('express').Router();
const { pool, registrarBitacora } = require('../db');
const { permitir } = require('../middleware/auth');
const esq = require('../servicios/esquema');
const Q = require('../indicadores/consultas');

// Informes agregados y nominales: enfermera y administrador (los nominales son de uso interno, Decreto 57-2008)
router.use(permitir('enfermera', 'administrador'));

function rangoMes(anio, mes) {
  const a = Number(anio), m = Number(mes);
  if (!a || !m || m < 1 || m > 12) return null;
  const desde = `${a}-${String(m).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { desde, hasta };
}

/** Período del informe: rango libre (desde y hasta) o un mes (año y mes). */
function rango(q) {
  if (!q.desde || !q.hasta) return rangoMes(q.anio, q.mes);
  const [desde, hasta] = [q.desde, q.hasta].sort(); // acepta las fechas en cualquier orden
  return { desde, hasta };
}

// Filtros comunes: tipo de cuaderno (origen), comunidad o sector
function filtros(q, params, alias = { a: 'a', n: 'n' }) {
  const w = [];
  if (q.tipo) { params.push(q.tipo); w.push(`${alias.a}.origen = $${params.length}`); }
  if (q.comunidad) { params.push(q.comunidad); w.push(`${alias.n}.comunidad_id = $${params.length}`); }
  if (q.sector) { params.push(q.sector); w.push(`${alias.n}.comunidad_id IN (SELECT id FROM comunidad WHERE sector_id = $${params.length})`); }
  return w.length ? ' AND ' + w.join(' AND ') : '';
}

/**
 * Informe mensual con las columnas del cuaderno 5a: cada columna impresa con total, hombres y mujeres,
 * más cuántas fueron hexavalente (para el pedido de biológicos). Insumo del consolidado y de SIGSA Web.
 */
router.get('/mensual', async (req, res) => {
  const r = rango(req.query);
  if (!r) return res.status(400).json({ error: 'Indique el mes o un rango de fechas.' });
  const params = [r.desde, r.hasta];
  const { rows } = await pool.query(`
    SELECT ad.esquema_dosis_id, a.producto_id, a.es_recuperacion, a.grupo_influenza, a.formulacion, n.sexo, p.codigo
    FROM aplicacion a JOIN aplicacion_dosis ad ON ad.aplicacion_id = a.id JOIN nino n ON n.id = a.nino_id
    JOIN producto p ON p.id = a.producto_id
    WHERE NOT a.anulada AND a.fecha_aplicacion BETWEEN $1 AND $2 ${filtros(req.query, params)}`, params);

  const columnas = await esq.cargarColumnas(pool);
  const vacio = () => ({ total: 0, hombres: 0, mujeres: 0, hexavalente: 0 });
  const conteo = new Map(columnas.map((c) => [c.id, vacio()]));
  let sinColumna = 0;
  for (const x of rows) {
    const col = esq.ubicarColumna(columnas, x);
    if (!col) { sinColumna++; continue; }
    const k = conteo.get(col.id);
    k.total++;
    x.sexo === 'H' ? k.hombres++ : k.mujeres++;
    if (x.codigo === 'HEXA') k.hexavalente++;
  }
  const p = await esq.cargarParametros(pool);
  res.json({
    encabezado: { area_salud: p.area_salud, distrito: p.distrito, anio: Number(req.query.anio) || null, mes: Number(req.query.mes) || null, desde: r.desde, hasta: r.hasta,
      responsable: req.usuario.nombre, tipo: req.query.tipo || null },
    columnas: columnas.map((c) => ({ id: c.id, pagina: c.pagina, grupo: c.grupo, etiqueta: c.etiqueta, ...conteo.get(c.id) })),
    total_dosis: rows.length, sin_columna: sinColumna,
  });
});

// Listado nominal del mes: una fila por dosis aplicada, para digitar en SIGSA Web desde una sola hoja
router.get('/nominal', async (req, res) => {
  const r = rango(req.query);
  if (!r) return res.status(400).json({ error: 'Indique el mes o un rango de fechas.' });
  const params = [r.desde, r.hasta];
  const { rows } = await pool.query(`
    SELECT a.id, a.fecha_aplicacion, n.nombre_completo, n.cui, n.sexo, n.fecha_nacimiento, c.nombre AS comunidad,
           cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio, n.fila, p.nombre AS producto, a.lote, a.formulacion,
           a.es_recuperacion, string_agg(d.etiqueta, ', ' ORDER BY d.orden) AS dosis, u.nombre AS registrado_por
    FROM aplicacion a JOIN aplicacion_dosis ad ON ad.aplicacion_id = a.id JOIN esquema_dosis d ON d.id = ad.esquema_dosis_id
    JOIN nino n ON n.id = a.nino_id JOIN comunidad c ON c.id = n.comunidad_id JOIN producto p ON p.id = a.producto_id
    LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id LEFT JOIN usuario u ON u.id = a.creado_por
    WHERE NOT a.anulada AND a.fecha_aplicacion BETWEEN $1 AND $2 ${filtros(req.query, params)}
    GROUP BY a.id, n.id, c.nombre, cu.numero, cu.anio, p.nombre, u.nombre
    ORDER BY a.fecha_aplicacion, n.primer_apellido`, params);
  res.json(rows);
});

// Listados de seguimiento: atrasados, dosis cero, abandono e inasistencia por comunidad
router.get('/seguimiento', async (req, res) => {
  const params = [];
  const w = [];
  if (req.query.tipo) { params.push(req.query.tipo); w.push(`al.tipo = $${params.length}`); }
  if (req.query.comunidad) { params.push(req.query.comunidad); w.push(`n.comunidad_id = $${params.length}`); }
  const { rows } = await pool.query(`
    SELECT al.tipo, al.prioridad, al.fecha_generada, d.etiqueta, n.id AS nino_id, n.nombre_completo, n.fecha_nacimiento,
           c.nombre AS comunidad, cu.numero AS cuaderno_numero, cu.anio AS cuaderno_anio, n.fila,
           r.nombre_completo AS responsable, r.telefono,
           (SELECT count(*) FROM seguimiento s WHERE s.alerta_id = al.id)::int AS intentos
    FROM alerta al JOIN nino n ON n.id = al.nino_id JOIN comunidad c ON c.id = n.comunidad_id
    LEFT JOIN esquema_dosis d ON d.id = al.esquema_dosis_id LEFT JOIN cuaderno cu ON cu.id = n.cuaderno_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE al.estado IN ('abierta','en_seguimiento') AND al.tipo <> 'proxima' ${w.length ? 'AND ' + w.join(' AND ') : ''}
    ORDER BY c.nombre, CASE al.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, n.primer_apellido`, params);
  res.json(rows);
});

/**
 * Cobertura y deserción por comunidad en un año.
 * Cobertura = dosis aplicadas en el año / población meta x 100; deserción DPT = (1a - 3a) / 1a x 100.
 */
router.get('/cobertura', async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const dosis = (serie, numero) => `(SELECT count(*) FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id
      JOIN nino n ON n.id = ad.nino_id JOIN esquema_dosis d ON d.id = ad.esquema_dosis_id JOIN serie s ON s.id = d.serie_id
     WHERE n.comunidad_id = c.id AND NOT ad.anulada AND s.codigo = '${serie}' AND d.numero = ${numero}
       AND extract(year FROM a.fecha_aplicacion) = $1)::int`;
  const { rows } = await pool.query(`
    SELECT c.id, c.nombre,
      (SELECT cantidad FROM poblacion_meta WHERE comunidad_id = c.id AND anio = $1 AND grupo_edad = 'menor_1') AS meta_menor_1,
      (SELECT cantidad FROM poblacion_meta WHERE comunidad_id = c.id AND anio = $1 AND grupo_edad = '1_anio') AS meta_1_anio,
      ${dosis('DPT_HIB_HB', 1)} AS dpt1, ${dosis('DPT_HIB_HB', 3)} AS dpt3, ${dosis('POLIO', 3)} AS polio3,
      ${dosis('SPR', 1)} AS spr1, ${dosis('SPR', 2)} AS spr2
    FROM comunidad c WHERE c.activo ORDER BY c.nombre`, [anio]);

  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const fila = (r) => ({ ...r, cobertura_dpt3: pct(r.dpt3, r.meta_menor_1), cobertura_polio3: pct(r.polio3, r.meta_menor_1),
    cobertura_spr1: pct(r.spr1, r.meta_1_anio), desercion_dpt: r.dpt1 ? pct(r.dpt1 - r.dpt3, r.dpt1) : null });
  const suma = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const total = fila({ id: null, nombre: 'Total del distrito', meta_menor_1: suma('meta_menor_1') || null, meta_1_anio: suma('meta_1_anio') || null,
    dpt1: suma('dpt1'), dpt3: suma('dpt3'), polio3: suma('polio3'), spr1: suma('spr1'), spr2: suma('spr2') });
  res.json({ anio, comunidades: rows.map(fila), total });
});

// Constancia de cierre: el informe del mes quedó revisado y enviado (análisis, F6)
router.post('/enviado', permitir('enfermera', 'administrador'), async (req, res) => {
  const { tipo = 'mensual_5a', anio, mes, datos } = req.body || {};
  if (!anio || !mes) return res.status(400).json({ error: 'Indique año y mes.' });
  const { rows: [r] } = await pool.query(
    'INSERT INTO informe_enviado (tipo, anio, mes, usuario_id, datos) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [tipo, anio, mes, req.usuario.id, datos ? JSON.stringify(datos) : null]);
  await registrarBitacora(pool, req, 'crear', 'informe_enviado', r.id, null, { tipo, anio, mes });
  res.status(201).json(r);
});

router.get('/enviados', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ie.id, ie.tipo, ie.anio, ie.mes, ie.fecha, u.nombre AS usuario FROM informe_enviado ie
    LEFT JOIN usuario u ON u.id = ie.usuario_id WHERE ($1::int IS NULL OR ie.anio = $1) ORDER BY ie.fecha DESC LIMIT 50`,
  [Number(req.query.anio) || null]);
  res.json(rows);
});

// Informe de sala situacional: una página con indicadores, comunidades prioritarias y acciones (análisis, F7)
router.get('/sala-situacional', async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const mes = Number(req.query.mes) || new Date().getMonth() + 1;
  const hasta = [Q.finDeMes(anio, mes), require('../fecha').hoy()].sort()[0];
  const params = await esq.cargarParametros(pool);
  const cob = await Q.coberturasPorComunidad(pool, { desde: `${anio}-01-01`, hasta }, params);
  const mon = await Q.monitoreoMensual(pool, { anio });
  const seg = await Q.seguimiento(pool, { desde: `${anio}-${String(mes).padStart(2, '0')}-01`, hasta }, params);
  const { rows: acciones } = await pool.query(`
    SELECT ac.*, c.nombre AS comunidad, u.nombre AS responsable FROM accion ac
    LEFT JOIN comunidad c ON c.id = ac.comunidad_id LEFT JOIN usuario u ON u.id = ac.responsable_id
    WHERE ac.estado IN ('pendiente','en_curso') OR ac.fecha >= $1::date - 31 ORDER BY ac.fecha_limite NULLS LAST`, [hasta]);
  res.json({
    encabezado: { area_salud: params.area_salud, distrito: params.distrito, anio, mes, hasta, responsable: req.usuario.nombre },
    total: cob.total, monitoreo: mon,
    prioritarias: cob.comunidades.filter((c) => c.prioridad).sort((a, b) => a.prioridad - b.prioridad || (b.sin_vacunar ?? 0) - (a.sin_vacunar ?? 0)).slice(0, 8),
    seguimiento: { S2: seg.S2, S3: seg.S3, S4: seg.S4, casos: seg.casos },
    acciones,
  });
});

module.exports = router;
