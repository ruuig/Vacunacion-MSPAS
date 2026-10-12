// Reglas puras de los indicadores (análisis del flujo operativo, secciones 4 y 6). Sin base de datos: se prueban solas.
//   - Rangos de cobertura, deserción, prioridad OPS-Guatemala (Cuadro 4, SIINSAN Módulo 2)
//   - Categoría de acceso y utilización (OMS, estrategia RED, tabla 2)
//   - Lectura automática y acción sugerida: texto armado con reglas fijas, verificable

const UMBRALES = { umbral_cobertura: 95, umbral_acceso: 80, umbral_desercion: 10 };
const umbrales = (p = {}) => ({ ...UMBRALES, ...Object.fromEntries(Object.keys(UMBRALES).filter((k) => p[k] != null).map((k) => [k, Number(p[k])])) });

/** Porcentaje con un decimal; null si no hay denominador. */
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

/** Población meta del período: meta anual × días del período / días del año. */
function metaPeriodo(metaAnual, desde, hasta) {
  if (metaAnual == null) return null;
  const d = (s) => Date.parse(s + 'T00:00:00Z');
  const anio = Number(desde.slice(0, 4));
  const diasAnio = (Date.UTC(anio + 1, 0, 1) - Date.UTC(anio, 0, 1)) / 864e5;
  const dias = (d(hasta) - d(desde)) / 864e5 + 1;
  return Math.round(metaAnual * Math.min(1, dias / diasAnio) * 10) / 10;
}

/** Rango de cobertura según la guía guatemalteca. */
function rangoCobertura(valor) {
  if (valor == null) return 'sin_meta';
  if (valor > 100) return 'mayor_100';
  if (valor >= 95) return '95_100';
  if (valor >= 80) return '80_94';
  if (valor >= 50) return '50_79';
  return 'menor_50';
}

/**
 * Deserción: (dosis 1 − dosis final) / dosis 1 × 100.
 * Un valor negativo indica un problema de calidad del dato.
 */
function desercion(inicio, fin) {
  if (!inicio) return null;
  return Math.round(((inicio - fin) / inicio) * 1000) / 10;
}

/** OMS RED: 1 sin problema · 2 llegan y no regresan · 3 no llegan · 4 ambos. */
function categoriaRED(coberturaDosis1, desercionValor, p) {
  const u = umbrales(p);
  if (coberturaDosis1 == null) return null;
  const acceso = coberturaDosis1 >= u.umbral_acceso;
  const utilizacion = desercionValor == null || desercionValor <= u.umbral_desercion;
  if (acceso && utilizacion) return 1;
  if (acceso) return 2;
  if (utilizacion) return 3;
  return 4;
}

/** Matriz OPS-Guatemala: prioridad 1, 2, 3 o 0 (aceptado). */
function prioridadRiesgo(coberturaTrazador, desercionValor, p) {
  const u = umbrales(p);
  if (coberturaTrazador == null) return null;
  const desercionAceptada = desercionValor == null || Math.abs(desercionValor) <= u.umbral_desercion;
  let nivel = 'aceptada';
  if (coberturaTrazador < 80 || coberturaTrazador > 100) nivel = 'inaceptable';
  else if (coberturaTrazador < u.umbral_cobertura) nivel = 'no_aceptada';
  // [prioridad con deserción aceptada, prioridad con deserción alta]
  const tabla = { inaceptable: [2, 1], no_aceptada: [3, 2], aceptada: [0, 3] };
  return tabla[nivel][desercionAceptada ? 0 : 1];
}

const ESTRATEGIA = {
  1: { titulo: 'Sin problema', accion: 'Mantener y vigilar a los niños nuevos' },
  2: { titulo: 'Llegan, pero no regresan', accion: 'Reforzar el seguimiento: asignar casos, llamar y dar cita' },
  3: { titulo: 'No llegan al servicio', accion: 'Jornada extramural y búsqueda de niños sin registrar' },
  4: { titulo: 'No llegan y no regresan', accion: 'Jornada y seguimiento intensivo: prioridad máxima' },
};

/** Ideal acumulado al mes m: 8,3 % por mes hasta el 100 %. */
const idealAlMes = (mes) => Math.round((100 / 12) * mes * 10) / 10;

/** Lectura del monitoreo mensual (regla 6.1). */
function lecturaMonitoreo({ nombre, valor, mes }) {
  if (valor == null) return null;
  const ideal = idealAlMes(mes);
  const dif = Math.round((valor - ideal) * 10) / 10;
  const proy = mes ? Math.round((valor * 12) / mes) : null;
  const debajo = `${nombre} va ${Math.abs(dif)} puntos debajo del ritmo ideal`;
  const proyeccion = `Proyección a diciembre: ${proy} %.`;
  if (valor > 100) {
    const texto = `${nombre} pasa de 100 %: `
      + 'revisar la población meta y la residencia de los niños.';
    return { estado: 'revisar', texto };
  }
  if (dif >= 0) {
    const texto = `${nombre} va al ritmo (${valor} % contra ${ideal} % ideal). ${proyeccion}`;
    return { estado: 'ok', texto };
  }
  if (dif >= -10) return { estado: 'atencion', texto: `${debajo}. ${proyeccion}` };
  const texto = `${debajo}: hace falta un plan de recuperación. ${proyeccion}`;
  return { estado: 'critico', texto };
}

/** Lectura por comunidad para el tablero territorial. */
function lecturaComunidad(c) {
  if (c.categoria == null) return `${c.nombre}: sin población meta; se muestran solo los casos con nombre.`;
  const e = ESTRATEGIA[c.categoria];
  return `${c.nombre}: ${e.titulo.toLowerCase()} → ${e.accion.toLowerCase()}.`;
}

/** Causa (personal, servicio o familia) de cada motivo de no vacunación (regla 6.4). */
const CAUSA_MOTIVO = {
  falsa_contraindicacion: 'personal',
  posterga_personal: 'personal',
  desabastecimiento: 'servicio',
  rechazo: 'familia',
  contraindicacion: 'valida',
  otro: 'otro',
};
const ACCION_CAUSA = {
  personal: 'Actualizar al personal en contraindicaciones verdaderas y vacunación simultánea',
  servicio: 'Revisar la solicitud de biológicos con el área de salud',
  familia: 'Consejería a la familia, materiales en poqomam y apoyo del líder comunitario',
};

/** Mediana de una lista de números. */
function mediana(v) {
  const s = v.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

module.exports = {
  umbrales, pct, metaPeriodo, rangoCobertura, desercion, categoriaRED, prioridadRiesgo, ESTRATEGIA, idealAlMes,
  lecturaMonitoreo, lecturaComunidad, CAUSA_MOTIVO, ACCION_CAUSA, mediana,
};
