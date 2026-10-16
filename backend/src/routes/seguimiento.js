// Control mensual (objetivo 2): quiénes se vacunaron cada día del mes, quiénes no se vacunaron aunque les tocaba,
// y cuántas dosis harán falta los próximos meses para el pedido al distrito.
const router = require('express').Router();
const { pool } = require('../db');
const { permitir, TODOS } = require('../middleware/auth');
const esq = require('../servicios/esquema');
const { calcularEsquema, aDia, aFecha } = require('../motor/motorEsquema');
const { productosNecesarios } = require('./jornadas');
const { hoy } = require('../fecha');
const { territorioDe } = require('../territorio');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const finDeMes = (a, m) => new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
const inicioDeMes = (a, m) => `${a}-${String(m).padStart(2, '0')}-01`;
const siguienteMes = (a, m, k) => { const t = a * 12 + (m - 1) + k; return [Math.floor(t / 12), (t % 12) + 1]; };

// Dosis que "tocan" a una fecha: ya pasó su fecha programada y no están aplicadas
const PENDIENTE = ['le_toca', 'atrasada', 'proxima', 'pendiente'];
const d0 = (dosis) => dosis.reduce((m, d) => (d.fechaProgramada < m ? d.fechaProgramada : m), dosis[0].fechaProgramada);

/**
 * Comunidades del filtro: una comunidad, o un puesto o el casco urbano con todas las que tiene a cargo.
 * null = todo el municipio.
 */
async function filtroTerritorio(db, { comunidad, puesto } = {}) {
  if (puesto) {
    const { rows } = await db.query('SELECT id FROM comunidad WHERE id = $1 OR comunidad_padre_id = $1', [Number(puesto)]);
    return rows.map((r) => r.id);
  }
  return comunidad ? [Number(comunidad)] : null;
}

/** Niños activos con sus aplicaciones vigentes, responsable principal, asignación y último contacto. */
async function cargarNinos(db, comunidad) {
  const { rows: ninos } = await db.query(`
    SELECT n.id, n.nombre_completo, n.fecha_nacimiento, n.sexo, n.comunidad_id, c.nombre AS comunidad, COALESCE(p.nombre, c.nombre) AS lugar, COALESCE(p.id, c.id) AS puesto_id, COALESCE(p.tipo, c.tipo) AS puesto_tipo,
           r.nombre_completo AS responsable, r.telefono, r.idioma_preferente, r.numero_casa, ua.nombre AS asignado_nombre, ca.usuario_id AS asignado_id
    FROM nino n JOIN comunidad c ON c.id = n.comunidad_id LEFT JOIN comunidad p ON p.id = c.comunidad_padre_id
    LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
    LEFT JOIN caso_asignacion ca ON ca.nino_id = n.id LEFT JOIN usuario ua ON ua.id = ca.usuario_id
    WHERE n.estado = 'activo' AND ($1::int[] IS NULL OR n.comunidad_id = ANY($1))`, [comunidad]);
  const ids = ninos.map((n) => n.id);
  const { rows: apps } = ids.length ? await db.query(`
    SELECT ad.nino_id, ad.esquema_dosis_id AS "esquemaDosisId", a.fecha_aplicacion AS fecha, ad.temporada
    FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id
    WHERE ad.nino_id = ANY($1) AND NOT ad.anulada`, [ids]) : { rows: [] };
  const porNino = new Map(ids.map((id) => [id, []]));
  for (const a of apps) porNino.get(a.nino_id).push(a);
  return { ninos, aplicaciones: porNino };
}

// ---- El mes: vacunados por día y no vacunados por comunidad ----
router.get('/mes', permitir(...TODOS), async (req, res) => {
  const anio = Number(req.query.anio) || Number(hoy().slice(0, 4));
  const mes = Number(req.query.mes) || Number(hoy().slice(5, 7));
  const desde = inicioDeMes(anio, mes);
  const hasta = finDeMes(anio, mes);
  const corte = hasta < hoy() ? hasta : hoy(); // el estado se mira al cierre del mes, o a hoy si el mes está en curso
  // El personal de un puesto o barrio solo ve su sector (y los niños que le asignaron); no puede ver todo el municipio
  const alcance = await require('../territorio').alcanceDe(pool, req.usuario);
  const sector = alcance || [];
  const soloSector = alcance !== null;
  const asignado = soloSector ? 'yo' : req.query.asignado;
  const comunidad = soloSector && !req.query.comunidad && !req.query.puesto ? sector : await filtroTerritorio(pool, req.query);

  const { rows: vacunados } = await pool.query(`
    SELECT a.id, a.fecha_aplicacion AS fecha, a.nino_id, n.nombre_completo, n.fecha_nacimiento, n.sexo,
           c.id AS comunidad_id, c.nombre AS comunidad, p.nombre AS producto, p.codigo AS producto_codigo, a.lote,
           a.jornada_id, e.nombre AS establecimiento, u.nombre AS registro,
           (SELECT string_agg(d.etiqueta, ', ' ORDER BY d.orden) FROM aplicacion_dosis ad JOIN esquema_dosis d ON d.id = ad.esquema_dosis_id
             WHERE ad.aplicacion_id = a.id AND NOT ad.anulada) AS dosis
    FROM aplicacion a JOIN nino n ON n.id = a.nino_id JOIN comunidad c ON c.id = n.comunidad_id JOIN producto p ON p.id = a.producto_id
    LEFT JOIN establecimiento e ON e.id = a.establecimiento_id LEFT JOIN usuario u ON u.id = a.creado_por
    WHERE NOT a.anulada AND a.fuente_primaria AND a.fecha_aplicacion BETWEEN $1 AND $2 AND ($3::int[] IS NULL OR n.comunidad_id = ANY($3))
    ORDER BY a.fecha_aplicacion, c.nombre, n.nombre_completo, p.nombre`, [desde, hasta, comunidad]);

  const ctx = { catalogo: await esq.cargarCatalogo(pool), params: await esq.cargarParametros(pool) };
  const { ninos, aplicaciones } = await cargarNinos(pool, soloSector ? null : comunidad);
  const { rows: alertas } = await pool.query(`
    SELECT nino_id, tipo FROM alerta WHERE estado IN ('abierta','en_seguimiento') AND tipo <> 'proxima'`);
  const { rows: contactos } = await pool.query(`
    SELECT DISTINCT ON (nino_id) nino_id, fecha, medio, resultado, fecha_compromiso FROM seguimiento ORDER BY nino_id, fecha DESC, id DESC`);
  const GRAVEDAD = ['dosis_cero', 'abandono', 'atrasada', 'inasistencia'];
  // Intentos desde que se abrió el caso actual (para decidir a quién llamar y cuándo visitar)
  const { rows: cuentas } = await pool.query(`
    SELECT s.nino_id, count(*)::int AS n FROM seguimiento s
    WHERE s.fecha >= (SELECT min(a.fecha_generada) FROM alerta a WHERE a.nino_id = s.nino_id AND a.estado IN ('abierta','en_seguimiento'))
    GROUP BY 1`);
  const intentos = new Map(cuentas.map((c) => [c.nino_id, c.n]));

  const pendientes = [];
  for (const n of ninos) {
    if (n.fecha_nacimiento > hasta) continue;
    if (esq.cumpleEgreso(n, corte, ctx.params)) continue;
    const r = calcularEsquema({ fechaNacimiento: n.fecha_nacimiento, aplicaciones: aplicaciones.get(n.id).filter((a) => a.fecha <= corte),
      catalogo: ctx.catalogo, fechaRef: corte, params: ctx.params });
    // La influenza es campaña de temporada, no un atraso del esquema: va en el pedido, no en esta lista
    const dosis = r.dosis.filter((d) => d.tipo === 'regular' && PENDIENTE.includes(d.estado) && d.fechaProgramada && d.fechaProgramada <= hasta)
      .map((d) => ({ etiqueta: d.etiqueta, programada: d.fechaProgramada, estado: d.estado,
        dias_atraso: Math.max(0, aDia(corte) - aDia(d.fechaProgramada)),
        situacion: d.fechaProgramada < desde ? 'de_antes' : d.fechaProgramada > corte ? 'por_venir' : 'del_mes' }));
    if (!dosis.length) continue;
    const tipos = alertas.filter((a) => a.nino_id === n.id).map((a) => a.tipo);
    pendientes.push({
      ...n, dosis,
      situacion: dosis.some((d) => d.situacion === 'de_antes') ? 'de_antes' : dosis.every((d) => d.situacion === 'por_venir') ? 'por_venir' : 'del_mes',
      dias_atraso: Math.max(...dosis.map((d) => d.dias_atraso)),
      alerta: GRAVEDAD.find((t) => tipos.includes(t)) || null,
      vacunado_en_el_mes: vacunados.some((v) => v.nino_id === n.id),
      ultimo_contacto: contactos.find((c) => c.nino_id === n.id) || null,
      intentos: intentos.get(n.id) || 0,
    });
  }
  const mias = soloSector ? new Set(sector) : asignado === 'yo' ? new Set(await territorioDe(pool, req.usuario.id)) : null;
  const filtrados = soloSector ? pendientes.filter((p) => mias.has(p.comunidad_id))
    : mias ? pendientes.filter((p) => p.asignado_id === req.usuario.id || mias.has(p.comunidad_id)) : pendientes;
  filtrados.sort((a, b) => a.comunidad.localeCompare(b.comunidad) || b.dias_atraso - a.dias_atraso);

  res.json({
    solo_sector: soloSector,
    anio, mes, nombre_mes: MESES[mes - 1], desde, hasta, corte, en_curso: hasta >= hoy(),
    vacunados, pendientes: filtrados,
    resumen: {
      ninos_vacunados: new Set(vacunados.map((v) => v.nino_id)).size, dosis: vacunados.length,
      pendientes: filtrados.filter((p) => p.situacion !== 'por_venir').length,
      por_venir: filtrados.filter((p) => p.situacion === 'por_venir').length,
    },
  });
});

// ---- Pedido: dosis que harán falta los próximos meses ----
// Simula que cada niño se vacuna en su fecha (o al inicio del mes si ya estaba atrasado) para encadenar las dosis siguientes.
router.get('/proyeccion', permitir(...TODOS), async (req, res) => {
  const meses = Math.min(6, Math.max(1, Number(req.query.meses) || 3));
  const [a0, m0] = [Number(hoy().slice(0, 4)), Number(hoy().slice(5, 7))];
  const ctx = { catalogo: await esq.cargarCatalogo(pool), params: await esq.cargarParametros(pool) };
  // El personal con sector solo ve lo suyo, aunque pida otro lugar
  let lugares = await filtroTerritorio(pool, req.query);
  const T = require('../territorio');
  // ?municipio=1: el pedido consolidado de todo el municipio (Dirección y encargada del centro)
  const todo = req.query.municipio === '1' && await T.consolidaPedido(pool, req.usuario);
  const alcanceP = todo ? null : await T.alcanceDe(pool, req.usuario);
  if (alcanceP) lugares = lugares ? lugares.filter((c) => alcanceP.includes(c)) : alcanceP;
  const { ninos, aplicaciones } = await cargarNinos(pool, lugares);
  const { rows: productos } = await pool.query('SELECT codigo, nombre FROM producto WHERE activo ORDER BY nombre');

  // Columnas: atrasadas a hoy, lo que falta de este mes y los meses siguientes
  const columnas = [{ clave: 'atrasadas', nombre: 'Atrasadas' }, { clave: 'este_mes', nombre: `Resto de ${MESES[m0 - 1]}` }];
  for (let k = 1; k <= meses; k++) { const [a, m] = siguienteMes(a0, m0, k); columnas.push({ clave: `${a}-${m}`, nombre: `${MESES[m - 1]} ${a}`, anio: a, mes: m }); }
  const cuenta = Object.fromEntries(columnas.map((c) => [c.clave, {}]));
  const quienes = Object.fromEntries(columnas.map((c) => [c.clave, []])); // niños que se vacunan en cada columna
  const sumar = (col, dosis) => { for (const p of productosNecesarios(dosis)) cuenta[col][p] = (cuenta[col][p] || 0) + 1; };

  for (const n of ninos) {
    const apps = [...aplicaciones.get(n.id)];
    const tope = finDeMes(...siguienteMes(a0, m0, meses));
    if (esq.cumpleEgreso(n, tope, ctx.params)) continue;
    for (const [i, col] of columnas.entries()) {
      // Atrasadas y el resto del mes se miran hoy; cada mes siguiente, a su último día
      const ref = i < 2 ? finDeMes(a0, m0) : finDeMes(col.anio, col.mes);
      const r = calcularEsquema({ fechaNacimiento: n.fecha_nacimiento, aplicaciones: apps, catalogo: ctx.catalogo, fechaRef: ref, params: ctx.params });
      let dosis = r.dosis.filter((d) => ['le_toca', 'atrasada'].includes(d.estado) && aDia(d.fechaMinima) <= aDia(ref));
      // Atrasadas: solo el esquema regular; la influenza de la temporada en curso cuenta en el mes
      if (i === 0) dosis = dosis.filter((d) => d.tipo === 'regular' && d.fechaProgramada < hoy());
      if (i === 1) dosis = dosis.filter((d) => d.tipo !== 'regular' || d.fechaProgramada >= hoy());
      if (!dosis.length) continue;
      sumar(col.clave, dosis);
      quienes[col.clave].push({ id: n.id, nombre_completo: n.nombre_completo, fecha_nacimiento: n.fecha_nacimiento, comunidad_id: n.comunidad_id,
        comunidad: n.comunidad, lugar: n.puesto_tipo === 'casco_urbano' ? 'Casco urbano' : n.lugar, puesto_id: n.puesto_id, responsable: n.responsable, telefono: n.telefono,
        dosis: dosis.map((d) => d.etiqueta), productos: [...productosNecesarios(dosis)], fecha: aFecha(Math.max(aDia(i < 2 ? hoy() : inicioDeMes(col.anio, col.mes)), aDia(d0(dosis)))) });
      const inicio = i < 2 ? hoy() : inicioDeMes(col.anio, col.mes);
      for (const d of dosis) apps.push({ esquemaDosisId: d.esquemaDosisId, fecha: aFecha(Math.max(aDia(inicio), aDia(d.fechaProgramada))) });
    }
  }

  // Recién nacidos de cada mes (promedio de los últimos 12): Hepatitis B y BCG al nacer
  const { rows: [{ nacidos }] } = await pool.query(
    "SELECT count(*)::int AS nacidos FROM nino WHERE fecha_nacimiento > ($1::date - interval '12 months')", [hoy()]);
  const porMes = Math.round(nacidos / 12);
  for (const col of columnas.slice(2)) for (const p of ['HB_PED', 'BCG']) cuenta[col.clave][p] = (cuenta[col.clave][p] || 0) + porMes;

  const filas = productos.map((p) => ({ codigo: p.codigo, nombre: p.nombre, cantidades: columnas.map((c) => cuenta[c.clave][p.codigo] || 0) }))
    .filter((f) => f.cantidades.some(Boolean));
  const orden = (l) => l.sort((a, b) => a.comunidad.localeCompare(b.comunidad) || a.nombre_completo.localeCompare(b.nombre_completo));
  res.json({ columnas: columnas.map(({ clave, nombre, anio, mes }) => ({ clave, nombre, anio: anio || a0, mes: mes || m0, ninos: orden(quienes[clave]) })), filas, nacimientos_por_mes: porMes,
    reserva: Number(ctx.params.porcentaje_reserva_jornada) || 0 });
});

module.exports = router;
module.exports.filtroTerritorio = filtroTerritorio;
