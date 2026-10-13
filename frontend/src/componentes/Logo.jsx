// Logo institucional: el que subió el administrador (Administración → Logo) o, si no hay, el que trae el sistema.
// Se pide una sola vez por carga de la página y todas las pantallas lo comparten.
import { useEffect, useState } from 'react';
import predeterminado from '../assets/mspas_png.png';

let actual = null; // URL del logo personalizado ya descargado
let pedido = null;
const avisos = new Set();

function cargar(forzar = false) {
  if (pedido && !forzar) return pedido;
  pedido = fetch(`/api/marca/logo?v=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => {
      if (actual) URL.revokeObjectURL(actual);
      actual = b ? URL.createObjectURL(b) : null;
      avisos.forEach((f) => f());
    })
    .catch(() => {}); // sin red: se queda el que había
  return pedido;
}

/** Después de subir o quitar el logo: todas las pantallas lo actualizan sin recargar. */
export const recargarLogo = () => cargar(true);

export default function Logo({ alt = 'Ministerio de Salud Pública y Asistencia Social', ...resto }) {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const f = () => refrescar((n) => n + 1);
    avisos.add(f);
    cargar();
    return () => avisos.delete(f);
  }, []);
  return <img src={actual || predeterminado} alt={alt} {...resto} />;
}
