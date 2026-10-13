// Suplementación del niño (vitamina A, micronutrientes espolvoreados y desparasitante), por grupo de edad
// como en la página del cuaderno; con botón para registrar lo que se entrega hoy.
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Clock, Pill } from 'lucide-react';
import { api } from '../api.js';
import { useDialogos } from './Dialogos.jsx';
import { Mensaje, Modal, Tarjeta } from './ui.jsx';
import { fecha, hoy } from '../util.js';

const GRUPOS = [['6_11', '6 a 11 meses', 'lila'], ['12_23', '1 año a menor de 2', 'durazno'], ['24_35', '2 años a menor de 3', 'verde']];
const ESTADO = {
  aplicada: ['Entregado', Check], le_toca: ['Le toca', Pill], proxima: ['Próximo', Clock], pendiente: ['Programado'],
  en_espera: ['Espera la anterior'], no_dada: ['No se entregó', AlertCircle], no_aplica: ['Ya no alcanza'],
};

export default function SuplementosNino({ ninoId, operativo }) {
  const { avisar } = useDialogos();
  const [datos, setDatos] = useState(null);
  const [entregar, setEntregar] = useState(false);
  const cargar = useCallback(() => { api(`/suplementos/nino/${ninoId}`).then(setDatos).catch(() => setDatos({ dosis: [], historial: [] })); }, [ninoId]);
  useEffect(cargar, [cargar]);
  if (!datos) return null;
  const tocan = datos.dosis.filter((d) => d.estado === 'le_toca');
  // Solo los grupos de edad que ya empezaron o empiezan pronto, y los que tienen algo registrado
  const visibles = GRUPOS.filter(([g]) => datos.dosis.some((d) => d.grupo === g && d.estado !== 'pendiente'));
  if (!visibles.length) return null;

  return (
    <Tarjeta titulo="Suplementación" icono={Pill} cuerpo={false}
      sub="Vitamina A, micronutrientes espolvoreados y desparasitante"
      acciones={operativo && tocan.length > 0 && (
        <button className="btn btn-verde btn-sm no-imprimir" onClick={() => setEntregar(true)}><Pill size={15} />Entregar ({tocan.length})</button>
      )}>
      <div className="carne-edad">
        {visibles.map(([g, nombre, color]) => (
          <div key={g} className={`franja-edad franja-${color}`}>
            <div className="franja-nombre">{nombre}</div>
            <div className="franja-dosis">
              {datos.dosis.filter((d) => d.grupo === g).map((d) => {
                const [texto, Ic] = ESTADO[d.estado] || [d.estado];
                const estadoCss = { no_dada: 'atrasada', no_aplica: 'no_aplicable' }[d.estado] || d.estado;
                return (
                  <div key={d.id} className={`dosis-carne estado-${estadoCss}`}>
                    <span className="dc-cab"><span className="dc-etq">{d.etiqueta}</span>{Ic && <Ic size={15} strokeWidth={2.6} className="dc-ic" />}</span>
                    <strong className="dc-fecha">{d.fecha ? fecha(d.fecha) : d.programada ? fecha(d.programada) : '—'}</strong>
                    <span className="dc-est">{texto}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {entregar && <Entregar ninoId={ninoId} tocan={tocan} onCerrar={() => setEntregar(false)}
        onListo={(r) => { setEntregar(false); avisar(`Entregado: ${r.guardadas.join(', ')}.`); cargar(); }} />}
    </Tarjeta>
  );
}

function Entregar({ ninoId, tocan, onCerrar, onListo }) {
  const [marcados, setMarcados] = useState(() => new Set(tocan.map((d) => d.id)));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const alternar = (id) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function guardar() {
    setGuardando(true);
    try { onListo(await api(`/suplementos/nino/${ninoId}`, { method: 'POST', body: { ids: [...marcados], fecha: hoy() } })); }
    catch (e) { setError(e.message); setGuardando(false); }
  }
  return (
    <Modal titulo="Entregar suplementos" sub={`Hoy, ${fecha(hoy())}`} onCerrar={onCerrar} chico
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn btn-verde" disabled={!marcados.size || guardando} onClick={guardar}><Check size={17} />{guardando ? 'Guardando…' : `Guardar ${marcados.size}`}</button></>}>
      <p className="suave" style={{ marginBottom: '.75rem' }}>Están marcados los que le tocan. Toque uno para quitarlo si no se entregó.</p>
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
