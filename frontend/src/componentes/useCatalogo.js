import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { catalogoGuardado } from './fueraDeLinea.js';

const cache = {};

/** Olvida una lista para que se vuelva a pedir (después de crear o editar en administración). */
export const invalidarCatalogo = (nombre) => { delete cache[nombre]; };

/** Carga una lista de /api/catalogos/:nombre una sola vez por sesión de página. */
export function useCatalogo(nombre) {
  const [lista, setLista] = useState(cache[nombre] || []);
  useEffect(() => {
    if (cache[nombre]) return;
    api('/catalogos/' + nombre)
      .then((l) => { cache[nombre] = l; setLista(l); })
      // Sin red: la copia guardada al descargar una jornada (en otras pantallas, la lista queda vacía)
      .catch(() => { const l = catalogoGuardado(nombre); if (l.length) setLista(l); });
  }, [nombre]);
  return lista;
}
