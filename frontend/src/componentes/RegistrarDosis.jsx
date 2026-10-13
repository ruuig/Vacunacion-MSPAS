import { useState } from 'react';
import { CheckCircle2, Save } from 'lucide-react';
import { api } from '../api.js';
import { useCatalogo } from './useCatalogo.js';
import { Campo, Mensaje, Modal } from './ui.jsx';
import { hoy } from '../util.js';


const PRODUCTO_SERIE = {
  HB_RN: 'HB_PED', BCG: 'BCG', ROTA: 'ROTA', NEUMO: 'NEUMO', SPR: 'SPR', SPR_CERO: 'SPR', INFLUENZA: 'INFL_PED',
  VARICELA: 'VARICELA', POLIO: 'OPV', DPT_HIB_HB: 'PENTA',
};

/** Producto que corresponde a una columna del cuaderno (tal como está impresa) o a una serie. */
function productoSugerido({ columna, serie, numero, modo }) {
  let codigo;
  if (columna) {
    codigo = columna.producto_codigo
      || (/\(OPV\)/.test(columna.etiqueta) && 'OPV') || (/\(IPV\)/.test(columna.etiqueta) && 'IPV')
      || (/\(DPT\)/.test(columna.etiqueta) && 'DPT') || (columna.grupo === 'DPT' && 'DPT')
      || PRODUCTO_SERIE[columna.serie_codigo];
    serie = columna.serie_codigo;
    numero = /R2/.test(columna.etiqueta) ? 5 : null;
  } else codigo = PRODUCTO_SERIE[serie];
  // En atención, la hexavalente sustituye a pentavalente y polio (excepto el R2 de 4 años)
  if (modo === 'atencion' && ['DPT_HIB_HB', 'POLIO'].includes(serie) && numero !== 5 && !columna?.producto_codigo) codigo = 'HEXA';
  if (numero === 5) codigo = serie === 'POLIO' ? 'OPV' : 'DPT';
  return codigo;
}

export default function RegistrarDosis({ ninoId, esquema, columna, serieSugerida, jornadaId, fechaDefecto, onCerrar, onRegistrado, titulo }) {
  const productos = useCatalogo('productos');
  const establecimientos = useCatalogo('establecimientos');
  const parametros = useCatalogo('parametros');
  const dosisSugerida = serieSugerida && esquema.leTocaHoy.find((d) => d.serieCodigo === serieSugerida);

  const [form, setForm] = useState({ producto: '', fecha_aplicacion: fechaDefecto && fechaDefecto < hoy() ? fechaDefecto : hoy(), lote: '', establecimiento_id: '', formulacion: '', observacion: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const establecimientoId = form.establecimiento_id || (establecimientos[0] ? String(establecimientos[0].id) : '');
  // Las reglas se aplican según lo que pasó, sin pedirle a la persona que elija un «modo»:
  // hoy aquí = atención (bloquea si no corresponde); otro día aquí = digitado del cuaderno; en otro lugar = antecedente del carné
  const externo = establecimientos.find((x) => String(x.id) === establecimientoId)?.es_local === false;
  const modo = externo ? 'antecedente' : form.fecha_aplicacion < hoy() ? 'cuaderno' : 'atencion';
  const codigoSugerido = productoSugerido({ columna, serie: serieSugerida, numero: dosisSugerida?.numero, modo });
  const producto = productos.find((p) => (form.producto ? String(p.id) === form.producto : p.codigo === codigoSugerido));
  const formulacion = form.formulacion || columna?.formulacion || parametros.influenza_formulacion || '';
  const usarColumna = columna && modo !== 'atencion';

  const cumple = usarColumna
    ? [esquema.dosis.find((d) => d.esquemaDosisId === columna.esquema_dosis_id)?.etiqueta || `${columna.grupo} ${columna.etiqueta}`]
    : (producto?.series || []).map((s) => esquema.dosis.find((d) => d.serieCodigo === s && d.estado !== 'aplicada')?.etiqueta).filter(Boolean);

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const r = await api(`/ninos/${ninoId}/aplicaciones`, { method: 'POST', body: {
        producto_id: producto.id, fecha_aplicacion: form.fecha_aplicacion, lote: form.lote, observacion: form.observacion,
        establecimiento_id: establecimientoId ? Number(establecimientoId) : null, modo, jornada_id: jornadaId || null,
        formulacion: producto.estacional ? formulacion : null,
        ...(usarColumna && { esquema_dosis_ids: [columna.esquema_dosis_id] }),
      } });
      onRegistrado(r);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={titulo || 'Registrar vacuna'} onCerrar={onCerrar} onSubmit={guardar}
      pie={(
        <>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={guardando || !producto}><Save size={17} />{guardando ? 'Guardando…' : 'Guardar'}</button>
        </>
      )}>

      <div className="rejilla">
        <Campo etiqueta="Vacuna" requerido className="ancho">
          <select required value={producto ? String(producto.id) : ''} onChange={set('producto')} autoFocus>
            <option value="">Seleccione la vacuna…</option>
            {productos.filter((p) => p.activo || modo !== 'atencion').map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}{!p.activo ? ' (solo antecedentes)' : ''}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="¿Cuándo se la pusieron?" requerido>
          <input type="date" required max={hoy()} value={form.fecha_aplicacion} onChange={set('fecha_aplicacion')} />
        </Campo>
        <Campo etiqueta="Lote"><input value={form.lote} onChange={set('lote')} placeholder="Ej. A12B34" /></Campo>
        {producto?.estacional && (
          <Campo etiqueta="Formulación" requerido>
            <select required value={formulacion} onChange={set('formulacion')}>
              <option value="">Seleccione…</option><option value="sur">Hemisferio sur</option><option value="norte">Hemisferio norte</option>
            </select>
          </Campo>
        )}
        <Campo etiqueta="¿Dónde?">
          <select value={establecimientoId} onChange={set('establecimiento_id')}>
            {establecimientos.map((x) => <option key={x.id} value={x.id}>{x.es_local ? x.nombre : 'En otro lugar (anotado en el carné)'}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Observación" className="ancho">
          <input value={form.observacion} onChange={set('observacion')} placeholder="Reacciones, ESAVI, etc." />
        </Campo>
      </div>

      {cumple.length > 0 && (
        <div className="msg msg-exito" style={{ marginTop: '1.1rem', marginBottom: 0 }}>
          <CheckCircle2 size={18} /><span>Esta aplicación cumple: <strong>{cumple.join(' y ')}</strong></span>
        </div>
      )}
      {producto && cumple.length === 0 && !producto.estacional && (
        <Mensaje tipo="aviso" className="mt">El niño ya tiene registradas las dosis de esta vacuna.</Mensaje>
      )}
      {error && <Mensaje tipo="error" className="mt">{error}</Mensaje>}
    </Modal>
  );
}
