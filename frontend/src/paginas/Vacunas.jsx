// Vacunas: lotes en uso (con vencimiento y trazabilidad) y consumo mensual por vacuna para el pedido al distrito.
// No es un inventario: las existencias y la cadena de frío se reportan por los canales del MSPAS (SIGSA).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Package, PackagePlus, Plus, Printer, Users } from 'lucide-react';
import Documento, { TablaDoc } from '../componentes/Documento.jsx';
import { api, qs } from '../api.js';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import {
  Campo, Cargando, Encabezado, EncabezadoImpresion, Mensaje, Modal, Pestanas, Tabla, Tarjeta, Vacio,
} from '../componentes/ui.jsx';
import { MESES, fecha, hoy } from '../util.js';

const ESTADO_LOTE = { vigente: ['Vigente', 'verde'], por_vencer: ['Por vencer', 'ambar'], vencido: ['Vencido', 'rojo'] };

export default function Vacunas() {
  const [vista, setVista] = useState(() => new URLSearchParams(window.location.search).get('vista') || 'lotes');
  return (
    <>
      <div className="no-imprimir">
        <Encabezado titulo="Vacunas" />
        <Pestanas valor={vista} onCambio={setVista} opciones={[['lotes', 'Lotes en uso'], ['consumo', 'Consumo del mes'], ['pedido', 'Qué pedir']]} />
      </div>
      {vista === 'lotes' ? <Lotes /> : vista === 'consumo' ? <Consumo /> : <PedidoVacunas />}
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

/**
 * Qué pedir al distrito. Se elige el mes del pedido (por defecto el siguiente: en octubre se pide noviembre)
 * y se puede sumar a los niños atrasados, que también podrían venir. Imprime una solicitud formal, no la pantalla.
 */
function PedidoVacunas() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [col, setCol] = useState(2);
  const [conAtrasados, setConAtrasados] = useState(false);
  const [verNinos, setVerNinos] = useState(false);
  const [impreso, setImpreso] = useState('pedido');
  // Se elige qué documento sale y luego se abre la impresión
  const imprimir = (cual) => { setImpreso(cual); setTimeout(() => window.print(), 50); };
  useEffect(() => { api('/seguimiento/proyeccion').then(setDatos).catch((e) => setError(e.message)); }, []);
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!datos) return <Cargando />;
  const ultimo = datos.columnas.length - 1;
  const c = datos.columnas[col];
  const atr = datos.columnas[0];
  const nombreMes = (k) => (k.clave === 'este_mes' ? k.nombre.replace('Resto de ', 'Lo que falta de ') : k.nombre.replace(/^\w/, (x) => x.toUpperCase()));
  const reserva = (n) => Math.ceil(n * (1 + datos.reserva / 100));
  const vacunas = datos.filas.map((f) => {
    const mes = f.cantidades[col];
    const atrasados = conAtrasados ? f.cantidades[0] : 0;
    return { ...f, mes, atrasados, n: mes + atrasados };
  }).filter((f) => f.n > 0).sort((x, y) => y.n - x.n);
  const ninos = conAtrasados ? [...c.ninos, ...atr.ninos.map((n) => ({ ...n, atrasado: true }))] : c.ninos;
  const porComunidad = Object.values(ninos.reduce((m, n) => { (m[n.comunidad_id] ||= { nombre: n.comunidad, ninos: [] }).ninos.push(n); return m; }, {}))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  // Listado por lugar de vacunación, y dentro por fecha
  const porLugar = Object.values(ninos.reduce((m, n) => { const l = n.lugar || n.comunidad; (m[l] ||= { nombre: l, ninos: [] }).ninos.push(n); return m; }, {}))
    .sort((x, y) => x.nombre.localeCompare(y.nombre))
    .map((g) => ({ ...g, ninos: [...g.ninos].sort((x, y) => (x.atrasado ? '' : x.fecha).localeCompare(y.atrasado ? '' : y.fecha) || x.nombre_completo.localeCompare(y.nombre_completo)) }));
  const total = vacunas.reduce((t, v) => t + reserva(v.n), 0);

  return (
    <>
      <div className="no-imprimir">
        <div className="pedido-barra">
          <div className="selector-mes" role="group" aria-label="Mes del pedido">
            <button type="button" className="btn btn-icono" onClick={() => setCol(col - 1)} disabled={col <= 1} aria-label="Mes anterior"><ChevronLeft size={20} /></button>
            <strong>{nombreMes(c)}</strong>
            <button type="button" className="btn btn-icono" onClick={() => setCol(col + 1)} disabled={col >= ultimo} aria-label="Mes siguiente"><ChevronRight size={20} /></button>
          </div>
          {col === 2 && <span className="chip-sector">Próximo pedido</span>}
          <label className={`chip-filtro ${conAtrasados ? 'activa' : ''}`}>
            <input type="checkbox" checked={conAtrasados} onChange={(e) => setConAtrasados(e.target.checked)} hidden />
            {conAtrasados ? <Check size={15} /> : <Plus size={15} />} Sumar {atr.ninos.length} atrasados
          </label>
          <div className="pedido-imprimir">
            <button className="btn" onClick={() => imprimir('pedido')} disabled={!vacunas.length}><Printer size={16} />Imprimir pedido</button>
            <button className="btn" onClick={() => imprimir('listado')} disabled={!ninos.length}><Printer size={16} />Imprimir listado de niños</button>
          </div>
        </div>

        <div className="pedido-resumen">
          <div><strong>{ninos.length}</strong><span>niños</span></div>
          <div><strong>{total}</strong><span>dosis a pedir</span></div>
        </div>

        {vacunas.length === 0 ? <div className="tarjeta"><Vacio icono={Package} titulo="Nadie se vacuna en este mes" /></div> : (
          <div className="pedido-vacunas">
            {vacunas.map((v) => (
              <div key={v.codigo} className="pedido-vacuna">
                <strong>{reserva(v.n)}</strong>
                <span className="pv-nombre">{v.nombre}</span>
                {v.atrasados > 0 && <span className="pv-detalle">{v.mes} del mes + {v.atrasados} atrasados</span>}
              </div>
            ))}
          </div>
        )}

        {ninos.length > 0 && (
          <>
            <button type="button" className="carne-completas lejanas" style={{ margin: '1rem 0' }} onClick={() => setVerNinos(!verNinos)} aria-expanded={verNinos}>
              <Users size={20} /><span><strong>Quiénes son</strong> · {ninos.length} niños en {porComunidad.length} comunidades</span>
              <ChevronDown size={18} className={verNinos ? 'girada' : ''} />
            </button>
            {verNinos && porComunidad.map((g) => (
              <section key={g.nombre} className="grupo-casos">
                <div className="grupo-casos-cab"><strong>{g.nombre}</strong><span className="chip">{g.ninos.length}</span></div>
                <div className="casos-filas">
                  {g.ninos.map((n) => (
                    <Link key={`${n.id}-${n.atrasado ? 'a' : 'm'}`} to={`/ninos/${n.id}`} className="fila-caso fila-simple">
                      <div className="fc-cuerpo"><strong>{n.nombre_completo}</strong>
                        <span className="fichas-hoy">{n.dosis.map((d) => <span key={d} className={`ficha-vacuna ${n.atrasado ? 'atrasada' : ''}`}>{d}</span>)}</span></div>
                      <span className="fs-fecha">{n.atrasado ? 'Atrasado' : fecha(n.fecha).slice(0, 5)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {impreso === 'pedido' ? <Documento titulo={`Pedido de vacunas · ${nombreMes(c)}`} periodo={`${nombreMes(c)}${conAtrasados ? ' (incluye atrasados)' : ''}`} detalle="Todo el municipio">
        <TablaDoc columnas={[
          { titulo: 'Vacuna', valor: 'nombre' },
          ...(conAtrasados ? [{ titulo: 'Del mes', valor: 'mes', num: true }, { titulo: 'Atrasados', valor: 'atrasados', num: true }] : []),
          ...(datos.reserva ? [{ titulo: `Reserva ${datos.reserva} %`, valor: (v) => reserva(v.n) - v.n, num: true }] : []),
          { titulo: 'Dosis a pedir', valor: (v) => <strong>{reserva(v.n)}</strong>, num: true },
        ]} filas={vacunas} total={['Total', ...(conAtrasados ? ['', ''] : []), total]} />
        <p className="doc-nota">Cálculo según el esquema de vacunación de cada niño registrado. Total: {total} dosis para {ninos.length} niños.</p>
      </Documento> : (
        <Documento titulo={`Niños que se vacunan · ${nombreMes(c)}`} periodo={`${nombreMes(c)}${conAtrasados ? ' (incluye atrasados)' : ''}`}
          detalle={`${ninos.length} niños · ${porLugar.length} ${porLugar.length === 1 ? 'lugar' : 'lugares'}`}>
          {porLugar.map((g) => (
            <section key={g.nombre}>
              <h2 className="doc-seccion">{g.nombre} · {g.ninos.length}</h2>
              <TablaDoc columnas={[
                { titulo: 'Fecha', valor: (n) => (n.atrasado ? 'Atrasado' : fecha(n.fecha)), ancho: '11%' },
                { titulo: 'Niña o niño', valor: 'nombre_completo', ancho: '34%' },
                { titulo: 'Comunidad', valor: 'comunidad', ancho: '20%' },
                { titulo: 'Vacunas', valor: (n) => n.dosis.join(', ') },
              ]} filas={g.ninos} />
            </section>
          ))}
        </Documento>
      )}
    </>
  );
}
