// Inicio: lo urgente primero, distinto para cada rol. No es un menú: cada tarjeta lleva a donde se actúa.
//  · Personal de vacunación: su sector (vacunas retrasadas, sus jornadas, les toca esta semana, familias que prometieron venir).
//  · Enfermera: el municipio por puesto, jornadas próximas y por cerrar, cobertura del mes y el pedido.
//  · Administrador: lo de la enfermera más el estado del sistema (usuarios sin lugar, comunidades sin responsable, respaldos).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertOctagon, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, DatabaseBackup, Lock, MapPin, Package, Phone, Search, Settings,
  Syringe, Truck, UserPlus, Users,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Tarjeta } from '../componentes/ui.jsx';
import { plural } from '../componentes/Estado.jsx';
import { MESES, fecha, hoy, puede, sumarDias } from '../util.js';

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
}
const finDeSemana = () => sumarDias(hoy(), (7 - new Date(`${hoy()}T12:00:00Z`).getUTCDay()) % 7 || 7);
const enDias = (n) => sumarDias(hoy(), n);
const diaJornada = (f) => (f.slice(0, 10) === hoy() ? 'Hoy' : f.slice(0, 10) === enDias(1) ? 'Mañana'
  : new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }));

export default function Inicio() {
  const { usuario, refrescarAlertas } = useSesion();
  const rol = usuario.rol;
  const operativo = rol === 'vacunador';
  const jefa = puede(rol, 'enfermera');
  const [mes, setMes] = useState(null);
  const [jornadas, setJornadas] = useState(null);

  useEffect(refrescarAlertas, [refrescarAlertas]);
  useEffect(() => {
    api('/seguimiento/mes').then(setMes).catch(() => setMes({ pendientes: [], resumen: {} }));
    api('/jornadas').then(setJornadas).catch(() => setJornadas([]));
  }, [rol]);

  return (
    <>
      <Saludo usuario={usuario} buscar />
      <Retrasadas mes={mes} porPuesto={jefa} />
      <div className="inicio-rejilla">
        <Jornadas jornadas={jornadas} jefa={jefa} />
        {operativo ? <EstaSemana mes={mes} /> : <MesEnCurso mes={mes} />}
      </div>
      {operativo && <Compromisos mes={mes} />}
      {jefa && <RecordatorioPedido />}
      {rol === 'administrador' && <EstadoSistema />}
      {operativo && (
        <div className="inicio-acciones">
          <Link to="/ninos" className="btn btn-verde btn-grande"><Syringe size={20} />Vacunar</Link>
          <Link to="/ninos/nuevo" className="btn btn-grande"><UserPlus size={20} />Niño nuevo</Link>
        </div>
      )}
    </>
  );
}

function Saludo({ usuario, buscar }) {
  const ir = useNavigate();
  const [q, setQ] = useState('');
  const hoyLargo = new Date().toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section className="inicio-saludo">
      <div>
        <h1>{saludo()}, {usuario.nombre.split(' ')[0]}</h1>
        <span className="tenue">{hoyLargo.replace(/^\w/, (x) => x.toUpperCase())}{usuario.sector ? ' · Su sector' : ''}</span>
      </div>
      {buscar && (
        <form className="inicio-buscar con-icono" role="search" onSubmit={(e) => { e.preventDefault(); ir('/ninos' + (q.trim() ? qs({ q: q.trim() }) : '')); }}>
          <Search size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar niño o mamá" aria-label="Buscar niño" />
        </form>
      )}
    </section>
  );
}

/** Lo más urgente: niños con vacunas retrasadas (el mismo cálculo que Control del mes). */
function Retrasadas({ mes, porPuesto }) {
  const comunidades = useCatalogo('comunidades');
  if (!mes) return <div className="tarjeta inicio-urgente"><div className="esqueleto" /></div>;
  const atrasados = mes.pendientes.filter((p) => p.situacion !== 'por_venir');
  const cuenta = (t) => atrasados.filter((p) => (t === 'atrasada' ? !['dosis_cero', 'abandono'].includes(p.alerta) : p.alerta === t)).length;
  if (!atrasados.length) {
    return (
      <div className="inicio-urgente al-dia">
        <CheckCircle2 size={34} />
        <div><strong>{mes.solo_sector ? 'Su sector está al día' : 'Ningún niño con vacunas retrasadas'}</strong><span>No hay a quién buscar por ahora.</span></div>
      </div>
    );
  }
  // Por puesto: cada comunidad cuenta en el puesto al que pertenece
  const puestoDe = (id) => { const c = comunidades.find((x) => x.id === id); return c ? (c.comunidad_padre_id || c.id) : id; };
  const grupos = Object.values(atrasados.reduce((m, p) => {
    const id = puestoDe(p.comunidad_id);
    const c = comunidades.find((x) => x.id === id);
    (m[id] ||= { id, nombre: c ? (c.tipo === 'casco_urbano' ? 'Casco urbano' : c.nombre) : p.comunidad, n: 0 }).n += 1;
    return m;
  }, {})).sort((a, b) => b.n - a.n);
  return (
    <section className="inicio-urgente">
      <Link to="/alertas?grupo=atrasados" className="iu-principal">
        <span className="iu-ic"><AlertOctagon size={30} /></span>
        <span className="iu-texto">
          <strong>{atrasados.length}</strong>
          <span>{plural(atrasados.length, 'niño con vacunas retrasadas', 'niños con vacunas retrasadas')}{mes.solo_sector ? ' en su sector' : ''}</span>
          <span className="iu-desglose">
            {cuenta('dosis_cero') > 0 && <b className="rojo">{cuenta('dosis_cero')} dosis cero</b>}
            {cuenta('abandono') > 0 && <b className="rojo">{cuenta('abandono')} abandono</b>}
            {cuenta('atrasada') > 0 && <b>{cuenta('atrasada')} con atraso</b>}
          </span>
        </span>
        <span className="btn btn-blanco iu-boton">{porPuesto ? 'Ver lista' : 'Ver y llamar'} <ArrowRight size={17} /></span>
      </Link>
      {porPuesto && grupos.length > 1 && (
        <div className="iu-puestos">
          {grupos.map((g, i) => (
            <Link key={g.id} to={`/alertas?grupo=atrasados&puesto=${g.id}`} className={`iu-puesto ${i === 0 ? 'peor' : ''}`}>
              <MapPin size={14} /><span>{g.nombre}</span><b>{g.n}</b>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** Jornadas de hoy a 14 días (para planificar con tiempo) y las que ya pasaron sin cerrar. */
function Jornadas({ jornadas, jefa }) {
  const abiertas = (jornadas || []).filter((j) => ['planificada', 'en_curso'].includes(j.estado));
  const proximas = abiertas.filter((j) => j.fecha.slice(0, 10) >= hoy() && j.fecha.slice(0, 10) <= enDias(14)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porCerrar = abiertas.filter((j) => j.fecha.slice(0, 10) < hoy());
  return (
    <Tarjeta titulo="Próximas jornadas" icono={Truck} sub="Hoy y las próximas dos semanas" cuerpo={false}
      pie={<Link to="/jornadas" className="btn btn-sm btn-fantasma">Todas las jornadas <ArrowRight size={15} /></Link>}>
      {jornadas === null ? <div className="tarjeta-cuerpo"><div className="esqueleto" /></div> : (
        <div className="inicio-lista">
          {porCerrar.length > 0 && (
            <Link to="/jornadas" className="il-fila aviso"><Lock size={16} />
              <span>{plural(porCerrar.length, 'jornada ya pasó y sigue abierta', 'jornadas ya pasaron y siguen abiertas')}{jefa ? ': ciérrelas' : ''}</span><ChevronRight size={18} />
            </Link>
          )}
          {proximas.map((j) => (
            <Link key={j.id} to={`/jornadas/${j.id}`} className={`il-fila ${j.fecha.slice(0, 10) === hoy() ? 'hoy' : ''}`}>
              <span className="il-dia">{diaJornada(j.fecha)}</span>
              <span className="il-cuerpo"><strong>{j.comunidades}</strong><span>{plural(j.convocados, 'niño', 'niños')}{j.estado === 'en_curso' ? ' · en curso' : ''}</span></span>
              <ChevronRight size={18} />
            </Link>
          ))}
          {!proximas.length && !porCerrar.length && (
            <div className="il-vacio">
              <span>Sin jornadas en las próximas dos semanas.</span>
              {jefa && <Link className="btn btn-sm btn-primario" to="/jornadas/nueva"><Truck size={15} />Planificar</Link>}
            </div>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

/** Personal: a quién le toca vacuna esta semana en su sector. */
function EstaSemana({ mes }) {
  const semana = (mes?.pendientes || []).filter((p) => p.situacion === 'por_venir' && p.dosis.some((d) => d.programada <= finDeSemana()));
  const vacunas = Object.entries(semana.flatMap((p) => p.dosis.map((d) => d.etiqueta.replace(/ \d+a$| R\d.*$/, ''))).reduce((m, v) => ({ ...m, [v]: (m[v] || 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <Tarjeta titulo="Les toca esta semana" icono={CalendarDays} cuerpo={false}
      pie={<Link to="/alertas?grupo=por_venir&periodo=semana" className="btn btn-sm btn-fantasma">Ver quiénes <ArrowRight size={15} /></Link>}>
      <div className="tarjeta-cuerpo inicio-cifra">
        <strong>{mes ? semana.length : '…'}</strong><span>{semana.length === 1 ? 'niño' : 'niños'} hasta el domingo</span>
        <div className="fichas-hoy">{vacunas.map(([v, n]) => <span key={v} className="ficha-vacuna le_toca">{v} · {n}</span>)}</div>
      </div>
    </Tarjeta>
  );
}

/** Enfermera y administrador: cómo va el mes. */
function MesEnCurso({ mes }) {
  const [resumen, setResumen] = useState(null);
  useEffect(() => { api('/tablero/resumen').then(setResumen).catch(() => {}); }, []);
  const ritmo = resumen?.ideal_al_mes ?? 0;
  const p3 = resumen?.avance?.p3;
  return (
    <Tarjeta titulo={`${MESES[Number(hoy().slice(5, 7)) - 1].replace(/^\w/, (x) => x.toUpperCase())} hasta hoy`} icono={CheckCircle2} cuerpo={false}
      pie={<Link to="/tablero" className="btn btn-sm btn-fantasma">Ver tablero <ArrowRight size={15} /></Link>}>
      <div className="tarjeta-cuerpo inicio-dos-cifras">
        <div><strong>{mes?.resumen?.ninos_vacunados ?? '…'}</strong><span>niños vacunados este mes</span></div>
        <div className={p3 == null ? '' : p3 >= ritmo ? 'verde' : 'rojo'}>
          <strong>{p3 != null ? `${p3} %` : '—'}</strong><span>con sus 3 dosis · deberíamos ir en {ritmo} %</span>
        </div>
      </div>
    </Tarjeta>
  );
}

/** Personal: familias que dijeron que vendrían y la fecha ya llegó (para volver a llamar). */
function Compromisos({ mes }) {
  const lista = (mes?.pendientes || []).filter((p) => p.ultimo_contacto?.fecha_compromiso && p.ultimo_contacto.fecha_compromiso.slice(0, 10) <= enDias(1))
    .sort((a, b) => a.ultimo_contacto.fecha_compromiso.localeCompare(b.ultimo_contacto.fecha_compromiso));
  if (!lista.length) return null;
  return (
    <Tarjeta titulo="Prometieron venir" icono={Phone} sub="La fecha ya llegó: confirme o vuelva a llamar" cuerpo={false}>
      <div className="inicio-lista">
        {lista.slice(0, 6).map((p) => {
          const f = p.ultimo_contacto.fecha_compromiso.slice(0, 10);
          return (
            <Link key={p.id} to={`/alertas?nino=${p.id}`} className={`il-fila ${f < hoy() ? 'aviso' : ''}`}>
              <span className="il-dia">{f === hoy() ? 'Hoy' : f > hoy() ? 'Mañana' : fecha(f).slice(0, 5)}</span>
              <span className="il-cuerpo"><strong>{p.nombre_completo}</strong><span>{p.responsable || 'Sin responsable'} · {p.comunidad}</span></span>
              <ChevronRight size={18} />
            </Link>
          );
        })}
      </div>
    </Tarjeta>
  );
}

/** Enfermera: recordar hacer el pedido del mes siguiente antes de que empiece. */
function RecordatorioPedido() {
  const [a, m] = hoy().split('-').map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const faltan = fin - Number(hoy().slice(8, 10));
  const siguiente = MESES[m % 12];
  return (
    <Link to="/vacunas?vista=pedido" className={`inicio-pedido ${faltan <= 10 ? 'pronto' : ''}`}>
      <Package size={22} />
      <span><strong>Pedido de {siguiente}</strong> · {faltan === 0 ? 'hoy termina el mes' : `faltan ${plural(faltan, 'día', 'días')} para fin de mes`}</span>
      <ArrowRight size={18} />
    </Link>
  );
}

/** Administrador: lo que hace falta configurar para que cada quien vea lo suyo. */
function EstadoSistema() {
  const comunidades = useCatalogo('comunidades');
  const [usuarios, setUsuarios] = useState([]);
  const [respaldos, setRespaldos] = useState(null);
  useEffect(() => {
    api('/admin/usuarios').then(setUsuarios).catch(() => {});
    api('/admin/respaldos').then((r) => setRespaldos(r.respaldos || [])).catch(() => setRespaldos([]));
  }, []);
  const conLugar = new Set(comunidades.map((c) => c.responsable_id).filter(Boolean));
  const sinLugar = usuarios.filter((u) => u.activo && u.rol === 'vacunador' && !conLugar.has(u.id));
  const sinResponsable = comunidades.filter((c) => !c.responsable && !c.responsable_puesto && c.tipo !== 'casco_urbano');
  const ultimo = respaldos?.[0];
  const diasRespaldo = ultimo ? Math.floor((Date.now() - new Date(ultimo.creado)) / 86400000) : null;
  const avisos = [
    sinLugar.length > 0 && { to: '/admin?vista=territorio', icono: Users, texto: `${plural(sinLugar.length, 'persona del personal sin lugar a cargo', 'personas del personal sin lugar a cargo')}: ven todo el municipio`, detalle: sinLugar.map((u) => u.nombre).join(', ') },
    sinResponsable.length > 0 && { to: '/admin?vista=territorio', icono: MapPin, texto: `${plural(sinResponsable.length, 'comunidad sin responsable', 'comunidades sin responsable')}`, detalle: sinResponsable.map((c) => c.nombre).join(', ') },
    respaldos !== null && (diasRespaldo == null || diasRespaldo > 7) && { to: '/admin?vista=respaldos', icono: DatabaseBackup, texto: ultimo ? `El último respaldo es de hace ${diasRespaldo} días` : 'Todavía no hay respaldos', detalle: 'Haga uno desde Administración' },
  ].filter(Boolean);
  return (
    <Tarjeta titulo="Estado del sistema" icono={Settings} cuerpo={false}
      pie={<Link to="/admin" className="btn btn-sm btn-fantasma">Administración <ArrowRight size={15} /></Link>}>
      <div className="inicio-lista">
        {avisos.length === 0 ? <div className="il-vacio"><CheckCircle2 size={18} /> Todo configurado: cada persona tiene su lugar y hay respaldo reciente.</div>
          : avisos.map((a) => (
            <Link key={a.texto} to={a.to} className="il-fila aviso">
              <a.icono size={16} />
              <span className="il-cuerpo"><strong>{a.texto}</strong><span>{a.detalle}</span></span>
              <ChevronRight size={18} />
            </Link>
          ))}
      </div>
    </Tarjeta>
  );
}
