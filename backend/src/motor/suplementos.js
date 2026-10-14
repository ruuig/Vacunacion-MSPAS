// Suplementación con micronutrientes y desparasitación (página del cuaderno SIGSA 5a). Módulo puro.
// Cada dosis se da dentro de un rango de edad (6 a 11 meses y cada año hasta los 5); cada una, 6 meses después de la anterior
// del mismo insumo. Si el niño sale del rango sin recibirla, esa dosis ya no se da.
const { aDia, aFecha } = require('./motorEsquema');

const AVISO_DIAS = 30; // «próxima»: le toca en el próximo mes

/**
 * Estado de cada dosis de suplemento a la fecha F.
 * catalogo: [{ id, insumo, grupo, numero, etiqueta, edad_desde_dias, edad_hasta_dias, intervalo_dias, orden }]
 * entregas: [{ suplemento_dosis_id, fecha }]
 */
function calcularSuplementos({ fechaNacimiento, catalogo, entregas = [], fechaRef }) {
  const nac = aDia(fechaNacimiento);
  const F = aDia(fechaRef);
  const dadas = new Map(entregas.map((e) => [e.suplemento_dosis_id, aDia(e.fecha)]));
  const orden = [...catalogo].sort((a, b) => a.orden - b.orden);
  return orden.map((d) => {
    const base = { id: d.id, insumo: d.insumo, grupo: d.grupo, numero: d.numero, etiqueta: d.etiqueta, fecha: null, programada: null };
    if (dadas.has(d.id)) return { ...base, estado: 'aplicada', fecha: aFecha(dadas.get(d.id)) };
    const hasta = nac + d.edad_hasta_dias;
    let desde = nac + d.edad_desde_dias;
    if (d.numero > 1) {
      const anterior = orden.find((x) => x.insumo === d.insumo && x.grupo === d.grupo && x.numero === d.numero - 1);
      if (anterior && !dadas.has(anterior.id)) return { ...base, estado: F > hasta ? 'no_dada' : 'en_espera' };
    }
    // 6 meses (intervalo) después de la última entrega del mismo insumo, aunque haya sido en la edad anterior
    const previas = orden.filter((x) => x.insumo === d.insumo && x.orden < d.orden && dadas.has(x.id)).map((x) => dadas.get(x.id));
    if (previas.length && d.intervalo_dias) desde = Math.max(desde, Math.max(...previas) + d.intervalo_dias);
    if (desde > hasta) return { ...base, estado: 'no_aplica' }; // ya no alcanza dentro del rango de edad
    if (F > hasta) return { ...base, estado: 'no_dada', programada: aFecha(desde) };
    if (F >= desde) return { ...base, estado: 'le_toca', programada: aFecha(desde), hasta: aFecha(hasta) };
    return { ...base, estado: desde - F <= AVISO_DIAS ? 'proxima' : 'pendiente', programada: aFecha(desde), hasta: aFecha(hasta) };
  });
}

module.exports = { calcularSuplementos };
