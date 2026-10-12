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
  ['quince', 'Próximas 2 semanas', () => sumar(hoy(), 14)],
  ['mes', 'Este mes', finDeMes],
];

export default function Buscar() {
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'citas' ? 'citas' : 'buscar';
  const cambiarVista = (v) => setParams(v === 'citas' ? { vista: 'citas' } : {}, { replace: true });
  const { usuario } = useSesion();

  return (
    <>
      <Encabezado titulo={vista === 'citas' ? 'Próximas citas' : 'Buscar niña o niño'}
        descripcion={vista === 'citas' ? 'Niños que deben venir a vacunarse en estos días.' : 'Escriba el nombre del niño o de la mamá, el CUI o el número de carné.'}>
        {puede(usuario.rol, 'enfermera', 'vacunador') && (
          <Link className="btn btn-verde" to="/ninos/nuevo"><UserPlus size={18} />Registrar niño nuevo</Link>
        )}
      </Encabezado>
      <Pestanas valor={vista} onCambio={cambiarVista} opciones={[['buscar', <><Search size={15} />Buscar</>], ['citas', <><CalendarDays size={15} />Próximas citas</>]]} />
      {vista === 'buscar' ? <BuscarNino params={params} setParams={setParams} /> : <Citas />}
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
        <input type="search" placeholder="Ej. María López o 3012345670101" value={q} onChange={(e) => setQ(e.target.value)} autoFocus
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
      {resultados === null ? (
        vistos.length > 0 ? (
          <>
            <div className="seccion-titulo" style={{ marginTop: 0 }}><History size={14} />Vistos recientemente en este equipo</div>
            <div className="lista-tarjetas">
              {vistos.map((n) => (
                <Link key={n.id} to={`/ninos/${n.id}`} className="tarjeta-nino">
                  <span className={`tc-avatar ${n.sexo === 'M' ? 'mujer' : ''}`}>{iniciales(n.nombre_completo)}</span>
                  <div className="cuerpo"><strong>{n.nombre_completo}</strong><span>{edad(n.fecha_nacimiento)} · {n.comunidad}</span></div>
                  <div className="derecha"><ChevronRight size={20} style={{ color: 'var(--tenue)' }} /></div>
                </Link>
              ))}
            </div>
            <p className="tenue" style={{ marginTop: '1rem' }}>No importa si escribe sin tildes o con algún error: el sistema lo encuentra igual.</p>
          </>
        ) : (
          <div className="tarjeta">
            <Vacio icono={Search} titulo="Escriba para buscar">
              No importa si escribe sin tildes o con algún error: el sistema lo encuentra igual.
            </Vacio>
          </div>
        )
      ) : buscando && !resultados.length ? <Cargando /> : resultados.length === 0 ? (
        <div className="tarjeta">
          <Vacio icono={SearchX} titulo="No se encontró a nadie con ese nombre"
            accion={operativo && <Link className="btn btn-verde btn-grande" to="/ninos/nuevo"><UserPlus size={20} />Registrar niño nuevo</Link>}>
            Pruebe con el nombre de la mamá o con el CUI. Si es la primera vez que viene, regístrelo.
          </Vacio>
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

function Citas() {
  const [rango, setRango] = useState('semana');
  const [comunidad, setComunidad] = useState('');
  const [citas, setCitas] = useState(null);
  const [error, setError] = useState('');
  const comunidades = useCatalogo('comunidades');

  useEffect(() => {
    setCitas(null);
    const hasta = RANGOS.find((r) => r[0] === rango)[2]();
    api('/ninos/citas' + qs({ desde: hoy(), hasta, comunidad })).then(setCitas).catch((e) => setError(e.message));
  }, [rango, comunidad]);

  const porDia = (citas || []).reduce((m, c) => { (m[c.proxima_cita] = m[c.proxima_cita] || []).push(c); return m; }, {});

  return (
    <>
      <div className="chips-filtro">
        {RANGOS.map(([k, t]) => <button key={k} className={`chip-filtro ${rango === k ? 'activa' : ''}`} onClick={() => setRango(k)}>{t}</button>)}
      </div>
      <div className="filtros">
        <Campo etiqueta="Comunidad">
          <select value={comunidad} onChange={(e) => setComunidad(e.target.value)}>
            <option value="">Todas las comunidades</option>
            {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      </div>
      <Mensaje tipo="error">{error}</Mensaje>
      {citas === null ? <Cargando /> : citas.length === 0 ? (
        <div className="tarjeta"><Vacio icono={CalendarDays} titulo="No hay citas en estos días">Elija otro rango de fechas.</Vacio></div>
      ) : (
        Object.entries(porDia).map(([dia, lista]) => (
          <div key={dia} style={{ marginBottom: '1.25rem' }}>
            <div className="seccion-titulo" style={{ marginTop: 0 }}>
              {dia === hoy() ? 'Hoy' : new Date(dia + 'T12:00:00').toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' })}
              <span className="chip">{plural(lista.length, 'niño', 'niños')}</span>
            </div>
            <div className="lista-tarjetas">
              {lista.map((c) => (
                <div key={c.id} className="tarjeta-nino">
                  <Link to={`/ninos/${c.id}`} className="cuerpo" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <strong>{c.nombre_completo}</strong>
                    <span>{edad(c.fecha_nacimiento)} · {c.comunidad} · {c.vacunas.join(', ')}</span>
                    <span style={{ display: 'block' }}>{c.responsable || 'Sin responsable'}{c.cuaderno_numero ? ` · ${cuadernoFila(c)}` : ''}</span>
                  </Link>
                  <div className="derecha">
                    {c.telefono ? <a className="tc-llamar" href={`tel:${c.telefono}`}><Phone size={15} />Llamar</a> : <span className="tc-sin-tel">Sin teléfono</span>}
                    {c.atrasada ? <Estado de="atrasado" texto="Ya atrasado" /> : <span className="tenue">{fecha(c.proxima_cita)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
