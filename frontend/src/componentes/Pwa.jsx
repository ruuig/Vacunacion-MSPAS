// App instalable: botón de instalación, aviso sin conexión y aviso de versión nueva.
import { useCallback, useEffect, useState } from 'react';
import { CloudUpload, Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { cola, enviarCola } from './fueraDeLinea.js';
import { useDialogos } from './Dialogos.jsx';

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// El navegador ofrece la instalación una sola vez por carga: se guarda el evento para usarlo cuando la persona quiera
let eventoInstalar = null;
const avisos = new Set();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; avisos.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { eventoInstalar = null; avisos.forEach((f) => f()); });

/** { puede, ios, instalar } — puede: el navegador permite instalar; ios: mostrar instrucciones manuales. */
export function useInstalar() {
  const [, refrescar] = useState(0);
  useEffect(() => {
    const f = () => refrescar((n) => n + 1);
    avisos.add(f);
    return () => avisos.delete(f);
  }, []);
  const instalar = async () => {
    if (!eventoInstalar) return;
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
    avisos.forEach((f) => f());
  };
  return { puede: Boolean(eventoInstalar) && !instalada(), ios: esIOS() && !instalada(), instalar };
}

export function BotonInstalar({ className = '' }) {
  const { puede, ios, instalar } = useInstalar();
  const [ayuda, setAyuda] = useState(false);
  if (!puede && !ios) return null;
  return (
    <>
      <button type="button" className={`instalar ${className}`} onClick={() => (puede ? instalar() : setAyuda(true))}>
        <span className="ic"><Download size={17} /></span>
        <span><strong>Instalar la app</strong><small>Acceso directo, pantalla completa</small></span>
      </button>
      {ayuda && (
        <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && setAyuda(false)}>
          <div className="modal chico">
            <div className="modal-cab"><h2>Instalar en iPhone o iPad</h2>
              <button className="btn btn-fantasma btn-icono" onClick={() => setAyuda(false)} aria-label="Cerrar"><X size={18} /></button></div>
            <div className="modal-cuerpo">
              <ol className="pasos">
                <li>Toque el botón <strong>Compartir</strong> <Share size={15} style={{ verticalAlign: '-2px' }} /> en la barra de Safari.</li>
                <li>Elija <strong>“Agregar a pantalla de inicio”</strong>.</li>
                <li>Toque <strong>Agregar</strong>. El ícono del MSPAS aparecerá junto a sus otras aplicaciones.</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * navigator.onLine solo dice si hay red local, no si llega al servidor: además se consulta al servidor
 * (ruta /api/auth, que el service worker nunca responde desde la caché) al cargar, al cambiar la red y cada 30 s.
 */
export function useConexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    let vivo = true;
    const comprobar = async () => {
      if (!navigator.onLine) { setEnLinea(false); return; }
      try { await fetch('/api/auth/ping', { cache: 'no-store' }); if (vivo) setEnLinea(true); } catch { if (vivo) setEnLinea(false); }
    };
    const no = () => setEnLinea(false);
    comprobar();
    const t = setInterval(comprobar, 30000);
    window.addEventListener('online', comprobar);
    window.addEventListener('offline', no);
    return () => { vivo = false; clearInterval(t); window.removeEventListener('online', comprobar); window.removeEventListener('offline', no); };
  }, []);
  return enLinea;
}

export function AvisoConexion() {
  const enLinea = useConexion();
  if (enLinea) return null;
  return (
    <div className="aviso-conexion" role="status">
      <WifiOff size={16} />
      <span><strong>Sin conexión.</strong> En las jornadas descargadas puede seguir vacunando: se guarda en el teléfono y se envía al volver la señal.</span>
    </div>
  );
}

/** Cuando se publica una versión nueva del sistema, ofrece actualizar sin perder lo que se está haciendo. */
export function AvisoActualizacion() {
  const { needRefresh: [hayNueva, setHayNueva], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Revisar si hay versión nueva cada hora mientras la app está abierta
      if (registro) setInterval(() => registro.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
  if (!hayNueva) return null;
  return (
    <div className="toasts" style={{ zIndex: 210 }}>
      <div className="toast">
        <RefreshCw size={18} />
        <span>Hay una nueva versión del sistema.</span>
        <button className="btn btn-sm btn-blanco-toast" onClick={() => updateServiceWorker(true)}>Actualizar</button>
        <button onClick={() => setHayNueva(false)} aria-label="Más tarde"><X size={16} /></button>
      </div>
    </div>
  );
}

/** Al cerrar sesión se borran las consultas guardadas: el equipo puede ser compartido. */
export async function borrarDatosGuardados() {
  if ('caches' in window) await caches.delete('api-consultas').catch(() => {});
}

/**
 * Registros hechos sin señal que aún están en el teléfono. Se envían solos al volver la conexión
 * (y cada minuto mientras queden); al terminar se avisa cuántos se enviaron y si alguno no se aceptó.
 */
export function ColaSinEnviar() {
  const enLinea = useConexion();
  const { avisar } = useDialogos();
  const [pendientes, setPendientes] = useState(() => cola().length);
  useEffect(() => {
    const f = () => setPendientes(cola().length);
    window.addEventListener('cola-cambio', f);
    window.addEventListener('storage', f);
    return () => { window.removeEventListener('cola-cambio', f); window.removeEventListener('storage', f); };
  }, []);
  const enviar = useCallback(async () => {
    const r = await enviarCola();
    if (r.enviadas) avisar(`Se enviaron ${r.enviadas === 1 ? '1 registro guardado' : `${r.enviadas} registros guardados`} sin conexión.`);
    if (r.rechazadas.length) avisar(`No se aceptó: ${r.rechazadas.join(' · ')}`, 'error');
    if (r.enviadas || r.rechazadas.length) window.dispatchEvent(new Event('cola-enviada'));
  }, [avisar]);
  const hay = pendientes > 0;
  useEffect(() => {
    if (!enLinea || !hay) return undefined;
    enviar();
    const t = setInterval(enviar, 60000);
    return () => clearInterval(t);
  }, [enLinea, hay, enviar]);
  if (!hay) return null;
  return (
    <div className="aviso-cola" role="status">
      <CloudUpload size={17} />
      <span><strong>{pendientes === 1 ? '1 registro' : `${pendientes} registros`} en este teléfono sin enviar.</strong>{' '}
        {enLinea ? 'Enviando…' : 'Se enviarán solos cuando vuelva la señal.'}</span>
      {enLinea && <button type="button" className="btn btn-sm" onClick={enviar}>Enviar ahora</button>}
    </div>
  );
}
