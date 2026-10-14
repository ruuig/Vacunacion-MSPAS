import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronRight, History, Phone, Search, SearchX, UserPlus } from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Cargando, Encabezado, Mensaje, Pestanas, Vacio, iniciales } from '../componentes/ui.jsx';
import { Estado, plural } from '../componentes/Estado.jsx';
import { ESTADO_REGISTRO, cuadernoFila, edad, fecha, hoy, puede, recientes, sumarDias } from '../util.js';

const sumar = sumarDias;
const finDeMes = () => { const [a, m] = hoy().split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const finDeSemana = () => sumar(hoy(), (7 - new Date(`${hoy()}T12:00:00Z`).getUTCDay()) % 7 || 7);
const RANGOS = [
  ['hoy', 'Hoy', () => hoy()],
  ['semana', 'Esta semana', finDeSemana],
  ['mes', 'Este mes', finDeMes],
];

/** Sin búsqueda: a quién le toca vacuna (hoy incluye a los atrasados), para llegar directo a su ficha. */
function LesToca({ comunidad }) {
  const [rango, setRango] = useState('hoy');
  const [lista, setLista] = useState(null);
  useEffect(() => {
    setLista(null);
    const hasta = RANGOS.find((r) => r[0] === rango)[2]();
    api('/ninos/citas' + qs({ hasta, comunidad })).then(setLista).catch(() => setLista([]));
  }, [rango, comunidad]);
  return (
    <section style={{ marginBottom: '1.25rem' }}>
      <div className="les-toca-cab">
        <div className="seccion-titulo" style={{ margin: 0 }}><CalendarDays size={14} />Les toca vacuna</div>
        <div className="segmentado" role="group" aria-label="Cuándo">
          {RANGOS.map(([k, t]) => <button key={k} type="button" className={rango === k ? 'activa' : ''} onClick={() => setRango(k)}>{t}</button>)}
        </div>
      </div>
      {lista === null ? <Cargando filas={3} /> : lista.length === 0 ? (
        <div className="tarjeta"><Vacio icono={CalendarDays} titulo="A nadie le toca en estos días" /></div>
      ) : (
        <div className="lista-tarjetas">
          {lista.map((n) => (
            <Link key={n.id} to={`/ninos/${n.id}`} className="tarjeta-nino">
              <span className={`tc-avatar ${n.atrasada ? 't-critico' : ''}`}>{iniciales(n.nombre_completo)}</span>
              <div className="cuerpo">
                <strong>{n.nombre_completo}</strong>
                <span>{edad(n.fecha_nacimiento)} · {n.comunidad}{n.responsable ? ` · ${n.responsable}` : ''}</span>
                <span className="fichas-hoy">{n.vacunas.map((v) => <span key={v} className={`ficha-vacuna ${n.atrasada ? 'atrasada' : 'le_toca'}`}>{v}</span>)}</span>
              </div>
              <div className="derecha">
                <span className={n.atrasada ? 'rojo fuerte' : 'tenue'}>{n.atrasada ? 'Atrasado' : n.proxima_cita === hoy() ? 'Hoy' : fecha(n.proxima_cita).slice(0, 5)}</span>
                <ChevronRight size={20} style={{ color: 'var(--tenue)' }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Buscar() {
  const [params, setParams] = useSearchParams();
  const { usuario } = useSesion();
  return (
    <>
      <Encabezado titulo="Niños">
        {puede(usuario.rol, 'enfermera', 'vacunador') && (
          <Link className="btn btn-verde" to="/ninos/nuevo"><UserPlus size={18} />Niño nuevo</Link>
        )}
      </Encabezado>
      <BuscarNino params={params} setParams={setParams} />
    </>
  );
}

function BuscarNino({ params, setParams }) {
  const { usuario } = useSesion();
  const [q, setQ] = useState(params.get('q') || '');
  const [comunidad, setComunidad] = useState(params.get('comunidad') || '');
  const [estado, setEstado] = useState(params.get('estado') || '');
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const comunidades = useCatalogo('comunidades');
  const operativo = puede(usuario.rol, 'enfermera', 'vacunador');
  const [vistos] = useState(recientes);

  useEffect(() => {
    const t = setTimeout(() => {
      setParams({ ...(q && { q }), ...(comunidad && { comunidad }), ...(estado && { estado }) }, { replace: true });
      if (!q && !comunidad) { setResultados(null); return; }
      setBuscando(true);
      setError('');
      api('/ninos' + qs({ q, comunidad, estado }))
        .then(setResultados).catch((e) => setError(e.message)).finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, comunidad, estado, setParams]);

  return (
    <>
      <div className="con-icono busqueda-grande" style={{ marginBottom: '.9rem' }}>
        <Search size={22} />
        <input type="search" placeholder="Nombre del niño o de la mamá, o CUI" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          aria-label="Buscar por nombre, CUI o carné" style={{ fontSize: '1.05rem', minHeight: 56 }} />
      </div>
      <div className="filtros">
        <Campo etiqueta="Comunidad">
          <select value={comunidad} onChange={(e) => setComunidad(e.target.value)}>
            <option value="">Todas las comunidades</option>
            {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Estado del registro">
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ESTADO_REGISTRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
      </div>

      <Mensaje tipo="error">{error}</Mensaje>
      {resultados === null ? (<>
        <LesToca comunidad={comunidad} />
        {vistos.length > 0 && (
          <>
            <div className="seccion-titulo" style={{ marginTop: 0 }}><History size={14} />Vistos hace poco</div>
            <div className="lista-tarjetas">
              {vistos.map((n) => (
                <Link key={n.id} to={`/ninos/${n.id}`} className="tarjeta-nino">
                  <span className={`tc-avatar ${n.sexo === 'M' ? 'mujer' : ''}`}>{iniciales(n.nombre_completo)}</span>
                  <div className="cuerpo"><strong>{n.nombre_completo}</strong><span>{edad(n.fecha_nacimiento)} · {n.comunidad}</span></div>
                  <div className="derecha"><ChevronRight size={20} style={{ color: 'var(--tenue)' }} /></div>
                </Link>
              ))}
            </div>
          </>
        )}
      </>) : buscando && !resultados.length ? <Cargando /> : resultados.length === 0 ? (
        <div className="tarjeta">
          <Vacio icono={SearchX} titulo={`Nadie se llama «${q}»`}
            accion={operativo && <Link className="btn btn-verde btn-grande" to="/ninos/nuevo"><UserPlus size={20} />Registrarlo como niño nuevo</Link>} />
        </div>
      ) : (
        <>
          <p className="tenue" style={{ marginBottom: '.6rem' }}>{resultados.length === 50 ? 'Se muestran los primeros 50' : plural(resultados.length, 'resultado', 'resultados')}</p>
          <div className="lista-tarjetas">
            {resultados.map((n) => (
              <Link key={n.id} to={`/ninos/${n.id}`} className="tarjeta-nino">
                <span className="tc-avatar">{iniciales(n.nombre_completo)}</span>
                <div className="cuerpo">
                  <strong>{n.nombre_completo}</strong>
                  <span>{edad(n.fecha_nacimiento)} · {n.comunidad}{n.responsable ? ` · Mamá o responsable: ${n.responsable}` : ''}</span>
                  <span style={{ display: 'block' }}>{cuadernoFila(n)}{n.cui ? ` · CUI ${n.cui}` : ''}</span>
                </div>
                <div className="derecha">
                  {n.estado !== 'activo' && <Estado de={n.estado} />}
                  <ChevronRight size={20} style={{ color: 'var(--tenue)' }} />
                </div>
              </Link>
            ))}
          </div>
          {operativo && (
            <p className="tenue" style={{ marginTop: '1rem', textAlign: 'center' }}>
              ¿No está en la lista? <Link to="/ninos/nuevo"><UserPlus size={14} style={{ verticalAlign: '-2px' }} /> Registrar niño nuevo</Link>
            </p>
          )}
        </>
      )}
    </>
  );
}
