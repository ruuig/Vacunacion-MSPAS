// Datos del centro de salud que configura el administrador (Administración → Centro de salud).
// Se leen una vez y se guardan en memoria; las funciones que no son componentes usan centroActual().
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const PREDETERMINADO = { nombre: 'Centro de Salud', municipio: '', departamento: '', area_salud: '', distrito: '' };
let actual = (() => {
  try { return { ...PREDETERMINADO, ...JSON.parse(localStorage.getItem('centro') || '{}') }; } catch { return PREDETERMINADO; }
})();
let pedido = null;
const oyentes = new Set();

function cargar(forzar = false) {
  if (pedido && !forzar) return pedido;
  pedido = api('/marca/centro').then((c) => {
    actual = { ...PREDETERMINADO, ...c };
    try { localStorage.setItem('centro', JSON.stringify(actual)); } catch { /* sin almacenamiento */ }
    oyentes.forEach((f) => f(actual));
    return actual;
  }).catch(() => actual);
  return pedido;
}

/** Datos del centro en este momento (para textos armados fuera de un componente). */
export const centroActual = () => actual;

/** Después de guardar los datos del centro, para que todas las pantallas se actualicen. */
export const recargarCentro = () => cargar(true);

/** «C. S. San Luis Jilotepeque, Jalapa» */
export const centroCorto = (c = actual) => [c.municipio ? `C. S. ${c.municipio}` : c.nombre, c.departamento].filter(Boolean).join(', ');

export function useCentro() {
  const [c, setC] = useState(actual);
  useEffect(() => {
    oyentes.add(setC);
    cargar();
    return () => oyentes.delete(setC);
  }, []);
  return c;
}
