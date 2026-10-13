import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon, AlertTriangle, BellOff, CalendarCheck, CalendarClock, CalendarDays, CalendarX, Check, CheckCircle2, ChevronLeft, ChevronRight,
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
import { MEDIOS, MESES, RESULTADOS, TIPO_ALERTA, cuadernoFila, edad, fecha, hoy, puede, sumarDias } from '../util.js';
import SelectorTerritorio, { useTerritorio } from '../componentes/SelectorTerritorio.jsx';

const ICONO_TIPO = { dosis_cero: AlertOctagon, abandono: UserX, atrasada: Clock, inasistencia: CalendarX, proxima: CalendarClock };
const GRAVEDAD = ['dosis_cero', 'abandono', 'atrasada', 'inasistencia', 'proxima'];
const dosisDe = (a) => a.etiqueta || (a.tipo === 'inasistencia' ? 'No llegó a la jornada o cita' : '');
const sumar = (d) => sumarDias(hoy(), d);

// Contacto en lenguaje sencillo: cada opción es un botón grande
const COMO = [
  { id: 'llamada', texto: 'Llamada', icono: Phone },
  { id: 'visita', texto: 'Visita a la casa', icono: Home },
  { id: 'lider_comunitario', texto: 'Líder comunitario', icono: Users },
];
const QUE_PASO = [
  { id: 'cita_acordada', texto: 'Vendrá a vacunarse', ayuda: 'Acordamos una fecha', icono: CalendarCheck, tono: 't-ok' },
  { id: 'contactado', texto: 'Hablamos, sin fecha', ayuda: 'Se le explicó, no dio día', icono: MessageCircle },
  { id: 'no_localizado', texto: 'No contestó o no estaba', ayuda: 'Se intentará otra vez', icono: PhoneMissed },
  { id: 'rechazo', texto: 'No quiere vacunar', ayuda: 'Necesita consejería', icono: UserX, tono: 't-critico' },
  { id: 'trasladado', texto: 'Se fue a vivir a otro lugar', ayuda: 'La enfermera cerrará el caso', icono: Truck },
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
const FILTROS = [
  ['', 'Todos'], ['dosis_cero', 'Dosis cero'], ['abandono', 'Abandono'], ['atrasada', 'Atrasados'], ['inasistencia', 'Inasistencia'], ['por_venir', 'Les toca este mes'],
];
const coincide = (p, f) => (f === 'por_venir' ? p.situacion === 'por_venir' : p.situacion !== 'por_venir' && (!f || p.alerta === f || (f === 'atrasada' && !p.alerta)));
const sinTildes = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Alertas() {
  const { usuario, refrescarAlertas } = useSesion();
  const esCelular = useEsCelular();
  const ir = useNavigate();
  const [params, setParams] = useSearchParams();
  const operativo = puede(usuario.rol, 'enfermera', 'vacunador');
  const esEnfermera = usuario.rol === 'enfermera';
  const ahora = hoy();
  const anio = Number(params.get('anio')) || Number(ahora.slice(0, 4));
  const mes = Number(params.get('mes')) || Number(ahora.slice(5, 7));
  const vista = params.get('vista') || 'por_vacunar';
  const comunidad = params.get('comunidad') || '';
  const puesto = params.get('puesto') || '';
  const periodo = params.get('periodo') || 'mes';
  const { describir } = useTerritorio();
  const lugar = describir({ puesto, comunidad });
  const asignado = params.get('asignado') || '';
  const filtro = params.get('tipo') || '';
  const comunidades = useCatalogo('comunidades');
  const [datos, setDatos] = useState(null);
  const [casos, setCasos] = useState([]);
  const [pedido, setPedido] = useState(null);
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
  useEffect(() => {
    if (vista === 'pedido' && !pedido) api('/seguimiento/proyeccion' + qs({ comunidad, puesto })).then(setPedido).catch((e) => setError(e.message));
  }, [vista, pedido, comunidad, puesto]);
  useEffect(() => setPedido(null), [comunidad, puesto]);
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
  const pendientes = (datos?.pendientes || []).filter((p) => enPeriodo(p) && coincide(p, filtro)
    && (!buscar || sinTildes(`${p.nombre_completo} ${p.responsable || ''}`).includes(sinTildes(buscar))));
  const cuenta = (f) => (datos?.pendientes || []).filter((p) => enPeriodo(p) && coincide(p, f)).length;
  const porComunidad = Object.values(pendientes.reduce((m, p) => {
    (m[p.comunidad_id] ||= { id: p.comunidad_id, nombre: p.comunidad, ninos: [] }).ninos.push(p);
    return m;
  }, {}));
  const titulo = `${MESES[mes - 1]} ${anio}`;
  const IMPRESION = { por_vacunar: 'Niños por vacunar', vacunados: 'Niños vacunados', suplementos: 'Suplementación', pedido: 'Pedido de vacunas' };
  const enSemana = esEsteMes && periodo === 'semana' && ['por_vacunar', 'suplementos'].includes(vista);

  return (
    <>
      <EncabezadoImpresion titulo={`${IMPRESION[vista]} · ${vista === 'pedido' ? 'próximos meses' : enSemana ? `semana al ${fecha(finSemana)}` : titulo}`}
        detalle={`${lugar.nombre}${lugar.responsable ? ` · Responsable: ${lugar.responsable}` : ''}`} />
      <div className="no-imprimir">
        <Encabezado titulo="Control del mes"
          descripcion="Quién se vacunó, quién falta por vacunar y qué vacunas pedir. Las alertas de atraso se generan solas cada día.">
          {esEnfermera && vista === 'por_vacunar' && !modoAsignar && <button className="btn" onClick={() => { setModoAsignar(true); cambiar({ nino: '' }); }}><Users size={17} />Asignar casos</button>}
          <button className="btn" onClick={() => window.print()} disabled={!datos}><Printer size={17} />Imprimir</button>
        </Encabezado>

        <div className="control-barra">
          {vista !== 'pedido' && (
            <div className="selector-mes" role="group" aria-label="Mes">
              <button type="button" className="btn btn-icono" onClick={() => moverMes(-1)} aria-label="Mes anterior"><ChevronLeft size={20} /></button>
              <strong>{titulo}</strong>
              <button type="button" className="btn btn-icono" onClick={() => moverMes(1)} disabled={esEsteMes} aria-label="Mes siguiente"><ChevronRight size={20} /></button>
            </div>
          )}
          <SelectorTerritorio puesto={puesto} comunidad={comunidad} onCambio={(t) => cambiar({ ...t, nino: '' })} />
          {esEsteMes && ['por_vacunar', 'suplementos'].includes(vista) && (
            <div className="segmentado" role="group" aria-label="Período">
              <button type="button" className={periodo === 'mes' ? 'activa' : ''} onClick={() => cambiar({ periodo: '' })}>Este mes</button>
              <button type="button" className={periodo === 'semana' ? 'activa' : ''} onClick={() => cambiar({ periodo: 'semana' })}>Esta semana</button>
            </div>
          )}
          {operativo && vista === 'por_vacunar' && (
            <div className="segmentado" role="group" aria-label="Casos">
              <button type="button" className={asignado !== 'yo' ? 'activa' : ''} onClick={() => cambiar({ asignado: '' })}>Todos</button>
              <button type="button" className={asignado === 'yo' ? 'activa' : ''} onClick={() => cambiar({ asignado: 'yo' })}>Mis casos</button>
            </div>
          )}
        </div>

        <Pestanas valor={vista} onCambio={(v) => cambiar({ vista: v === 'por_vacunar' ? '' : v, nino: '' })} opciones={[
          ['por_vacunar', <><Syringe size={15} />Por vacunar</>, datos && <span className="cuenta">{datos.resumen.pendientes}</span>],
          ['vacunados', <><CheckCircle2 size={15} />Vacunados</>, datos && <span className="cuenta">{datos.resumen.ninos_vacunados}</span>],
          ['suplementos', <><Pill size={15} />Suplementos</>],
          ['pedido', <><Package size={15} />Pedido de vacunas</>],
        ]} />
        {lugar.responsable && <p className="responsable-lugar"><User size={15} />Responsable de {lugar.nombre.replace(/ y comunidades a cargo$/, '')}: <strong>{lugar.responsable}</strong></p>}
      </div>
      <Mensaje tipo="error">{error}</Mensaje>

      {vista === 'suplementos' ? <Suplementos anio={anio} mes={mes} puesto={puesto} comunidad={comunidad} hastaSemana={esEsteMes && periodo === 'semana' ? finSemana : null} />
        : vista === 'pedido' ? <Pedido datos={pedido} /> : !datos ? <Cargando /> : vista === 'vacunados' ? (
        <Vacunados datos={datos} />
      ) : (
        <>
          <div className="kpis no-imprimir">
            <Kpi valor={datos.resumen.pendientes} rotulo={esEsteMes ? 'Atrasados por vacunar' : 'No se vacunaron'} icono={AlertOctagon} color="rojo" resaltar />
            {esEsteMes && <Kpi valor={datos.resumen.por_venir} rotulo="Les toca este mes" icono={CalendarClock} color="azul" />}
            <Kpi valor={datos.resumen.ninos_vacunados} rotulo="Vacunados en el mes" icono={CheckCircle2} color="verde" pie={`${plural(datos.resumen.dosis, 'dosis', 'dosis')}`} />
          </div>
          <div className="chips-filtro no-imprimir">
            {FILTROS.map(([k, t]) => (!esEsteMes && k === 'por_venir') ? null : (
              <button key={k} className={`chip-filtro ${filtro === k ? 'activa' : ''}`} onClick={() => cambiar({ tipo: k })}>{t} ({cuenta(k)})</button>
            ))}
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

          {porComunidad.length === 0 ? (
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
      )}

      {actual && (
        <DetalleCaso key={actual.nino_id} caso={actual} rol={usuario.rol} esCelular={esCelular}
          onCerrarPanel={() => cambiar({ nino: '' })} onCambio={() => { cargar(); refrescarAlertas(); }} />
      )}
    </>
  );
}

/** Un niño por vacunar: toda la fila se toca para llamar, visitar o anotar el contacto. */
function FilaPendiente({ p, seleccionado, marcado, onMarcar, onAbrir }) {
  const s = SITUACION[p.situacion];
  const tono = p.alerta ? tonoDe(p.alerta) : s.tono;
  const teclado = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (marcado != null ? onMarcar : onAbrir)(); } };
  const lista = p.dosis.map((d) => d.etiqueta).join(', ');
  const cuando = p.situacion === 'por_venir'
    ? `Le toca el ${fecha(p.dosis[0].programada).slice(0, 5)}`
    : `${p.alerta ? TIPO_ALERTA[p.alerta] : s.texto}${p.dias_atraso ? ` · ${plural(p.dias_atraso, 'día', 'días')}` : ''}`;
  return (
    <article className={`fila-caso fila-pendiente t-${tono} ${seleccionado ? 'seleccionado' : ''} ${marcado ? 'marcada' : ''}`} role="button" tabIndex={0}
      onClick={marcado != null ? onMarcar : onAbrir} onKeyDown={teclado} aria-label={`${p.nombre_completo}: ${cuando}. Le falta ${lista}`}>
      {marcado != null && (
        <span className={`casilla-asignar no-imprimir ${marcado ? 'si' : ''}`} role="checkbox" aria-checked={marcado} aria-label={`Marcar a ${p.nombre_completo}`}>
          {marcado && <Check size={16} strokeWidth={3} />}
        </span>
      )}
      <div className="fc-cuerpo">
        <strong>{p.nombre_completo}</strong>
        <span><b className="tc-tipo">{cuando}</b> · {edad(p.fecha_nacimiento)} · {lista}</span>
        <span className="fp-contacto">
          {p.responsable || 'Sin responsable'}{p.telefono && ` · ${p.telefono}`}
          {p.ultimo_contacto ? ` · contacto ${fecha(p.ultimo_contacto.fecha).slice(0, 5)}` : ' · sin contactar'}
          {p.asignado_nombre && ` · ${p.asignado_nombre.split(' ')[0]}`}
          {p.vacunado_en_el_mes && ' · vino este mes, le falta'}
        </span>
      </div>
      {marcado == null && <span className="no-imprimir"><BotonLlamar caso={p} /></span>}
      {marcado != null && p.asignado_nombre && <span className="chip no-imprimir">{p.asignado_nombre.split(' ')[0]}</span>}
      <span className="solo-imprimir-celda fp-nota">Resultado: ________________</span>
    </article>
  );
}

/** Vacunados del mes, día por día. */
function Vacunados({ datos }) {
  const dias = Object.entries(datos.vacunados.reduce((m, v) => {
    const d = (m[v.fecha] ||= {});
    const n = (d[v.nino_id] ||= { ...v, vacunas: [], jornada: false });
    n.vacunas.push(v.dosis || v.producto);
    n.jornada = n.jornada || Boolean(v.jornada_id);
    return m;
  }, {})).sort(([a], [b]) => b.localeCompare(a));
  if (!dias.length) return <div className="tarjeta"><Vacio icono={Syringe} titulo="Nadie se vacunó en este mes">Elija otro mes con las flechas.</Vacio></div>;
  return dias.map(([dia, ninos]) => {
    const lista = Object.values(ninos);
    return (
      <section key={dia} className="dia-vacunados">
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
  });
}

/** Suplementación del mes: a quién le toca (para llamar), qué se entregó y cuánto pedir. */
function Suplementos({ anio, mes, puesto, comunidad, hastaSemana }) {
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
      <div className="kpis tres no-imprimir">
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
    </>
  );
}

/** Pedido: dosis que tocarán los próximos meses, por vacuna. */
function Pedido({ datos }) {
  if (!datos) return <Cargando />;
  const total = (f) => f.cantidades.reduce((a, b) => a + b, 0);
  return (
    <Tarjeta titulo="Vacunas para pedir" icono={Package} cuerpo={false}
      sub={`Dosis que tocarán según el esquema de cada niño. Incluye ${datos.nacimientos_por_mes} nacimientos por mes (promedio del último año) para Hepatitis B y BCG.`}>
      <Tabla>
        <thead>
          <tr><th>Vacuna</th>{datos.columnas.map((c) => <th key={c.clave} className="celda-num">{c.nombre}</th>)}
            <th className="celda-num">Total</th><th className="celda-num" title="Total más la reserva por pérdidas">+{datos.reserva} %</th></tr>
        </thead>
        <tbody>
          {datos.filas.map((f) => (
            <tr key={f.codigo}>
              <td className="fuerte">{f.nombre}</td>
              {f.cantidades.map((n, i) => <td key={i} className="celda-num">{n || '—'}</td>)}
              <td className="celda-num fuerte">{total(f)}</td>
              <td className="celda-num fuerte">{Math.ceil(total(f) * (1 + datos.reserva / 100))}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="tenue" style={{ padding: '0 1.4rem 1rem' }}>
        «Atrasadas» son dosis que ya debieron ponerse: se recuperan si los niños vienen. La influenza solo se cuenta mientras dure la temporada.
      </p>
    </Tarjeta>
  );
}

/** "4 vacunas · 76 días de atraso": lo que hay que saber para decidir a quién llamar primero. */
function resumenCaso(c) {
  const vacunas = c.alertas.filter((a) => a.tipo !== 'inasistencia').length;
  const partes = [];
  if (vacunas) partes.push(plural(vacunas, 'vacuna', 'vacunas'));
  if (c.dias_atraso > 0) partes.push(`${plural(c.dias_atraso, 'día', 'días')} de atraso`);
  else if (c.peor === 'inasistencia') partes.push('faltó a la jornada o cita');
  return partes.join(' · ');
}

function BotonLlamar({ caso: c }) {
  return c.telefono ? (
    <a className="tc-tel" href={`tel:${c.telefono}`} onClick={(e) => e.stopPropagation()} aria-label={`Llamar al ${c.telefono}`} title={`Llamar al ${c.telefono}`}>
      <Phone size={16} />
    </a>
  ) : <span className="tc-sin-tel">Sin teléfono</span>;
}

/** Vacunas pendientes agrupadas por la fecha en que le tocaban: una línea por fecha, no una por vacuna. */
function porFecha(alertas) {
  const grupos = new Map();
  for (const a of alertas.filter((x) => x.etiqueta)) {
    const k = a.programada || '';
    if (!grupos.has(k)) grupos.set(k, { fecha: a.programada, dias: a.dias_atraso, vacunas: [] });
    grupos.get(k).vacunas.push(a.etiqueta);
  }
  return [...grupos.values()].sort((x, y) => (x.fecha || '').localeCompare(y.fecha || ''));
}

function DetalleCaso({ caso, rol, esCelular, onCerrarPanel, onCambio }) {
  const { pedirTexto, avisar } = useDialogos();
  const [personal, setPersonal] = useState([]);
  useEffect(() => { if (rol === 'enfermera') api('/casos/personal').then(setPersonal).catch(() => {}); }, [rol]);
  async function reasignar(usuarioId) {
    try {
      await api('/casos/asignar', { method: 'POST', body: { nino_ids: [caso.nino_id], usuario_id: usuarioId ? Number(usuarioId) : null } });
      avisar(usuarioId ? `Caso asignado a ${personal.find((x) => String(x.id) === usuarioId)?.nombre}.` : 'Asignación quitada.');
      onCambio();
    } catch (e) { avisar(e.message, 'error'); }
  }
  const [seguimientos, setSeguimientos] = useState([]);
  const [verTodos, setVerTodos] = useState(false);
  const [como, setComo] = useState(caso.telefono ? 'llamada' : 'visita');
  const [paso, setPaso] = useState(null);
  const [cuando, setCuando] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const operativo = puede(rol, 'enfermera', 'vacunador');

  const cargar = useCallback(() => {
    api(`/casos/${caso.nino_id}/seguimientos`).then(setSeguimientos).catch((e) => setError(e.message));
  }, [caso.nino_id]);
  useEffect(cargar, [cargar]);

  async function registrar() {
    if (paso === 'cita_acordada' && !cuando) { setError('Elija qué día vendrá.'); return; }
    setError('');
    setGuardando(true);
    try {
      await api(`/casos/${caso.nino_id}/seguimientos`, { method: 'POST', body: { medio: como, resultado: paso, fecha_compromiso: paso === 'cita_acordada' ? cuando : '', nota } });
      avisar('Contacto guardado.');
      setPaso(null); setCuando(''); setNota('');
      cargar();
      onCambio();
    } catch (err) { setError(err.message); }
    setGuardando(false);
  }

  async function cerrar() {
    const motivo = await pedirTexto({
      titulo: 'Cerrar caso sin vacunar', peligro: true, aceptar: 'Cerrar caso', etiqueta: 'Motivo de cierre',
      mensaje: `Se cerrarán las ${caso.alertas.length} vacunas pendientes de ${caso.nombre_completo}. Use esto solo si se fue a vivir a otro lugar, falleció o la familia rechaza la vacuna.`,
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

  const fechas = porFecha(caso.alertas);
  const inasistencia = caso.alertas.some((a) => a.tipo === 'inasistencia');
  const contactos = verTodos ? seguimientos : seguimientos.slice(0, 2);

  const titulo = (
    <span className="caso-cab">
      <span className={`tc-avatar t-${tonoDe(caso.peor)}`}>{iniciales(caso.nombre_completo)}</span>
      <span>
        <Link to={`/ninos/${caso.nino_id}`} className="caso-nombre" title="Abrir la ficha">{caso.nombre_completo}</Link>
        <span className="caso-meta">{edad(caso.fecha_nacimiento)} · {caso.comunidad} · {cuadernoFila(caso)}</span>
      </span>
    </span>
  );

  const pie = operativo && (
    <>
      {rol === 'enfermera' && <button type="button" className="btn btn-fantasma btn-sm caso-cerrar" onClick={cerrar}><X size={15} />Cerrar caso</button>}
      <button className="btn btn-primario" style={{ flex: 1 }} disabled={!paso || guardando} onClick={registrar}>
        <Check size={18} />{guardando ? 'Guardando…' : paso ? 'Guardar contacto' : 'Elija qué pasó para guardar'}
      </button>
    </>
  );

  return (
    <Modal titulo={titulo} onCerrar={onCerrarPanel} pie={pie} className={`modal-caso ${esCelular ? 'modal-completo' : 'modal-caso-ancho'}`}>
      <div className="caso-estado">
        <Estado de={caso.peor} grande />
        <span>{resumenCaso(caso)}</span>
      </div>

      <div className="caso-columnas">
        <div className="caso-info">
      <section className="caso-bloque">
        <div className="caso-responsable">
          <div>
            <span className="rotulo">Mamá o responsable</span>
            <strong>{caso.responsable || 'Sin registrar'}</strong>
            <span className="tenue">{caso.telefono || 'Sin teléfono: visita o líder comunitario'}
              {caso.idioma_preferente === 'poqomam' && <> · <Languages size={12} style={{ verticalAlign: '-1px' }} /> habla poqomam</>}</span>
          </div>
          {caso.telefono && (
            <div className="caso-botones">
              <a className="btn btn-verde btn-sm" href={`tel:${caso.telefono}`}><Phone size={15} />Llamar</a>
              <a className="btn btn-sm boton-whatsapp" href={enlaceWhatsApp(caso)} target="_blank" rel="noreferrer"
                title="Abre WhatsApp con un mensaje listo; usted decide si lo envía"><MessageCircle size={15} />WhatsApp</a>
            </div>
          )}
        </div>
        {caso.avisos.map((a) => <div key={a.tipo} className="caso-aviso"><AlertTriangle size={14} />{a.texto}</div>)}
        {rol === 'enfermera' ? (
          <label className="caso-asignado"><span>Asignado a</span>
            <select value={caso.asignado_id || ''} onChange={(e) => reasignar(e.target.value)}>
              <option value="">Nadie</option>
              {personal.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>
        ) : caso.asignado_nombre && <p className="tenue" style={{ marginTop: '.6rem' }}>Asignado a {caso.asignado_nombre}</p>}
      </section>

      <section className="caso-bloque">
        <div className="seccion-titulo">Le falta</div>
        {fechas.map((g) => (
          <div key={g.fecha || 'sin'} className="caso-falta">
            <strong>{g.vacunas.join(' · ')}</strong>
            {g.fecha && <span>Le tocaba{g.vacunas.length > 1 ? 'n' : ''} el {fecha(g.fecha)}{g.dias > 0 && ` · ${plural(g.dias, 'día', 'días')} de atraso`}</span>}
          </div>
        ))}
        {inasistencia && <div className="caso-falta"><strong>No llegó a la jornada o cita</strong></div>}
      </section>

      <section className="caso-bloque">
        <div className="seccion-titulo">Contactos anteriores {seguimientos.length > 0 && `(${seguimientos.length})`}</div>
        {seguimientos.length === 0 ? <p className="tenue">Ninguno todavía. Pendiente desde el {fecha(caso.desde)}.</p> : (
          <>
            <ul className="linea-tiempo">
              {contactos.map((s) => (
                <li key={s.id}>
                  <div className="cuando">{fecha(s.fecha)} · {s.usuario}</div>
                  <strong>{MEDIOS[s.medio]}</strong> · {RESULTADOS[s.resultado]}
                  {s.fecha_compromiso && <> · vendrá el <strong>{fecha(s.fecha_compromiso)}</strong></>}
                  {s.nota && <div className="suave">{s.nota}</div>}
                </li>
              ))}
            </ul>
            {seguimientos.length > 2 && (
              <button type="button" className="enlace-tenue" style={{ marginTop: '.6rem' }} onClick={() => setVerTodos(!verTodos)}>
                {verTodos ? 'Ver menos' : `Ver los ${seguimientos.length} contactos`}
              </button>
            )}
          </>
        )}
      </section>
        </div>
        <div className="caso-anotar">
      {operativo && (
        <section className="caso-bloque">
          <div className="seccion-titulo">Anotar un contacto</div>
          <div className="segmentado caso-como" role="group" aria-label="¿Cómo lo contactó?">
            {COMO.map((m) => (
              <button key={m.id} type="button" className={como === m.id ? 'activa' : ''} onClick={() => setComo(m.id)} aria-pressed={como === m.id}>
                <m.icono size={15} />{m.texto}
              </button>
            ))}
          </div>
          <p className="caso-pregunta">¿Qué pasó?</p>
          <div className="caso-resultados">
            {QUE_PASO.map((r) => (
              <button key={r.id} type="button" className={`caso-resultado ${r.tono || ''} ${paso === r.id ? 'marcada' : ''}`} onClick={() => setPaso(r.id)}
                aria-pressed={paso === r.id} title={r.ayuda}>
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
          {paso && <textarea rows={2} className="mt" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota opcional para quien llame después" aria-label="Nota" />}
          {error && <Mensaje tipo="error" className="mt">{error}</Mensaje>}
        </section>
      )}

        </div>
      </div>
    </Modal>
  );
}
