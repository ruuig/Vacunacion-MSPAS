// Motor de cálculo del esquema. Módulo puro: sin base de datos.
// Fechas 'YYYY-MM-DD'; internamente se trabaja en días UTC.
//
// Tres tipos de serie:
//  - regular: dosis con edad e intervalo; cuentan para atraso y dosis cero.
//    El abandono (OPS: inició la serie y no la terminó) solo se mide en la serie primaria (menor de 1 año);
//    un refuerzo vencido es atraso, no abandono.
//  - estacional (influenza): solo dentro de la temporada; 2 dosis sin antecedente, 1 con antecedente.
//  - informativa (SPR dosis cero): se registra pero no cuenta en el esquema.

const DIA = 86400000;
const aDia = (s) => Math.floor(Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / DIA);
const aFecha = (d) => new Date(d * DIA).toISOString().slice(0, 10);

const PARAMS_DEFECTO = {
  dias_ventana_aviso: 7,
  dias_tolerancia_atraso: 28,
  dias_abandono: 90,
  edad_egreso_meses: 84,
  influenza_inicio: null, // 'YYYY-MM-DD'
  influenza_fin: null,
};

const INFLUENZA = { edadMin: 180, edadMax: 1094, intervaloMin: 28, intervaloRec: 30 };

/** Temporada de influenza a la que pertenece una fecha: año en que empieza (julio a junio). */
function temporadaDe(fecha) {
  const [a, m] = String(fecha).slice(0, 7).split('-').map(Number);
  return m >= 7 ? a : a - 1;
}

function mesesEntre(nac, fecha) {
  const [a1, m1, d1] = nac.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = fecha.slice(0, 10).split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** Grupo de edad de influenza impreso en el 5a. */
function grupoInfluenza(nac, fecha) {
  const m = mesesEntre(nac, fecha);
  if (m >= 6 && m <= 11) return '6_11';
  if (m >= 12 && m <= 23) return '12_23';
  if (m >= 24 && m <= 35) return '24_35';
  return null;
}

/**
 * Regular o recuperación (página 5 del 5a): una dosis de "menor de 1 año"
 * aplicada con 12 meses o más, o una de 12 o 18 meses aplicada con 2 años o más.
 * R2, influenza e informativas nunca son de recuperación.
 */
function esRecuperacion(dosis, fechaNacimiento, fecha) {
  if (dosis.estacional || dosis.informativa) return false;
  const edad = mesesEntre(fechaNacimiento, fecha);
  if (dosis.edadRecomendadaDias < 365) return edad >= 12;
  if (dosis.edadRecomendadaDias <= 548) return edad >= 24;
  return false;
}

const tipo = (d) => (d.estacional ? 'estacional' : d.informativa ? 'informativa' : 'regular');
const vigentes = (aplicaciones) => aplicaciones.filter((a) => !a.anulada);

/** Mapa esquemaDosisId -> día de aplicación para series no estacionales. */
function mapaAplicadas(aplicaciones, catalogo) {
  const estacionales = new Set(catalogo.filter((d) => d.estacional).map((d) => d.id));
  const m = new Map();
  for (const a of vigentes(aplicaciones)) if (!estacionales.has(a.esquemaDosisId)) m.set(a.esquemaDosisId, aDia(a.fecha));
  return m;
}

/** Aplicaciones de influenza con su temporada y número de dosis. */
function aplicacionesInfluenza(aplicaciones, catalogo) {
  const porId = new Map(catalogo.filter((d) => d.estacional).map((d) => [d.id, d]));
  return vigentes(aplicaciones)
    .filter((a) => porId.has(a.esquemaDosisId))
    .map((a) => ({ ...a, numero: porId.get(a.esquemaDosisId).numero, temporada: a.temporada ?? temporadaDe(a.fecha) }));
}

function aplicaAlNino(dosis, nac) {
  return dosis.activo !== false && !(dosis.aplicaNacidosDesde && nac < aDia(dosis.aplicaNacidosDesde));
}

function estadoEn(F, programada, limite, P, puedeAtrasarse = true) {
  if (limite != null && F > limite) return 'no_aplicable';
  if (puedeAtrasarse && F > programada + P.dias_tolerancia_atraso) return 'atrasada';
  if (F >= programada) return 'le_toca';
  if (programada - F <= P.dias_ventana_aviso) return 'proxima';
  return 'pendiente';
}

function nuevaFila(d) {
  return {
    esquemaDosisId: d.id, serieCodigo: d.serieCodigo, numero: d.numero, etiqueta: d.etiqueta, tipo: tipo(d),
    edadRecomendadaDias: d.edadRecomendadaDias, primaria: d.edadRecomendadaDias < 365, estado: null, fechaAplicada: null, fechaMinima: null, fechaProgramada: null, fechaLimite: null, diasAtraso: 0,
  };
}

/** Dosis de influenza de la temporada vigente a la fecha F. */
function calcularInfluenza(dosisCat, nac, F, aplicaciones, catalogo, P) {
  const apps = aplicacionesInfluenza(aplicaciones, catalogo);
  const temporada = temporadaDe(aFecha(F));
  const deEsta = apps.filter((a) => a.temporada === temporada);
  const previas = apps.filter((a) => a.temporada < temporada);
  const enTemporada = P.influenza_inicio && P.influenza_fin && F >= aDia(P.influenza_inicio) && F <= aDia(P.influenza_fin);
  const edadOk = F - nac >= INFLUENZA.edadMin && F - nac <= INFLUENZA.edadMax;
  const d1 = dosisCat.find((d) => d.numero === 1);
  const d2 = dosisCat.find((d) => d.numero === 2);
  const out = [];

  for (const a of deEsta) {
    const d = dosisCat.find((x) => x.numero === a.numero);
    if (d) out.push({ ...nuevaFila(d), estado: 'aplicada', fechaAplicada: aFecha(aDia(a.fecha)), temporada });
  }
  if (!enTemporada || !edadOk) return out;

  const a1 = deEsta.find((a) => a.numero === 1);
  if (!a1 && d1) {
    const programada = Math.max(aDia(P.influenza_inicio), nac + INFLUENZA.edadMin);
    out.push({ ...nuevaFila(d1), temporada, fechaMinima: aFecha(programada), fechaProgramada: aFecha(programada),
      fechaLimite: aFecha(Math.min(aDia(P.influenza_fin), nac + INFLUENZA.edadMax)),
      estado: estadoEn(F, programada, null, P, false) });
  }
  // 2ª dosis solo si nunca se vacunó antes de esta temporada
  if (d2 && previas.length === 0 && !deEsta.some((a) => a.numero === 2)) {
    const fila = { ...nuevaFila(d2), temporada };
    if (!a1) fila.estado = 'en_espera';
    else {
      const b = aDia(a1.fecha);
      fila.fechaMinima = aFecha(b + INFLUENZA.intervaloMin);
      fila.fechaProgramada = aFecha(b + INFLUENZA.intervaloRec);
      fila.fechaLimite = aFecha(Math.min(aDia(P.influenza_fin), nac + INFLUENZA.edadMax));
      fila.estado = estadoEn(F, b + INFLUENZA.intervaloRec, aDia(fila.fechaLimite), P, false);
    }
    out.push(fila);
  }
  return out;
}

/** Estado general del niño: se revisa del caso más grave al más leve. */
function estadoGeneral({ esDosisCero, abandono, regulares, dosis }) {
  const alguna = (lista, ...estados) => lista.some((r) => estados.includes(r.estado));
  if (esDosisCero) return 'dosis_cero';
  if (abandono) return 'abandono';
  if (alguna(regulares, 'atrasada')) return 'atrasado';
  if (alguna(dosis, 'proxima', 'le_toca')) return 'proximo';
  const completo = regulares.every((r) => ['aplicada', 'no_aplicable'].includes(r.estado));
  return completo ? 'esquema_completo' : 'al_dia';
}

/**
 * Calcula el estado de cada dosis y del niño a la fecha de referencia (hoy o la de una jornada).
 * aplicaciones: [{ esquemaDosisId, fecha, temporada?, anulada? }]
 * catalogo: filas de esquema_dosis en camelCase con serieCodigo, estacional e informativa.
 */
function calcularEsquema({ fechaNacimiento, aplicaciones = [], catalogo, fechaRef, params = {} }) {
  const P = { ...PARAMS_DEFECTO, ...params };
  const nac = aDia(fechaNacimiento);
  const F = aDia(fechaRef);
  const aplicadas = mapaAplicadas(aplicaciones, catalogo);
  const orden = [...catalogo].sort((a, b) => a.orden - b.orden);
  const porId = new Map(catalogo.map((d) => [d.id, d]));
  // Series en recuperación: alguna de sus dosis se puso después de su edad recomendada (más la tolerancia)
  const seriesEnRecuperacion = new Set();
  for (const [dosisId, dia] of aplicadas) {
    const x = porId.get(dosisId);
    if (x && dia > nac + x.edadRecomendadaDias + P.dias_tolerancia_atraso) seriesEnRecuperacion.add(x.serieCodigo);
  }
  const dosis = [];

  const estacional = orden.filter((d) => d.estacional && aplicaAlNino(d, nac));
  for (const d of orden) {
    if (!aplicaAlNino(d, nac) || d.estacional) continue;
    const r = nuevaFila(d);

    if (aplicadas.has(d.id)) {
      dosis.push({ ...r, estado: 'aplicada', fechaAplicada: aFecha(aplicadas.get(d.id)) });
      continue;
    }
    if (d.informativa) continue; // solo aparece si se aplicó
    dosis.push(r);

    // Dosis anterior de la serie. Si esa ya no se puede poner (pasó su edad máxima, como la 2a de neumococo
    // después del año), la serie continúa desde la última que sí se aplicó.
    let previa = null;
    let dosisPrevia = d.dosisPreviaId ? porId.get(d.dosisPreviaId) : null;
    while (dosisPrevia && !aplicadas.has(dosisPrevia.id) && dosisPrevia.edadMaximaDias != null && F > nac + dosisPrevia.edadMaximaDias) {
      dosisPrevia = dosisPrevia.dosisPreviaId ? porId.get(dosisPrevia.dosisPreviaId) : null;
    }
    if (dosisPrevia) {
      if (!aplicadas.has(dosisPrevia.id)) { r.estado = 'en_espera'; continue; }
      previa = aplicadas.get(dosisPrevia.id);
    }
    // Fecha válida: la más tardía entre la edad exigida y el intervalo desde la previa
    const desdePrevia = (intervalo) => (previa != null ? previa + (intervalo || 0) : -Infinity);
    const minima = Math.max(nac + d.edadMinimaDias, desdePrevia(d.intervaloMinimoDias));
    // Esquema acelerado (recuperación): si la dosis anterior se puso tarde, las siguientes van con el intervalo mínimo
    // (cada mes; el refuerzo, 6 meses después) desde la edad mínima, como hace el servicio. Si va a tiempo, a su edad recomendada.
    const previaTarde = previa != null && seriesEnRecuperacion.has(d.serieCodigo);
    const programada = previaTarde
      ? Math.max(nac + d.edadMinimaDias, desdePrevia(d.intervaloMinimoDias))
      : Math.max(nac + d.edadRecomendadaDias, desdePrevia(d.intervaloMinimoDias));
    const limite = d.edadMaximaDias != null ? nac + d.edadMaximaDias : null;
    r.fechaMinima = aFecha(minima);
    r.fechaProgramada = aFecha(programada);
    r.fechaLimite = limite != null ? aFecha(limite) : null;
    r.estado = estadoEn(F, programada, limite, P);
    if (r.estado === 'atrasada') r.diasAtraso = F - programada;
  }
  if (estacional.length) dosis.push(...calcularInfluenza(estacional, nac, F, aplicaciones, catalogo, P));

  // Estado del niño y alertas (solo las regulares cuentan para atraso)
  const regulares = dosis.filter((r) => r.tipo === 'regular');
  const tieneAlguna = dosis.some((r) => r.estado === 'aplicada');
  const dpt1 = dosis.find((r) => r.serieCodigo === 'DPT_HIB_HB' && r.numero === 1);
  const esDosisCero = dpt1 && dpt1.estado === 'atrasada' && F - nac > 56 + P.dias_tolerancia_atraso;

  const alertas = [];
  let abandono = false;
  for (const r of dosis) {
    if (r.tipo === 'regular' && r.estado === 'atrasada') {
      if (esDosisCero && r === dpt1) alertas.push({ tipo: 'dosis_cero', prioridad: 'alta', esquemaDosisId: r.esquemaDosisId });
      else if (tieneAlguna && r.primaria && r.diasAtraso > P.dias_abandono) {
        abandono = true;
        alertas.push({ tipo: 'abandono', prioridad: 'alta', esquemaDosisId: r.esquemaDosisId });
      } else alertas.push({ tipo: 'atrasada', prioridad: 'media', esquemaDosisId: r.esquemaDosisId });
    } else if (r.estado === 'proxima' || r.estado === 'le_toca') {
      alertas.push({ tipo: 'proxima', prioridad: 'baja', esquemaDosisId: r.esquemaDosisId });
    }
  }

  const estadoNino = estadoGeneral({ esDosisCero, abandono, regulares, dosis });

  // Próxima cita (no antes de F) y las vacunas de esa cita, para copiar al carné
  const programables = dosis.filter((r) => r.fechaProgramada && !['aplicada', 'no_aplicable', 'en_espera'].includes(r.estado));
  const cita = (r) => Math.max(F, aDia(r.fechaProgramada));
  const diaCita = programables.length ? Math.min(...programables.map(cita)) : null;
  const proximaCita = diaCita != null ? aFecha(diaCita) : null;
  const proximaCitaVacunas = programables.filter((r) => cita(r) === diaCita).map((r) => r.etiqueta);

  const leTocaHoy = dosis.filter((r) => ['le_toca', 'atrasada'].includes(r.estado) && aDia(r.fechaMinima) <= F);

  return { fechaRef: aFecha(F), estadoNino, dosis, alertas, proximaCita, proximaCitaVacunas, leTocaHoy };
}

/** Valida registrar una dosis del esquema en una fecha. Devuelve { ok, error }. */
function validarAplicacion({
  fechaNacimiento, aplicaciones = [], catalogo, esquemaDosisId, fecha,
}) {
  const rechazo = (error) => ({ ok: false, error });
  const d = catalogo.find((x) => x.id === esquemaDosisId);
  if (!d) return rechazo('La dosis no existe en el esquema.');
  const nac = aDia(fechaNacimiento);
  const f = aDia(fecha);
  if (f < nac) return rechazo('La fecha de aplicación es anterior al nacimiento.');
  if (!aplicaAlNino(d, nac)) {
    return rechazo(`${d.etiqueta} no aplica para este niño por su fecha de nacimiento.`);
  }

  if (d.estacional) {
    if (f - nac < INFLUENZA.edadMin || f - nac > INFLUENZA.edadMax)
      return { ok: false, error: 'La influenza pediátrica se aplica de 6 a 35 meses de edad.' };
    const apps = aplicacionesInfluenza(aplicaciones, catalogo);
    const temporada = temporadaDe(fecha);
    const deEsta = apps.filter((a) => a.temporada === temporada);
    if (deEsta.some((a) => a.numero === d.numero)) return { ok: false, error: `${d.etiqueta} ya está registrada en esta temporada.` };
    if (d.numero === 2) {
      if (apps.some((a) => a.temporada < temporada)) return { ok: false, error: 'Con antecedente de influenza solo corresponde 1 dosis por temporada.' };
      const a1 = deEsta.find((a) => a.numero === 1);
      if (!a1) return { ok: false, error: 'Falta registrar Influenza 1ª de esta temporada.' };
      if (f < aDia(a1.fecha) + INFLUENZA.intervaloMin)
        return { ok: false, error: `No se cumple el intervalo mínimo de 1 mes desde Influenza 1ª; puede aplicarse desde el ${aFecha(aDia(a1.fecha) + INFLUENZA.intervaloMin)}.` };
    }
    return { ok: true };
  }

  const aplicadas = mapaAplicadas(aplicaciones, catalogo);
  if (aplicadas.has(d.id)) {
    return rechazo(`${d.etiqueta} ya está registrada (${aFecha(aplicadas.get(d.id))}).`);
  }
  const edadMinima = nac + d.edadMinimaDias;
  if (f < edadMinima) {
    return rechazo(`Todavía no tiene la edad mínima para ${d.etiqueta}; `
      + `puede aplicarse desde el ${aFecha(edadMinima)}.`);
  }
  const edadMaxima = d.edadMaximaDias != null ? nac + d.edadMaximaDias : null;
  if (edadMaxima != null && f > edadMaxima) {
    return rechazo(`${d.etiqueta} ya no se puede aplicar: `
      + `pasó la edad máxima (${aFecha(edadMaxima)}).`);
  }
  if (d.dosisPreviaId) {
    const previa = catalogo.find((x) => x.id === d.dosisPreviaId);
    if (!aplicadas.has(d.dosisPreviaId)) {
      return rechazo(`Falta registrar ${previa ? previa.etiqueta : 'la dosis anterior'}.`);
    }
    const minInt = d.intervaloMinimoDias || 0;
    const desde = aplicadas.get(d.dosisPreviaId) + minInt;
    if (f < desde) {
      return rechazo(`No se cumple el intervalo mínimo de ${minInt} días `
        + `desde ${previa.etiqueta}; puede aplicarse desde el ${aFecha(desde)}.`);
    }
  }
  return { ok: true };
}

/**
 * Dosis del esquema que cumple un producto aplicado en una fecha: la siguiente de cada serie que cubre.
 * Hexavalente cumple DPT y polio; una serie iniciada con pentavalente continúa sin reiniciarse.
 * SPR antes de los 12 meses cae en "SPR dosis cero" (informativa) y no en SPR 1.
 * Devuelve [{ esquemaDosisId, temporada }] (temporada = 0 fuera de influenza).
 */
function dosisQueCumpleProducto({ seriesProducto, catalogo, aplicaciones = [], fechaNacimiento, fecha, limites = {} }) {
  const nac = aDia(fechaNacimiento);
  const f = aDia(fecha);
  const aplicadas = mapaAplicadas(aplicaciones, catalogo);
  const regulares = [];
  const informativas = [];

  for (const serie of seriesProducto) {
    const deSerie = catalogo.filter((d) => d.serieCodigo === serie && aplicaAlNino(d, nac)).sort((a, b) => a.numero - b.numero);
    if (!deSerie.length) continue;

    if (deSerie[0].estacional) {
      const apps = aplicacionesInfluenza(aplicaciones, catalogo);
      const temporada = temporadaDe(fecha);
      const deEsta = apps.filter((a) => a.temporada === temporada);
      const previas = apps.some((a) => a.temporada < temporada);
      let numero = null;
      if (!deEsta.length) numero = 1;
      else if (!previas && deEsta.some((a) => a.numero === 1) && !deEsta.some((a) => a.numero === 2)) numero = 2;
      const d = deSerie.find((x) => x.numero === numero);
      if (d) regulares.push({ esquemaDosisId: d.id, temporada });
      continue;
    }

    const siguiente = deSerie.find((d) => !aplicadas.has(d.id));
    if (!siguiente) continue;
    // Hasta qué dosis cubre el producto: la hexavalente no cumple el R1 de polio (ese es OPV)
    if (limites[serie] != null && siguiente.numero > limites[serie]) continue;
    if (siguiente.informativa) {
      const dentro = f >= nac + siguiente.edadMinimaDias && (siguiente.edadMaximaDias == null || f <= nac + siguiente.edadMaximaDias);
      if (dentro) informativas.push({ esquemaDosisId: siguiente.id, temporada: 0 });
    } else regulares.push({ esquemaDosisId: siguiente.id, temporada: 0 });
  }
  return informativas.length ? informativas : regulares;
}

module.exports = {
  calcularEsquema, validarAplicacion, dosisQueCumpleProducto, esRecuperacion, grupoInfluenza, temporadaDe,
  mesesEntre, aDia, aFecha,
};
