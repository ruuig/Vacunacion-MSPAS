// Cliente de la API: agrega el token y convierte errores en excepciones con el mensaje del servidor.
const CLAVE = 'vacunacion.sesion';

export const sesionGuardada = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; }
};
export const guardarSesion = (s) => (s ? localStorage.setItem(CLAVE, JSON.stringify(s)) : localStorage.removeItem(CLAVE));

const SIN_SERVIDOR = 'No se pudo conectar con el servidor. Intente de nuevo.';
const SIN_INTERNET = 'Sin conexión a internet. '
  + 'Esta acción se podrá hacer cuando vuelva la señal.';

// Consultas e inicio de sesión se pueden repetir sin riesgo; un registro no (podría guardarse dos veces)
const repetible = (method, ruta) => method === 'GET' || ruta === '/auth/login';
const fallaDeRed = (res) => res.status >= 502 || (res.status === 500 && !res.headers.get('content-type')?.includes('json'));

export async function api(ruta, { method = 'GET', body } = {}) {
  const s = sesionGuardada();
  const headers = { 'Content-Type': 'application/json' };
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  const pedir = () => fetch('/api' + ruta, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let res;
  try {
    res = await pedir();
    // Una conexión cortada a medio camino se reintenta una vez antes de mostrar error
    if (fallaDeRed(res) && repetible(method, ruta)) res = await pedir();
  } catch {
    try {
      if (!repetible(method, ruta)) throw new Error();
      res = await pedir();
    } catch {
      // Sin red y sin copia guardada de esta consulta: sinRed permite guardar el registro en el teléfono
      throw Object.assign(new Error(navigator.onLine ? SIN_SERVIDOR : SIN_INTERNET), { sinRed: true });
    }
  }
  if (fallaDeRed(res)) throw Object.assign(new Error(SIN_SERVIDOR), { sinRed: true });
  const datos = await res.json().catch(() => ({}));
  if (res.status === 401 && s) {
    guardarSesion(null);
    window.location.href = '/login';
  }
  if (!res.ok) throw Object.assign(new Error(datos.error || 'No se pudo completar la operación.'), { estado: res.status });
  return datos;
}

export const qs = (o) => '?' + new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
