// Trabajo sin conexión en las jornadas: la jornada se descarga al teléfono antes de salir, y lo que se registra
// sin señal queda en una cola que se envía sola al volver la conexión.
// Se guarda en localStorage (pocos kilobytes por jornada): está en el teléfono aunque se cierre la aplicación.
import { api, sesionGuardada } from '../api.js';

const usuarioActual = () => sesionGuardada()?.usuario?.id;
// Lo guardado por otra cuenta en este teléfono no se muestra ni se usa (lo anterior a este cambio no trae dueño)
const esMio = (x) => x?.usuario_id == null || x.usuario_id === usuarioActual();

const CLAVE_COLA = 'vacunacion.cola';
const claveJornada = (id) => `vacunacion.jornada.${id}`;
const leer = (k, defecto) => { try { return JSON.parse(localStorage.getItem(k)) ?? defecto; } catch { return defecto; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const avisarCambio = () => window.dispatchEvent(new Event('cola-cambio'));

// ---- Copia local de una jornada ----

/** Descarga todo lo necesario para trabajar la jornada sin internet. */
export async function descargarJornada(id) {
  const jornada = await api(`/jornadas/${id}`);
  const [productos, establecimientos] = await Promise.all([
    api('/catalogos/productos'), api('/catalogos/establecimientos'),
  ]);
  const esquemas = {};
  for (const n of jornada.ninos) esquemas[n.nino_id] = await api(`/ninos/${n.nino_id}/esquema?fecha=${jornada.fecha.slice(0, 10)}`);
  const copia = { jornada, esquemas, productos, establecimientos, descargada: new Date().toISOString(), usuario_id: usuarioActual() };
  if (!escribir(claveJornada(id), copia)) throw new Error('El teléfono no tiene espacio para guardar la jornada.');
  return copia;
}
export const jornadaGuardada = (id) => { const c = leer(claveJornada(id), null); return esMio(c) ? c : null; };
export const borrarJornada = (id) => { try { localStorage.removeItem(claveJornada(id)); } catch { /* sin almacenamiento */ } };
/** Catálogos de cualquier jornada descargada: los usa la ventana de vacunar cuando no hay red. */
export function catalogoGuardado(nombre) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('vacunacion.jornada.')) { const c = leer(k, null); if (c?.[nombre]?.length) return c[nombre]; }
    }
  } catch { /* sin almacenamiento */ }
  return [];
}

// ---- Cola de registros sin enviar ----

// Cada registro se envía con la sesión de quien lo hizo: con la de otra cuenta podría rechazarse y perderse
const colaDelTelefono = () => leer(CLAVE_COLA, []);
export const cola = () => colaDelTelefono().filter(esMio);
export function encolar(op) {
  const lista = colaDelTelefono();
  lista.push({ ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, creado: new Date().toISOString(), usuario_id: usuarioActual() });
  escribir(CLAVE_COLA, lista);
  avisarCambio();
}

let enviando = false;
/**
 * Envía la cola en orden. Lo que el servidor rechaza (por ejemplo, la dosis ya estaba registrada) se quita
 * y se informa; si se corta la red a medio camino, lo que falta queda para el siguiente intento.
 */
export async function enviarCola() {
  if (enviando || !cola().length) return { enviadas: 0, rechazadas: [] };
  enviando = true;
  let enviadas = 0;
  const rechazadas = [];
  try {
    for (const op of cola()) {
      try {
        await api(op.ruta, { method: op.method, body: op.body });
        enviadas++;
      } catch (e) {
        // Sesión vencida (8 h): no es un rechazo del registro, queda para cuando vuelva a entrar
        if (e.sinRed || e.estado === 401) break;
        rechazadas.push(`${op.descripcion}: ${e.message}`);
      }
      escribir(CLAVE_COLA, colaDelTelefono().filter((x) => x.id !== op.id));
    }
  } finally {
    enviando = false;
    avisarCambio();
  }
  return { enviadas, rechazadas };
}
