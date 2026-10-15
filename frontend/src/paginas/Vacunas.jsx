// Vacunas: consumo mensual por vacuna y qué pedir al distrito.
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
import { useSesion } from '../App.jsx';

export default function Vacunas() {
  const { usuario } = useSesion();
  const direccion = usuario.rol === 'administrador';
  const [vista, setVista] = useState(() => new URLSearchParams(window.location.search).get('vista') || 'pedido');
  return (
    <>
      <div className="no-imprimir">
        <Encabezado titulo={direccion ? 'Vacunas' : 'Vacunas que necesita su puesto'} />
        {direccion && <Pestanas valor={vista} onCambio={setVista} opciones={[['pedido', 'Qué pedir'], ['consumo', 'Consumo del mes']]} />}
      </div>
      {direccion && vista === 'consumo' ? <Consumo /> : <PedidoVacunas direccion={direccion} />}
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
                  <th className="celda-num">Devueltas</th>
                </tr></thead>
                <tbody>
                  {datos.vacunas.map((v) => (
                    <tr key={v.producto_id}>
                      <td className="fuerte">{v.nombre}</td>
                      <td className="celda-num">{v.en_servicio}</td><td className="celda-num">{v.en_jornadas}</td>
                      <td className="celda-num fuerte">{v.total}</td>
                      <td className="celda-num">{v.llevadas ?? '—'}</td><td className="celda-num">{v.devueltas ?? '—'}</td>
                    </tr>
                  ))}
                  <tr className="fila-total">
                    <td>Total</td><td className="celda-num">{total('en_servicio')}</td><td className="celda-num">{total('en_jornadas')}</td>
                    <td className="celda-num">{total('total')}</td><td className="celda-num">{total('llevadas')}</td>
                    <td className="celda-num">{total('devueltas')}</td>
                  </tr>
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        </>
      )}
    </>
  );
}

/**
 * Qué pedir al distrito. Se elige el mes del pedido (por defecto el siguiente: en octubre se pide noviembre)
 * y se puede sumar a los niños atrasados, que también podrían venir. Imprime una solicitud formal, no la pantalla.
 */
function PedidoVacunas({ direccion }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [col, setCol] = useState(2);
  const [conAtrasados, setConAtrasados] = useState(false);
  // Quiénes son: se filtra por comunidad o tocando una vacuna; sin filtro no se lista a nadie
  const [comunidadSel, setComunidadSel] = useState('');
  const [vacunaSel, setVacunaSel] = useState('');
  const [impreso, setImpreso] = useState('pedido');
  // Se elige qué documento sale y luego se abre la impresión
  const imprimir = (cual) => { setImpreso(cual); setTimeout(() => window.print(), 50); };
  const { avisar } = useDialogos();
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
    // BCG y Hepatitis B se ponen al nacer: en los meses que vienen se suman los recién nacidos estimados (aún no registrados)
    const porNacer = col >= 2 && ['BCG', 'HB_PED'].includes(f.codigo) ? Math.min(mes, datos.nacimientos_por_mes || 0) : 0;
    return { ...f, mes, atrasados, porNacer, n: mes + atrasados };
  }).filter((f) => f.n > 0).sort((x, y) => y.n - x.n);
  const ninos = conAtrasados ? [...c.ninos, ...atr.ninos.map((n) => ({ ...n, atrasado: true }))] : c.ninos;
  const porComunidad = Object.values(ninos.reduce((m, n) => { (m[n.comunidad_id] ||= { nombre: n.comunidad, ninos: [] }).ninos.push(n); return m; }, {}))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  // Listado por lugar de vacunación, y dentro por fecha
  const porLugar = Object.values(ninos.reduce((m, n) => { const l = n.lugar || n.comunidad; (m[l] ||= { nombre: l, ninos: [] }).ninos.push(n); return m; }, {}))
    .sort((x, y) => x.nombre.localeCompare(y.nombre))
    .map((g) => ({ ...g, ninos: [...g.ninos].sort((x, y) => (x.atrasado ? '' : x.fecha).localeCompare(y.atrasado ? '' : y.fecha) || x.nombre_completo.localeCompare(y.nombre_completo)) }));
  const comunidadesPedido = porComunidad.map((g) => g.nombre);
  const filtrados = ninos.filter((n) => (!comunidadSel || n.comunidad === comunidadSel) && (!vacunaSel || (n.productos || []).includes(vacunaSel)));
  const gruposFiltrados = Object.values(filtrados.reduce((m, n) => { (m[n.comunidad] ||= { nombre: n.comunidad, ninos: [] }).ninos.push(n); return m; }, {}))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  const total = vacunas.reduce((t, v) => t + reserva(v.n), 0);
  // Dirección: lo que necesita cada puesto (sumando las vacunas de sus niños)
  const productosCat = datos.filas.map((x) => [x.codigo, x.nombre]);
  const nombreVacuna = (k) => productosCat.find((x) => x[0] === k)?.[1] || k;
  const porPuesto = Object.values(ninos.reduce((m, n) => {
    const id = n.puesto_id ?? n.comunidad_id;
    const p = (m[id] ||= { id, nombre: n.lugar || n.comunidad, cant: {} });
    for (const k of n.productos || []) p.cant[k] = (p.cant[k] || 0) + 1;
    return m;
  }, {})).sort((a, b) => Object.values(b.cant).reduce((t, x) => t + x, 0) - Object.values(a.cant).reduce((t, x) => t + x, 0));
  const codigos = vacunas.map((v) => v.codigo).filter((k) => porPuesto.some((p) => p.cant[k]));

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
            <button className="btn" disabled={!vacunas.length} onClick={() => {
              // La Dirección guarda el pedido del municipio (y el de cada puesto) al imprimirlo: a fin de mes se compara con lo aplicado
              if (direccion && c.anio && c.mes) {
                api('/lotes/pedido', { method: 'POST', body: { anio: c.anio, mes: c.mes, incluye_atrasados: conAtrasados,
                  detalle: vacunas.map((v) => ({ codigo: v.codigo, cantidad: v.n })),
                  por_puesto: porPuesto.flatMap((p) => Object.entries(p.cant).map(([codigo, cantidad]) => ({ puesto_id: p.id, codigo, cantidad }))) } })
                  .then(() => avisar(`Pedido de ${nombreMes(c)} guardado.`)).catch(() => {});
              }
              imprimir('pedido');
            }}><Printer size={16} />{direccion ? 'Imprimir pedido' : 'Imprimir lo que necesita mi puesto'}</button>
            <button className="btn" onClick={() => imprimir('listado')} disabled={!ninos.length}><Printer size={16} />Imprimir listado de niños</button>
          </div>
        </div>

        <div className="pedido-resumen">
          <div><strong>{ninos.length}</strong><span>niños</span></div>
          <div><strong>{total}</strong><span>dosis a pedir</span></div>
        </div>

        {direccion && porPuesto.length > 0 && (
          <Tarjeta titulo="Por puesto" icono={Package} sub="Lo que necesita cada puesto para sus niños. El total del municipio suma además BCG y Hepatitis B de los recién nacidos (estimados)" cuerpo={false}>
            <Tabla>
              <thead><tr><th>Puesto</th>{codigos.map((k) => <th key={k} className="celda-num">{nombreVacuna(k)}</th>)}<th className="celda-num">Total</th></tr></thead>
              <tbody>
                {porPuesto.map((p) => (
                  <tr key={p.id}><td className="fuerte">{p.nombre}</td>{codigos.map((k) => <td key={k} className="celda-num">{p.cant[k] || '—'}</td>)}
                    <td className="celda-num fuerte">{Object.values(p.cant).reduce((t, x) => t + x, 0)}</td></tr>
                ))}
                <tr className="fila-total"><td>Total del municipio</td>{codigos.map((k) => <td key={k} className="celda-num">{vacunas.find((v) => v.codigo === k)?.n ?? 0}</td>)}<td className="celda-num">{total}</td></tr>
              </tbody>
            </Tabla>
          </Tarjeta>
        )}
        {vacunas.length === 0 ? <div className="tarjeta"><Vacio icono={Package} titulo="Nadie se vacuna en este mes" /></div> : (
          <div className="pedido-vacunas">
            {vacunas.map((v) => (
              <button type="button" key={v.codigo} className={`pedido-vacuna ${vacunaSel === v.codigo ? 'activa' : ''}`} aria-pressed={vacunaSel === v.codigo}
                onClick={() => setVacunaSel(vacunaSel === v.codigo ? '' : v.codigo)}>
                <strong>{reserva(v.n)}</strong>
                <span className="pv-nombre">{v.nombre}</span>
                {v.porNacer > 0 && <span className="pv-detalle">{v.porNacer === v.n ? 'Recién nacidos (estimado)' : `${v.porNacer} recién nacidos estimados`}</span>}
                {v.atrasados > 0 && <span className="pv-detalle">{v.mes} del mes + {v.atrasados} atrasados</span>}
              </button>
            ))}
          </div>
        )}

        {ninos.length > 0 && (
          <>
            <div className="pedido-quienes">
              <strong className="pq-titulo"><Users size={18} />Quiénes son</strong>
              <select value={comunidadSel} onChange={(e) => setComunidadSel(e.target.value)} aria-label="Comunidad">
                <option value="">Elija una comunidad…</option>
                {comunidadesPedido.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {vacunaSel && (
                <button type="button" className="chip-filtro activa" onClick={() => setVacunaSel('')}>
                  {vacunas.find((v) => v.codigo === vacunaSel)?.nombre} ✕
                </button>
              )}
              {(comunidadSel || vacunaSel) && <span className="tenue">{filtrados.length} niños</span>}
            </div>
            {(() => {
              const v = vacunas.find((x) => x.codigo === vacunaSel);
              return v?.porNacer > 0 && !comunidadSel && (
                <Mensaje tipo="info">{v.porNacer} de las {v.n} dosis de {v.nombre} son para los bebés que nacerán en {nombreMes(c).toLowerCase()}: se calcula con el promedio de nacimientos ({datos.nacimientos_por_mes} por mes). Todavía no están registrados.</Mensaje>
              );
            })()}
            {(comunidadSel || vacunaSel) && gruposFiltrados.map((g) => (
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

      {impreso === 'pedido' ? <Documento titulo={direccion ? `Pedido de vacunas · ${nombreMes(c)}` : `Vacunas que necesita el puesto · ${nombreMes(c)}`} periodo={`${nombreMes(c)}${conAtrasados ? ' (incluye atrasados)' : ''}`} detalle={direccion ? 'Todo el municipio' : (porPuesto.map((p) => p.nombre).join(', ') || 'Su puesto')}>
        <TablaDoc columnas={[
          { titulo: 'Vacuna', valor: 'nombre' },
          ...(conAtrasados ? [{ titulo: 'Del mes', valor: 'mes', num: true }, { titulo: 'Atrasados', valor: 'atrasados', num: true }] : []),
          ...(datos.reserva ? [{ titulo: `Reserva ${datos.reserva} %`, valor: (v) => reserva(v.n) - v.n, num: true }] : []),
          { titulo: 'Dosis a pedir', valor: (v) => <strong>{reserva(v.n)}</strong>, num: true },
        ]} filas={vacunas} total={['Total', ...(conAtrasados ? ['', ''] : []), total]} />
        <p className="doc-nota">Cálculo según el esquema de vacunación de cada niño registrado. Total: {total} dosis para {ninos.length} niños.</p>
        {direccion && porPuesto.length > 0 && (
          <>
            <h2 className="doc-seccion">Por puesto</h2>
            <TablaDoc columnas={[{ titulo: 'Puesto', valor: 'nombre' }, ...codigos.map((k) => ({ titulo: nombreVacuna(k), valor: (p) => p.cant[k] || '', num: true })),
              { titulo: 'Total', valor: (p) => Object.values(p.cant).reduce((t, x) => t + x, 0), num: true }]} filas={porPuesto} />
            <p className="doc-nota">BCG y Hepatitis B de recién nacidos se suman solo en el total del municipio (son estimados, aún no tienen puesto).</p>
          </>
        )}
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
