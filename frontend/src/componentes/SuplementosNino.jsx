// Suplementación del niño (vitamina A, micronutrientes espolvoreados y desparasitante), por grupo de edad
// como en la página del cuaderno; con botón para registrar lo que se entrega hoy.
import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Clock, Pill } from 'lucide-react';
import { api } from '../api.js';
import { useDialogos } from './Dialogos.jsx';
import { Campo, Mensaje, Modal, Tarjeta } from './ui.jsx';
import { fecha, hoy } from '../util.js';

const GRUPOS = [['6_11', '6 a 11 meses', 'lila'], ['12_23', '1 año', 'durazno'], ['24_35', '2 años', 'verde'],
  ['36_47', '3 años', 'lila'], ['48_59', '4 años', 'durazno'], ['60_71', '5 años', 'verde']];
const ESTADO = {
  aplicada: ['Entregado el', Check], le_toca: ['Le toca desde el', Pill], proxima: ['Le toca desde el', Clock], pendiente: ['Le toca desde el'],
  en_espera: ['Después de la anterior'], no_dada: ['No se dio a esa edad'], no_aplica: ['Ya no alcanza a esa edad'],
};

export default function SuplementosNino({ ninoId, operativo, siempre = false }) {
  const { avisar } = useDialogos();
  const [datos, setDatos] = useState(null);
  const [entregar, setEntregar] = useState(false);
  const [verPasadas, setVerPasadas] = useState(false);
  const [verLejanas, setVerLejanas] = useState(false);
  const cargar = useCallback(() => { api(`/suplementos/nino/${ninoId}`).then(setDatos).catch(() => setDatos({ dosis: [], historial: [] })); }, [ninoId]);
  useEffect(cargar, [cargar]);
  if (!datos) return null;
  const tocan = datos.dosis.filter((d) => d.estado === 'le_toca');
  // Edades que ya pasaron (nada pendiente) se resumen en una línea; se muestran las que están en curso o vienen pronto
  const deGrupo = (g) => datos.dosis.filter((d) => d.grupo === g);
  const pasada = (g) => deGrupo(g).every((d) => ['aplicada', 'no_dada', 'no_aplica'].includes(d.estado));
  const empezada = (g) => deGrupo(g).some((d) => d.estado !== 'pendiente');
  const pasadas = GRUPOS.filter(([g]) => pasada(g) && empezada(g));
  // De lo que falta se muestra la edad en curso (o la siguiente); las demás, en «Lo que le toca después»
  const activas = GRUPOS.filter(([g]) => deGrupo(g).length && !pasada(g));
  const enCurso = activas.filter(([g]) => deGrupo(g).some((d) => ['le_toca', 'proxima', 'aplicada'].includes(d.estado)));
  const cercanas = enCurso.length ? enCurso : activas.slice(0, 1);
  const lejanas = activas.filter((x) => !cercanas.includes(x));
  const visibles = [...(verPasadas ? pasadas : []), ...cercanas, ...(verLejanas ? lejanas : [])];
  if (!GRUPOS.some(([g]) => empezada(g))) return siempre ? <Tarjeta titulo="Suplementación" icono={Pill}><p className="tenue">Empieza a los 6 meses.</p></Tarjeta> : null;

  return (
    <Tarjeta titulo="Suplementación" icono={Pill} cuerpo={false}
      acciones={operativo && (tocan.length > 0 ? (
        <button className="btn btn-verde btn-sm no-imprimir" onClick={() => setEntregar(true)}><Pill size={15} />Entregar ({tocan.length})</button>
      ) : <button className="btn btn-sm no-imprimir" onClick={() => setEntregar(true)}><Pill size={15} />Registrar entrega</button>)}>
      <div className="carne-edad">
        {pasadas.length > 0 && (
          <button type="button" className="carne-completas" onClick={() => setVerPasadas(!verPasadas)} aria-expanded={verPasadas}>
            <CheckCircle2 size={20} />
            <span><strong>{pasadas.map(([, n]) => n).join(', ')}</strong> · {datos.dosis.filter((d) => pasada(d.grupo) && d.estado === 'aplicada').length} entregados</span>
            <ChevronDown size={18} className={verPasadas ? 'girada' : ''} />
          </button>
        )}
        {visibles.map(([g, nombre, color]) => (
          <div key={g} className={`franja-edad franja-${color}`}>
            <div className="franja-nombre">{nombre}</div>
            <div className="franja-dosis">
              {datos.dosis.filter((d) => d.grupo === g).map((d) => {
                const [texto, Ic] = ESTADO[d.estado] || [d.estado];
                // Lo que ya no se puede dar va en gris, no en rojo: no hay nada que hacer con eso
                const estadoCss = { no_dada: 'no_aplicable', no_aplica: 'no_aplicable' }[d.estado] || d.estado;
                const conFecha = ['aplicada', 'le_toca', 'proxima', 'pendiente'].includes(d.estado);
                const tocable = operativo && d.estado === 'le_toca';
                const Cont = tocable ? 'button' : 'div';
                return (
                  <Cont key={d.id} type={tocable ? 'button' : undefined} className={`dosis-carne estado-${estadoCss} ${tocable ? 'tocable' : ''}`}
                    onClick={tocable ? () => setEntregar(true) : undefined}>
                    <span className="dc-cab"><span className="dc-etq">{d.etiqueta}</span>{Ic && <Ic size={15} strokeWidth={2.6} className="dc-ic" />}</span>
                    <span className="dc-est">{texto}</span>
                    {conFecha && <strong className="dc-fecha">{fecha(d.fecha || d.programada)}</strong>}
                  </Cont>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {lejanas.length > 0 && (
        <div className="carne-edad" style={{ paddingTop: 0 }}>
          <button type="button" className="carne-completas lejanas" onClick={() => setVerLejanas(!verLejanas)} aria-expanded={verLejanas}>
            <Clock size={20} />
            <span><strong>Lo que le toca después</strong><small>{lejanas.map(([, n]) => n).join(' · ')}</small></span>
            <span className="cc-ver">{verLejanas ? 'Ocultar' : 'Ver'}<ChevronDown size={16} className={verLejanas ? 'girada' : ''} /></span>
          </button>
        </div>
      )}
      {entregar && <Entregar ninoId={ninoId} tocanHoy={tocan} onCerrar={() => setEntregar(false)}
        onListo={(r) => { setEntregar(false); avisar(`Entregado: ${r.guardadas.join(', ')}.`); cargar(); }} />}
    </Tarjeta>
  );
}

function Entregar({ ninoId, tocanHoy, onCerrar, onListo }) {
  // Hoy por defecto; si se entregó otro día, se elige la fecha y salen los que le tocaban ese día
  const [dia, setDia] = useState(hoy());
  const [tocan, setTocan] = useState(tocanHoy);
  const [marcados, setMarcados] = useState(() => new Set(tocanHoy.map((d) => d.id)));
  useEffect(() => {
    if (dia === hoy()) { setTocan(tocanHoy); setMarcados(new Set(tocanHoy.map((d) => d.id))); return; }
    if (!dia || dia > hoy()) return;
    api(`/suplementos/nino/${ninoId}?fecha=${dia}`).then((d) => {
      const t = d.dosis.filter((x) => x.estado === 'le_toca');
      setTocan(t); setMarcados(new Set(t.map((x) => x.id)));
    }).catch(() => {});
  }, [dia, ninoId, tocanHoy]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const alternar = (id) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function guardar() {
    setGuardando(true);
    try { onListo(await api(`/suplementos/nino/${ninoId}`, { method: 'POST', body: { ids: [...marcados], fecha: dia } })); }
    catch (e) { setError(e.message); setGuardando(false); }
  }
  return (
    <Modal titulo="Entregar suplementos" onCerrar={onCerrar} chico
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn btn-verde" disabled={!marcados.size || guardando} onClick={guardar}><Check size={17} />{guardando ? 'Guardando…' : `Guardar ${marcados.size}`}</button></>}>
      <Campo etiqueta="¿Cuándo se entregó?" requerido>
        <input type="date" required max={hoy()} value={dia} onChange={(e) => setDia(e.target.value)} />
      </Campo>
      {tocan.length === 0 && <Mensaje tipo="aviso">Ese día no le tocaba ningún suplemento.</Mensaje>}
      <div className="vacunas-marcar">
        {tocan.map((d) => {
          const si = marcados.has(d.id);
          return (
            <div key={d.id} className={`vacuna-marcar ${si ? 'marcada' : ''}`} role="checkbox" aria-checked={si} tabIndex={0} onClick={() => alternar(d.id)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar(d.id); } }}>
              <span className="caja">{si && <Check size={20} strokeWidth={3} />}</span>
              <strong>{d.etiqueta}</strong>
              <span className="det">Hasta el {fecha(d.hasta)}</span>
            </div>
          );
        })}
      </div>
      <Mensaje tipo="error" className="mt">{error}</Mensaje>
    </Modal>
  );
}
