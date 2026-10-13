import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Bell, CalendarDays, ChevronRight, FileText, LayoutDashboard, Lock, Package, MapPinned, Phone, Search, Settings, Syringe, Truck, UserPlus,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { Mensaje, Tarjeta, Vacio } from '../componentes/ui.jsx';
import { Cuenta, Estado, NIVELES, nivelComunidad, plural, puntaje } from '../componentes/Estado.jsx';
import { edad, fecha, hoy, puede, sumarDias } from '../util.js';

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
}

const finDeSemana = () => sumarDias(hoy(), (7 - new Date(`${hoy()}T12:00:00Z`).getUTCDay()) % 7 || 7);

function Mosaico({ to, icono: Ic, titulo, texto, color = '', contador, contadorNeutro = false, className = '' }) {
  return (
    <Link to={to} className={`mosaico ${color} ${className}`}>
      <span className="ic"><Ic size={26} /></span>
      {contador > 0 && <b className={`contador-mosaico ${contadorNeutro ? 'neutro' : ''}`}>{contador > 99 ? '99+' : contador}</b>}
      <div><strong>{titulo}</strong><span>{texto}</span></div>
    </Link>
  );
}

/** Flecha y diferencia contra el mes anterior: ▼ es buena noticia cuando se cuentan problemas. */
const tendencia = (actual, anterior) => {
  if (anterior == null || actual == null) return null;
  const d = actual - anterior;
  return `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)} contra el mes pasado`;
};

export default function Inicio() {
  const { usuario, pendientes, refrescarAlertas } = useSesion();
  const ir = useNavigate();
  const [comunidades, setComunidades] = useState(null);
  const [jornadas, setJornadas] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [misCasos, setMisCasos] = useState(null);
  const [citas, setCitas] = useState(null);
  const [buscar, setBuscar] = useState('');
  const operativo = puede(usuario.rol, 'enfermera', 'vacunador');
  const gestion = puede(usuario.rol, 'enfermera', 'encargado');

  useEffect(refrescarAlertas, [refrescarAlertas]);
  useEffect(() => {
    api('/comunidades/tablero').then(setComunidades).catch(() => setComunidades([]));
    api('/jornadas').then(setJornadas).catch(() => setJornadas([]));
    if (gestion) api('/tablero/resumen').then(setResumen).catch(() => {});
    if (operativo) api('/ninos/citas' + qs({ desde: hoy(), hasta: finDeSemana() })).then(setCitas).catch(() => setCitas([]));
    if (usuario.rol === 'vacunador') api('/casos?asignado=yo').then(setMisCasos).catch(() => setMisCasos([]));
  }, [gestion, operativo, usuario.rol]);

  const hoyLargo = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  const ordenadas = (comunidades || []).filter((c) => puntaje(c) > 0).sort((a, b) => puntaje(b) - puntaje(a));
  const maximo = ordenadas.length ? puntaje(ordenadas[0]) : 0;
  const prioritarias = ordenadas.slice(0, 5);
  const planificadas = (jornadas || []).filter((j) => ['planificada', 'en_curso'].includes(j.estado));
  const proximas = planificadas.filter((j) => j.fecha.slice(0, 10) >= hoy()).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 3);
  const porCerrar = planificadas.filter((j) => j.fecha.slice(0, 10) < hoy());
  const jornadaHoy = proximas.find((j) => j.fecha.slice(0, 10) === hoy());
  // Citas por fecha programada; los atrasados ya están en "Llamar o visitar"
  const citasSemana = (citas || []).filter((c) => !c.atrasada).length;
  const k = resumen?.kpis;
  const ritmo = resumen?.ideal_al_mes ?? 0;

  function enviarBusqueda(e) {
    e.preventDefault();
    ir('/ninos' + (buscar.trim() ? qs({ q: buscar.trim() }) : ''));
  }

  return (
    <>
      <section className="heroe heroe-inicio">
        <div className="fecha-hoy">{hoyLargo}</div>
        <h1 style={{ marginTop: '.35rem' }}>{saludo()}, {usuario.nombre.split(' ')[0]}</h1>
        {operativo ? (
          <form className="heroe-buscar" onSubmit={enviarBusqueda} role="search">
            <Search size={20} />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o CUI"
              aria-label="Buscar niño" />
            <button className="btn btn-blanco">Buscar</button>
          </form>
        ) : <p>¿Qué quiere hacer?</p>}
      </section>

      {puede(usuario.rol, 'enfermera') && porCerrar.length > 0 && (
        <Mensaje tipo="aviso">
          <strong>{porCerrar.length === 1 ? 'Tiene 1 jornada por cerrar' : `Tiene ${porCerrar.length} jornadas por cerrar`}:</strong>{' '}
          {porCerrar.map((j, i) => (
            <span key={j.id}>{i > 0 && ', '}<Link to={`/jornadas/${j.id}`}>{fecha(j.fecha)} · {j.comunidades}</Link></span>
          ))}
        </Mensaje>
      )}

      {jornadaHoy && (
        <Link to={`/jornadas/${jornadaHoy.id}`} className="aviso-jornada">
          <span className="ic"><Truck size={22} /></span>
          <span className="texto"><strong>Hoy hay jornada en {jornadaHoy.comunidades}</strong>
            <span>{plural(jornadaHoy.convocados, 'niño convocado', 'niños convocados')}</span></span>
          <ArrowRight size={20} />
        </Link>
      )}

      <div className="mosaicos">
        {operativo && <Mosaico to="/ninos" icono={Syringe} titulo="Vacunar" texto="Buscar al niño" color="destacado" />}
        {operativo && <Mosaico to="/ninos/nuevo" icono={UserPlus} titulo="Niño nuevo" texto="Primera vez que viene" color="verde" />}
        {operativo && (
          <Mosaico to={pendientes.mios ? '/alertas?asignado=yo' : '/alertas'} icono={Phone} titulo="Niños a buscar"
            texto={pendientes.mios ? (usuario.sector ? 'En su sector' : 'Los que le asignaron') : 'Llamar o visitar'}
            color="rojo" contador={pendientes.mios || pendientes.total} />
        )}
        {operativo && (
          <Mosaico to="/alertas?periodo=semana&tipo=por_venir" icono={CalendarDays} titulo="Vienen esta semana" color="ambar" contador={citasSemana} contadorNeutro
            texto={citas !== null && !citasSemana ? 'Nadie tiene cita' : 'Citas de estos días'} />
        )}
        {!operativo && gestion && <Mosaico to="/tablero" icono={LayoutDashboard} titulo="Tablero" texto="Cómo vamos" color="destacado" />}
        {!operativo && <Mosaico to="/ninos" icono={Search} titulo="Buscar niño" texto="Fichas e historial" />}
        {!operativo && gestion && <Mosaico to="/informes" icono={FileText} titulo="Informes" texto="Informe mensual SIGSA" />}
        {!operativo && gestion && <Mosaico to="/vacunas?vista=pedido" icono={Package} titulo="Pedido de vacunas" texto="Quiénes se vacunan cada mes" color="verde" />}
        {usuario.rol === 'administrador' && <Mosaico to="/admin" icono={Settings} titulo="Administración" texto="Usuarios y respaldos" />}
      </div>

      {usuario.rol === 'vacunador' && misCasos && misCasos.length > 0 && (
        <Tarjeta titulo="Sus niños a buscar" icono={Phone} cuerpo={false}
          pie={<Link to="/alertas?asignado=yo" className="btn btn-sm btn-fantasma">Ver todos ({misCasos.length}) <ArrowRight size={15} /></Link>}>
          <div className="lista-tarjetas" style={{ padding: '1rem' }}>
            {misCasos.slice(0, 4).map((c) => (
              <Link key={c.nino_id} to={`/alertas?nino=${c.nino_id}&asignado=yo`} className="tarjeta-nino">
                <div className="cuerpo"><strong>{c.nombre_completo}</strong><span>{edad(c.fecha_nacimiento)} · {c.comunidad}</span></div>
                <div className="derecha"><Estado de={c.peor} />{c.dias_atraso > 0 && <span className="tenue">{c.dias_atraso} días</span>}</div>
              </Link>
            ))}
          </div>
        </Tarjeta>
      )}

      {gestion && k && (
        <>
          <div className="seccion-titulo">Este año</div>
          <div className="kpis">
            <Link to="/tablero" className={`kpi activo ${resumen.avance?.p3 >= ritmo ? 'verde' : resumen.avance?.p3 >= ritmo * 0.75 ? 'ambar' : 'rojo'}`}>
              <span>Niños con sus 3 dosis</span>
              <strong>{resumen.avance?.p3 ?? '—'}{resumen.avance?.p3 != null && ' %'}</strong>
              <em className="kpi-pie" style={{ fontStyle: 'normal' }}>Deberíamos ir en {ritmo} %</em>
            </Link>
            <Link to="/alertas?tipo=dosis_cero" className="kpi rojo activo">
              <span>Dosis cero</span>
              <strong>{k.N1.valor}</strong>
              <em className="kpi-pie" style={{ fontStyle: 'normal' }}>{tendencia(k.N1.valor, k.N1.anterior) || 'Ver quiénes'} <ChevronRight size={13} /></em>
            </Link>
            <Link to="/alertas" className="kpi ambar activo">
              <span>Niños a buscar</span>
              <strong>{k.por_contactar.valor}</strong>
              <em className="kpi-pie" style={{ fontStyle: 'normal' }}>Ver quiénes <ChevronRight size={13} /></em>
            </Link>
            <div className="kpi verde">
              <span>Al día con sus vacunas</span>
              <strong>{k.N2.valor ?? '—'} %</strong>
              <em className="kpi-pie" style={{ fontStyle: 'normal' }}>{k.N2.numerador} de {k.N2.denominador}</em>
            </div>
          </div>
        </>
      )}

      <div className="dos-col">
        <Tarjeta titulo="Dónde hay más niños a buscar" icono={MapPinned} cuerpo={false}
          pie={<Link to="/comunidades" className="btn btn-sm btn-fantasma">Ver todas <ArrowRight size={15} /></Link>}>
          {comunidades === null ? <div className="tarjeta-cuerpo"><div className="esqueleto" /></div> : prioritarias.length === 0 ? (
            <Vacio icono={MapPinned} titulo="Todas las comunidades al día" />
          ) : (
            <div className="ranking">
              <div className="ranking-cab"><span>#</span><span>Comunidad</span><span>Dosis cero</span><span><b className="solo-pc">Abandono</b><b className="solo-cel">Aban&shy;dono</b></span><span><b className="solo-pc">Atrasados</b><b className="solo-cel">Atra&shy;sados</b></span><span /></div>
              {prioritarias.map((c, i) => {
                const nivel = nivelComunidad(c, maximo);
                return (
                  <Link key={c.id} to={`/alertas?comunidad=${c.id}`} className={`ranking-fila t-${NIVELES[nivel][1]}`}>
                    <span className="posicion">{i + 1}</span>
                    <span className="nombre">
                      <strong>{c.nombre}</strong>
                      <span>{plural(c.activos, 'niño activo', 'niños activos')}</span>
                      <b className={`nivel t-${NIVELES[nivel][1]}`}>{NIVELES[nivel][0]}</b>
                    </span>
                    <Cuenta n={c.dosis_cero} tono="critico" />
                    <Cuenta n={c.abandono} tono="critico" />
                    <Cuenta n={c.atrasados} tono="atencion" />
                    <ChevronRight size={18} className="flecha" />
                  </Link>
                );
              })}
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Próximas jornadas" icono={Truck} cuerpo={false}
          pie={<Link to="/jornadas" className="btn btn-sm btn-fantasma">Ver todas <ArrowRight size={15} /></Link>}>
          {jornadas === null ? <div className="tarjeta-cuerpo"><div className="esqueleto" /></div> : proximas.length === 0 ? (
            <div className="vacio-linea">
              <span>No hay jornadas planificadas.</span>
              {puede(usuario.rol, 'enfermera') && <Link className="btn btn-sm btn-primario" to="/jornadas/nueva"><Truck size={15} />Planificar jornada</Link>}
            </div>
          ) : (
            <ul className="lista-items">
              {proximas.map((j) => (
                <li key={j.id}>
                  <div className="crece">
                    <Link to={`/jornadas/${j.id}`} className="nombre-link">{j.fecha.slice(0, 10) === hoy() ? 'Hoy' : fecha(j.fecha)}</Link>
                    <div className="tenue">{j.comunidades}</div>
                  </div>
                  <span className="chip">{plural(j.convocados, 'niño', 'niños')}</span>
                </li>
              ))}
            </ul>
          )}
          {usuario.rol !== 'enfermera' && porCerrar.length > 0 && (
            <div className="vacio-linea"><Lock size={15} /><span>{plural(porCerrar.length, 'jornada pasada', 'jornadas pasadas')} sin cerrar.</span></div>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
