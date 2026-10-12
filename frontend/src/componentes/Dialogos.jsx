// Diálogos propios (en lugar de prompt/confirm del navegador) y avisos flotantes.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, X, XCircle } from 'lucide-react';
import { Modal } from './ui.jsx';

const Ctx = createContext(null);
export const useDialogos = () => useContext(Ctx);

export function ProveedorDialogos({ children }) {
  const [dialogo, setDialogo] = useState(null);
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);

  const abrir = useCallback((d) => new Promise((resolve) => setDialogo({ ...d, resolve })), []);

  /** confirmar({ titulo, mensaje, aceptar, peligro }) → true | false */
  const confirmar = useCallback((d) => abrir({ ...d, tipo: 'confirmar' }), [abrir]);
  /** pedirTexto({ titulo, mensaje, etiqueta, aceptar, peligro, opcional }) → texto | null */
  const pedirTexto = useCallback((d) => abrir({ ...d, tipo: 'texto' }), [abrir]);

  const quitar = useCallback((t) => setToasts((l) => l.filter((x) => x.id !== t)), []);
  /** avisar(texto, 'exito' | 'error' | 'info') */
  const avisar = useCallback((texto, tipo = 'exito') => {
    const t = ++id.current;
    setToasts((l) => [...l, { id: t, texto, tipo }]);
    setTimeout(() => quitar(t), tipo === 'error' ? 7000 : 4500);
  }, [quitar]);

  const cerrar = (valor) => { dialogo.resolve(valor); setDialogo(null); };

  return (
    <Ctx.Provider value={{ confirmar, pedirTexto, avisar }}>
      {children}
      {dialogo && <Dialogo d={dialogo} onFin={cerrar} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            {t.tipo === 'error' ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{t.texto}</span>
            <button onClick={() => quitar(t.id)} aria-label="Cerrar"><X size={16} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function Dialogo({ d, onFin }) {
  const [texto, setTexto] = useState('');
  const esTexto = d.tipo === 'texto';
  const cancelar = () => onFin(esTexto ? null : false);
  const aceptar = (e) => {
    e.preventDefault();
    if (esTexto) { if (texto.trim() || d.opcional) onFin(texto.trim()); } else onFin(true);
  };
  const Ic = d.peligro ? AlertTriangle : HelpCircle;

  return (
    <Modal chico titulo={d.titulo} onCerrar={cancelar} onSubmit={aceptar}
      pie={(
        <>
          <button type="button" className="btn" onClick={cancelar}>Cancelar</button>
          <button className={`btn ${d.peligro ? 'btn-peligro-lleno' : 'btn-primario'}`} disabled={esTexto && !d.opcional && !texto.trim()} autoFocus={!esTexto}>
            {d.aceptar || 'Aceptar'}
          </button>
        </>
      )}>
      <div className={`dialogo-icono ${d.peligro ? 'peligro' : ''}`}><Ic size={24} /></div>
      {d.mensaje && <p className="suave" style={{ marginBottom: esTexto ? '1rem' : 0 }}>{d.mensaje}</p>}
      {esTexto && (
        <label className="campo">
          <span>{d.etiqueta || 'Motivo'}{!d.opcional && <span className="req">*</span>}</span>
          <textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={d.placeholder} />
        </label>
      )}
    </Modal>
  );
}
