import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CalendarCheck, Check, ClipboardList, Lock, MapPin, MapPinned, Package, PlayCircle, Printer, Save, Search, Syringe, Truck, UserPlus, Users, XCircle,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import Vacunar from '../componentes/Vacunar.jsx';
import Documento, { TablaDoc } from '../componentes/Documento.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import {
  Campo, Cargando, Encabezado, EncabezadoImpresion, Mensaje, Modal, Pestanas, Tabla, Tarjeta, Vacio, useEsCelular,
} from '../componentes/ui.jsx';
import { borrarJornada, cola, descargarJornada, encolar, jornadaGuardada } from '../componentes/fueraDeLinea.js';
import { Estado, Nivel, nivelComunidad, plural, puntaje } from '../componentes/Estado.jsx';
import { cuadernoFila, edad, fecha, hoy, puede } from '../util.js';

// Una jornada planificada cuya fecha ya pasó está "por cerrar": hasta cerrarla, sus inasistentes no pasan a Pendientes
const estadoJornada = (j) => (['planificada', 'en_curso'].includes(j.estado) && j.fecha.slice(0, 10) < hoy() ? 'por_cerrar' : j.estado);

function Avance({ hechos, total }) {
  const p = total ? Math.round((hechos / total) * 100) : 0;
  return (
    <span className="barra-progreso">
      <span className="pista"><span className="lleno" style={{ width: `${p}%`, background: 'var(--verde)' }} /></span>
      <span>{hechos} de {total}{total ? ` · ${p} %` : ''}</span>
    </span>
  );
}

const pctCumplimiento = (v, c) => (c ? Math.round((v / c) * 100) : null);
const tonoCumplimiento = (p) => (p == null ? '' : p >= 80 ? 'verde' : p >= 60 ? 'ambar' : 'rojo');

/** Cumplimiento de las jornadas ya realizadas: vacunados de la lista ÷ convocados, por encargado (responsable de la jornada). */
function CumplimientoEncargados({ jornadas }) {
  const realizadas = jornadas.filter((j) => j.estado === 'cerrada');
  if (!realizadas.length) return null;
  const filas = Object.values(realizadas.reduce((m, j) => {
    const k = j.responsable || 'Sin responsable';
    const r = (m[k] ||= { nombre: k, jornadas: 0, convocados: 0, vacunados: 0 });
    r.jornadas += 1; r.convocados += j.convocados; r.vacunados += Math.min(j.vacunados, j.convocados);
    return m;
  }, {})).sort((a, b) => (pctCumplimiento(b.vacunados, b.convocados) ?? 0) - (pctCumplimiento(a.vacunados, a.convocados) ?? 0));
  const total = filas.reduce((t, f) => ({ c: t.c + f.convocados, v: t.v + f.vacunados }), { c: 0, v: 0 });
  return (
    <Tarjeta titulo="Cumplimiento de las jornadas" icono={CalendarCheck} sub={`Vacunados de la lista ÷ convocados · ${plural(realizadas.length, 'jornada realizada', 'jornadas realizadas')} · en total ${pctCumplimiento(total.v, total.c) ?? 0} %`} cuerpo={false}>
      <Tabla>
        <thead><tr><th>Encargado de la jornada</th><th className="celda-num">Jornadas</th><th className="celda-num">Convocados</th><th className="celda-num">Vacunados</th><th>Cumplimiento</th></tr></thead>
        <tbody>
          {filas.map((f) => {
            const p = pctCumplimiento(f.vacunados, f.convocados);
            return (
              <tr key={f.nombre}>
                <td className="fuerte">{f.nombre}</td><td className="celda-num">{f.jornadas}</td><td className="celda-num">{f.convocados}</td><td className="celda-num">{f.vacunados}</td>
                <td><span className={`cumplimiento ${tonoCumplimiento(p)}`}><span className="pista"><span className="lleno" style={{ width: `${p ?? 0}%` }} /></span><b>{p ?? '—'} %</b></span></td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </Tarjeta>
  );
}

export function ListaJornadas() {
  const { usuario } = useSesion();
  const ir = useNavigate();
  const [jornadas, setJornadas] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/jornadas').then(setJornadas).catch((e) => setError(e.message)); }, []);
  const esEnfermera = puede(usuario.rol, 'enfermera');
  const porCerrar = (jornadas || []).filter((j) => estadoJornada(j) === 'por_cerrar').length;
  const [filtro, setFiltro] = useState('');
  // Primero lo que está pasando hoy, luego lo que falta cerrar, lo que viene y al final lo ya hecho
  const ORDEN = { en_curso: 0, por_cerrar: 1, planificada: 2, cerrada: 3, cancelada: 4 };
  const lista = (jornadas || []).map((j) => ({ ...j, est: estadoJornada(j) }))
    .sort((a, b) => ORDEN[a.est] - ORDEN[b.est] || (a.est === 'planificada' ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha)));
  const cuenta = (e) => lista.filter((j) => j.est === e).length;
  const visibles = lista.filter((j) => !filtro || j.est === filtro);

  return (
    <>
      <Encabezado titulo="Jornadas extramurales">
        {esEnfermera && <Link className="btn btn-primario" to="/jornadas/nueva"><Truck size={18} />Planificar jornada</Link>}
      </Encabezado>
      <Mensaje tipo="error">{error}</Mensaje>
      {porCerrar > 0 && (
        <Mensaje tipo="aviso">
          {plural(porCerrar, 'jornada ya pasó y sigue abierta', 'jornadas ya pasaron y siguen abiertas')}. Ciérrela para pasar a quienes no llegaron al control del mes.
        </Mensaje>
      )}
      {jornadas && <CumplimientoEncargados jornadas={jornadas} />}
      {jornadas === null ? <Cargando /> : jornadas.length === 0 ? (
        <div className="tarjeta">
          <Vacio icono={Truck} titulo="Todavía no hay jornadas"
            accion={esEnfermera && <Link className="btn btn-primario" to="/jornadas/nueva">Planificar la primera</Link>}>
            {esEnfermera ? 'Elija las comunidades con más atrasos y planifique una jornada.' : 'Aquí aparecerán las jornadas en las que la enfermera lo asigne.'}
          </Vacio>
        </div>
      ) : (
        <>
        <div className="chips-filtro">
          {[['', 'Todas', lista.length], ['en_curso', 'En curso'], ['por_cerrar', 'Por cerrar'], ['planificada', 'Planificadas'], ['cerrada', 'Realizadas'], ['cancelada', 'Canceladas']]
            .map(([k, t, n = cuenta(k)]) => (k && !n ? null : (
              <button key={k} className={`chip-filtro ${filtro === k ? 'activa' : ''} ${k === 'en_curso' ? 'chip-en-curso' : ''}`} onClick={() => setFiltro(k)}>{t} ({n})</button>
            )))}
        </div>
        <Tabla>
          <thead><tr><th>Fecha</th><th>Comunidades</th><th>Equipo</th><th>Vacunados de la lista</th><th>Estado</th></tr></thead>
          <tbody>
            {visibles.map((j) => (
              <tr key={j.id} className={`clicable ${j.est === 'en_curso' ? 'fila-en-curso' : ''}`} onClick={() => ir(`/jornadas/${j.id}`)}>
                <td><Link className="nombre-link" to={`/jornadas/${j.id}`}>{fecha(j.fecha)}</Link></td>
                <td>{j.comunidades}</td>
                <td>{j.equipo || j.responsable}</td>
                <td>{j.estado === 'cancelada' ? <span className="tenue">—</span> : <Avance hechos={j.vacunados} total={j.convocados} />}</td>
                <td><Estado de={j.est} grande={j.est === 'en_curso'} /></td>
              </tr>
            ))}
          </tbody>
        </Tabla>
        </>
      )}
    </>
  );
}


export function NuevaJornada() {
  const { usuario } = useSesion();
  const [params] = useSearchParams();
  const ir = useNavigate();
  const comunidades = useCatalogo('comunidades');
  const productos = useCatalogo('productos');
  const [f, setF] = useState({ fecha: hoy(), porcentaje_reserva: 0, observaciones: '', responsable_id: String(usuario.id) });
  const [equipo, setEquipo] = useState(new Set());
  const [elegidas, setElegidas] = useState(params.get('comunidad') ? [Number(params.get('comunidad'))] : null);
  const [previa, setPrevia] = useState(null);
  const [tablero, setTablero] = useState(null);
  const [personal, setPersonal] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [viendoResumen, setViendoResumen] = useState(false);

  useEffect(() => {
    api('/comunidades/tablero').then(setTablero).catch(() => setTablero([]));
    api('/casos/personal').then(setPersonal).catch(() => {});
  }, []);
  useEffect(() => {
    setPrevia(null);
    api('/jornadas/vista-previa' + qs({ fecha: f.fecha })).then((r) => setPrevia(Object.fromEntries(r.comunidades.map((c) => [c.comunidad_id, c]))))
      .catch((e) => setError(e.message));
  }, [f.fecha]);

  // Comunidades ordenadas por necesidad; al abrir se proponen las de prioridad alta que tengan niños ese día
  const porId = Object.fromEntries((tablero || []).map((c) => [c.id, c]));
  const maximo = Math.max(0, ...(tablero || []).map(puntaje));
  const ordenadas = [...comunidades].sort((a, b) => (porId[b.id] ? puntaje(porId[b.id]) : 0) - (porId[a.id] ? puntaje(porId[a.id]) : 0)
    || (previa?.[b.id]?.ninos || 0) - (previa?.[a.id]?.ninos || 0) || a.nombre.localeCompare(b.nombre));
  useEffect(() => {
    if (elegidas !== null || !previa || !tablero) return;
    setElegidas(tablero.filter((c) => nivelComunidad(c, maximo) === 'critica' && previa[c.id]?.ninos).map((c) => c.id));
  }, [previa, tablero, elegidas, maximo]);
  // Una comunidad sin nadie con vacunas ese día no se puede elegir (no hay a quién vacunar)
  const marcadas = (elegidas || []).filter((id) => !previa || previa[id]);
  const alternar = (id) => setElegidas(marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id]);

  // Resumen en vivo de lo elegido: niños, dosis y biológicos a llevar (con reserva)
  const resumen = useMemo(() => {
    const r = { ninos: 0, dosis: 0, productos: {} };
    for (const id of marcadas) {
      const c = previa?.[id];
      if (!c) continue;
      r.ninos += c.ninos;
      r.dosis += c.dosis;
      for (const [p, n] of Object.entries(c.productos)) r.productos[p] = (r.productos[p] || 0) + n;
    }
    return r;
  }, [marcadas, previa]);
  const nombreProducto = (codigo) => productos.find((p) => p.codigo === codigo)?.nombre || codigo;
  const reserva = Number(f.porcentaje_reserva) || 0;

  async function crear(e) {
    e?.preventDefault();
    // Primero se ve el resumen; desde ahí se confirma
    if (!viendoResumen) { setViendoResumen(true); return; }
    setError('');
    setGuardando(true);
    try {
      const j = await api('/jornadas', { method: 'POST', body: {
        ...f, porcentaje_reserva: reserva, responsable_id: Number(f.responsable_id), comunidad_ids: marcadas, equipo_ids: [...equipo],
      } });
      ir('/jornadas/' + j.id);
    } catch (err) { setError(err.message); setGuardando(false); setViendoResumen(false); }
  }
  const nombrePersona = (id) => personal.find((p) => String(p.id) === String(id))?.nombre || (String(id) === String(usuario.id) ? usuario.nombre : '');
  const fechaLarga = new Date(`${f.fecha}T12:00:00Z`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <form onSubmit={crear}>
      <Encabezado titulo="Planificar jornada" migas={[['Jornadas', '/jornadas'], ['Nueva']]} />
      <Mensaje tipo="error">{error}</Mensaje>

      <Tarjeta titulo="Datos de la jornada" icono={CalendarCheck}>
        <div className="rejilla">
          <Campo etiqueta="Fecha" requerido><input type="date" required min={hoy()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Responsable" requerido>
            <select required value={f.responsable_id} onChange={(e) => setF({ ...f, responsable_id: e.target.value })}>
              {personal.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              {!personal.some((p) => String(p.id) === f.responsable_id) && <option value={usuario.id}>{usuario.nombre}</option>}
            </select>
          </Campo>
          <div className="campo ancho">
            <span>También salen (solo el equipo verá la jornada)</span>
            <div className="chips-filtro" style={{ marginBottom: 0 }}>
              {personal.filter((p) => String(p.id) !== f.responsable_id).map((p) => (
                <button key={p.id} type="button" className={`chip-filtro ${equipo.has(p.id) ? 'activa' : ''}`} aria-pressed={equipo.has(p.id)}
                  onClick={() => setEquipo((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>
          <Campo etiqueta="Observaciones" className="ancho"><input value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} placeholder="Punto de reunión, transporte, etc." /></Campo>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Comunidades de la ruta" icono={MapPinned}
        sub={elegidas === null ? 'Calculando quiénes tendrán vacunas ese día…' : `${plural(marcadas.length, 'seleccionada', 'seleccionadas')} · se proponen las de prioridad alta; cambie las que quiera`}>
        <div className="casillas">
          {ordenadas.map((c) => {
            const p = previa?.[c.id];
            const t = porId[c.id];
            const nivel = t ? nivelComunidad(t, maximo) : 'al_dia';
            return (
              <label key={c.id} className={`casilla ${marcadas.includes(c.id) ? 'marcada' : ''} ${p ? '' : 'sin-ninos'}`}>
                <input type="checkbox" checked={marcadas.includes(c.id)} onChange={() => alternar(c.id)} disabled={previa !== null && !p} />
                <span className="casilla-texto">
                  <span className="casilla-nombre">{c.nombre}</span>
                  <span className="sub">
                    {previa === null ? 'Calculando…' : p ? <><b>{plural(p.ninos, 'niño', 'niños')}</b> con vacunas ese día{p.atrasados > 0 && ` · ${plural(p.atrasados, 'atrasado', 'atrasados')}`}</> : 'Nadie tiene vacunas ese día'}
                  </span>
                  {nivel !== 'al_dia' && <Nivel de={nivel} />}
                </span>
              </label>
            );
          })}
        </div>
      </Tarjeta>

      <section className={`resumen-jornada ${marcadas.length ? '' : 'vacio'}`}>
        <div className="cifras">
          <div><strong>{resumen.ninos}</strong><span>niños convocados</span></div>
          {/* Vacunas que se pondrán (una hexavalente cubre Penta y Polio): lo que importa para el trabajo y lo que se lleva */}
          <div title={`${resumen.dosis} dosis del esquema; la hexavalente cubre Pentavalente y Polio en una sola aplicación`}>
            <strong>{Object.values(resumen.productos).reduce((t, n) => t + n, 0)}</strong><span>vacunas a poner</span>
          </div>
          <div><strong>{Object.keys(resumen.productos).length}</strong><span>vacunas distintas</span></div>
        </div>
        {Object.keys(resumen.productos).length > 0 && (
          <div className="llevar">
            <span className="rotulo"><Package size={14} /> Llevar{reserva ? ` (con ${reserva} % de reserva)` : ''}:</span>
            {Object.entries(resumen.productos).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
              <span key={p} className="chip">{nombreProducto(p)}: {Math.ceil(n * (1 + reserva / 100))}</span>
            ))}
          </div>
        )}
        <div className="acciones">
          <button type="button" className="btn" onClick={() => ir(-1)}>Cancelar</button>
          <button className="btn btn-primario" disabled={!marcadas.length}>
            <ClipboardList size={18} />Ver resumen de la jornada
          </button>
        </div>
      </section>

      {viendoResumen && (
        <Modal titulo="Resumen de la jornada" onCerrar={() => setViendoResumen(false)}
          pie={<>
            <button type="button" className="btn" onClick={() => setViendoResumen(false)}>Volver a editar</button>
            <button type="button" className="btn btn-verde" disabled={guardando} onClick={() => crear()}>
              <Check size={18} />{guardando ? 'Creando…' : 'Crear jornada'}
            </button>
          </>}>
          <dl className="resumen-confirmar">
            <div><dt>Fecha</dt><dd>{fechaLarga.replace(/^\w/, (x) => x.toUpperCase())}</dd></div>
            <div><dt>Responsable</dt><dd>{nombrePersona(f.responsable_id)}</dd></div>
            {equipo.size > 0 && <div><dt>Equipo</dt><dd>{[...equipo].map(nombrePersona).join(', ')}</dd></div>}
            <div><dt>Comunidades</dt><dd>
              <ul className="rc-lista">
                {marcadas.map((id) => <li key={id}><span>{comunidades.find((c) => c.id === id)?.nombre}</span><b>{plural(previa?.[id]?.ninos || 0, 'niño', 'niños')}</b></li>)}
              </ul>
            </dd></div>
            <div><dt>Vacunas a llevar</dt><dd>
              <ul className="rc-lista">
                {Object.entries(resumen.productos).sort((a, b) => b[1] - a[1]).map(([p, n]) => <li key={p}><span>{nombreProducto(p)}</span><b>{n}</b></li>)}
              </ul>
            </dd></div>
            {f.observaciones && <div><dt>Observaciones</dt><dd>{f.observaciones}</dd></div>}
          </dl>
          <div className="rc-total"><strong>{plural(resumen.ninos, 'niño', 'niños')}</strong> · {Object.values(resumen.productos).reduce((t, n) => t + n, 0)} vacunas a poner</div>
        </Modal>
      )}
    </form>
  );
}

const FILTROS_NINOS = [['todos', 'Todos'], ['falta', 'Faltan'], ['vacunado', 'Vacunados'], ['no_asistio', 'No llegaron']];
const sinTildes = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Hora de inicio o cierre (si fue otro día, también la fecha)
const hora = (t) => {
  const d = new Date(t);
  const h = d.toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Guatemala' });
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' }) === hoy() ? h : `${d.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', timeZone: 'America/Guatemala' })} ${h}`;
};
const duracion = (a, b) => {
  const min = Math.round((new Date(b) - new Date(a)) / 60000);
  if (min >= 24 * 60) return `${Math.floor(min / 1440)} d después`;
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};

export function JornadaDetalle() {
  const { id } = useParams();
  const ir = useNavigate();
  const { usuario, refrescarAlertas } = useSesion();
  const { confirmar, pedirTexto, avisar } = useDialogos();
  const esCelular = useEsCelular();
  const productos = useCatalogo('productos');
  const [j, setJ] = useState(null);
  const [biologicos, setBiologicos] = useState([]);
  const [captura, setCaptura] = useState(null); // { nino, esquema }
  const [pestana, setPestana] = useState('ninos');
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [sinRed, setSinRed] = useState(false);
  const [copia, setCopia] = useState(() => jornadaGuardada(id));
  const [descargando, setDescargando] = useState(false);
  const [equipoAbierto, setEquipoAbierto] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [, setCambioCola] = useState(0);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    api('/jornadas/' + id).then((x) => { setJ(x); setBiologicos(x.biologicos); setSinRed(false); }).catch((e) => {
      // Sin señal: se trabaja con la copia descargada en el teléfono
      const c = jornadaGuardada(id);
      if (e.sinRed && c) { setJ(c.jornada); setBiologicos(c.jornada.biologicos); setSinRed(true); } else setError(e.message);
    });
  }, [id]);
  useEffect(cargar, [cargar]);
  // Lo guardado sin señal se refleja al momento; al enviarse, se vuelve a pedir la jornada
  useEffect(() => {
    const cambio = () => setCambioCola((n) => n + 1);
    window.addEventListener('cola-cambio', cambio);
    window.addEventListener('cola-enviada', cargar);
    return () => { window.removeEventListener('cola-cambio', cambio); window.removeEventListener('cola-enviada', cargar); };
  }, [cargar]);
  // La jornada se guarda sola en el teléfono para trabajar sin señal (al abrirla y cada vez que cambia de etapa)
  const etapaServidor = j?.estado;
  useEffect(() => {
    if (!j || sinRed || !['planificada', 'en_curso'].includes(etapaServidor) || !puede(usuario.rol, 'enfermera', 'vacunador')) return;
    let vivo = true;
    setDescargando(true);
    descargarJornada(id).then((c) => { if (vivo) setCopia(c); }).catch(() => {}).finally(() => { if (vivo) setDescargando(false); });
    return () => { vivo = false; };
  }, [id, etapaServidor, sinRed]); // eslint-disable-line react-hooks/exhaustive-deps
  // Varias personas vacunan a la vez: el avance se actualiza solo mientras la jornada está en curso
  const enCurso = j && j.estado === 'en_curso';
  useEffect(() => {
    if (!enCurso || captura) return undefined;
    const t = setInterval(() => { if (navigator.onLine) cargar(); }, 20000);
    return () => clearInterval(t);
  }, [enCurso, captura, cargar]);

  if (error && !j) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!j) return <Cargando filas={6} />;

  // Lo registrado en este teléfono y aún no enviado cuenta como hecho (también iniciar la jornada sin señal)
  const enCola = cola().filter((o) => o.jornada_id === j.id || o.ruta.startsWith(`/jornadas/${id}/`));
  const etapa = j.estado === 'planificada' && enCola.some((o) => o.tipo === 'iniciar') ? 'en_curso' : j.estado;
  const preparacion = etapa === 'planificada';
  const enCursoAhora = etapa === 'en_curso';
  const abierta = preparacion || enCursoAhora;
  const delPersonal = puede(usuario.rol, 'enfermera', 'vacunador');
  const operativo = enCursoAhora && delPersonal; // vacunar y marcar inasistencias
  const editaPreparacion = preparacion && delPersonal && !sinRed; // vacunas a llevar
  const yaPaso = j.fecha.slice(0, 10) <= hoy();
  const estado = estadoJornada({ ...j, estado: etapa });
  const vacunadoLocal = new Set(enCola.filter((o) => o.tipo === 'aplicacion').map((o) => o.nino_id));
  const faltaLocal = new Set(enCola.filter((o) => o.tipo === 'asistencia').map((o) => o.nino_id));
  const situacion = (n) => (n.aplicadas?.length || vacunadoLocal.has(n.nino_id) ? 'vacunado'
    : n.asistio === false || faltaLocal.has(n.nino_id) ? 'no_asistio' : 'falta');
  const cuenta = (f) => j.ninos.filter((n) => f === 'todos' || situacion(n) === f).length;
  const atendidos = j.ninos.length - cuenta('falta');
  const visibles = j.ninos.filter((n) => (filtro === 'todos' || situacion(n) === filtro)
    && (!buscar || sinTildes(`${n.nombre_completo} ${n.responsable || ''}`).includes(sinTildes(buscar))));
  // Por comunidad, en el orden de la ruta; dentro, los que faltan arriba
  const orden = { falta: 0, no_asistio: 1, vacunado: 2 };
  const grupos = j.comunidades.map((c) => ({
    ...c, ninos: visibles.filter((n) => n.comunidad === c.nombre).sort((a, b) => orden[situacion(a)] - orden[situacion(b)]),
  })).filter((g) => g.ninos.length);

  async function accion(fn, ok) {
    setError('');
    try { const r = await fn(); avisar(ok(r)); cargar(); refrescarAlertas(); } catch (e) { avisar(e.message, 'error'); }
  }
  const abrirCaptura = async (n) => {
    try {
      setCaptura({ nino: n, esquema: await api(`/ninos/${n.nino_id}/esquema?fecha=${j.fecha.slice(0, 10)}`) });
    } catch (e) {
      const guardado = jornadaGuardada(id)?.esquemas?.[n.nino_id];
      if (e.sinRed && guardado) setCaptura({ nino: n, esquema: guardado });
      else avisar(e.sinRed ? 'Sin señal: descargue la jornada antes de salir para poder vacunar sin internet.' : e.message, 'error');
    }
  };
  const tocarNino = (n) => {
    if (operativo && situacion(n) === 'falta') abrirCaptura(n);
    else if (!sinRed) ir(`/ninos/${n.nino_id}`);
  };
  const faltar = async (n) => {
    const motivo = await pedirTexto({
      titulo: 'No llegó a la jornada', mensaje: `${n.nombre_completo} no se presentó.`, opcional: true,
      etiqueta: 'Motivo (opcional)', placeholder: 'No estaba, rechazo, enfermo…', aceptar: 'Registrar',
    });
    if (motivo === null) return;
    const body = { nino_id: n.nino_id, asistio: false, motivo_inasistencia: motivo };
    try {
      await api(`/jornadas/${id}/asistencia`, { method: 'POST', body });
      avisar('Inasistencia registrada.'); cargar();
    } catch (e) {
      if (!e.sinRed) { avisar(e.message, 'error'); return; }
      encolar({ ruta: `/jornadas/${id}/asistencia`, method: 'POST', body, tipo: 'asistencia', jornada_id: j.id, nino_id: n.nino_id,
        descripcion: `${n.nombre_completo} · no llegó` });
      avisar('Sin señal: quedó guardado en el teléfono.');
    }
  };
  async function iniciar() {
    try {
      await api(`/jornadas/${id}/iniciar`, { method: 'POST' });
      avisar('Jornada iniciada: ya puede vacunar.');
      cargar();
    } catch (e) {
      if (!e.sinRed) { avisar(e.message, 'error'); return; }
      encolar({ ruta: `/jornadas/${id}/iniciar`, method: 'POST', body: { hora: new Date().toISOString() }, tipo: 'iniciar', jornada_id: j.id, descripcion: `Iniciar la jornada del ${fecha(j.fecha)}` });
      avisar('Sin señal: la jornada quedó iniciada en este teléfono.');
    }
  }
  const cancelar = async () => {
    if (await confirmar({ titulo: 'Cancelar jornada', mensaje: 'La jornada quedará cancelada y no se podrán registrar dosis en ella.', aceptar: 'Cancelar jornada', peligro: true }))
      accion(() => api(`/jornadas/${id}/cancelar`, { method: 'POST' }), () => 'Jornada cancelada.');
  };
  const cerrar = () => {
    if (enCola.length) { avisar('Primero envíe los registros guardados sin señal en este teléfono.', 'error'); return; }
    setCerrando(true);
  };
  const confirmarCierre = (devueltas) => accion(() => api(`/jornadas/${id}/cerrar`, { method: 'POST', body: { devueltas } }),
    (r) => { setCerrando(false); borrarJornada(id); setCopia(null); return `Jornada cerrada. ${r.inasistencias === 1 ? '1 niño no llegó' : `${r.inasistencias} niños no llegaron`}: pasan al control del mes.`; });
  const marcarLlevada = async (b) => {
    const llevada = !b.llevada;
    setBiologicos((l) => l.map((x) => (x.producto_id === b.producto_id ? { ...x, llevada } : x)));
    try {
      await api(`/jornadas/${id}/biologicos/${b.producto_id}/llevada`, { method: 'PUT', body: { llevada, dosis_llevadas: b.dosis_llevadas } });
      // Queda guardada (con su cantidad si era agregada): ya no cuenta como cambio pendiente
      const guardada = { ...b, llevada, dosis_llevadas: b.dosis_llevadas === '' ? null : Number(b.dosis_llevadas) };
      setBiologicos((l) => l.map((x) => (x.producto_id === b.producto_id ? guardada : x)));
      setJ((x) => ({ ...x, biologicos: x.biologicos.some((y) => y.producto_id === b.producto_id)
        ? x.biologicos.map((y) => (y.producto_id === b.producto_id ? guardada : y)) : [...x.biologicos, guardada] }));
    }
    catch (e) { avisar(e.message, 'error'); setBiologicos(j.biologicos); }
  };
  const listas = biologicos.filter((b) => b.llevada).length;
  // Para iniciar, cada vacuna se marca a conciencia como llevada (sin señal no se exige: no se puede guardar la marca)
  const porMarcar = sinRed ? 0 : biologicos.filter((b) => b.dosis_llevadas > 0 && !b.llevada).length;
  const irAVacunas = () => {
    if (esCelular) setPestana('vacunas');
    setTimeout(() => document.querySelector('.tabla-biologicos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const setBio = (i, k) => (e) => setBiologicos(biologicos.map((b, x) => (x === i ? { ...b, [k]: e.target.value } : b)));
  const agregarVacuna = (productoId) => {
    const p = productos.find((x) => String(x.id) === String(productoId));
    if (p) setBiologicos([...biologicos, { producto_id: p.id, nombre: p.nombre, dosis_estimadas: 0, dosis_llevadas: '', aplicadas: 0, agregada: true }]);
  };
  // En la preparación solo importa qué llevar; ya iniciada, lo aplicado (y al cerrar, lo devuelto)
  const alCierre = !preparacion;
  const sinAgregar = productos.filter((p) => p.activo !== false && !biologicos.some((b) => b.producto_id === p.id));
  const hayCambios = JSON.stringify(biologicos.map((b) => [b.producto_id, String(b.dosis_llevadas ?? '')]))
    !== JSON.stringify(j.biologicos.map((b) => [b.producto_id, String(b.dosis_llevadas ?? '')]));

  const tarjetaBiologicos = (
    <Tarjeta titulo="Vacunas a llevar" icono={Package} cuerpo={false}
      sub={preparacion ? (biologicos.length ? `Cabales, ni una más · ${listas} de ${biologicos.length} listas` : null) : 'Fijas desde que inició la jornada'}
      pie={editaPreparacion && (
        <div className="acciones" style={{ justifyContent: 'space-between' }}>
          {sinAgregar.length > 0 ? (
            <select value="" onChange={(e) => agregarVacuna(e.target.value)} aria-label="Agregar otra vacuna" style={{ maxWidth: 260 }}>
              <option value="">+ Agregar otra vacuna…</option>
              {sinAgregar.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          ) : <span />}
          {hayCambios ? (
            <span className="botones-fila">
              <button className="btn btn-sm" onClick={() => setBiologicos(j.biologicos)}>Deshacer</button>
              <button className="btn btn-sm btn-primario" onClick={() => accion(() => api(`/jornadas/${id}/biologicos`, { method: 'PUT', body: { biologicos } }), () => 'Cambios guardados.')}><Save size={15} />Guardar cambios</button>
            </span>
          ) : <span className="tenue">Sin cambios por guardar</span>}
        </div>
      )}>
      <Tabla className="tabla-biologicos">
        <thead>
          <tr><th>Vacuna</th><th className="celda-num">Llevar</th>{preparacion && <th className="celda-llevada">Llevada</th>}
            {alCierre && <><th className="celda-num">Aplicadas</th><th className="celda-num">Devueltas</th></>}</tr>
        </thead>
        <tbody>
          {biologicos.map((b, i) => (
            <tr key={b.producto_id}>
              <td className="fuerte">{b.nombre}{(b.agregada || !b.dosis_estimadas) && <span className="etiqueta">Agregada</span>}</td>
              {/* Las calculadas van cabales y no se cambian; solo una vacuna agregada a mano lleva cantidad */}
              <td className="celda-num"><strong className="llevar-num">{editaPreparacion && !b.dosis_estimadas
                ? <input type="number" min="0" className="num-input" value={b.dosis_llevadas ?? ''} onChange={setBio(i, 'dosis_llevadas')} aria-label={`${b.nombre} a llevar`} />
                : b.dosis_llevadas ?? '—'}</strong></td>
              {preparacion && (
                <td className="celda-llevada">
                  <button type="button" className={`btn-llevada ${b.llevada ? 'si' : ''}`} disabled={!delPersonal || sinRed || !b.dosis_llevadas}
                    aria-pressed={b.llevada} onClick={() => marcarLlevada(b)}>
                    <Check size={18} />{b.llevada ? 'Llevada' : 'Marcar'}
                  </button>
                </td>
              )}
              {alCierre && (
                <>
                  <td className="celda-num">{b.aplicadas}</td>
                  <td className="celda-num">{b.dosis_devueltas ?? '—'}</td>
                </>
              )}
            </tr>
          ))}
          {biologicos.length === 0 && <tr><td colSpan={alCierre ? 4 : 3} className="tenue">Sin vacunas calculadas.</td></tr>}
        </tbody>
      </Tabla>
    </Tarjeta>
  );

  const tarjetaListado = (
    <Tarjeta titulo="Niños de la jornada" icono={ClipboardList} sub={`${atendidos} de ${plural(j.ninos.length, 'niño', 'niños')} atendidos`} cuerpo={false}
      acciones={operativo && !sinRed && <Link className="btn btn-sm no-imprimir" to="/ninos/nuevo"><UserPlus size={15} />Niño nuevo encontrado</Link>}>
      <div className="jornada-herramientas no-imprimir">
        <div className="con-icono">
          <Search size={18} />
          <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar niño o mamá" aria-label="Buscar niño en la jornada" />
        </div>
        <div className="chips-filtro">
          {FILTROS_NINOS.map(([k, t]) => <button key={k} className={`chip-filtro ${filtro === k ? 'activa' : ''}`} onClick={() => setFiltro(k)}>{t} ({cuenta(k)})</button>)}
        </div>
      </div>
      {j.ninos.length === 0 ? (
        <Vacio icono={ClipboardList} titulo="Nadie tiene dosis pendientes para esa fecha" />
      ) : grupos.length === 0 ? (
        <Vacio icono={Search} titulo="Nadie coincide con la búsqueda o el filtro" />
      ) : grupos.map((g) => (
        <div key={g.id} className="grupo-jornada no-imprimir">
          <div className="grupo-jornada-cab">
            <MapPin size={15} /><strong>{g.nombre}</strong>
            <span className="tenue">{g.ninos.filter((n) => situacion(n) !== 'falta').length} de {g.ninos.length} atendidos</span>
          </div>
          <div className="filas-jornada">
            {g.ninos.map((n) => {
              const s = situacion(n);
              const local = vacunadoLocal.has(n.nino_id) || faltaLocal.has(n.nino_id);
              return (
                <article key={n.nino_id} className={`fila-jornada estado-${s}`} role="button" tabIndex={0} onClick={() => tocarNino(n)}
                  onKeyDown={(e) => { if (e.key === 'Enter') tocarNino(n); }}>
                  <div className="fj-cuerpo">
                    <strong>{n.nombre_completo}</strong>
                    <span>{edad(n.fecha_nacimiento, j.fecha.slice(0, 10))} · {n.dosis_programadas.map((d) => d.etiqueta).join(', ')}</span>
                    <span className="tenue">{n.responsable || 'Sin responsable'}{n.telefono && ` · ${n.telefono}`}{n.numero_casa && ` · casa ${n.numero_casa}`}</span>
                  </div>
                  <div className="fj-accion">
                    {s === 'vacunado' ? <Estado de="al_dia" texto={local ? 'Vacunado · sin enviar' : 'Vacunado'} />
                      : s === 'no_asistio' ? <Estado de="inasistencia" texto={local ? 'No llegó · sin enviar' : 'No llegó'} />
                        : operativo ? (
                          <>
                            <button className="btn btn-sm btn-fantasma" onClick={(e) => { e.stopPropagation(); faltar(n); }}>No llegó</button>
                            <span className="btn btn-sm btn-verde" aria-hidden="true"><Syringe size={14} />Vacunar</span>
                          </>
                        ) : <span className="tenue">Pendiente</span>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </Tarjeta>
  );

  const equipo = j.equipo?.length ? j.equipo.map((u) => u.nombre).join(', ') : j.responsable;
  // Hoja impresa: documento ordenado por comunidad, con casillas para anotar a mano (no es una captura de la pantalla)
  const porComunidadDoc = Object.values(j.ninos.reduce((m, n) => { (m[n.comunidad] ||= { nombre: n.comunidad, ninos: [] }).ninos.push(n); return m; }, {}))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const diaLargo = new Date(`${j.fecha.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cerrada = j.estado === 'cerrada';
  const documento = (
    <Documento titulo="Hoja de jornada" periodo={diaLargo.replace(/^\w/, (x) => x.toUpperCase())} detalle={j.comunidades.map((c) => c.nombre).join(', ')}>
      <p className="doc-nota"><b>Responsable:</b> {j.responsable} · <b>Equipo:</b> {equipo}
        {j.iniciada_en && <> · <b>Inició:</b> {hora(j.iniciada_en)}</>}{j.cerrada_en && <> · <b>Cerró:</b> {hora(j.cerrada_en)}</>}</p>
      <h2 className="doc-seccion">Vacunas</h2>
      <TablaDoc columnas={[
        { titulo: 'Vacuna', valor: 'nombre' },
        { titulo: 'Llevar', valor: (b) => b.dosis_llevadas ?? '—', num: true },
        ...(preparacion ? [{ titulo: 'Llevada', valor: () => '☐', num: true }]
          : [{ titulo: 'Aplicadas', valor: 'aplicadas', num: true }, ...(cerrada ? [{ titulo: 'Devueltas', valor: (b) => b.dosis_devueltas ?? '—', num: true }] : [])]),
      ]} filas={j.biologicos} />
      <h2 className="doc-seccion">Niños · {j.ninos.length}{!preparacion && ` (${cuenta('vacunado')} vacunados, ${cuenta('no_asistio')} no llegaron)`}</h2>
      {porComunidadDoc.map((g) => (
        <section key={g.nombre}>
          <h3 className="doc-subseccion">{g.nombre} · {g.ninos.length}</h3>
          <TablaDoc columnas={[
            { titulo: 'Niña o niño', valor: (n) => <><strong>{n.nombre_completo}</strong><br />{edad(n.fecha_nacimiento, j.fecha.slice(0, 10))} · {cuadernoFila(n)}</>, ancho: '27%' },
            { titulo: 'Mamá o responsable', valor: (n) => <>{n.responsable || '—'}<br />{n.telefono || ''}{n.numero_casa && ` · casa ${n.numero_casa}`}</>, ancho: '24%' },
            { titulo: 'Le toca', valor: (n) => n.dosis_programadas.map((d) => d.etiqueta).join(', ') },
            { titulo: 'Resultado', ancho: '20%', valor: (n) => {
              const st = situacion(n);
              if (st === 'vacunado') return <>✓ Vacunado{n.aplicadas?.length ? <><br />{n.aplicadas.map((a) => a.producto).join(', ')}</> : null}</>;
              if (st === 'no_asistio') return 'No llegó';
              return '☐ Vacunado   ☐ No llegó';
            } },
          ]} filas={g.ninos} />
        </section>
      ))}
    </Documento>
  );
  return (
    <div className="con-documento">
      {documento}
      <div className="no-imprimir">
        <Encabezado titulo={`Jornada del ${fecha(j.fecha)}`} migas={[['Jornadas', '/jornadas'], [fecha(j.fecha)]]}
          descripcion={`${j.comunidades.map((c) => c.nombre).join(' → ')} · Equipo: ${equipo}`}>
          <Estado de={estado} grande />
          <button className="btn" onClick={() => window.print()}><Printer size={16} />Imprimir hoja</button>
          {abierta && puede(usuario.rol, 'enfermera') && !sinRed && <button className="btn" onClick={() => setEquipoAbierto(true)}><Users size={16} />Equipo</button>}
          {preparacion && puede(usuario.rol, 'enfermera') && !sinRed && <button className="btn btn-peligro" onClick={cancelar}><XCircle size={16} />Cancelar</button>}
          {abierta && puede(usuario.rol, 'enfermera') && !sinRed && (enCursoAhora || estado === 'por_cerrar') && (
            <button className="btn btn-primario" onClick={cerrar}><Lock size={16} />Cerrar jornada</button>
          )}
        </Encabezado>
      </div>

      {sinRed && <Mensaje tipo="aviso" className="no-imprimir">Sin señal: está trabajando con la copia guardada en este teléfono ({copia && `descargada el ${new Date(copia.descargada).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}`}). Lo que registre se enviará al volver la conexión.</Mensaje>}
      {preparacion && delPersonal && (
        <div className={`etapa-jornada no-imprimir ${yaPaso ? 'lista' : ''}`}>
          <span className="ic"><PlayCircle size={24} /></span>
          <span className="texto">
            <strong>{yaPaso ? (porMarcar ? 'Antes de salir, marque cada vacuna que lleva' : 'Inicie la jornada para comenzar a vacunar') : `Preparación · se inicia el ${fecha(j.fecha)}`}</strong>
            <span>{yaPaso
              ? 'Al iniciarla, las vacunas llevadas quedan fijas y se habilita vacunar y marcar a los que no llegan.'
              : 'Revise las vacunas a llevar y el equipo. El día de la jornada aparecerá aquí el botón para iniciarla.'}</span>
          </span>
          {yaPaso && (porMarcar > 0
            ? <button className="btn btn-grande" onClick={irAVacunas}><Package size={20} />Marque las vacunas que lleva · faltan {porMarcar}</button>
            : <button className="btn btn-verde btn-grande" onClick={iniciar}><PlayCircle size={20} />Iniciar jornada</button>)}
        </div>
      )}
      {estado === 'por_cerrar' && puede(usuario.rol, 'enfermera') && (
        <Mensaje tipo="aviso" className="no-imprimir">La fecha de esta jornada ya pasó. Anote lo que falte y ciérrela: quienes no llegaron pasarán al control del mes.</Mensaje>
      )}

      <div className="avance-jornada no-imprimir">
        {abierta && delPersonal && (
          <span className={`sin-internet ${copia ? 'si' : ''}`} title="La jornada se guarda sola en este teléfono para poder trabajar sin señal">
            {copia ? <><Check size={14} />Disponible sin internet</> : descargando ? 'Guardando para usar sin internet…' : 'Se guardará para usar sin internet'}
          </span>
        )}
        {j.iniciada_en && (
          <span className="horas-jornada">
            <span><PlayCircle size={15} />Inició {hora(j.iniciada_en)}{j.iniciada_por_nombre ? ` · ${j.iniciada_por_nombre.split(' ')[0]}` : ''}</span>
            {j.cerrada_en && <span><Lock size={15} />Cerró {hora(j.cerrada_en)}{j.cerrada_por_nombre ? ` · ${j.cerrada_por_nombre.split(' ')[0]}` : ''}</span>}
            {j.cerrada_en && <span className="tenue">{duracion(j.iniciada_en, j.cerrada_en)}</span>}
          </span>
        )}
        <div className="texto"><strong>{atendidos} de {j.ninos.length} niños atendidos · cumplimiento {pctCumplimiento(cuenta('vacunado'), j.ninos.length) ?? 0} %</strong>
          <span>{cuenta('vacunado')} vacunados · {cuenta('no_asistio')} no llegaron · {cuenta('falta')} faltan{j.resumen.no_convocados_vacunados ? ` · ${j.resumen.no_convocados_vacunados} vacunados sin estar en la lista` : ''}</span></div>
        <div className="pista"><span className="lleno" style={{ width: `${j.ninos.length ? (atendidos / j.ninos.length) * 100 : 0}%` }} /></div>
      </div>

      {esCelular ? (
        <>
          <Pestanas valor={pestana} onCambio={setPestana}
            opciones={[['ninos', <><Users size={15} />Niños ({j.ninos.length})</>], ['vacunas', <><Package size={15} />Vacunas a llevar</>]]} />
          {pestana === 'ninos' ? tarjetaListado : tarjetaBiologicos}
        </>
      ) : (
        <>
          {tarjetaBiologicos}
          {tarjetaListado}
        </>
      )}

      {captura && (
        <Vacunar ninoId={captura.nino.nino_id} nombre={captura.nino.nombre_completo} esquema={captura.esquema} jornadaId={j.id} fechaDefecto={j.fecha.slice(0, 10)}
          onCerrar={() => setCaptura(null)}
          onTerminado={(r) => { setCaptura(null); if (r.hechas.length && !r.sinConexion) avisar(`${captura.nino.nombre_completo}: ${r.hechas.map((h) => h.nombre).join(', ')}.`); cargar(); refrescarAlertas(); }} />
      )}
      {cerrando && <CerrarJornada biologicos={j.biologicos} faltan={cuenta('falta')} onCerrar={() => setCerrando(false)} onConfirmar={confirmarCierre} />}
      {equipoAbierto && <EditarEquipo jornada={j} onCerrar={() => setEquipoAbierto(false)} onGuardado={() => { setEquipoAbierto(false); cargar(); }} />}
    </div>
  );
}

/** Cerrar: se anotan las vacunas devueltas; quienes no recibieron dosis pasan al control del mes. */
function CerrarJornada({ biologicos, faltan, onCerrar, onConfirmar }) {
  const [devueltas, setDevueltas] = useState(() => Object.fromEntries(biologicos.map((b) => [b.producto_id,
    b.dosis_devueltas ?? (b.dosis_llevadas != null ? Math.max(0, b.dosis_llevadas - b.aplicadas) : '')])));
  return (
    <Modal titulo="Cerrar jornada" onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Volver</button>
        <button className="btn btn-primario" onClick={() => onConfirmar(biologicos.map((b) => ({ producto_id: b.producto_id, dosis_devueltas: devueltas[b.producto_id] })))}>
          <Lock size={16} />Cerrar jornada</button></>}>
      <Tabla adaptable={false}>
        <thead><tr><th>Vacuna</th><th className="celda-num">Llevadas</th><th className="celda-num">Aplicadas</th><th className="celda-num">Devueltas</th></tr></thead>
        <tbody>
          {biologicos.map((b) => (
            <tr key={b.producto_id}>
              <td className="fuerte">{b.nombre}</td>
              <td className="celda-num">{b.dosis_llevadas ?? '—'}</td>
              <td className="celda-num">{b.aplicadas}</td>
              <td className="celda-num"><input type="number" min="0" className="num-input" value={devueltas[b.producto_id] ?? ''}
                onChange={(e) => setDevueltas({ ...devueltas, [b.producto_id]: e.target.value })} aria-label={`${b.nombre} devueltas`} /></td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      {faltan > 0 && <Mensaje tipo="aviso" className="mt">{faltan === 1 ? '1 niño no fue atendido' : `${faltan} niños no fueron atendidos`}: quedarán como «no llegó» y pasarán al control del mes para darles seguimiento.</Mensaje>}
    </Modal>
  );
}

/** La enfermera elige quién sale a la jornada: solo ese equipo la verá y podrá registrar en ella. */
function EditarEquipo({ jornada, onCerrar, onGuardado }) {
  const { avisar } = useDialogos();
  const [personal, setPersonal] = useState([]);
  const [responsable, setResponsable] = useState(String(jornada.responsable_id || ''));
  const [equipo, setEquipo] = useState(() => new Set((jornada.equipo || []).map((u) => u.id)));
  useEffect(() => { api('/casos/personal').then(setPersonal).catch(() => {}); }, []);
  const alternar = (uid) => setEquipo((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
  async function guardar() {
    try {
      await api(`/jornadas/${jornada.id}/equipo`, { method: 'PUT', body: { responsable_id: Number(responsable), equipo_ids: [...equipo] } });
      avisar('Equipo actualizado.');
      onGuardado();
    } catch (e) { avisar(e.message, 'error'); }
  }
  return (
    <Modal titulo="Equipo de la jornada" onCerrar={onCerrar} chico
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn btn-primario" onClick={guardar}>Guardar</button></>}>
      <Campo etiqueta="Responsable">
        <select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          {personal.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </Campo>
      <p className="caso-pregunta">También salen</p>
      <div className="casillas">
        {personal.filter((p) => String(p.id) !== responsable).map((p) => (
          <label key={p.id} className={`casilla ${equipo.has(p.id) ? 'marcada' : ''}`}>
            <input type="checkbox" checked={equipo.has(p.id)} onChange={() => alternar(p.id)} />
            <span className="casilla-texto"><span className="casilla-nombre">{p.nombre}</span><span className="sub">{p.cargo}</span></span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
