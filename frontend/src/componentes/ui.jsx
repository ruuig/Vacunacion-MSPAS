// Piezas visuales compartidas por todas las pantallas.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info, MoreHorizontal, X } from 'lucide-react';
import Logo from './Logo.jsx';

/** Título de pantalla con migas de pan, descripción y botones. */
export function Encabezado({ titulo, descripcion, migas, children }) {
  return (
    <div className="pagina-cab">
      <div>
        {migas && (
          <div className="miga">
            {migas.map(([texto, ruta], i) => (
              <span key={texto} style={{ display: 'contents' }}>
                {i > 0 && <ChevronRight size={13} />}
                {ruta ? <Link to={ruta}>{texto}</Link> : <span>{texto}</span>}
              </span>
            ))}
          </div>
        )}
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {children && <div className="acciones">{children}</div>}
    </div>
  );
}

/** Encabezado que solo aparece al imprimir (logo institucional + título). */
export function EncabezadoImpresion({ titulo, detalle }) {
  return (
    <div className="encabezado-impresion">
      <Logo alt="MSPAS" />
      <div style={{ textAlign: 'right' }}>
        <strong>{titulo}</strong>
        <div>Centro de Salud San Luis Jilotepeque, Jalapa</div>
        {detalle && <div>{detalle}</div>}
      </div>
    </div>
  );
}

/**
 * Tabla que en el celular se muestra como tarjetas: copia el texto de cada encabezado
 * a la celda correspondiente (data-label) para que el CSS lo pinte como rótulo.
 */
export function Tabla({ children, className = '', adaptable = true }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t || !adaptable) return;
    const titulos = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach((tr) => {
      let col = 0;
      [...tr.children].forEach((td) => {
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', td.colSpan > 1 ? '' : titulos[col] || '');
        col += td.colSpan || 1;
      });
    });
  });
  return (
    <div className="tabla-caja">
      <table ref={ref} className={`${adaptable ? 'tabla-resp' : ''} ${className}`}>{children}</table>
    </div>
  );
}

const ICONO_MSG = { error: AlertCircle, exito: CheckCircle2, aviso: AlertTriangle, info: Info };

export function Mensaje({ tipo = 'info', children, onCerrar, className = '' }) {
  if (!children) return null;
  const Ic = ICONO_MSG[tipo];
  return (
    <div className={`msg msg-${tipo} ${className}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Ic size={18} />
      <div style={{ flex: 1 }}>{children}</div>
      {onCerrar && <button className="btn btn-fantasma btn-sm btn-icono" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>}
    </div>
  );
}

export function Vacio({ icono: Ic, titulo, children, accion }) {
  return (
    <div className="vacio">
      {Ic && <div className="ic"><Ic size={28} /></div>}
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
      {accion && <div className="acciones">{accion}</div>}
    </div>
  );
}

export function Cargando({ filas = 4 }) {
  return (
    <div className="cargando" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => <div key={i} className="esqueleto" style={{ width: `${95 - i * 12}%` }} />)}
    </div>
  );
}

export function Tarjeta({ titulo, icono: Ic, sub, acciones, children, pie, className = '', cuerpo = true }) {
  return (
    <section className={`tarjeta ${className}`}>
      {titulo && (
        <div className="tarjeta-cab">
          <div>
            <h2>{Ic && <Ic size={19} />}{titulo}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {acciones && <div className="botones-fila">{acciones}</div>}
        </div>
      )}
      {cuerpo ? <div className="tarjeta-cuerpo">{children}</div> : children}
      {pie && <div className="tarjeta-pie">{pie}</div>}
    </section>
  );
}

/** Indicador numérico. Con `resaltar`, el número toma el color de su gravedad cuando es mayor que cero. */
export function Kpi({ valor, rotulo, icono: Ic, color = '', to, pie, resaltar }) {
  const clase = `kpi ${color} ${resaltar && valor > 0 ? 'activo' : ''}`;
  const contenido = (
    <>
      {Ic && <div className="kpi-icono"><Ic size={18} strokeWidth={2.2} /></div>}
      <strong>{valor ?? '—'}</strong>
      <span>{rotulo}</span>
      {(pie || to) && <em className="kpi-pie" style={{ fontStyle: 'normal' }}>{pie || 'Ver casos'}{to && <ChevronRight size={13} />}</em>}
    </>
  );
  return to ? <Link to={to} className={clase}>{contenido}</Link> : <div className={clase}>{contenido}</div>;
}

export function Pestanas({ opciones, valor, onCambio }) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map(([k, texto, extra]) => (
        <button key={k} role="tab" aria-selected={valor === k} className={valor === k ? 'activa' : ''} onClick={() => onCambio(k)}>
          {texto}{extra}
        </button>
      ))}
    </div>
  );
}

export function Campo({ etiqueta, requerido, ayuda, className = '', children }) {
  return (
    <label className={`campo ${className}`}>
      <span>{etiqueta}{requerido && <span className="req">*</span>}</span>
      {children}
      {ayuda && <span className="ayuda">{ayuda}</span>}
    </label>
  );
}

export function Modal({ titulo, sub, onCerrar, children, pie, chico, onSubmit, className = '' }) {
  const Contenedor = onSubmit ? 'form' : 'div';
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar?.()}>
      <Contenedor className={`modal ${chico ? 'chico' : ''} ${className}`} onSubmit={onSubmit} role="dialog" aria-modal="true">
        <div className="modal-cab">
          <div>
            <h2>{titulo}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {onCerrar && <button type="button" className="btn btn-fantasma btn-icono" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>}
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </Contenedor>
    </div>
  );
}

export function Progreso({ valor, max }) {
  const p = max ? Math.min(100, Math.round((valor / max) * 100)) : 0;
  return (
    <span className="barra-progreso">
      <span className="pista"><span className="lleno" style={{ width: `${p}%` }} /></span>
      <span>{valor}/{max}</span>
    </span>
  );
}

/** true cuando la pantalla es de celular (mismo corte que el CSS). */
export function useEsCelular() {
  const consulta = '(max-width: 900px)';
  const [es, setEs] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const f = () => setEs(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return es;
}

export const iniciales =(nombre = '') => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/**
 * Menú "⋯" para acciones poco frecuentes o delicadas (anular, cargar antecedentes):
 * quedan a un toque, pero no compiten con la acción principal de la pantalla.
 * opciones: [{ texto, icono, onClick, peligro }]
 */
export function MenuMas({ opciones, etiqueta = 'Más acciones', texto }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  const visibles = opciones.filter(Boolean);
  if (!visibles.length) return null;
  return (
    <div className="menu-mas" ref={ref}>
      <button type="button" className={`btn ${texto ? '' : 'btn-icono'} ${abierto ? 'activo' : ''}`} onClick={() => setAbierto(!abierto)}
        aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta} title={etiqueta}>
        <MoreHorizontal size={18} />{texto}
      </button>
      {abierto && (
        <div className="menu-mas-lista" role="menu">
          {visibles.map(({ texto: t, icono: Ic, onClick, peligro }) => (
            <button key={t} type="button" role="menuitem" className={peligro ? 'peligro' : ''} onClick={() => { setAbierto(false); onClick(); }}>
              {Ic && <Ic size={16} />}{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * CUI o DPI con espacios mientras se escribe (3012 34567 0101): se lee y se compara con el documento
 * sin contar dígitos. Guarda solo los 13 números.
 */
export function InputCui({ value = '', onCambio, ...resto }) {
  const digitos = String(value).replace(/\D/g, '').slice(0, 13);
  const visible = [digitos.slice(0, 4), digitos.slice(4, 9), digitos.slice(9)].filter(Boolean).join(' ');
  return (
    <input inputMode="numeric" autoComplete="off" placeholder="0000 00000 0000" value={visible} maxLength={15}
      pattern="\d{4} \d{5} \d{4}" title="13 números" onChange={(e) => onCambio(e.target.value.replace(/\D/g, '').slice(0, 13))} {...resto} />
  );
}

// Partículas que forman parte del nombre o apellido siguiente: "De León", "Del Cid", "de los Ángeles"
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa']);

/** "María de los Ángeles" → ['María', 'de los Ángeles']; "De León Pérez" → ['De León', 'Pérez']. */
export function partirNombre(texto = '') {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < palabras.length - 1 && PARTICULAS.has(palabras[i].toLowerCase())) i++;
  return [palabras.slice(0, i + 1).join(' '), palabras.slice(i + 1).join(' ')];
}

/**
 * Un solo campo para "Nombres" o "Apellidos". El cuaderno SIGSA 5a pide primero y segundo por separado:
 * el sistema los separa solo, así quien registra escribe el nombre como lo dice la mamá.
 */
export function InputNombreDoble({ primero = '', segundo = '', onCambio, ...resto }) {
  const unido = [primero, segundo].filter(Boolean).join(' ');
  const [texto, setTexto] = useState(unido);
  // Si los datos cambian desde fuera (responsable ya registrado, edición), se muestra lo nuevo
  useEffect(() => {
    if (texto.trim().replace(/\s+/g, ' ') !== unido) setTexto(unido);
  }, [unido]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input autoCapitalize="words" autoComplete="off" value={texto} {...resto}
      onChange={(e) => { setTexto(e.target.value); onCambio(...partirNombre(e.target.value)); }} />
  );
}
