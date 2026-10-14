import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BookOpen, CalendarX, ChevronDown, CheckCircle2, ClipboardList, Clock, MapPin, MessageCircle, Pencil, Phone, Plus, Printer, RefreshCw, Syringe, Trash2, X,
} from 'lucide-react';
import { api } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import RegistrarDosis from '../componentes/RegistrarDosis.jsx';
import Vacunar from '../componentes/Vacunar.jsx';
import VistaCuaderno from '../componentes/VistaCuaderno.jsx';
import SuplementosNino from '../componentes/SuplementosNino.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Cargando, EncabezadoImpresion, MenuMas, Mensaje, Pestanas, Tarjeta, Vacio, iniciales, useEsCelular } from '../componentes/ui.jsx';
import { Estado, plural, tonoDe } from '../componentes/Estado.jsx';
import {
  ESTADO_REGISTRO, LINGUISTICAS, MEDIOS, PUEBLOS, RESULTADOS, TIPO_CUADERNO,
  cuadernoFila, diasDesde, edad, fecha, hoy, puede, recordarNino,
} from '../util.js';

const PARENTESCO = { madre: 'Mamá', padre: 'Papá', otro: 'Responsable' };
const VISITAS_VISIBLES = 3;

/** "hoy", "mañana", "en 12 días" o "hace 3 días": la fecha absoluta sola obliga a hacer la cuenta. */
function relativo(f) {
  const d = -diasDesde(f);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

/** Aplicaciones agrupadas por visita (mismo día y lugar): una visita = una línea del historial. */
function porVisita(aplicaciones) {
  const visitas = [];
  for (const a of aplicaciones) {
    const clave = `${a.fecha_aplicacion}|${a.establecimiento || ''}`;
    let v = visitas.find((x) => x.clave === clave);
    if (!v) visitas.push(v = { clave, fecha: a.fecha_aplicacion, lugar: a.establecimiento, registro: a.responsable_informacion, aplicaciones: [] });
    v.aplicaciones.push(a);
  }
  return visitas;
}

export default function Ficha() {
  const { id } = useParams();
  const { usuario, refrescarAlertas } = useSesion();
  const { pedirTexto, avisar, confirmar } = useDialogos();
  const esCelular = useEsCelular();
  const columnas = useCatalogo('columnas');
  const [nino, setNino] = useState(null);
  const [esquema, setEsquema] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [modal, setModal] = useState(null); // null | { serie?, fecha? }
  const [vacunar, setVacunar] = useState(null); // null | 'normal' | 'sin' (no se pudo vacunar hoy)
  const [resultado, setResultado] = useState(null);
  const [pestana, setPestana] = useState('carne');
  const [verDatos, setVerDatos] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    Promise.all([api('/ninos/' + id), api(`/ninos/${id}/esquema`)])
      .then(([n, e]) => { setNino(n); setEsquema(e); recordarNino(n); })
      .catch((e) => setError(e.message));
    api(`/casos/${id}/seguimientos`).then(setContactos).catch(() => setContactos([]));
  }, [id]);
  useEffect(cargar, [cargar]);

  async function anular(a) {
    const motivo = await pedirTexto({
      titulo: 'Anular dosis', peligro: true, aceptar: 'Anular dosis',
      mensaje: `Se anulará ${a.producto} del ${fecha(a.fecha_aplicacion)}. La dosis queda en el historial como anulada.`,
      etiqueta: 'Motivo de la anulación',
    });
    if (!motivo) return;
    try {
      await api(`/aplicaciones/${a.id}/anular`, { method: 'POST', body: { motivo } });
      avisar('Dosis anulada.');
      cargar();
      refrescarAlertas();
    } catch (e) { avisar(e.message, 'error'); }
  }

  function alRegistrar(r) {
    setModal(null);
    setResultado(r);
    avisar('Vacuna guardada.');
    cargar();
    refrescarAlertas();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (error && !nino) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!nino || !esquema) return <Cargando filas={6} />;

  const activo = nino.estado === 'activo';
  const operativo = puede(usuario.rol, 'enfermera', 'vacunador') && activo;
  const resp = nino.responsables.find((t) => t.es_principal) || nino.responsables[0];
  const estadoVisible = activo ? esquema.estadoNino : 'inactivo';

  // Atraso real: desde la fecha programada en el carné (la misma que se ve en las casillas rojas)
  const atrasadas = esquema.dosis.filter((d) => d.estado === 'atrasada');
  const atrasoDesde = atrasadas.reduce((m, d) => (!m || d.fechaProgramada < m ? d.fechaProgramada : m), null);
  const diasAtraso = atrasadas.reduce((m, d) => Math.max(m, d.diasAtraso), 0);
  const tocaHoy = esquema.leTocaHoy;
  const tonoFranja = !activo ? 'neutro' : atrasadas.length ? tonoDe(esquema.estadoNino) : tocaHoy.length ? 'info' : 'ok';
  const casos = nino.alertas.filter((a) => a.tipo !== 'proxima');
  const visitas = porVisita(nino.aplicaciones);

  // Tocar una casilla del carné: registrar esa dosis o saber desde cuándo se puede
  async function tocarDosis(d) {
    if (!operativo) return;
    if (d.fechaMinima && d.fechaMinima > hoy()) {
      await confirmar({ titulo: d.etiqueta, aceptar: 'Entendido', sinCancelar: true,
        mensaje: `Tiene ${edad(nino.fecha_nacimiento)}. Esta vacuna se puede poner desde el ${fecha(d.fechaMinima)}.` });
      return;
    }
    if (['le_toca', 'atrasada'].includes(d.estado) && tocaHoy.length > 1) { setVacunar('normal'); return; }
    setModal({ serie: d.serieCodigo });
  }

  const encabezado = (
    <section className="tarjeta ficha">
      <div className="ficha-cab">
        <div className={`ficha-avatar ${nino.sexo === 'M' ? 'mujer' : ''}`}>{iniciales(nino.nombre_completo)}</div>
        <div className="datos">
          <div className="ficha-nombre">
            <h1>{nino.nombre_completo}</h1>
            <Estado de={estadoVisible} grande />
            {activo && esquema.recuperacion?.length > 0 && (
              <span className="chip-recuperacion" title="Las dosis que faltan de estas vacunas van con el intervalo mínimo para ponerse al día">
                <RefreshCw size={15} />Esquema de recuperación · {esquema.recuperacion.join(', ')}
              </span>
            )}
          </div>
          <p className="ficha-resumen"><b>{edad(nino.fecha_nacimiento)}</b> · {nino.sexo === 'M' ? 'niña' : 'niño'} · <MapPin size={14} /> {nino.comunidad}</p>
          {resp && (
            <div className="ficha-mama">
              <span>{PARENTESCO[resp.parentesco]}: <strong>{resp.nombre_completo}</strong></span>
              {resp.telefono && (
                <span className="ficha-mama-botones no-imprimir">
                  <a className="btn btn-sm btn-verde" href={`tel:${resp.telefono}`}><Phone size={14} />{resp.telefono}</a>
                  <a className="btn btn-sm boton-whatsapp" href={`https://wa.me/502${resp.telefono}`} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={14} /></a>
                </span>
              )}
              {resp.idioma_preferente === 'poqomam' && <span className="etiqueta celeste">Habla poqomam</span>}
            </div>
          )}
          <button type="button" className="enlace-tenue ficha-ver-datos no-imprimir" onClick={() => setVerDatos(!verDatos)} aria-expanded={verDatos}>
            <ChevronDown size={15} className={verDatos ? 'girada' : ''} />Datos del registro
          </button>
          <dl className={`ficha-datos ${verDatos ? '' : 'solo-imprimir'}`}>
            <div><dt>Nació</dt><dd>{fecha(nino.fecha_nacimiento)}</dd></div>
            <div><dt>Cuaderno</dt><dd>{cuadernoFila(nino)}{nino.cuaderno_tipo && ` · ${TIPO_CUADERNO[nino.cuaderno_tipo]}`}</dd></div>
            <div><dt>CUI</dt><dd>{nino.cui || '—'}</dd></div>
            <div><dt>Pueblo</dt><dd>{PUEBLOS[nino.pueblo]}{nino.pueblo === 2 && `, ${LINGUISTICAS[nino.comunidad_linguistica]}`}</dd></div>
          </dl>
        </div>
        <div className="acciones no-imprimir" style={{ margin: 0 }}>
          {puede(usuario.rol, 'enfermera', 'vacunador') && <Link className="btn btn-icono" to={`/ninos/${id}/editar`} aria-label="Editar datos" title="Editar datos"><Pencil size={17} /></Link>}
          <button className="btn btn-icono" onClick={() => window.print()} aria-label="Imprimir" title="Imprimir"><Printer size={17} /></button>
          {operativo && <MenuMas opciones={[{ texto: 'Registrar una vacuna de otra fecha', icono: Plus, onClick: () => setModal({}) }]} />}
        </div>
      </div>

      {activo && (
        <div className={`franja-estado t-${tonoFranja}`}>
          <span className="ic">{atrasadas.length ? <Clock size={22} /> : tocaHoy.length ? <Syringe size={22} /> : <CheckCircle2 size={22} />}</span>
          <div className="texto">
            {tocaHoy.length ? (
              <>
                <strong>Hoy le {tocaHoy.length === 1 ? 'toca 1 vacuna' : `tocan ${tocaHoy.length} vacunas`}
                  {atrasoDesde && <em> · atrasado {plural(diasAtraso, 'día', 'días')}</em>}</strong>
                <span className="fichas-hoy">{tocaHoy.map((d) => <span key={d.esquemaDosisId} className={`ficha-vacuna ${d.estado}`}>{d.etiqueta}</span>)}</span>
              </>
            ) : esquema.proximaCita ? (
              <>
                <strong>Próxima cita: {fecha(esquema.proximaCita)} <em className="suave">({relativo(esquema.proximaCita)})</em></strong>
                <span className="fichas-hoy">{esquema.proximaCitaVacunas.map((v) => <span key={v} className="ficha-vacuna">{v}</span>)}</span>
              </>
            ) : (
              <strong>Esquema completo para su edad</strong>
            )}
          </div>
          {operativo && tocaHoy.length > 0 && (
            <div className="botones no-imprimir">
              <button className="btn btn-grande" onClick={() => setVacunar('sin')}>No se pudo vacunar hoy</button>
              <button className="btn btn-verde btn-grande" onClick={() => setVacunar('normal')}><Syringe size={20} />Vacunar</button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  const carne = (
    <Tarjeta titulo="Carné de vacunación" icono={Syringe} cuerpo={false}>
      <VistaCuaderno columnas={columnas} celdas={nino.celdas} dosis={esquema.dosis} onTocar={operativo ? tocarDosis : null} />
    </Tarjeta>
  );

  const historial = (
    <Tarjeta titulo="Historial" icono={ClipboardList} cuerpo={false}>
      {visitas.length === 0 ? (
        <Vacio icono={Syringe} titulo="Todavía no tiene vacunas registradas" />
      ) : (
        <ol className="linea-visitas">
          {visitas.map((v, i) => (
            <li key={v.clave} className={i >= VISITAS_VISIBLES && !verHistorial ? 'solo-imprimir' : ''}>
              <div className="lv-cab">
                <strong>{fecha(v.fecha)}</strong>
                <span className="tenue">{v.lugar || 'Lugar sin registrar'} · {v.registro}</span>
              </div>
              <div className="lv-vacunas">
                {v.aplicaciones.map((a) => (
                  <span key={a.id} className={`lv-vacuna ${a.anulada ? 'anulada' : ''}`} title={a.dosis.join(', ')}>
                    <span>
                      {a.producto}
                      <small>{a.dosis.join(', ')}{a.es_recuperacion && ' · recuperación'}{!a.fuente_primaria && ' · del carné'}</small>
                      {a.anulada && <small className="rojo">Anulada: {a.motivo_anulacion}</small>}
                    </span>
                    {puede(usuario.rol, 'enfermera') && !a.anulada && (
                      <MenuMas etiqueta={`Acciones de ${a.producto}`} opciones={[{ texto: 'Anular esta dosis', icono: Trash2, peligro: true, onClick: () => anular(a) }]} />
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
      {visitas.length > VISITAS_VISIBLES && (
        <div className="tarjeta-pie no-imprimir">
          <button className="enlace-tenue" onClick={() => setVerHistorial(!verHistorial)}>
            {verHistorial ? 'Ver menos' : `Ver las ${visitas.length} visitas`}
          </button>
        </div>
      )}
    </Tarjeta>
  );

  const seguimiento = casos.length > 0 && (
    <Seguimiento ninoId={id} casos={casos} atrasadas={atrasadas} estado={esquema.estadoNino} contactos={contactos} operativo={operativo} />
  );

  return (
    <>
      <EncabezadoImpresion titulo="Historial vacunal" detalle={`Impreso el ${fecha(hoy())}`} />
      {encabezado}

      {!activo && <Mensaje tipo="aviso">Registro {ESTADO_REGISTRO[nino.estado].toLowerCase()}: no genera alertas ni aparece en jornadas.</Mensaje>}
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>

      {resultado && (
        <section className="tarjeta anotar no-imprimir">
          <div className="tarjeta-cab">
            <h2><CheckCircle2 size={19} style={{ color: 'var(--verde)' }} />Anotar en el papel</h2>
            <button className="btn btn-fantasma btn-icono" onClick={() => setResultado(null)} aria-label="Cerrar"><X size={18} /></button>
          </div>
          <div className="tarjeta-cuerpo">
            <div className="linea"><BookOpen size={17} /><span><strong>Cuaderno:</strong> {resultado.dondeAnotar.texto}.</span></div>
            <div className="linea"><ClipboardList size={17} /><span><strong>Carné:</strong> {resultado.dosis.join(', ')} aplicada el {fecha(resultado.aplicacion.fecha_aplicacion)}.
              {resultado.proximaCita && <> Próxima cita: <strong>{fecha(resultado.proximaCita)}</strong> ({resultado.proximaCitaVacunas.join(', ')}).</>}</span></div>
            {resultado.advertencias.length > 0 && (
              <Mensaje tipo="aviso" className="mt">Se guardó con advertencias:<ul>{resultado.advertencias.map((a) => <li key={a}>{a}</li>)}</ul></Mensaje>
            )}
          </div>
        </section>
      )}

      {esCelular ? (
        <>
          {seguimiento}
          <Pestanas valor={pestana} onCambio={setPestana} opciones={[
            ['carne', 'Carné'], ...(activo ? [['suplementos', 'Suplementos']] : []), ['historial', `Historial (${visitas.length})`],
          ]} />
          {pestana === 'carne' && carne}
          {pestana === 'suplementos' && <SuplementosNino ninoId={id} operativo={operativo} siempre />}
          {pestana === 'historial' && historial}
        </>
      ) : (
        <>
          <div className={seguimiento ? 'col-principal' : ''}>
            <div>{carne}</div>
            {seguimiento && <div className="no-imprimir lado-primero">{seguimiento}</div>}
          </div>
          {activo && <SuplementosNino ninoId={id} operativo={operativo} />}
          {historial}
        </>
      )}

      {vacunar && <Vacunar ninoId={id} nombre={nino.nombre_completo} esquema={esquema} sinVacunar={vacunar === 'sin'}
        onCerrar={() => setVacunar(null)}
        onTerminado={(r) => { setVacunar(null); if (r.hechas.length) avisar(r.hechas.length === 1 ? 'Vacuna guardada.' : 'Vacunas guardadas.'); cargar(); refrescarAlertas(); }} />}
      {modal && <RegistrarDosis ninoId={id} esquema={esquema} serieSugerida={modal.serie}
        onCerrar={() => setModal(null)} onRegistrado={alRegistrar} />}
    </>
  );
}

/** Por qué hay que buscar al niño: motivos, último contacto y una única acción. */
function Seguimiento({ ninoId, casos, atrasadas, estado, contactos, operativo }) {
  const tipos = new Set(casos.map((a) => a.tipo));
  const inasistencias = casos.filter((a) => a.tipo === 'inasistencia');
  const ultimo = contactos[0];
  return (
    <Tarjeta titulo="Seguimiento" icono={Phone} cuerpo={false}
      pie={operativo && <Link className="btn btn-primario btn-bloque" to={`/alertas?nino=${ninoId}`}><Phone size={16} />Anotar llamada o visita</Link>}>
      <div className="tarjeta-cuerpo motivos">
        <Estado de={estado === 'proximo' || estado === 'al_dia' ? [...tipos][0] : estado} grande />
        <ul>
          {tipos.has('dosis_cero') && <li>No tiene la primera pentavalente.</li>}
          {tipos.has('abandono') && <li>Empezó sus vacunas y dejó de venir.</li>}
          {atrasadas.length > 0 && <li>Le {atrasadas.length === 1 ? 'falta 1 vacuna atrasada' : `faltan ${atrasadas.length} vacunas atrasadas`}.</li>}
          {inasistencias.map((a) => (
            <li key={a.id}><CalendarX size={14} style={{ verticalAlign: '-2px', color: 'var(--morado)' }} /> No llegó a la jornada del {fecha(a.fecha_generada)}.</li>
          ))}
        </ul>
        <div className="ultimo-contacto">
          {ultimo
            ? <>Último contacto: <b>{fecha(ultimo.fecha)}</b> · {MEDIOS[ultimo.medio]} · {RESULTADOS[ultimo.resultado]}{ultimo.fecha_compromiso && <> · vendrá el <b>{fecha(ultimo.fecha_compromiso)}</b></>}</>
            : 'Nadie ha llamado ni visitado a la familia.'}
        </div>
      </div>
    </Tarjeta>
  );
}
