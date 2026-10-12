// Consultas de los indicadores del tablero (análisis del flujo operativo, sección 4).
// Cada función devuelve numerador y denominador además del valor, para mostrar absolutos y porcentajes.
const R = require('./reglas');
const { calcularEsquema } = require('../motor/motorEsquema');
const esq = require('../servicios/esquema');

const { hoy } = require('../fecha');
const finDeMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);

/** Dosis aplicadas por el servicio (no antecedentes), por serie, número y edad al aplicar. */
const SQL_DOSIS = `
  SELECT n.comunidad_id, s.codigo, ed.numero, (a.fecha_aplicacion - n.fecha_nacimiento) AS edad, a.fecha_aplicacion
  FROM aplicacion_dosis ad
  JOIN aplicacion a     ON a.id = ad.aplicacion_id AND NOT a.anulada AND a.fuente_primaria
  JOIN esquema_dosis ed ON ed.id = ad.esquema_dosis_id
  JOIN serie s          ON s.id = ed.serie_id
  JOIN nino n           ON n.id = ad.nino_id
  WHERE NOT ad.anulada AND a.fecha_aplicacion BETWEEN $1 AND $2`;

// Trazadores con la edad que cuenta el SIGSA: Penta/Hexa y BCG en menores de 1 año, SPR 1 a los 12-23 meses
const TRAZADORES = `
  count(*) FILTER (WHERE codigo = 'DPT_HIB_HB' AND numero = 1 AND edad < 365)::int AS p1,
  count(*) FILTER (WHERE codigo = 'DPT_HIB_HB' AND numero = 3 AND edad < 365)::int AS p3,
  count(*) FILTER (WHERE codigo = 'SPR' AND numero = 1 AND edad BETWEEN 365 AND 729)::int AS spr1,
  count(*) FILTER (WHERE codigo = 'BCG' AND edad < 365)::int AS bcg`;

/**
 * Coberturas, deserción, casos abiertos y registro por comunidad en un período.
 * Meta prorrateada por los días del período (meta anual del año de "desde").
 */
async function coberturasPorComunidad(db, { desde, hasta }, params) {
  const anio = Number(desde.slice(0, 4));
  const { rows } = await db.query(`
    WITH d AS (${SQL_DOSIS}),
    dc AS (SELECT comunidad_id, ${TRAZADORES} FROM d GROUP BY 1),
    -- Deserción nominal: de los niños con Penta/Hexa 1 en el período que ya tuvieron tiempo de recibir la 3.ª
    -- (8 semanas × 2 de intervalo + 28 días de tolerancia = 148 días), cuántos no la tienen.
    -- Evita contar como abandono a los bebés que apenas empezaron (sesgo de la fórmula por período).
    des AS (
      SELECT n.comunidad_id, count(DISTINCT ad.nino_id)::int AS elegibles,
             count(DISTINCT ad.nino_id) FILTER (WHERE EXISTS (
               SELECT 1 FROM aplicacion_dosis x JOIN esquema_dosis xd ON xd.id = x.esquema_dosis_id JOIN serie xs ON xs.id = xd.serie_id
               JOIN aplicacion xa ON xa.id = x.aplicacion_id
               WHERE x.nino_id = ad.nino_id AND NOT x.anulada AND NOT xa.anulada AND xs.codigo = 'DPT_HIB_HB' AND xd.numero = 3
                 AND xa.fecha_aplicacion <= $2))::int AS completaron
      FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id AND NOT a.anulada AND a.fuente_primaria
      JOIN esquema_dosis ed ON ed.id = ad.esquema_dosis_id JOIN serie s ON s.id = ed.serie_id AND s.codigo = 'DPT_HIB_HB' AND ed.numero = 1
      JOIN nino n ON n.id = ad.nino_id
      WHERE NOT ad.anulada AND a.fecha_aplicacion BETWEEN $1 AND $2::date - 148
      GROUP BY 1),
    al AS (
      SELECT n.comunidad_id,
        count(DISTINCT a.nino_id) FILTER (WHERE a.tipo = 'dosis_cero')::int AS dosis_cero,
        count(DISTINCT a.nino_id) FILTER (WHERE a.tipo = 'abandono')::int AS abandono,
        count(DISTINCT a.nino_id) FILTER (WHERE a.tipo = 'atrasada')::int AS atrasados,
        count(DISTINCT a.nino_id) FILTER (WHERE a.tipo = 'inasistencia')::int AS inasistencia,
        count(DISTINCT a.nino_id) FILTER (WHERE a.tipo <> 'proxima')::int AS por_contactar
      FROM alerta a JOIN nino n ON n.id = a.nino_id
      WHERE a.estado IN ('abierta','en_seguimiento') GROUP BY 1),
    ni AS (
      SELECT comunidad_id,
        count(*) FILTER (WHERE estado = 'activo')::int AS activos,
        count(*) FILTER (WHERE estado = 'activo' AND fecha_nacimiento > CURRENT_DATE - 365)::int AS menores_1,
        count(*) FILTER (WHERE extract(year FROM fecha_nacimiento) = $3)::int AS nacidos_anio,
        count(*) FILTER (WHERE estado = 'activo' AND NOT EXISTS (
          SELECT 1 FROM alerta x WHERE x.nino_id = nino.id AND x.estado IN ('abierta','en_seguimiento') AND x.tipo <> 'proxima'))::int AS al_dia
      FROM nino GROUP BY 1)
    SELECT c.id, c.nombre, c.tipo, se.nombre AS sector,
      (SELECT cantidad FROM poblacion_meta WHERE comunidad_id = c.id AND anio = $3 AND grupo_edad = 'menor_1') AS meta_menor_1,
      (SELECT cantidad FROM poblacion_meta WHERE comunidad_id = c.id AND anio = $3 AND grupo_edad = '1_anio') AS meta_1_anio,
      COALESCE(dc.p1, 0) AS p1, COALESCE(dc.p3, 0) AS p3, COALESCE(dc.spr1, 0) AS spr1, COALESCE(dc.bcg, 0) AS bcg,
      COALESCE(al.dosis_cero, 0) AS dosis_cero, COALESCE(al.abandono, 0) AS abandono, COALESCE(al.atrasados, 0) AS atrasados,
      COALESCE(al.inasistencia, 0) AS inasistencia, COALESCE(al.por_contactar, 0) AS por_contactar,
      COALESCE(ni.activos, 0) AS activos, COALESCE(ni.menores_1, 0) AS menores_1, COALESCE(ni.nacidos_anio, 0) AS nacidos_anio,
      COALESCE(ni.al_dia, 0) AS al_dia, COALESCE(des.elegibles, 0) AS d_elegibles, COALESCE(des.completaron, 0) AS d_completaron,
      (SELECT max(j.fecha) FROM jornada j JOIN jornada_comunidad jc ON jc.jornada_id = j.id
        WHERE jc.comunidad_id = c.id AND j.estado <> 'cancelada') AS ultima_jornada
    FROM comunidad c LEFT JOIN sector se ON se.id = c.sector_id
    LEFT JOIN dc ON dc.comunidad_id = c.id LEFT JOIN des ON des.comunidad_id = c.id LEFT JOIN al ON al.comunidad_id = c.id LEFT JOIN ni ON ni.comunidad_id = c.id
    WHERE c.activo ORDER BY c.nombre`, [desde, hasta, anio]);

  const completar = (r) => {
    const meta1 = R.metaPeriodo(r.meta_menor_1, desde, hasta);
    const meta12 = R.metaPeriodo(r.meta_1_anio, desde, hasta);
    const c1 = R.pct(r.p1, meta1), c2 = R.pct(r.p3, meta1), c3 = R.pct(r.spr1, meta12);
    const d1 = R.desercion(r.d_elegibles, r.d_completaron);
    const categoria = R.categoriaRED(c1, d1, params);
    return {
      ...r, meta_periodo_menor_1: meta1, meta_periodo_1_anio: meta12,
      C1: c1, C2: c2, C3: c3, C4: R.pct(r.bcg, meta1), D1: d1,
      sin_vacunar: meta1 != null ? Math.max(0, Math.round(meta1 - r.p3)) : null,
      rango: R.rangoCobertura(c2), categoria, prioridad: R.prioridadRiesgo(c2, d1, params),
      N2: R.pct(r.al_dia, r.activos), N8: R.pct(r.nacidos_anio, r.meta_menor_1),
      estrategia: categoria ? R.ESTRATEGIA[categoria] : null,
    };
  };
  const filas = rows.map((r) => ({ ...completar(r), lectura: null }));
  filas.forEach((f) => { f.lectura = R.lecturaComunidad(f); });

  const suma = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const conMeta = rows.filter((r) => r.meta_menor_1 != null);
  const total = completar({
    id: 0, nombre: 'Total del municipio', meta_menor_1: conMeta.length ? suma('meta_menor_1') : null,
    meta_1_anio: rows.some((r) => r.meta_1_anio != null) ? suma('meta_1_anio') : null,
    ...Object.fromEntries(['p1', 'p3', 'spr1', 'bcg', 'dosis_cero', 'abandono', 'atrasados', 'inasistencia', 'por_contactar',
      'activos', 'menores_1', 'nacidos_anio', 'al_dia', 'd_elegibles', 'd_completaron'].map((k) => [k, suma(k)])),
  });
  const enMeta = filas.filter((f) => f.C2 != null && f.C2 >= 95 && f.C2 <= 100).length;
  total.C8 = R.pct(enMeta, filas.filter((f) => f.C2 != null).length);
  total.comunidades_en_meta = enMeta;
  return { comunidades: filas, total };
}

/** Dosis por mes (trazadores) para el gráfico de monitoreo: acumulado, % acumulado e ideal de 8,3 % por mes. */
async function monitoreoMensual(db, { anio, comunidad }) {
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
  const params = [desde, hasta];
  let filtro = '';
  if (comunidad) { params.push(comunidad); filtro = `WHERE comunidad_id = $${params.length}`; }
  const { rows } = await db.query(`
    WITH d AS (${SQL_DOSIS})
    SELECT extract(month FROM fecha_aplicacion)::int AS mes, ${TRAZADORES} FROM d ${filtro} GROUP BY 1`, params);
  const metas = (await db.query(`
    SELECT grupo_edad, sum(cantidad)::int AS total FROM poblacion_meta
    WHERE anio = $1 ${comunidad ? 'AND comunidad_id = $2' : ''} GROUP BY 1`, comunidad ? [anio, comunidad] : [anio])).rows;
  const meta = Object.fromEntries(metas.map((m) => [m.grupo_edad, m.total]));
  const ahora = new Date();
  const mesActual = ahora.getFullYear() === anio ? ahora.getMonth() + 1 : ahora.getFullYear() > anio ? 12 : 0;

  let acc = { p1: 0, p3: 0, spr1: 0 };
  const meses = [];
  for (let m = 1; m <= 12; m++) {
    const r = rows.find((x) => x.mes === m) || { p1: 0, p3: 0, spr1: 0 };
    const pasado = m <= mesActual;
    if (pasado) acc = { p1: acc.p1 + r.p1, p3: acc.p3 + r.p3, spr1: acc.spr1 + r.spr1 };
    meses.push({
      mes: m, ideal: R.idealAlMes(m), dosis_p1: r.p1, dosis_p3: r.p3, dosis_spr1: r.spr1,
      p1: pasado ? R.pct(acc.p1, meta.menor_1) : null, p3: pasado ? R.pct(acc.p3, meta.menor_1) : null,
      spr1: pasado ? R.pct(acc.spr1, meta['1_anio']) : null,
      acumulado_p1: pasado ? acc.p1 : null, acumulado_p3: pasado ? acc.p3 : null, acumulado_spr1: pasado ? acc.spr1 : null,
    });
  }
  const ultimo = meses[mesActual - 1];
  const lecturas = mesActual && ultimo ? [
    R.lecturaMonitoreo({ nombre: 'Penta/Hexa 1', valor: ultimo.p1, mes: mesActual }),
    R.lecturaMonitoreo({ nombre: 'Penta/Hexa 3', valor: ultimo.p3, mes: mesActual }),
    R.lecturaMonitoreo({ nombre: 'SPR 1', valor: ultimo.spr1, mes: mesActual }),
  ].filter(Boolean) : [];
  const faltan = meta.menor_1 != null && ultimo ? Math.max(0, Math.round(meta.menor_1 * 0.95 - (ultimo.acumulado_p3 || 0))) : null;
  return {
    anio, mes_actual: mesActual, meta_menor_1: meta.menor_1 ?? null, meta_1_anio: meta['1_anio'] ?? null, meses, lecturas,
    proyeccion_p3: ultimo?.p3 != null && mesActual ? Math.round((ultimo.p3 * 12) / mesActual) : null,
    faltan_p3_para_meta: faltan,
  };
}

/** Oportunidad (N5): dosis aplicadas a la edad del esquema + tolerancia, por vacuna. */
async function oportunidad(db, { desde, hasta, comunidad }, params) {
  const tolerancia = Number(params.dias_tolerancia_atraso) || 28;
  const { rows } = await db.query(`
    SELECT s.nombre AS vacuna, s.codigo,
      count(*)::int AS total,
      count(*) FILTER (WHERE (a.fecha_aplicacion - n.fecha_nacimiento) <= ed.edad_recomendada_dias + $3)::int AS a_tiempo
    FROM aplicacion_dosis ad
    JOIN aplicacion a ON a.id = ad.aplicacion_id AND NOT a.anulada AND a.fuente_primaria
    JOIN esquema_dosis ed ON ed.id = ad.esquema_dosis_id JOIN serie s ON s.id = ed.serie_id
    JOIN nino n ON n.id = ad.nino_id
    WHERE NOT ad.anulada AND NOT s.estacional AND NOT s.informativa AND a.fecha_aplicacion BETWEEN $1 AND $2
      AND ($4::int IS NULL OR n.comunidad_id = $4)
    GROUP BY s.nombre, s.codigo, s.id ORDER BY min(ed.orden)`, [desde, hasta, tolerancia, comunidad || null]);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const aTiempo = rows.reduce((s, r) => s + r.a_tiempo, 0);
  return { porVacuna: rows.map((r) => ({ ...r, tarde: r.total - r.a_tiempo, valor: R.pct(r.a_tiempo, r.total) })),
    N5: { numerador: aTiempo, denominador: total, valor: R.pct(aTiempo, total) } };
}

/** Oportunidades perdidas (N6) y sus motivos (N7). */
async function oportunidadesPerdidas(db, { desde, hasta, comunidad }) {
  const p = [desde, hasta, comunidad || null];
  const { rows: [v] } = await db.query(`
    SELECT count(DISTINCT v.id)::int AS visitas,
           count(DISTINCT v.id) FILTER (WHERE dna.es_oportunidad_perdida)::int AS con_perdida,
           count(DISTINCT v.id) FILTER (WHERE v.tipo = 'sin_vacuna')::int AS sin_vacuna
    FROM visita v JOIN nino n ON n.id = v.nino_id
    LEFT JOIN dosis_no_aplicada dna ON dna.visita_id = v.id
    WHERE v.fecha BETWEEN $1 AND $2 AND ($3::int IS NULL OR n.comunidad_id = $3)`, p);
  const { rows: motivos } = await db.query(`
    SELECT dna.motivo, count(*)::int AS total
    FROM dosis_no_aplicada dna JOIN visita v ON v.id = dna.visita_id JOIN nino n ON n.id = v.nino_id
    WHERE v.fecha BETWEEN $1 AND $2 AND ($3::int IS NULL OR n.comunidad_id = $3)
    GROUP BY 1 ORDER BY 2 DESC`, p);
  const porCausa = {};
  for (const m of motivos) {
    const causa = R.CAUSA_MOTIVO[m.motivo];
    if (causa !== 'valida') porCausa[causa] = (porCausa[causa] || 0) + m.total;
  }
  const principal = Object.entries(porCausa).filter(([k]) => k !== 'otro').sort((a, b) => b[1] - a[1])[0];
  return {
    N6: { numerador: v.con_perdida, denominador: v.visitas, valor: R.pct(v.con_perdida, v.visitas) },
    visitas_sin_vacuna: v.sin_vacuna,
    motivos: motivos.map((m) => ({ ...m, causa: R.CAUSA_MOTIVO[m.motivo] })),
    porCausa, accion: principal ? { causa: principal[0], texto: R.ACCION_CAUSA[principal[0]] } : null,
  };
}

/** Seguimiento de casos (S1 a S7) y carga por persona. */
async function seguimiento(db, { desde, hasta, comunidad }, params) {
  const diasContacto = Number(params.dias_contacto_oportuno) || 7;
  const diasResolucion = Number(params.dias_resolucion) || 30;
  const p = [desde, hasta, comunidad || null];
  const { rows: casos } = await db.query(`
    WITH casos AS (
      SELECT a.nino_id, min(a.fecha_generada) AS apertura,
             bool_and(a.estado = 'resuelta') AS resuelto,
             max(a.fecha_cierre) FILTER (WHERE a.estado = 'resuelta') AS fecha_resuelto,
             bool_or(a.estado IN ('abierta','en_seguimiento')) AS abierto
      FROM alerta a JOIN nino n ON n.id = a.nino_id
      WHERE a.tipo <> 'proxima' AND a.fecha_generada BETWEEN $1 AND $2 AND ($3::int IS NULL OR n.comunidad_id = $3)
      GROUP BY a.nino_id)
    SELECT c.*, (SELECT min(s.fecha) FROM seguimiento s WHERE s.nino_id = c.nino_id AND s.fecha >= c.apertura) AS primer_contacto,
           (SELECT array_agg(DISTINCT s.medio) FROM seguimiento s WHERE s.nino_id = c.nino_id AND s.fecha >= c.apertura) AS medios
    FROM casos c`, p);
  const dif = (a, b) => (Date.parse(a) - Date.parse(b)) / 864e5;
  const contactadosATiempo = casos.filter((c) => c.primer_contacto && dif(c.primer_contacto, c.apertura) <= diasContacto).length;
  const contactados = casos.filter((c) => c.primer_contacto).length;
  const resueltosATiempo = casos.filter((c) => c.resuelto && c.fecha_resuelto && dif(c.fecha_resuelto, c.apertura) <= diasResolucion).length;
  const resueltos = casos.filter((c) => c.resuelto).length;

  const medios = {};
  for (const c of casos) for (const m of c.medios || []) {
    medios[m] = medios[m] || { medio: m, contactados: 0, resueltos: 0 };
    medios[m].contactados++;
    if (c.resuelto) medios[m].resueltos++;
  }

  const { rows: dias } = await db.query(`
    SELECT (a.fecha_cierre - a.fecha_generada) AS dias FROM alerta a JOIN nino n ON n.id = a.nino_id
    WHERE a.estado = 'resuelta' AND a.tipo <> 'proxima' AND a.motivo_cierre ILIKE 'Dosis aplicada%'
      AND a.fecha_cierre BETWEEN $1 AND $2 AND ($3::int IS NULL OR n.comunidad_id = $3)`, p);
  const { rows: [comp] } = await db.query(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM aplicacion a WHERE a.nino_id = s.nino_id AND NOT a.anulada
        AND a.fecha_aplicacion BETWEEN s.fecha AND s.fecha_compromiso + 7))::int AS cumplidos
    FROM seguimiento s JOIN nino n ON n.id = s.nino_id
    WHERE s.fecha_compromiso BETWEEN $1 AND LEAST($2::date, CURRENT_DATE - 7) AND ($3::int IS NULL OR n.comunidad_id = $3)`, p);
  const { rows: [rech] } = await db.query(`
    SELECT count(DISTINCT s.nino_id)::int AS total FROM seguimiento s JOIN nino n ON n.id = s.nino_id
    WHERE s.resultado = 'rechazo' AND s.fecha BETWEEN $1 AND $2 AND ($3::int IS NULL OR n.comunidad_id = $3)`, p);
  const { rows: carga } = await db.query(`
    SELECT u.id, u.nombre, count(DISTINCT ca.nino_id)::int AS asignados,
      count(DISTINCT ca.nino_id) FILTER (WHERE EXISTS (SELECT 1 FROM seguimiento s WHERE s.nino_id = ca.nino_id AND s.fecha >= CURRENT_DATE - 7))::int AS contactados_semana
    FROM caso_asignacion ca JOIN usuario u ON u.id = ca.usuario_id
    WHERE EXISTS (SELECT 1 FROM alerta a WHERE a.nino_id = ca.nino_id AND a.estado IN ('abierta','en_seguimiento') AND a.tipo <> 'proxima')
    GROUP BY u.id, u.nombre ORDER BY asignados DESC`);
  const { rows: [sinAsignar] } = await db.query(`
    SELECT count(DISTINCT a.nino_id)::int AS total FROM alerta a
    WHERE a.estado IN ('abierta','en_seguimiento') AND a.tipo <> 'proxima'
      AND NOT EXISTS (SELECT 1 FROM caso_asignacion ca WHERE ca.nino_id = a.nino_id)`);

  return {
    casos: casos.length,
    embudo: [
      { paso: 'Casos nuevos', valor: casos.length },
      { paso: `Contactados en ${diasContacto} días`, valor: contactadosATiempo },
      { paso: 'Contactados', valor: contactados },
      { paso: 'Vacunados (resueltos)', valor: resueltos },
    ],
    S2: { numerador: contactadosATiempo, denominador: casos.length, valor: R.pct(contactadosATiempo, casos.length) },
    S3: { numerador: resueltosATiempo, denominador: casos.length, valor: R.pct(resueltosATiempo, casos.length) },
    S4: { valor: R.mediana(dias.map((d) => d.dias)), n: dias.length },
    S5: Object.values(medios).map((m) => ({ ...m, valor: R.pct(m.resueltos, m.contactados) })).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)),
    S6: { numerador: comp.cumplidos, denominador: comp.total, valor: R.pct(comp.cumplidos, comp.total) },
    S7: rech.total,
    carga, sin_asignar: sinAsignar.total,
  };
}

/** Jornadas del año (J1 a J4). */
async function jornadas(db, { anio }) {
  const { rows } = await db.query(`
    SELECT j.id, j.fecha, j.estado,
      (SELECT string_agg(c.nombre, ', ' ORDER BY c.nombre) FROM jornada_comunidad jc JOIN comunidad c ON c.id = jc.comunidad_id WHERE jc.jornada_id = j.id) AS comunidades,
      (SELECT count(*) FROM jornada_nino jn WHERE jn.jornada_id = j.id)::int AS convocados,
      (SELECT count(DISTINCT a.nino_id) FROM aplicacion a JOIN jornada_nino jn ON jn.nino_id = a.nino_id AND jn.jornada_id = j.id
        WHERE a.jornada_id = j.id AND NOT a.anulada)::int AS vacunados_lista,
      (SELECT count(DISTINCT a.nino_id) FROM aplicacion a WHERE a.jornada_id = j.id AND NOT a.anulada
        AND NOT EXISTS (SELECT 1 FROM jornada_nino jn WHERE jn.jornada_id = j.id AND jn.nino_id = a.nino_id))::int AS captados,
      (SELECT count(*) FROM jornada_nino jn WHERE jn.jornada_id = j.id AND jn.asistio = false)::int AS inasistencias,
      (SELECT COALESCE(sum(dosis_llevadas), 0) FROM jornada_biologico jb WHERE jb.jornada_id = j.id)::int AS llevadas,
      (SELECT count(*) FROM aplicacion a WHERE a.jornada_id = j.id AND NOT a.anulada)::int AS aplicadas
    FROM jornada j WHERE extract(year FROM j.fecha) = $1 AND j.estado <> 'cancelada' ORDER BY j.fecha`, [anio]);
  const { rows: motivos } = await db.query(`
    SELECT COALESCE(NULLIF(trim(jn.motivo_inasistencia), ''), 'Sin motivo') AS motivo, count(*)::int AS total
    FROM jornada_nino jn JOIN jornada j ON j.id = jn.jornada_id
    WHERE jn.asistio = false AND extract(year FROM j.fecha) = $1 GROUP BY 1 ORDER BY 2 DESC`, [anio]);
  return {
    jornadas: rows.map((j) => ({ ...j, J1: R.pct(j.vacunados_lista, j.convocados), J3: R.pct(j.aplicadas, j.llevadas) })),
    motivos_inasistencia: motivos,
  };
}

/** Controles de calidad de datos (Q1 a Q7). Cada uno con conteo y la lista de registros a revisar. */
async function calidad(db, params, { desde, hasta }) {
  const dias = Number(params.dias_digitacion_tardia) || 7;
  const lista = async (sql, p = []) => (await db.query(sql, p)).rows;
  const q1 = await lista(`
    SELECT a.id, a.nino_id, n.nombre_completo, a.fecha_aplicacion, a.creado_en::date AS registrado, (a.creado_en::date - a.fecha_aplicacion) AS dias
    FROM aplicacion a JOIN nino n ON n.id = a.nino_id
    WHERE NOT a.anulada AND a.fuente_primaria AND NOT a.digitado_desde_cuaderno
      AND a.creado_en::date - a.fecha_aplicacion > $1 AND a.fecha_aplicacion BETWEEN $2 AND $3
    ORDER BY dias DESC LIMIT 100`, [dias, desde, hasta]);
  const q2 = await lista(`
    SELECT n.id AS nino_id, n.nombre_completo, n.cui IS NULL AS sin_cui, r.telefono IS NULL OR r.telefono = '' AS sin_telefono,
           n.cuaderno_id IS NULL AS sin_cuaderno
    FROM nino n LEFT JOIN nino_responsable nr ON nr.nino_id = n.id AND nr.es_principal LEFT JOIN responsable r ON r.id = nr.responsable_id
    WHERE n.estado = 'activo' AND (n.cui IS NULL OR r.telefono IS NULL OR r.telefono = '' OR n.cuaderno_id IS NULL)
    ORDER BY n.primer_apellido LIMIT 300`);
  const q3 = await lista(`
    SELECT a.id AS nino_id, a.nombre_completo, b.id AS otro_id, b.nombre_completo AS otro_nombre, a.fecha_nacimiento
    FROM nino a JOIN nino b ON b.id > a.id AND b.fecha_nacimiento = a.fecha_nacimiento
      AND similarity(f_unaccent(a.nombre_completo), f_unaccent(b.nombre_completo)) > 0.55
    WHERE a.estado = 'activo' AND b.estado = 'activo' LIMIT 50`);
  const { comunidades } = await coberturasPorComunidad(db, { desde, hasta }, params);
  // Deserción administrativa (dosis 1 − dosis 3 del período, como el SIGSA): si es negativa, hay un error de registro
  const q4 = comunidades.map((c) => ({ comunidad_id: c.id, nombre: c.nombre, D1: R.desercion(c.p1, c.p3) }))
    .filter((c) => c.D1 != null && c.D1 < -5);
  const q5 = comunidades.filter((c) => c.C2 != null && c.C2 > 100).map((c) => ({ comunidad_id: c.id, nombre: c.nombre, C2: c.C2 }));
  const q6 = await lista(`
    SELECT a.id, a.nino_id, n.nombre_completo, a.fecha_aplicacion, a.motivo_anulacion
    FROM aplicacion a JOIN nino n ON n.id = a.nino_id WHERE a.anulada AND a.fecha_aplicacion BETWEEN $1 AND $2 LIMIT 100`, [desde, hasta]);
  const q7 = comunidades.filter((c) => c.meta_menor_1 == null).map((c) => ({ comunidad_id: c.id, nombre: c.nombre }));

  const control = (codigo, titulo, ayuda, filas, grave = true) => ({ codigo, titulo, ayuda, cantidad: filas.length, ok: filas.length === 0, grave, filas });
  return [
    control('Q1', 'Dosis registradas tarde', `Se registraron más de ${dias} días después de aplicarse. Registrar el mismo día evita olvidos.`, q1),
    control('Q2', 'Fichas incompletas', 'Niños activos sin CUI, sin teléfono del responsable o sin cuaderno y fila.', q2, false),
    control('Q3', 'Posibles registros duplicados', 'Mismo nombre parecido y misma fecha de nacimiento.', q3),
    control('Q4', 'Deserción negativa', 'Hay más terceras dosis que primeras: revisar el registro o los antecedentes.', q4),
    control('Q5', 'Cobertura mayor a 100 %', 'La población meta parece baja o se cuentan niños de otros lugares.', q5),
    control('Q6', 'Dosis anuladas en el período', 'Revisar que las correcciones estén bien hechas.', q6, false),
    control('Q7', 'Comunidades sin población meta', 'Sin meta no se puede calcular la cobertura de la comunidad.', q7),
  ];
}

/**
 * Estado nominal al cierre de una fecha (para la foto mensual): recalcula con el motor usando solo las dosis
 * aplicadas hasta esa fecha. Devuelve conteos por comunidad.
 */
async function nominalAlCorte(db, corte, params) {
  const catalogo = await esq.cargarCatalogo(db);
  const meses = Number(params.edad_egreso_meses) || 84;
  const { rows: ninos } = await db.query(`
    SELECT id, comunidad_id, fecha_nacimiento FROM nino
    WHERE fecha_nacimiento <= $1 AND fecha_nacimiento + make_interval(months => $2::int) > $1::date
      AND (estado = 'activo' OR estado = 'egresado')`, [corte, meses]);
  const { rows: apls } = await db.query(`
    SELECT ad.nino_id, ad.esquema_dosis_id AS "esquemaDosisId", a.fecha_aplicacion AS fecha, ad.temporada
    FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id
    WHERE NOT ad.anulada AND NOT a.anulada AND a.fecha_aplicacion <= $1`, [corte]);
  const porNino = new Map();
  for (const a of apls) { if (!porNino.has(a.nino_id)) porNino.set(a.nino_id, []); porNino.get(a.nino_id).push(a); }
  const conteo = new Map();
  const sumar = (com, k) => {
    for (const id of [com, 0]) {
      if (!conteo.has(id)) conteo.set(id, { activos: 0, dosis_cero: 0, abandono: 0, atrasado: 0, al_dia: 0 });
      conteo.get(id)[k]++;
    }
  };
  for (const n of ninos) {
    const r = calcularEsquema({ fechaNacimiento: n.fecha_nacimiento, aplicaciones: porNino.get(n.id) || [], catalogo, fechaRef: corte, params });
    sumar(n.comunidad_id, 'activos');
    if (['dosis_cero', 'abandono', 'atrasado'].includes(r.estadoNino)) sumar(n.comunidad_id, r.estadoNino);
    else sumar(n.comunidad_id, 'al_dia');
  }
  return conteo;
}

/**
 * Foto mensual (indicador_mensual): coberturas acumuladas del año al cierre del mes y estado nominal a esa fecha.
 * Se toma el día 1 para el mes que cerró; se puede repetir para cualquier mes.
 */
async function tomarFoto(db, anio, mes) {
  const params = await esq.cargarParametros(db);
  const corte = [finDeMes(anio, mes), hoy()].sort()[0];
  const { comunidades, total } = await coberturasPorComunidad(db, { desde: `${anio}-01-01`, hasta: corte }, params);
  const nominal = await nominalAlCorte(db, corte, params);
  const filas = [];
  const agregar = (comunidadId, codigo, numerador, denominador, valor) => filas.push([anio, mes, comunidadId, codigo, numerador, denominador, valor]);
  for (const c of [...comunidades, total]) {
    const m1 = c.meta_periodo_menor_1, m12 = c.meta_periodo_1_anio;
    agregar(c.id, 'C1', c.p1, m1, c.C1);
    agregar(c.id, 'C2', c.p3, m1, c.C2);
    agregar(c.id, 'C3', c.spr1, m12, c.C3);
    agregar(c.id, 'D1', c.d_elegibles - c.d_completaron, c.d_elegibles, c.D1);
    const n = nominal.get(c.id) || { activos: 0, dosis_cero: 0, abandono: 0, atrasado: 0, al_dia: 0 };
    agregar(c.id, 'N1', n.dosis_cero, n.activos, n.dosis_cero);
    agregar(c.id, 'N3_abandono', n.abandono, n.activos, n.abandono);
    agregar(c.id, 'N3_atrasado', n.atrasado, n.activos, n.atrasado);
    agregar(c.id, 'N2', n.al_dia, n.activos, R.pct(n.al_dia, n.activos));
  }
  for (const f of filas) {
    await db.query(`
      INSERT INTO indicador_mensual (anio, mes, comunidad_id, codigo, numerador, denominador, valor) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (anio, mes, comunidad_id, codigo) DO UPDATE
      SET numerador = EXCLUDED.numerador, denominador = EXCLUDED.denominador, valor = EXCLUDED.valor, calculado_en = now()`, f);
  }
  return filas.length;
}

/** Serie mensual de un indicador desde las fotos. */
async function tendencia(db, { codigos, anio, comunidad }) {
  const { rows } = await db.query(`
    SELECT mes, codigo, numerador::float, denominador::float, valor::float FROM indicador_mensual
    WHERE anio = $1 AND comunidad_id = $2 AND codigo = ANY($3) ORDER BY mes`, [anio, Number(comunidad) || 0, codigos]);
  return rows;
}

module.exports = {
  coberturasPorComunidad, monitoreoMensual, oportunidad, oportunidadesPerdidas, seguimiento, jornadas, calidad,
  nominalAlCorte, tomarFoto, tendencia, finDeMes,
};
