import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon, AlertTriangle, BellOff, CalendarCheck, CalendarClock, CalendarDays, CalendarX, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Home, Languages, MapPin, MessageCircle, Package, Phone, PhoneMissed, Pill, Printer, Search, Syringe, Truck, User, Users, UserX, X,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import {
  Cargando, Encabezado, EncabezadoImpresion, Kpi, Mensaje, Modal, Pestanas, Tabla, Tarjeta, Vacio, iniciales, useEsCelular,
} from '../componentes/ui.jsx';
import { Estado, plural, tonoDe } from '../componentes/Estado.jsx';
import Documento, { TablaDoc } from '../componentes/Documento.jsx';
import { MEDIOS, MESES, RESULTADOS, TIPO_ALERTA, cuadernoFila, edad, fecha, hoy, puede, sumarDias } from '../util.js';
import SelectorTerritorio, { useTerritorio } from '../componentes/SelectorTerritorio.jsx';

const ICONO_TIPO = { dosis_cero: AlertOctagon, abandono: UserX, atrasada: Clock, inasistencia: CalendarX, proxima: CalendarClock };
const GRAVEDAD = ['dosis_cero', 'abandono', 'atrasada', 'inasistencia', 'proxima'];
const dosisDe = (a) => a.etiqueta || (a.tipo === 'inasistencia' ? 'No llegó a la jornada o cita' : '');
const sumar = (d) => sumarDias(hoy(), d);

// Contacto en lenguaje sencillo: cada opción es un botón grande
const COMO = [
  { id: 'llamada', texto: 'Llamada', icono: Phone },
  { id: 'visita', texto: 'Visita', icono: Home },
  { id: 'lider_comunitario', texto: 'Líder', icono: Users },
];
const QUE_PASO = [
  { id: 'cita_acordada', texto: 'Vendrá', icono: CalendarCheck, tono: 't-ok' },
  { id: 'contactado', texto: 'Habló, sin fecha', icono: MessageCircle },
  { id: 'no_localizado', texto: 'No contestó o no estaba', icono: PhoneMissed },
  { id: 'rechazo', texto: 'No quiere', icono: UserX, tono: 't-critico' },
  { id: 'trasladado', texto: 'Se mudó', icono: Truck },
];
/**
 * Enlace de WhatsApp con el mensaje redactado: lo envía la persona desde su teléfono (no es envío automático,
 * que queda fuera del alcance). Números de Guatemala de 8 dígitos llevan el prefijo 502.
 */
function enlaceWhatsApp(caso) {
  const digitos = String(caso.telefono).replace(/\D/g, '');
  const numero = digitos.length === 8 ? `502${digitos}` : digitos;
  const vacunas = caso.alertas.filter((a) => a.etiqueta).map((a) => a.etiqueta).join(', ');
  const texto = `Buen día${caso.responsable ? `, ${caso.responsable.split(' ')[0]}` : ''}. Le saludamos del Centro de Salud de San Luis Jilotepeque. `
    + `${caso.nombre_completo} tiene pendiente${vacunas ? `: ${vacunas}` : ' su vacunación'}. `
    + 'Le esperamos en el centro de salud o en la próxima jornada de su comunidad. Traiga el carné de vacunación.';
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const FECHAS_RAPIDAS = [['Mañana', 1], ['En 3 días', 3], ['En una semana', 7], ['En 15 días', 15]];

// Control del mes (objetivo 2): las alertas que genera el motor cada día se trabajan aquí, mes por mes.
//  · Por vacunar: quién no se ha vacunado aunque le tocaba (o le toca este mes), por comunidad, para llamar o visitar.
//  · Vacunados: quién se vacunó cada día del mes.
//  · Pedido: cuántas dosis harán falta los próximos meses.
// Todo se puede imprimir.
const SITUACION = {
  de_antes: { texto: 'Atrasado', tono: 'critico' },
  del_mes: { texto: 'Le tocaba este mes', tono: 'atencion' },
  por_venir: { texto: 'Le toca este mes', tono: 'info' },
};
const FILTROS = [['', 'Todos'], ['dosis_cero', 'Dosis cero'], ['abandono', 'Abandono'], ['atrasada', 'Atrasados'], ['inasistencia', 'Inasistencia']];
const coincide = (p, f) => (f === 'por_venir' ? p.situacion === 'por_venir' : p.situacion !== 'por_venir' && (!f || p.alerta === f || (f === 'atrasada' && !p.alerta)));
const sinTildes = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Alertas() {
  const { usuario, refrescarAlertas } = useSesion();
  const esCelular = useEsCelular();
  const ir = useNavigate();
  const [params, setParams] = useSearchParams();
  const operativo = puede(usuario.rol, 'enfermera', 'vacunador');
  const esEnfermera = puede(usuario.rol, 'enfermera');
  const ahora = hoy();
  const anio = Number(params.get('anio')) || Number(ahora.slice(0, 4));
  const mes = Number(params.get('mes')) || Number(ahora.slice(5, 7));
  const vista = params.get('vista') || 'por_vacunar';
  const comunidad = params.get('comunidad') || '';
  const puesto = params.get('puesto') || '';
  const periodo = params.get('periodo') || 'mes';
  const { describir } = useTerritorio();
  const lugar = describir({ puesto, comunidad });
  // Quien tiene un sector a cargo entra viendo lo suyo; puede cambiar a «Todos»
  const asignado = params.get('asignado') ?? (usuario.rol === 'vacunador' && usuario.sector ? 'yo' : '');
  // Al entrar no se lista nada: se elige el grupo (atrasados o les toca este mes) y abajo salen sus filtros y la lista
  const grupo = params.get('grupo') || '';
  const filtro = grupo === 'por_venir' ? 'por_venir' : params.get('tipo') || '';
  const comunidades = useCatalogo('comunidades');
  const [datos, setDatos] = useState(null);
  const [casos, setCasos] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [personal, setPersonal] = useState([]);
  const [marcados, setMarcados] = useState(new Set());
  const [modoAsignar, setModoAsignar] = useState(false);
  const [destino, setDestino] = useState(''); // a quién se asignan los niños marcados ('nadie' = quitar asignación)
  const [error, setError] = useState('');
  const { avisar } = useDialogos();

  const ultimaConsulta = useRef(0);
  const cargar = useCallback(() => {
    setDatos(null);
    // Si se cambia de mes o de lugar antes de que llegue la respuesta, la respuesta vieja se descarta
    const n = ++ultimaConsulta.current;
    api('/seguimiento/mes' + qs({ anio, mes, comunidad, puesto, asignado }))
      .then((d) => { if (n === ultimaConsulta.current) setDatos(d); }).catch((e) => setError(e.message));
    api('/casos').then(setCasos).catch(() => {});
  }, [anio, mes, comunidad, puesto, asignado]);
  useEffect(cargar, [cargar]);
  const cargarSuave = () => {
    api('/seguimiento/mes' + qs({ anio, mes, comunidad, puesto, asignado })).then(setDatos).catch(() => {});
    api('/casos').then(setCasos).catch(() => {});
  };
  useEffect(() => { if (esEnfermera) api('/casos/personal').then(setPersonal).catch(() => {}); }, [esEnfermera]);

  const cambiar = (cambios) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p, { replace: true });
  };
  const moverMes = (k) => {
    const t = anio * 12 + (mes - 1) + k;
    cambiar({ anio: String(Math.floor(t / 12)), mes: String((t % 12) + 1) });
  };
  const esEsteMes = anio === Number(ahora.slice(0, 4)) && mes === Number(ahora.slice(5, 7));

  // El caso (alertas, contactos) del niño abierto; sin alertas abiertas, se abre su ficha
  const abierto = params.get('nino');
  const actual = casos.find((c) => String(c.nino_id) === abierto);
  const enGrupo = (p) => !grupo || (grupo === 'por_venir') === (p.situacion === 'por_venir');
  const abrir = (p) => {
    if (modoAsignar) { alternarMarca(p.id); return; }
    if (casos.some((c) => c.nino_id === p.id)) cambiar({ nino: String(p.id) }); else ir(`/ninos/${p.id}`);
  };
  const alternarMarca = (id) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const terminarAsignar = () => { setModoAsignar(false); setMarcados(new Set()); setDestino(''); };
  const nombreDestino = destino === 'nadie' ? null : personal.find((x) => String(x.id) === destino)?.nombre;
  async function asignar() {
    if (!marcados.size || !destino) return;
    try {
      await api('/casos/asignar', { method: 'POST', body: { nino_ids: [...marcados], usuario_id: destino === 'nadie' ? null : Number(destino) } });
      avisar(nombreDestino ? `${plural(marcados.size, 'niño asignado', 'niños asignados')} a ${nombreDestino}.` : 'Asignación quitada.');
      terminarAsignar(); cargar(); refrescarAlertas();
    } catch (e) { avisar(e.message, 'error'); }
  }
  const marcarGrupo = (ninos) => setMarcados((s) => {
    const n = new Set(s);
    const todos = ninos.every((x) => n.has(x.id));
    ninos.forEach((x) => (todos ? n.delete(x.id) : n.add(x.id)));
    return n;
  });

  // Esta semana: los atrasados y a quienes les toca antes del domingo (para la hoja del puesto o barrio)
  const finSemana = sumarDias(ahora, (7 - new Date(`${ahora}T12:00:00Z`).getUTCDay()) % 7);
  const enPeriodo = (p) => !(esEsteMes && periodo === 'semana') || p.situacion !== 'por_venir' || p.dosis.some((d) => d.programada <= finSemana);
  const pendientes = (datos?.pendientes || []).filter((p) => enPeriodo(p) && enGrupo(p) && (!grupo || coincide(p, filtro))
    && (!buscar || sinTildes(`${p.nombre_completo} ${p.responsable || ''}`).includes(sinTildes(buscar))));
  const cuenta = (f) => (datos?.pendientes || []).filter((p) => enPeriodo(p) && coincide(p, f)).length;
  const porComunidad = Object.values(pendientes.reduce((m, p) => {
    (m[p.comunidad_id] ||= { id: p.comunidad_id, nombre: p.comunidad, ninos: [] }).ninos.push(p);
    return m;
  }, {}));
  // «Siguiente niño» sigue el orden de la lista que se ve
  const visibles = porComunidad.flatMap((g) => g.ninos).filter((p) => casos.some((c) => c.nino_id === p.id));
  const siguiente = visibles[visibles.findIndex((p) => String(p.id) === abierto) + 1] || null;
  const titulo = `${MESES[mes - 1]} ${anio}`;
  const IMPRESION = { por_vacunar: 'Niños por vacunar', vacunados: 'Niños vacunados', suplementos: 'Suplementación' };
  const enSemana = esEsteMes && periodo === 'semana' && ['por_vacunar', 'suplementos'].includes(vista);

  return (
    <>
      <div className="no-imprimir">
        <Encabezado titulo="Control del mes">
          {esEnfermera && vista === 'por_vacunar' && !modoAsignar && <button className="btn" onClick={() => { setModoAsignar(true); cambiar({ nino: '', grupo: grupo || 'atrasados' }); }}><Users size={17} />Asignar casos</button>}
          <button className="btn" onClick={() => window.print()} disabled={!datos}><Printer size={17} />Imprimir</button>
        </Encabezado>

        <div className="control-barra">
          {(
            <div className="selector-mes" role="group" aria-label="Mes">
              <button type="button" className="btn btn-icono" onClick={() => moverMes(-1)} aria-label="Mes anterior"><ChevronLeft size={20} /></button>
              <strong>{titulo}</strong>
              <button type="button" className="btn btn-icono" onClick={() => moverMes(1)} disabled={esEsteMes} aria-label="Mes siguiente"><ChevronRight size={20} /></button>
            </div>
          )}
          {vista !== 'por_vacunar' && (datos?.solo_sector ? <span className="chip-sector"><MapPin size={16} />Su sector</span>
            : <SelectorTerritorio puesto={puesto} comunidad={comunidad} onCambio={(t) => cambiar({ ...t, nino: '' })} />)}
          {esEsteMes && vista === 'suplementos' && (
            <div className="segmentado" role="group" aria-label="Período">
              <button type="button" className={periodo === 'mes' ? 'activa' : ''} onClick={() => cambiar({ periodo: '' })}>Este mes</button>
              <button type="button" className={periodo === 'semana' ? 'activa' : ''} onClick={() => cambiar({ periodo: 'semana' })}>Esta semana</button>
            </div>
          )}
        </div>

        <Pestanas valor={vista} onCambio={(v) => cambiar({ vista: v === 'por_vacunar' ? '' : v, nino: '', grupo: '', tipo: '' })} opciones={[
          ['por_vacunar', <><Syringe size={15} />Por vacunar</>, datos && <span className="cuenta">{datos.resumen.pendientes + (esEsteMes ? datos.resumen.por_venir : 0)}</span>],
          ['vacunados', <><CheckCircle2 size={15} />Vacunados</>, datos && <span className="cuenta">{datos.resumen.ninos_vacunados}</span>],
          ['suplementos', <><Pill size={15} />Suplementos</>],
        ]} />
        {lugar.responsable && <p className="responsable-lugar"><User size={15} />Responsable de {lugar.nombre.replace(/ y comunidades a cargo$/, '')}: <strong>{lugar.responsable}</strong></p>}
      </div>
      <Mensaje tipo="error">{error}</Mensaje>

      {vista === 'suplementos' ? <Suplementos anio={anio} mes={mes} puesto={puesto} comunidad={comunidad} hastaSemana={esEsteMes && periodo === 'semana' ? finSemana : null}
        periodo={enSemana ? `Semana al ${fecha(finSemana)}` : titulo} lugar={lugar} />
        : !datos ? <Cargando /> : vista === 'vacunados' ? (
        <Vacunados datos={datos} periodo={titulo} lugar={lugar} />
      ) : (
        <>
          <Documento titulo="Niños a buscar" periodo={enSemana ? `Semana al ${fecha(finSemana)}` : titulo}
            detalle={`${lugar.nombre}${lugar.responsable ? ` · Responsable: ${lugar.responsable}` : ''}`}>
            {porComunidad.map((g) => (
              <section key={g.id}>
                <h2 className="doc-seccion">{g.nombre} · {g.ninos.length}</h2>
                <TablaDoc columnas={[
                  { titulo: 'Niña o niño', valor: (p) => <><strong>{p.nombre_completo}</strong><br />{edad(p.fecha_nacimiento)}</>, ancho: '24%' },
                  { titulo: 'Le falta', valor: (p) => p.dosis.map((d) => d.etiqueta).join(', ') },
                  { titulo: 'Atraso', valor: (p) => (p.situacion === 'por_venir' ? `Le toca ${fecha(p.dosis[0].programada).slice(0, 5)}` : `${p.dias_atraso} días`), num: true },
                  { titulo: 'Mamá o responsable', valor: (p) => <>{p.responsable || '—'}<br />{p.telefono || 'Sin teléfono'}</>, ancho: '24%' },
                  { titulo: 'Resultado', valor: () => '', ancho: '18%' },
                ]} filas={g.ninos} />
              </section>
            ))}
          </Documento>
          <div className="no-imprimir">
          <div className="control-grupos">
            <button type="button" className={`control-grupo rojo ${grupo === 'atrasados' ? 'activa' : ''}`} aria-pressed={grupo === 'atrasados'}
              onClick={() => cambiar({ grupo: grupo === 'atrasados' ? '' : 'atrasados', tipo: '', nino: '' })}>
              <AlertOctagon size={26} /><strong>{datos.resumen.pendientes}</strong><span>{esEsteMes ? 'Atrasados' : 'No se vacunaron'}</span>
              <ChevronDown size={22} className={`cg-flecha ${grupo === 'atrasados' ? 'girada' : ''}`} />
            </button>
            {esEsteMes && (
              <button type="button" className={`control-grupo azul ${grupo === 'por_venir' ? 'activa' : ''}`} aria-pressed={grupo === 'por_venir'}
                onClick={() => cambiar({ grupo: grupo === 'por_venir' ? '' : 'por_venir', tipo: '', nino: '' })}>
                <CalendarClock size={26} /><strong>{cuenta('por_venir')}</strong><span>{periodo === 'semana' ? 'Les toca esta semana' : 'Les toca este mes'}</span>
                <ChevronDown size={22} className={`cg-flecha ${grupo === 'por_venir' ? 'girada' : ''}`} />
              </button>
            )}
          </div>
          <>
          <div className="control-filtros">
            <div className="control-lugar">{datos?.solo_sector ? <span className="chip-sector"><MapPin size={16} />Su sector</span>
              : <SelectorTerritorio puesto={puesto} comunidad={comunidad} onCambio={(t) => cambiar({ ...t, nino: '' })} />}</div>
            {grupo !== 'por_venir' && (
              <div className="chips-filtro">
                {FILTROS.map(([k, t]) => (k && !cuenta(k) ? null : (
                  <button key={k} className={`chip-filtro ${grupo === 'atrasados' && filtro === k ? 'activa' : ''}`}
                    onClick={() => cambiar({ grupo: 'atrasados', tipo: k, nino: '' })}>{t} ({cuenta(k)})</button>
                )))}
              </div>
            )}
            {grupo !== 'atrasados' && esEsteMes && (
              <div className="segmentado" role="group" aria-label="Período">
                <button type="button" className={grupo && periodo === 'mes' ? 'activa' : ''} onClick={() => cambiar({ grupo: 'por_venir', periodo: '', nino: '' })}>Todo el mes</button>
                <button type="button" className={grupo && periodo === 'semana' ? 'activa' : ''} onClick={() => cambiar({ grupo: 'por_venir', periodo: 'semana', nino: '' })}>Esta semana</button>
              </div>
            )}
            {operativo && !datos?.solo_sector && (
              <div className="segmentado" role="group" aria-label="Casos">
                <button type="button" className={asignado !== 'yo' ? 'activa' : ''} onClick={() => { const p = new URLSearchParams(params); p.set('asignado', ''); setParams(p, { replace: true }); }}>Todos</button>
                <button type="button" className={asignado === 'yo' ? 'activa' : ''} onClick={() => cambiar({ asignado: 'yo' })}>{usuario.sector ? 'Mi sector' : 'Mis casos'}</button>
              </div>
            )}
          </div>
          <div className="con-icono buscador-control no-imprimir">
            <Search size={18} />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar niño o mamá en la lista" aria-label="Buscar en la lista" />
          </div>
          {modoAsignar && (
            <div className="panel-asignar no-imprimir">
              <div className="pa-paso">
                <span className="pa-num">1</span>
                <label className="pa-campo"><span>¿A quién le asigna los casos?</span>
                  <select value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Asignar a">
                    <option value="">Elija a la persona…</option>
                    {personal.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    <option value="nadie">Nadie (quitar la asignación)</option>
                  </select>
                </label>
              </div>
              <div className="pa-paso">
                <span className="pa-num">2</span>
                <span className="pa-texto">Marque las casillas de los niños o use «Marcar todos» en cada comunidad.</span>
              </div>
            </div>
          )}

          {!grupo && !buscar ? null : porComunidad.length === 0 ? (
            <div className="tarjeta"><Vacio icono={BellOff} titulo="Nadie por vacunar con estos filtros">Cuando a un niño le toque una vacuna y no venga, aparecerá aquí.</Vacio></div>
          ) : porComunidad.map((g) => (
            <section key={g.id} className="grupo-casos">
              <div className="grupo-casos-cab"><MapPin size={16} /><strong>{g.nombre}</strong><span className="chip">{plural(g.ninos.length, 'niño', 'niños')}</span>
                {modoAsignar && (
                  <button type="button" className="btn btn-sm marcar-grupo" onClick={() => marcarGrupo(g.ninos)}>
                    {g.ninos.every((x) => marcados.has(x.id)) ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                )}
              </div>
              <div className="casos-filas">
                {g.ninos.map((p) => (
                  <FilaPendiente key={p.id} p={p} seleccionado={String(p.id) === abierto}
                    marcado={modoAsignar ? marcados.has(p.id) : null} onMarcar={() => alternarMarca(p.id)} onAbrir={() => abrir(p)} />
                ))}
              </div>
            </section>
          ))}
          {modoAsignar && (
            <div className="barra-asignar no-imprimir">
              <strong>{plural(marcados.size, 'niño marcado', 'niños marcados')}</strong>
              <button className="btn" onClick={terminarAsignar}>Cancelar</button>
              <button className="btn btn-verde" disabled={!marcados.size || !destino} onClick={asignar}>
                <Check size={17} />{!destino ? 'Elija a la persona arriba' : !marcados.size ? 'Marque al menos un niño'
                  : nombreDestino ? `Asignar ${plural(marcados.size, 'niño', 'niños')} a ${nombreDestino.split(' ')[0]}` : `Quitar asignación a ${plural(marcados.size, 'niño', 'niños')}`}
              </button>
            </div>
          )}
          </>
          </div>
        </>
      )}

      {actual && (
        <DetalleCaso key={actual.nino_id} caso={actual} rol={usuario.rol} esCelular={esCelular} onSiguiente={siguiente ? () => abrir(siguiente) : null}
          onCerrarPanel={() => cambiar({ nino: '' })} onCambio={() => { cargarSuave(); refrescarAlertas(); }} />
      )}
    </>
  );
}

/** Un niño por vacunar: toda la fila se toca para llamar, visitar o anotar el contacto. */
function FilaPendiente({ p, seleccionado, marcado, onMarcar, onAbrir }) {
  const s = SITUACION[p.situacion];
  const tono = p.alerta ? tonoDe(p.alerta) : s.tono;
  const teclado = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (marcado != null ? onMarcar : onAbrir)(); } };
  const etiqueta = p.situacion === 'por_venir' ? 'Le toca' : p.alerta ? TIPO_ALERTA[p.alerta] : s.texto;
  const u = p.ultimo_contacto;
  return (
    <article className={`fila-caso fila-pendiente t-${tono} ${seleccionado ? 'seleccionado' : ''} ${marcado ? 'marcada' : ''}`} role="button" tabIndex={0}
      onClick={marcado != null ? onMarcar : onAbrir} onKeyDown={teclado} aria-label={`${p.nombre_completo}: ${etiqueta}`}>
      {marcado != null && (
        <span className={`casilla-asignar no-imprimir ${marcado ? 'si' : ''}`} role="checkbox" aria-checked={marcado} aria-label={`Marcar a ${p.nombre_completo}`}>
          {marcado && <Check size={16} strokeWidth={3} />}
        </span>
      )}
      <div className="fc-cuerpo">
        <span className="fp-linea1">
          <strong>{p.nombre_completo}</strong>
          <span className="fp-estado"><b className="tc-tipo">{etiqueta}</b>{p.situacion === 'por_venir'
            ? ` ${fecha(p.dosis[0].programada).slice(0, 5)}` : p.dias_atraso ? ` · ${p.dias_atraso} días` : ''}</span>
        </span>
        <span className="fichas-hoy">{p.dosis.map((d) => <span key={d.etiqueta} className={`ficha-vacuna ${d.situacion === 'por_venir' ? '' : 'atrasada'}`}>{d.etiqueta}</span>)}</span>
        <span className="fp-contacto">
          {p.responsable ? p.responsable.split(' ').slice(0, 2).join(' ') : 'Sin responsable'}
          <span> · {p.intentos ? `${plural(p.intentos, 'intento', 'intentos')}${u ? `, ${RESULTADO_CORTO[u.resultado]} (${fecha(u.fecha).slice(0, 5)})` : ''}` : 'sin buscar todavía'}</span>
        </span>
      </div>
      {marcado == null && <span className="no-imprimir"><BotonLlamar caso={p} /></span>}
      {marcado != null && p.asignado_nombre && <span className="chip no-imprimir">{p.asignado_nombre.split(' ')[0]}</span>}
      <span className="solo-imprimir-celda fp-nota">{p.telefono || ''} · Resultado: ____________</span>
    </article>
  );
}

/** Vacunados del mes, día por día. */
function Vacunados({ datos, periodo, lugar }) {
  const dias = Object.entries(datos.vacunados.reduce((m, v) => {
    const d = (m[v.fecha] ||= {});
    const n = (d[v.nino_id] ||= { ...v, vacunas: [], jornada: false });
    n.vacunas.push(v.dosis || v.producto);
    n.jornada = n.jornada || Boolean(v.jornada_id);
    return m;
  }, {})).sort(([a], [b]) => b.localeCompare(a));
  if (!dias.length) return <div className="tarjeta"><Vacio icono={Syringe} titulo="Nadie se vacunó en este mes">Elija otro mes con las flechas.</Vacio></div>;
  const largo = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const documento = (
    <Documento key="doc" titulo="Niños vacunados" periodo={periodo} detalle={lugar.nombre}>
      {[...dias].reverse().map(([dia, ninos]) => (
        <section key={dia}>
          <h2 className="doc-seccion">{largo(dia).replace(/^\w/, (x) => x.toUpperCase())} · {Object.keys(ninos).length}</h2>
          <TablaDoc columnas={[
            { titulo: 'Niña o niño', valor: 'nombre_completo', ancho: '30%' },
            { titulo: 'Comunidad', valor: 'comunidad' },
            { titulo: 'Vacunas', valor: (n) => n.vacunas.join(', ') },
            { titulo: 'Lugar', valor: (n) => (n.jornada ? 'Jornada' : n.establecimiento || 'Servicio') },
          ]} filas={Object.values(ninos)} />
        </section>
      ))}
    </Documento>
  );
  return [documento, ...dias.map(([dia, ninos]) => {
    const lista = Object.values(ninos);
    return (
      <section key={dia} className="dia-vacunados no-imprimir">
        <div className="grupo-casos-cab">
          <CalendarDays size={16} />
          <strong>{new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</strong>
          <span className="chip">{plural(lista.length, 'niño', 'niños')}</span>
        </div>
        <div className="casos-filas">
          {lista.map((n) => (
            <Link key={n.nino_id} to={`/ninos/${n.nino_id}`} className="fila-caso t-ok fila-vacunado">
              <div className="fc-cuerpo">
                <strong>{n.nombre_completo}</strong>
                <span>{n.comunidad} · {edad(n.fecha_nacimiento, dia)} · {n.vacunas.join(', ')}</span>
              </div>
              <span className="chip">{n.jornada ? 'Jornada' : (n.establecimiento || 'Servicio').replace('Centro de Salud', 'C. S.').replace('Puesto de Salud', 'P. S.')}</span>
            </Link>
          ))}
        </div>
      </section>
    );
  })];
}

/** Suplementación del mes: a quién le toca (para llamar), qué se entregó y cuánto pedir. */
function Suplementos({ anio, mes, puesto, comunidad, hastaSemana, periodo, lugar }) {
  const [datos, setDatos] = useState(null);
  const [vista, setVista] = useState('toca');
  const [error, setError] = useState('');
  useEffect(() => {
    setDatos(null);
    let vigente = true;
    api('/suplementos/mes' + qs({ anio, mes, puesto, comunidad })).then((d) => { if (vigente) setDatos(d); }).catch((e) => setError(e.message));
    return () => { vigente = false; };
  }, [anio, mes, puesto, comunidad]);
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!datos) return <Cargando />;
  const pendientes = hastaSemana ? datos.pendientes.filter((p) => p.suplementos.some((x) => x.programada <= hastaSemana)) : datos.pendientes;
  const porComunidad = Object.values(pendientes.reduce((m, p) => {
    (m[p.comunidad_id] ||= { id: p.comunidad_id, nombre: p.comunidad, ninos: [] }).ninos.push(p);
    return m;
  }, {}));
  return (
    <>
      <Documento titulo="Suplementación: a quién le toca" periodo={periodo} detalle={lugar.nombre}>
        {porComunidad.map((g) => (
          <section key={g.id}>
            <h2 className="doc-seccion">{g.nombre} · {g.ninos.length}</h2>
            <TablaDoc columnas={[
              { titulo: 'Niña o niño', valor: (p) => <><strong>{p.nombre_completo}</strong><br />{edad(p.fecha_nacimiento)}</>, ancho: '28%' },
              { titulo: 'Le toca', valor: (p) => p.suplementos.map((x) => x.etiqueta).join(', ') },
              { titulo: 'Mamá o responsable', valor: (p) => <>{p.responsable || '—'}<br />{p.telefono || ''}</> },
              { titulo: 'Entregado', valor: () => '', ancho: '14%' },
            ]} filas={g.ninos} />
          </section>
        ))}
      </Documento>
      <div className="no-imprimir">
      <div className="kpis tres">
        {datos.insumos.map((i) => (
          <Kpi key={i.insumo} valor={i.pendientes} rotulo={`${i.nombre}: le toca`} icono={Pill} color="azul" pie={`${i.entregados} entregados en el mes`} />
        ))}
      </div>
      <div className="segmentado no-imprimir" style={{ marginBottom: '1rem', width: 'fit-content' }} role="group">
        <button type="button" className={vista === 'toca' ? 'activa' : ''} onClick={() => setVista('toca')}>Le toca ({pendientes.length})</button>
        <button type="button" className={vista === 'entregados' ? 'activa' : ''} onClick={() => setVista('entregados')}>Entregados ({datos.entregados.length})</button>
      </div>
      {vista === 'entregados' ? (
        datos.entregados.length === 0 ? <div className="tarjeta"><Vacio icono={Pill} titulo="No se entregaron suplementos en este mes" /></div> : (
          <div className="casos-filas">
            {datos.entregados.map((e, i) => (
              <Link key={i} to={`/ninos/${e.nino_id}`} className="fila-caso t-ok fila-vacunado">
                <div className="fc-cuerpo"><strong>{e.nombre_completo}</strong><span>{fecha(e.fecha)} · {e.comunidad} · {e.etiqueta}</span></div>
              </Link>
            ))}
          </div>
        )
      ) : porComunidad.length === 0 ? (
        <div className="tarjeta"><Vacio icono={Pill} titulo="A nadie le toca un suplemento en este período" /></div>
      ) : porComunidad.map((g) => (
        <section key={g.id} className="grupo-casos">
          <div className="grupo-casos-cab"><MapPin size={16} /><strong>{g.nombre}</strong><span className="chip">{plural(g.ninos.length, 'niño', 'niños')}</span></div>
          <div className="casos-filas">
            {g.ninos.map((p) => (
              <Link key={p.id} to={`/ninos/${p.id}`} className="fila-caso fila-pendiente t-info">
                <div className="fc-cuerpo">
                  <strong>{p.nombre_completo}</strong>
                  <span><b className="tc-tipo">{p.suplementos.map((x) => x.etiqueta).join(', ')}</b> · {edad(p.fecha_nacimiento)}</span>
                  <span className="fp-contacto">{p.responsable || 'Sin responsable'}{p.telefono && ` · ${p.telefono}`}
                    {p.suplementos.some((x) => x.estado !== 'le_toca') && ` · desde el ${fecha(p.suplementos.map((x) => x.programada).sort()[0]).slice(0, 5)}`}</span>
                </div>
                <span className="no-imprimir"><BotonLlamar caso={p} /></span>
                <span className="solo-imprimir-celda fp-nota">Entregado: ________</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      </div>
    </>
  );
}


function BotonLlamar({ caso: c }) {
  return c.telefono ? (
    <a className="tc-tel" href={`tel:${c.telefono}`} onClick={(e) => e.stopPropagation()} aria-label={`Llamar al ${c.telefono}`} title={`Llamar al ${c.telefono}`}>
      <Phone size={16} />
    </a>
  ) : <span className="tc-sin-tel">Sin teléfono</span>;
}

// La influenza es campaña de temporada: no es un atraso del esquema (igual que en la lista del mes)
const deEsquema = (a) => !/^Influenza/.test(a.etiqueta || '');
const RESULTADO_CORTO = { contactado: 'habló, sin fecha', no_localizado: 'no contestó', cita_acordada: 'vendrá', rechazo: 'no quiere', trasladado: 'se mudó' };
const MEDIO_CORTO = { llamada: 'Llamada', visita: 'Visita', lider_comunitario: 'Líder', jornada: 'Jornada', otro: 'Otro' };

/**
 * Atender un caso, en pasos como «Vacunar»: cómo se buscó → ¿contestó? → ¿qué dijo? → guardado y siguiente niño.
 * Arriba solo lo necesario: qué le falta, a quién llamar y cuántas veces se ha intentado.
 */
function DetalleCaso({ caso, rol, esCelular, onCerrarPanel, onCambio, onSiguiente }) {
  const { pedirTexto, avisar } = useDialogos();
  const [personal, setPersonal] = useState([]);
  const [seguimientos, setSeguimientos] = useState([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [como, setComo] = useState(caso.telefono ? 'llamada' : 'visita');
  const [contesto, setContesto] = useState(null); // null | true | false
  const [paso, setPaso] = useState(null); // resultado elegido cuando sí contestó
  const [cuando, setCuando] = useState('');
  const [nota, setNota] = useState('');
  const [conNota, setConNota] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const operativo = puede(rol, 'enfermera', 'vacunador');
  const jefa = puede(rol, 'enfermera');

  useEffect(() => { if (jefa) api('/casos/personal').then(setPersonal).catch(() => {}); }, [jefa]);
  const cargar = useCallback(() => {
    api(`/casos/${caso.nino_id}/seguimientos`).then(setSeguimientos).catch((e) => setError(e.message));
  }, [caso.nino_id]);
  useEffect(cargar, [cargar]);
  const cargarSuave = () => {
    api('/seguimiento/mes' + qs({ anio, mes, comunidad, puesto, asignado })).then(setDatos).catch(() => {});
    api('/casos').then(setCasos).catch(() => {});
  };

  async function guardar(resultado) {
    if (resultado === 'cita_acordada' && !cuando) { setError('Elija qué día vendrá.'); return; }
    setError('');
    setGuardando(true);
    try {
      await api(`/casos/${caso.nino_id}/seguimientos`, { method: 'POST', body: {
        medio: como, resultado, fecha_compromiso: resultado === 'cita_acordada' ? cuando : '', nota: conNota ? nota : '' } });
      setGuardado(resultado);
      cargar();
      onCambio();
    } catch (err) { setError(err.message); }
    setGuardando(false);
  }
  async function reasignar(usuarioId) {
    try {
      await api('/casos/asignar', { method: 'POST', body: { nino_ids: [caso.nino_id], usuario_id: usuarioId ? Number(usuarioId) : null } });
      avisar(usuarioId ? 'Caso asignado.' : 'Asignación quitada.');
      onCambio();
    } catch (e) { avisar(e.message, 'error'); }
  }
  async function cerrar() {
    const motivo = await pedirTexto({
      titulo: 'Cerrar caso sin vacunar', peligro: true, aceptar: 'Cerrar caso', etiqueta: 'Motivo',
      placeholder: 'Se mudó, falleció, rechazo definitivo…',
    });
    if (!motivo) return;
    try {
      await api(`/casos/${caso.nino_id}/cerrar`, { method: 'POST', body: { motivo } });
      avisar('Caso cerrado.');
      onCerrarPanel();
      onCambio();
    } catch (err) { setError(err.message); }
  }

  const falta = caso.alertas.filter((a) => a.etiqueta && deEsquema(a));
  const inasistencia = caso.alertas.some((a) => a.tipo === 'inasistencia');
  const ultimo = seguimientos[0];
  const aviso = caso.avisos.find((x) => x.tipo === 'visitar') || caso.avisos[0];
  const encontrado = como === 'llamada' ? '¿Contestó?' : como === 'visita' ? '¿Lo encontró?' : '¿Pudo hablar con la familia?';

  const titulo = (
    <span className="caso-cab">
      <span className={`tc-avatar t-${tonoDe(caso.peor)}`}>{iniciales(caso.nombre_completo)}</span>
      <span>
        <Link to={`/ninos/${caso.nino_id}`} className="caso-nombre">{caso.nombre_completo}</Link>
        <span className="caso-meta">{edad(caso.fecha_nacimiento)} · {caso.comunidad}</span>
      </span>
    </span>
  );

  // Cuando se guarda: confirmación y pasar al siguiente niño de la lista sin volver atrás
  if (guardado) {
    return (
      <Modal titulo={titulo} onCerrar={onCerrarPanel} className={`modal-caso ${esCelular ? 'modal-completo' : 'modal-caso-ancho'}`}
        pie={<>
          <button className="btn btn-grande" onClick={onCerrarPanel}>Cerrar</button>
          {onSiguiente && <button className="btn btn-primario btn-grande" style={{ flex: 1 }} onClick={onSiguiente}>Siguiente niño <ChevronRight size={20} /></button>}
        </>}>
        <div className="confirmacion">
          <div className="sello"><CheckCircle2 size={46} /></div>
          <h2>Guardado</h2>
          <p className="suave">{MEDIO_CORTO[como]} · {RESULTADO_CORTO[guardado]}{guardado === 'cita_acordada' && cuando && ` el ${fecha(cuando)}`}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo={titulo} onCerrar={onCerrarPanel} className={`modal-caso ${esCelular ? 'modal-completo' : 'modal-caso-ancho'}`}>
      {/* Qué le falta: lo primero que se quiere saber */}
      <section className="caso-bloque caso-falta-cab">
        <div className="caso-falta-fichas">
          {falta.map((a) => <span key={a.id} className={`ficha-vacuna ${a.dias_atraso > 0 ? 'atrasada' : 'le_toca'}`}>{a.etiqueta}</span>)}
          {inasistencia && <span className="ficha-vacuna">No llegó a la jornada</span>}
        </div>
        {caso.dias_atraso > 0 && <span className="caso-dias"><b>{caso.dias_atraso}</b> días</span>}
      </section>
      {/* Si el niño está aquí (llegó o lo encontraron), se va directo a su ficha para vacunarlo */}
      <Link to={`/ninos/${caso.nino_id}`} className="btn btn-verde btn-bloque caso-ir-ficha"><Syringe size={18} />Abrir ficha para vacunar</Link>

      {/* A quién llamar */}
      <section className="caso-bloque caso-familia">
        <div>
          <span className="rotulo">Mamá o responsable</span>
          <strong>{caso.responsable || 'Sin registrar'}</strong>
          {caso.idioma_preferente === 'poqomam' && <span className="etiqueta celeste">Habla poqomam</span>}
        </div>
        {caso.telefono ? (
          <span className="caso-botones">
            <a className="btn btn-verde" href={`tel:${caso.telefono}`} onClick={() => setComo('llamada')}><Phone size={17} />{caso.telefono}</a>
            <a className="btn boton-whatsapp btn-icono" href={enlaceWhatsApp(caso)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={17} /></a>
          </span>
        ) : <span className="tenue">Sin teléfono</span>}
      </section>

      {/* Intentos: un resumen; el historial se abre si se necesita */}
      <section className="caso-bloque">
        <button type="button" className="caso-intentos" onClick={() => setVerHistorial(!verHistorial)} aria-expanded={verHistorial} disabled={!seguimientos.length}>
          <span className="ci-numero">{seguimientos.length}</span>
          <span>{seguimientos.length === 1 ? 'intento' : 'intentos'}
            {ultimo && <small>Último: {fecha(ultimo.fecha).slice(0, 5)} · {MEDIO_CORTO[ultimo.medio]} · {RESULTADO_CORTO[ultimo.resultado]}</small>}</span>
          {seguimientos.length > 0 && <ChevronDown size={18} className={verHistorial ? 'girada' : ''} />}
        </button>
        {verHistorial && (
          <ul className="caso-historial">
            {seguimientos.map((s) => (
              <li key={s.id}>
                <span className="ch-fecha">{fecha(s.fecha).slice(0, 5)}</span>
                <span><strong>{MEDIO_CORTO[s.medio]} · {RESULTADO_CORTO[s.resultado]}</strong>{s.fecha_compromiso && ` · vendrá el ${fecha(s.fecha_compromiso).slice(0, 5)}`}
                  <small>{s.usuario}{s.nota && ` · ${s.nota}`}</small></span>
              </li>
            ))}
          </ul>
        )}
        {aviso && <div className="caso-aviso"><AlertTriangle size={14} />{aviso.texto}</div>}
      </section>

      {/* Anotar lo que pasó */}
      {operativo && (
        <section className="caso-bloque caso-anotar-pasos">
          <div className="segmentado caso-como" role="group" aria-label="Cómo lo buscó">
            {COMO.map((m) => (
              <button key={m.id} type="button" className={como === m.id ? 'activa' : ''} onClick={() => { setComo(m.id); setContesto(null); setPaso(null); }} aria-pressed={como === m.id}>
                <m.icono size={15} />{m.texto}
              </button>
            ))}
          </div>

          <p className="caso-pregunta">{encontrado}</p>
          <div className="caso-sino">
            <button type="button" className={`caso-resultado t-ok ${contesto === true ? 'marcada' : ''}`} onClick={() => { setContesto(true); setPaso(null); }}><Check size={18} />Sí</button>
            <button type="button" className={`caso-resultado ${contesto === false ? 'marcada' : ''}`} onClick={() => { setContesto(false); setPaso(null); }}><PhoneMissed size={18} />No</button>
          </div>

          {contesto === true && (
            <>
              <p className="caso-pregunta">¿Qué dijo?</p>
              <div className="caso-resultados">
                {QUE_PASO.filter((r) => r.id !== 'no_localizado').map((r) => (
                  <button key={r.id} type="button" className={`caso-resultado ${r.tono || ''} ${paso === r.id ? 'marcada' : ''}`} onClick={() => setPaso(r.id)} aria-pressed={paso === r.id}>
                    <r.icono size={16} />{r.texto}
                  </button>
                ))}
              </div>
              {paso === 'cita_acordada' && (
                <>
                  <p className="caso-pregunta">¿Qué día vendrá?</p>
                  <div className="chips-filtro" style={{ marginBottom: '.5rem' }}>
                    {FECHAS_RAPIDAS.map(([t, d]) => <button key={t} type="button" className={`chip-filtro ${cuando === sumar(d) ? 'activa' : ''}`} onClick={() => setCuando(sumar(d))}>{t}</button>)}
                  </div>
                  <input type="date" min={hoy()} value={cuando} onChange={(e) => setCuando(e.target.value)} aria-label="Fecha en que vendrá" />
                </>
              )}
            </>
          )}

          {contesto !== null && (conNota
            ? <textarea rows={2} className="mt" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota" aria-label="Nota" autoFocus />
            : <button type="button" className="enlace-tenue mt" onClick={() => setConNota(true)}>+ Agregar nota</button>)}
          {error && <Mensaje tipo="error" className="mt">{error}</Mensaje>}

          {contesto !== null && (
            <button className="btn btn-primario btn-grande btn-bloque mt" disabled={guardando || (contesto && !paso)}
              onClick={() => guardar(contesto ? paso : 'no_localizado')}>
              <Check size={20} />{guardando ? 'Guardando…' : contesto ? (paso ? 'Guardar' : 'Elija qué dijo') : `Guardar: ${como === 'llamada' ? 'no contestó' : 'no lo encontré'}`}
            </button>
          )}
        </section>
      )}

      {jefa && (
        <section className="caso-bloque caso-mas">
          <label className="caso-asignado"><span>Asignado a</span>
            <select value={caso.asignado_id || ''} onChange={(e) => reasignar(e.target.value)}>
              <option value="">Nadie</option>
              {personal.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>
          <button type="button" className="enlace-tenue rojo" onClick={cerrar}>Cerrar caso sin vacunar</button>
        </section>
      )}
    </Modal>
  );
}
