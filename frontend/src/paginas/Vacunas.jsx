// Vacunas: lotes en uso (con vencimiento y trazabilidad) y consumo mensual por vacuna para el pedido al distrito.
// No es un inventario: las existencias y la cadena de frío se reportan por los canales del MSPAS (SIGSA).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackagePlus, Printer, Users } from 'lucide-react';
import { api, qs } from '../api.js';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import {
  Campo, Cargando, Encabezado, EncabezadoImpresion, Mensaje, Modal, Pestanas, Tabla, Tarjeta, Vacio,
} from '../componentes/ui.jsx';
import { MESES, fecha, hoy } from '../util.js';

const ESTADO_LOTE = { vigente: ['Vigente', 'verde'], por_vencer: ['Por vencer', 'ambar'], vencido: ['Vencido', 'rojo'] };

export default function Vacunas() {
  const [vista, setVista] = useState('lotes');
  return (
    <>
      <div className="no-imprimir">
        <Encabezado titulo="Vacunas" />
        <Pestanas valor={vista} onCambio={setVista} opciones={[['lotes', 'Lotes en uso'], ['consumo', 'Consumo del mes']]} />
      </div>
      {vista === 'lotes' ? <Lotes /> : <Consumo />}
    </>
  );
}

function Lotes() {
  const { avisar, confirmar } = useDialogos();
  const productos = useCatalogo('productos').filter((p) => p.activo);
  const [lotes, setLotes] = useState(null);
  const [verRetirados, setVerRetirados] = useState(false);
  const [nuevo, setNuevo] = useState({ producto_id: '', codigo: '', fecha_vencimiento: '' });
  const [error, setError] = useState('');
  const [ninos, setNinos] = useState(null); // { lote, lista }
  const [registrando, setRegistrando] = useState(false);

  const cargar = useCallback(() => {
    api('/lotes' + (verRetirados ? '?todos=1' : '')).then(setLotes).catch((e) => setError(e.message));
  }, [verRetirados]);
  useEffect(cargar, [cargar]);

  async function registrar(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/lotes', { method: 'POST', body: nuevo });
      avisar(`Lote ${nuevo.codigo.toUpperCase()} registrado.`);
      setNuevo({ producto_id: nuevo.producto_id, codigo: '', fecha_vencimiento: '' });
      setRegistrando(false);
      cargar();
    } catch (err) { setError(err.message); }
  }

  async function cambiarActivo(l) {
    if (l.activo && !(await confirmar({
      titulo: `¿Retirar el lote ${l.codigo}?`,
      mensaje: 'Ya no aparecerá al vacunar. Las dosis aplicadas con este lote se conservan.',
      aceptar: 'Retirar',
    }))) return;
    await api(`/lotes/${l.id}`, { method: 'PUT', body: { activo: !l.activo } }).catch((e) => avisar(e.message, 'error'));
    cargar();
  }

  const verNinos = (l) => api(`/lotes/${l.id}/ninos`).then((lista) => setNinos({ lote: l, lista })).catch((e) => avisar(e.message, 'error'));

  const porVencer = (lotes || []).filter((l) => l.activo && l.estado === 'por_vencer');
  const vencidos = (lotes || []).filter((l) => l.activo && l.estado === 'vencido');

  return (
    <>
      {porVencer.length > 0 && (
        <Mensaje tipo="aviso">
          <strong>{porVencer.length === 1 ? '1 lote vence pronto' : `${porVencer.length} lotes vencen pronto`}:</strong>{' '}
          {porVencer.map((l) => `${l.producto} ${l.codigo} (${fecha(l.fecha_vencimiento)})`).join(', ')}. Úselos primero; el sistema ya los propone así.
        </Mensaje>
      )}
      {vencidos.length > 0 && (
        <Mensaje tipo="error">{vencidos.length === 1 ? '1 lote vencido sigue activo' : `${vencidos.length} lotes vencidos siguen activos`}: retírelos para que no se ofrezcan.</Mensaje>
      )}
      {!registrando ? (
        <div className="acciones izq" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
          <button className="btn btn-primario" onClick={() => setRegistrando(true)}><PackagePlus size={17} />Registrar lote recibido</button>
          <span className="tenue">Al vacunar, el sistema propone el lote vigente que vence primero; nadie tiene que escribirlo.</span>
        </div>
      ) : (
      <Tarjeta titulo="Registrar un lote recibido" icono={PackagePlus}>
        <form className="rejilla" onSubmit={registrar}>
          <Campo etiqueta="Vacuna" requerido>
            <select required value={nuevo.producto_id} onChange={(e) => setNuevo({ ...nuevo, producto_id: e.target.value })}>
              <option value="">Seleccione…</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Número de lote" requerido>
            <input required value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })} placeholder="Como aparece en la caja" />
          </Campo>
          <Campo etiqueta="Vence" requerido>
            <input required type="date" min={hoy()} value={nuevo.fecha_vencimiento} onChange={(e) => setNuevo({ ...nuevo, fecha_vencimiento: e.target.value })} />
          </Campo>
          <div className="acciones" style={{ alignSelf: 'end' }}>
            <button type="button" className="btn" onClick={() => setRegistrando(false)}>Cancelar</button>
            <button className="btn btn-primario">Registrar lote</button>
          </div>
        </form>
        <Mensaje tipo="error">{error}</Mensaje>
      </Tarjeta>
      )}

      <Tarjeta titulo="Lotes" cuerpo={false}
        acciones={<label className="tenue" style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
          <input type="checkbox" checked={verRetirados} onChange={(e) => setVerRetirados(e.target.checked)} />Ver también los retirados</label>}>
        {!lotes ? <Cargando /> : !lotes.length ? (
          <Vacio titulo="Todavía no hay lotes registrados">Registre el lote de cada vacuna al recibirla.</Vacio>
        ) : (
          <Tabla>
            <thead><tr><th>Vacuna</th><th>Lote</th><th>Vence</th><th>Estado</th><th className="celda-num">Dosis aplicadas</th><th /></tr></thead>
            <tbody>
              {lotes.map((l) => {
                const [texto, tono] = ESTADO_LOTE[l.estado];
                return (
                  <tr key={l.id} className={l.activo ? '' : 'tenue'}>
                    <td className="fuerte">{l.producto}</td>
                    <td>{l.codigo}</td>
                    <td>{fecha(l.fecha_vencimiento)}</td>
                    <td><span className={`chip ${l.activo ? tono : ''}`}>{l.activo ? texto : 'Retirado'}</span></td>
                    <td className="celda-num">{l.dosis_aplicadas}</td>
                    <td className="botones-fila">
                      <button className="btn btn-sm" onClick={() => verNinos(l)} disabled={!l.dosis_aplicadas}><Users size={14} />Niños</button>
                      <button className="btn btn-sm" onClick={() => cambiarActivo(l)}>{l.activo ? 'Retirar' : 'Reactivar'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      {ninos && (
        <Modal titulo={`Niños vacunados con el lote ${ninos.lote.codigo}`} sub={ninos.lote.producto} onCerrar={() => setNinos(null)}>
          <Tabla>
            <thead><tr><th>Niña o niño</th><th>Comunidad</th><th>Fecha</th><th>Responsable</th></tr></thead>
            <tbody>
              {ninos.lista.map((n) => (
                <tr key={`${n.nino_id}-${n.fecha_aplicacion}`}>
                  <td className="fuerte"><Link to={`/ninos/${n.nino_id}`}>{n.nombre_completo}</Link></td>
                  <td>{n.comunidad}</td><td>{fecha(n.fecha_aplicacion)}</td>
                  <td>{n.responsable || '—'}{n.telefono && <span className="sub">{n.telefono}</span>}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Modal>
      )}
    </>
  );
}

function Consumo() {
  const ahora = new Date();
  const [f, setF] = useState({ anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 });
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setDatos(null);
    api('/lotes/consumo' + qs(f)).then(setDatos).catch((e) => setError(e.message));
  }, [f]);
  const set = (k) => (e) => setF({ ...f, [k]: Number(e.target.value) });
  const total = (k) => datos?.vacunas.reduce((s, v) => s + (v[k] || 0), 0);

  return (
    <>
      <EncabezadoImpresion titulo="Consumo de vacunas" detalle={`${MESES[f.mes - 1]} ${f.anio}`} />
      <div className="tarjeta no-imprimir"><div className="tarjeta-cuerpo">
        <div className="filtros" style={{ marginBottom: 0 }}>
          <Campo etiqueta="Mes"><select value={f.mes} onChange={set('mes')}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Campo>
          <Campo etiqueta="Año"><input type="number" value={f.anio} onChange={set('anio')} /></Campo>
          <div className="acciones" style={{ alignSelf: 'end' }}>
            <button className="btn btn-primario" onClick={() => window.print()} disabled={!datos}><Printer size={16} />Imprimir / PDF</button>
          </div>
        </div>
      </div></div>
      <Mensaje tipo="error">{error}</Mensaje>
      {!datos ? <Cargando /> : (
        <>
          <Tarjeta titulo="Dosis aplicadas por vacuna" cuerpo={false}>
            {!datos.vacunas.length ? <Vacio titulo="Sin dosis aplicadas en este mes" /> : (
              <Tabla>
                <thead><tr>
                  <th>Vacuna</th><th className="celda-num">En el servicio</th><th className="celda-num">En jornadas</th>
                  <th className="celda-num">Total aplicadas</th><th className="celda-num">Llevadas a jornadas</th>
                  <th className="celda-num">Devueltas</th><th className="celda-num">Sin lote anotado</th>
                </tr></thead>
                <tbody>
                  {datos.vacunas.map((v) => (
                    <tr key={v.producto_id}>
                      <td className="fuerte">{v.nombre}</td>
                      <td className="celda-num">{v.en_servicio}</td><td className="celda-num">{v.en_jornadas}</td>
                      <td className="celda-num fuerte">{v.total}</td>
                      <td className="celda-num">{v.llevadas ?? '—'}</td><td className="celda-num">{v.devueltas ?? '—'}</td>
                      <td className="celda-num">{v.sin_lote || '—'}</td>
                    </tr>
                  ))}
                  <tr className="fila-total">
                    <td>Total</td><td className="celda-num">{total('en_servicio')}</td><td className="celda-num">{total('en_jornadas')}</td>
                    <td className="celda-num">{total('total')}</td><td className="celda-num">{total('llevadas')}</td>
                    <td className="celda-num">{total('devueltas')}</td><td className="celda-num">{total('sin_lote')}</td>
                  </tr>
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
          {datos.lotes.length > 0 && (
            <Tarjeta titulo="Lotes usados en el mes" cuerpo={false}>
              <Tabla>
                <thead><tr><th>Vacuna</th><th>Lote</th><th>Vence</th><th className="celda-num">Dosis</th></tr></thead>
                <tbody>
                  {datos.lotes.map((l) => (
                    <tr key={`${l.producto}-${l.codigo}`}><td className="fuerte">{l.producto}</td><td>{l.codigo}</td>
                      <td>{fecha(l.fecha_vencimiento)}</td><td className="celda-num">{l.dosis}</td></tr>
                  ))}
                </tbody>
              </Tabla>
            </Tarjeta>
          )}
        </>
      )}
    </>
  );
}
