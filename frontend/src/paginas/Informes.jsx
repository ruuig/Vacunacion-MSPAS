import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Download, FileText, Printer, Search, Send, ShieldCheck, Syringe, TrendingUp } from 'lucide-react';
import { api, qs } from '../api.js';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Cargando, Encabezado, EncabezadoImpresion, Mensaje, Pestanas, Tabla, Tarjeta } from '../componentes/ui.jsx';
import { Estado } from '../componentes/Estado.jsx';
import { MESES, PAGINAS, TIPO_ALERTA, TIPO_CUADERNO, cuadernoFila, descargarCSV, edad, fecha, hoy, pct } from '../util.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';

const VISTAS = [
  ['mensual', <><FileText size={15} />Mensual 5a</>],
  ['nominal', <><ClipboardList size={15} />Listado nominal</>],
  ['seguimiento', <><Search size={15} />Seguimiento</>],
  ['cobertura', <><TrendingUp size={15} />Cobertura</>],
];
const TITULO = { mensual: 'Informe mensual de vacunación', nominal: 'Listado nominal', seguimiento: 'Niños a buscar', cobertura: 'Cobertura y deserción' };

export default function Informes() {
  const ahora = new Date();
  const [vista, setVista] = useState('mensual');
  const [f, setF] = useState({ anio: ahora.getFullYear(), mes: ahora.getMonth() + 1, tipo: '', comunidad: '', tipoAlerta: '',
    modo: 'mes', desde: `${ahora.getFullYear()}-01-01`, hasta: hoy() });
  const [cargado, setCargado] = useState(null); // { vista, datos }: evita pintar una vista con datos de otra
  const [error, setError] = useState('');
  const comunidades = useCatalogo('comunidades');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Un mes (como el SIGSA) o un rango de fechas libre
  const periodoConsulta = f.modo === 'rango' ? { desde: f.desde, hasta: f.hasta } : { anio: f.anio, mes: f.mes };

  useEffect(() => {
    setCargado(null);
    setError('');
    const ruta = {
      mensual: `/informes/mensual${qs({ ...periodoConsulta, tipo: f.tipo, comunidad: f.comunidad })}`,
      nominal: `/informes/nominal${qs({ ...periodoConsulta, tipo: f.tipo, comunidad: f.comunidad })}`,
      seguimiento: `/informes/seguimiento${qs({ tipo: f.tipoAlerta, comunidad: f.comunidad })}`,
      cobertura: `/informes/cobertura${qs({ anio: f.anio })}`,
    }[vista];
    api(ruta).then((d) => setCargado({ vista, datos: d })).catch((e) => setError(e.message));
  }, [vista, f.anio, f.mes, f.tipo, f.comunidad, f.tipoAlerta, f.modo, f.desde, f.hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const datos = cargado?.vista === vista ? cargado.datos : null;
  const periodo = f.modo === 'rango' ? `del ${fecha(f.desde)} al ${fecha(f.hasta)}` : `${MESES[f.mes - 1]} ${f.anio}`;

  return (
    <>
      <EncabezadoImpresion titulo={TITULO[vista]} detalle={vista === 'cobertura' ? `Año ${f.anio}` : vista === 'seguimiento' ? null : periodo} />
      <div className="no-imprimir">
        <Encabezado titulo="Informes">
          <button className="btn" onClick={() => exportar(vista, datos, f)} disabled={!datos}><Download size={16} />Exportar a Excel</button>
          <button className="btn btn-primario" onClick={() => window.print()} disabled={!datos}><Printer size={16} />Imprimir / PDF</button>
        </Encabezado>
        <Pestanas valor={vista} onCambio={setVista} opciones={VISTAS} />

        <div className="tarjeta"><div className="tarjeta-cuerpo">
          <div className="filtros" style={{ marginBottom: 0 }}>
            {['mensual', 'nominal'].includes(vista) && (
              <Campo etiqueta="Período">
                <select value={f.modo} onChange={set('modo')}><option value="mes">Un mes</option><option value="rango">Elegir fechas…</option></select>
              </Campo>
            )}
            {vista !== 'seguimiento' && !(f.modo === 'rango' && ['mensual', 'nominal'].includes(vista)) && <Campo etiqueta="Año"><input type="number" value={f.anio} onChange={set('anio')} /></Campo>}
            {['mensual', 'nominal'].includes(vista) && f.modo === 'rango' && (
              <>
                <Campo etiqueta="Desde"><input type="date" value={f.desde} max={f.hasta} onChange={set('desde')} /></Campo>
                <Campo etiqueta="Hasta"><input type="date" value={f.hasta} min={f.desde} max={hoy()} onChange={set('hasta')} /></Campo>
              </>
            )}
            {['mensual', 'nominal'].includes(vista) && (
              <>
                {f.modo === 'mes' && <Campo etiqueta="Mes"><select value={f.mes} onChange={set('mes')}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Campo>}
                <Campo etiqueta="Tipo de cuaderno">
                  <select value={f.tipo} onChange={set('tipo')}>
                    <option value="">Todos</option>
                    {Object.entries(TIPO_CUADERNO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Campo>
              </>
            )}
            {vista === 'seguimiento' && (
              <Campo etiqueta="Tipo de alerta">
                <select value={f.tipoAlerta} onChange={set('tipoAlerta')}>
                  <option value="">Todos</option>
                  {Object.entries(TIPO_ALERTA).filter(([k]) => k !== 'proxima').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Campo>
            )}
            {vista !== 'cobertura' && (
              <Campo etiqueta="Comunidad">
                <select value={f.comunidad} onChange={set('comunidad')}>
                  <option value="">Todas</option>
                  {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Campo>
            )}
          </div>
        </div></div>
      </div>

      <Mensaje tipo="error">{error}</Mensaje>
      {!datos ? (!error && <Cargando filas={6} />) : (
        <>
          {vista === 'mensual' && f.modo === 'mes' && <CierreMes anio={Number(f.anio)} mes={Number(f.mes)} />}
          {vista === 'mensual' && <Mensual d={datos} periodo={periodo} />}
          {vista === 'nominal' && <Nominal filas={datos} periodo={periodo} />}
          {vista === 'seguimiento' && <Seguimiento filas={datos} />}
          {vista === 'cobertura' && <Cobertura d={datos} />}
        </>
      )}
    </>
  );
}

function Mensual({ d, periodo }) {
  const e = d.encabezado;
  const hex = d.columnas.reduce((s, c) => s + c.hexavalente, 0);
  // En pantalla se pueden esconder las columnas sin dosis para revisar rápido; al imprimir siempre sale completo
  const [soloConDosis, setSoloConDosis] = useState(false);
  const ceros = d.columnas.filter((c) => !c.total).length;
  return (
    <>
      <div className="kpis">
        <div className="kpi marino"><div className="kpi-icono"><Syringe size={19} /></div><strong>{d.total_dosis}</strong><span>Dosis en {periodo}</span></div>
        <div className="kpi azul"><div className="kpi-icono"><BarChart3 size={19} /></div><strong>{hex}</strong><span>Con hexavalente</span></div>
      </div>
      <p className="tenue" style={{ marginBottom: '1rem' }}>
        Área de salud {e.area_salud} · Distrito {e.distrito}{e.tipo && ` · ${TIPO_CUADERNO[e.tipo]}`} · Responsable: {e.responsable}
      </p>
      {ceros > 0 && (
        <label className="interruptor no-imprimir">
          <input type="checkbox" checked={soloConDosis} onChange={(ev) => setSoloConDosis(ev.target.checked)} />
          Ocultar en pantalla las {ceros} columnas sin dosis (al imprimir sale completo)
        </label>
      )}
      {PAGINAS.map((p) => {
        const cols = d.columnas.filter((c) => c.pagina === p.id);
        return (
          <Tarjeta key={p.id} titulo={p.nombre} icono={FileText} cuerpo={false}>
            <Tabla>
              <thead><tr><th>Columna</th><th>Grupo</th><th className="celda-num">Total</th><th className="celda-num">Hombres</th><th className="celda-num">Mujeres</th><th className="celda-num">Hexavalente</th></tr></thead>
              <tbody>
                {cols.map((c) => (
                  <tr key={c.id} className={c.total ? '' : `fila-cero ${soloConDosis ? 'oculta-pantalla' : ''}`}>
                    <td className="fuerte">{c.etiqueta}</td><td>{c.grupo}</td><td className="celda-num fuerte">{c.total}</td>
                    <td className="celda-num">{c.hombres}</td><td className="celda-num">{c.mujeres}</td><td className="celda-num">{c.hexavalente || ''}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        );
      })}
      <Mensaje tipo="info">{hex} de las dosis de Pentavalente y Polio del mes fueron hexavalente (una aplicación llena ambas columnas).</Mensaje>
    </>
  );
}

function Nominal({ filas, periodo }) {
  return (
    <Tarjeta titulo={`Listado nominal · ${periodo}`} icono={ClipboardList} sub={`${filas.length} aplicaciones · Uso interno: contiene datos personales`} cuerpo={false}>
      <Tabla>
        <thead><tr><th>Niña o niño</th><th>Fecha</th><th>CUI</th><th>Sexo</th><th>Vacuna</th><th>Dosis</th><th>Lote</th><th>Cuaderno</th><th>Comunidad</th></tr></thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.id}>
              <td className="fuerte">{r.nombre_completo}</td><td>{fecha(r.fecha_aplicacion)}</td><td>{r.cui || '—'}</td><td>{r.sexo}</td>
              <td>{r.producto}{r.formulacion && ` (${r.formulacion})`}</td>
              <td>{r.dosis}{r.es_recuperacion && <span className="etiqueta">Recup.</span>}</td>
              <td>{r.lote || '—'}</td><td>{cuadernoFila(r)}</td><td>{r.comunidad}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={9} className="tenue">Sin aplicaciones en este periodo.</td></tr>}
        </tbody>
      </Tabla>
    </Tarjeta>
  );
}

function Seguimiento({ filas }) {
  return (
    <Tarjeta titulo="Niños a buscar" icono={Search} sub={`${filas.length} alertas abiertas (sin contar próximas) · Uso interno`} cuerpo={false}>
      <Tabla>
        <thead><tr><th>Niña o niño</th><th>Comunidad</th><th>Tipo</th><th>Dosis</th><th>Responsable</th><th>Cuaderno</th><th>Intentos</th></tr></thead>
        <tbody>
          {filas.map((r, i) => (
            <tr key={i}>
              <td><Link className="nombre-link" to={`/ninos/${r.nino_id}`}>{r.nombre_completo}</Link><span className="sub">{edad(r.fecha_nacimiento)}</span></td>
              <td>{r.comunidad}</td>
              <td><Estado de={r.tipo} /></td>
              <td>{r.etiqueta || '—'}</td>
              <td>{r.responsable || '—'}<span className="sub">{r.telefono || 'Sin teléfono'}</span></td>
              <td>{cuadernoFila(r)}</td>
              <td className="num">{r.intentos}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={7} className="tenue">No hay niños pendientes de buscar.</td></tr>}
        </tbody>
      </Tabla>
    </Tarjeta>
  );
}

function Cobertura({ d }) {
  const filas = [...d.comunidades, d.total];
  return (
    <Tarjeta titulo={`Cobertura y deserción · ${d.anio}`} icono={TrendingUp} cuerpo={false}>
      <Tabla>
        <thead>
          <tr><th>Comunidad</th><th className="celda-num">Meta &lt; 1</th><th className="celda-num">Penta 1a</th><th className="celda-num">Penta 3a</th>
            <th className="celda-num">Cob. Penta 3a</th><th className="celda-num">Cob. Polio 3a</th><th className="celda-num">Meta 1 año</th>
            <th className="celda-num">SPR 1</th><th className="celda-num">Cob. SPR 1</th><th className="celda-num">Deserción</th></tr>
        </thead>
        <tbody>
          {filas.map((r) => (
            <tr key={r.id ?? 'total'} className={r.id ? '' : 'fila-total'}>
              <td className="fuerte">{r.nombre}</td><td className="celda-num">{r.meta_menor_1 ?? '—'}</td><td className="celda-num">{r.dpt1}</td>
              <td className="celda-num">{r.dpt3}</td><td className="celda-num">{pct(r.cobertura_dpt3)}</td><td className="celda-num">{pct(r.cobertura_polio3)}</td>
              <td className="celda-num">{r.meta_1_anio ?? '—'}</td><td className="celda-num">{r.spr1}</td><td className="celda-num">{pct(r.cobertura_spr1)}</td>
              <td className={`celda-num ${r.desercion_dpt > 10 ? 'num-alerta' : ''}`}>{pct(r.desercion_dpt)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </Tarjeta>
  );
}

function exportar(vista, datos, f) {
  const sufijo = `${f.anio}-${String(f.mes).padStart(2, '0')}`;
  if (vista === 'mensual') {
    descargarCSV(`informe-mensual-${sufijo}`, [
      { titulo: 'Página', valor: (c) => PAGINAS.find((p) => p.id === c.pagina)?.nombre }, { titulo: 'Grupo', valor: 'grupo' },
      { titulo: 'Columna', valor: 'etiqueta' }, { titulo: 'Total', valor: 'total' }, { titulo: 'Hombres', valor: 'hombres' },
      { titulo: 'Mujeres', valor: 'mujeres' }, { titulo: 'Hexavalente', valor: 'hexavalente' },
    ], datos.columnas);
  } else if (vista === 'nominal') {
    descargarCSV(`listado-nominal-${sufijo}`, [
      { titulo: 'Fecha', valor: (r) => fecha(r.fecha_aplicacion) }, { titulo: 'Nombre', valor: 'nombre_completo' }, { titulo: 'CUI', valor: 'cui' },
      { titulo: 'Sexo', valor: 'sexo' }, { titulo: 'Nacimiento', valor: (r) => fecha(r.fecha_nacimiento) }, { titulo: 'Vacuna', valor: 'producto' },
      { titulo: 'Dosis', valor: 'dosis' }, { titulo: 'Lote', valor: 'lote' }, { titulo: 'Formulación', valor: 'formulacion' },
      { titulo: 'Recuperación', valor: (r) => (r.es_recuperacion ? 'Sí' : '') }, { titulo: 'Cuaderno', valor: (r) => (r.cuaderno_numero ? `${r.cuaderno_numero}/${r.cuaderno_anio}` : '') },
      { titulo: 'Fila', valor: 'fila' }, { titulo: 'Comunidad', valor: 'comunidad' },
    ], datos);
  } else if (vista === 'seguimiento') {
    descargarCSV('seguimiento', [
      { titulo: 'Comunidad', valor: 'comunidad' }, { titulo: 'Tipo', valor: (r) => TIPO_ALERTA[r.tipo] }, { titulo: 'Nombre', valor: 'nombre_completo' },
      { titulo: 'Dosis', valor: 'etiqueta' }, { titulo: 'Responsable', valor: 'responsable' }, { titulo: 'Teléfono', valor: 'telefono' },
      { titulo: 'Cuaderno y fila', valor: cuadernoFila }, { titulo: 'Intentos', valor: 'intentos' },
    ], datos);
  } else {
    descargarCSV(`cobertura-${f.anio}`, [
      { titulo: 'Comunidad', valor: 'nombre' }, { titulo: 'Meta menor de 1', valor: 'meta_menor_1' }, { titulo: 'Penta 1a', valor: 'dpt1' },
      { titulo: 'Penta 3a', valor: 'dpt3' }, { titulo: 'Cobertura Penta 3a %', valor: 'cobertura_dpt3' }, { titulo: 'Cobertura Polio 3a %', valor: 'cobertura_polio3' },
      { titulo: 'Meta 1 año', valor: 'meta_1_anio' }, { titulo: 'SPR 1', valor: 'spr1' }, { titulo: 'Cobertura SPR 1 %', valor: 'cobertura_spr1' },
      { titulo: 'Deserción %', valor: 'desercion_dpt' },
    ], [...datos.comunidades, datos.total]);
  }
}

/** Cierre de mes (análisis F6): revisar la calidad de los datos y dejar constancia de que el informe se envió. */
function CierreMes({ anio, mes }) {
  const { usuario } = useSesion();
  const { avisar } = useDialogos();
  const [calidad, setCalidad] = useState(null);
  const [enviados, setEnviados] = useState([]);
  const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const hasta = [new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10), hoy()].sort()[0];
  const cargar = () => {
    api('/tablero/calidad' + qs({ desde, hasta })).then(setCalidad).catch(() => setCalidad([]));
    api('/informes/enviados' + qs({ anio })).then(setEnviados).catch(() => {});
  };
  useEffect(cargar, [anio, mes]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!calidad) return null;
  const pendientes = calidad.filter((c) => !c.ok && c.grave);
  const revisiones = calidad.filter((c) => c.grave);
  const bien = revisiones.filter((c) => c.ok).length;
  const enviado = enviados.find((e) => e.tipo === 'mensual_5a' && e.mes === mes);
  const marcar = () => api('/informes/enviado', { method: 'POST', body: { tipo: 'mensual_5a', anio, mes } })
    .then(() => { avisar('Quedó registrado como enviado.'); cargar(); }).catch((e) => avisar(e.message, 'error'));
  return (
    <Tarjeta titulo="Antes de enviar el informe" icono={ShieldCheck} className="no-imprimir"
      sub={pendientes.length ? 'Revise estos puntos para que los números sean confiables' : 'Los datos del mes están listos'}>
      {/* Lo que está bien se resume en una línea; solo se despliega lo que hay que revisar */}
      {bien > 0 && (
        <div className="lectura-item t-ok" style={{ marginBottom: '.6rem' }}><CheckCircle2 size={17} />
          <span><strong>{bien} de {revisiones.length} revisiones sin problemas</strong>
            {' '}({revisiones.filter((c) => c.ok).map((c) => c.titulo.toLowerCase()).join(', ')}).</span></div>
      )}
      <div className="lectura">
        {revisiones.filter((c) => !c.ok).map((c) => (
          <div key={c.codigo} className={`lectura-item ${c.ok ? 't-ok' : 't-atencion'}`}>
            {c.ok ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <span><strong>{c.titulo}</strong>{c.ok ? ': sin problemas.' : `: ${c.cantidad}. ${c.ayuda}`}</span>
          </div>
        ))}
      </div>
      <div className="acciones" style={{ justifyContent: 'space-between' }}>
        {pendientes.length > 0 ? <Link className="btn" to="/tablero?vista=calidad">Revisar en el tablero</Link> : <span />}
        {enviado ? (
          <span className="lectura-item t-ok"><CheckCircle2 size={17} /><span>Enviado el {fecha(String(enviado.fecha).slice(0, 10))} por {enviado.usuario}</span></span>
        ) : usuario.rol === 'enfermera' && (
          <button className="btn btn-verde" onClick={marcar}><Send size={16} />Marcar como enviado al SIGSA</button>
        )}
      </div>
    </Tarjeta>
  );
}
