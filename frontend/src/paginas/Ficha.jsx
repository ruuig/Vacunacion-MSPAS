import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bell, BookOpen, CalendarDays, CalendarX, Plus, CheckCircle2, ClipboardList, Clock, Hash, MapPin, Pencil, Phone, Printer, Syringe, Trash2, X,
} from 'lucide-react';
import { api } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import RegistrarDosis from '../componentes/RegistrarDosis.jsx';
import Vacunar from '../componentes/Vacunar.jsx';
import VistaCuaderno from '../componentes/VistaCuaderno.jsx';
import SuplementosNino from '../componentes/SuplementosNino.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Cargando, EncabezadoImpresion, MenuMas, Mensaje, Tabla, Tarjeta, Vacio, iniciales } from '../componentes/ui.jsx';
import { Estado, plural, tonoDe } from '../componentes/Estado.jsx';
import {
  ESTADO_REGISTRO, LINGUISTICAS, MEDIOS, PUEBLOS, RESULTADOS, TIPO_CUADERNO,
  cuadernoFila, diasDesde, edad, fecha, puede, recordarNino,
} from '../util.js';

const PARENTESCO = { madre: 'Madre', padre: 'Padre', otro: 'Responsable' };

/** "hoy", "mañana", "en 12 días" o "hace 3 días": la fecha absoluta sola obliga a hacer la cuenta. */
function relativo(f) {
  const d = -diasDesde(f);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}

export default function Ficha() {
  const { id } = useParams();
  const { usuario, refrescarAlertas } = useSesion();
  const { pedirTexto, avisar } = useDialogos();
  const columnas = useCatalogo('columnas');
  const [nino, setNino] = useState(null);
  const [esquema, setEsquema] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [modal, setModal] = useState(null); // null | { columna?, serie? }
  const [vacunar, setVacunar] = useState(null); // null | 'normal' | 'sin' (vino pero no se vacunó)
  const [resultado, setResultado] = useState(null);
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
    avisar('Dosis registrada correctamente.');
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

  return (
    <>
      <EncabezadoImpresion titulo="Historial vacunal" detalle={`Impreso el ${fecha(new Date().toISOString())}`} />
      <div className="pagina-cab no-imprimir" style={{ marginBottom: '1rem' }}>
        <div className="miga"><Link to="/ninos">Niñas y niños</Link> › Ficha</div>
      </div>

      <section className="tarjeta">
        <div className="ficha-cab">
          <div className={`ficha-avatar ${nino.sexo === 'M' ? 'mujer' : ''}`}>{iniciales(nino.nombre_completo)}</div>
          <div className="datos">
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h1>{nino.nombre_completo}</h1>
              <Estado de={estadoVisible} grande />
            </div>
            <div className="meta-lista">
              <span><CalendarDays size={15} />{nino.sexo === 'M' ? 'Niña' : 'Niño'} · {edad(nino.fecha_nacimiento)} · nació el {fecha(nino.fecha_nacimiento)}</span>
              <span><MapPin size={15} />{nino.comunidad}{nino.sector && ` · sector ${nino.sector}`}</span>
              <span><BookOpen size={15} />{cuadernoFila(nino)}{nino.cuaderno_tipo && ` (${TIPO_CUADERNO[nino.cuaderno_tipo]})`}</span>
              {nino.cui && <span><Hash size={15} />CUI {nino.cui}</span>}
              <span>Pueblo {PUEBLOS[nino.pueblo]}{nino.pueblo === 2 && `, ${LINGUISTICAS[nino.comunidad_linguistica]}`}</span>
            </div>
            <div className="contacto-ficha">
              <span className="rotulo">{resp ? PARENTESCO[resp.parentesco] : 'Responsable'}</span>
              <strong>{resp?.nombre_completo || 'Sin registrar'}</strong>
              {resp?.telefono ? <a href={`tel:${resp.telefono}`}><Phone size={14} /> {resp.telefono}</a> : resp && <span className="tenue">Sin teléfono</span>}
              {resp?.idioma_preferente === 'poqomam' && <span className="etiqueta celeste">Habla poqomam</span>}
            </div>
          </div>
          <div className="acciones no-imprimir" style={{ margin: 0 }}>
            {puede(usuario.rol, 'enfermera', 'vacunador') && <Link className="btn" to={`/ninos/${id}/editar`}><Pencil size={16} />Editar</Link>}
            <button className="btn" onClick={() => window.print()}><Printer size={16} />Imprimir</button>
            {operativo && <MenuMas opciones={[{ texto: 'Otra vacuna o dato del carné', icono: Plus, onClick: () => setModal({}) }]} />}
          </div>
        </div>

        {activo && (
          <div className={`franja-estado t-${tonoFranja}`}>
            <span className="ic">{atrasadas.length ? <Clock size={22} /> : tocaHoy.length ? <Syringe size={22} /> : <CheckCircle2 size={22} />}</span>
            <div className="texto">
              {tocaHoy.length ? (
                <>
                  <strong>
                    Hoy le {tocaHoy.length === 1 ? 'toca 1 vacuna' : `tocan ${tocaHoy.length} vacunas`}
                    {atrasoDesde && <em> · atrasado desde el {fecha(atrasoDesde)} ({plural(diasAtraso, 'día', 'días')})</em>}
                  </strong>
                  <span>{tocaHoy.map((d) => d.etiqueta).join(' · ')}</span>
                </>
              ) : esquema.proximaCita ? (
                <>
                  <strong>Hoy no le toca ninguna vacuna</strong>
                  <span>Próxima cita: <b>{fecha(esquema.proximaCita)}</b> ({relativo(esquema.proximaCita)}) · {esquema.proximaCitaVacunas.join(', ')}</span>
                </>
              ) : (
                <><strong>Esquema completo para su edad</strong><span>No tiene vacunas pendientes.</span></>
              )}
            </div>
            {operativo && tocaHoy.length > 0 && (
              <div className="botones no-imprimir">
                <button className="btn btn-grande" onClick={() => setVacunar('sin')}>Vino pero no se vacunó</button>
                <button className="btn btn-verde btn-grande" onClick={() => setVacunar('normal')}><Syringe size={20} />Vacunar ahora</button>
              </div>
            )}
          </div>
        )}
      </section>

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
              <Mensaje tipo="aviso" className="mt">Se guardó con advertencias (registro histórico):<ul>{resultado.advertencias.map((a) => <li key={a}>{a}</li>)}</ul></Mensaje>
            )}
          </div>
        </section>
      )}

      <div className={casos.length > 0 ? 'col-principal' : ''}>
        <div>
          <Tarjeta titulo="Carné de vacunación" icono={Syringe} cuerpo={false}>
            <VistaCuaderno columnas={columnas} celdas={nino.celdas} dosis={esquema.dosis} />
          </Tarjeta>
        </div>

        {casos.length > 0 && (
          <div className="no-imprimir lado-primero">
            <Seguimiento ninoId={id} casos={casos} atrasadas={atrasadas} atrasoDesde={atrasoDesde} diasAtraso={diasAtraso}
              estado={esquema.estadoNino} contactos={contactos} />
          </div>
        )}
      </div>

      {activo && <SuplementosNino ninoId={id} operativo={operativo} />}

      <Tarjeta titulo="Historial de aplicaciones" icono={ClipboardList} sub={plural(nino.aplicaciones.length, 'registro', 'registros')} cuerpo={false}>
        {nino.aplicaciones.length === 0 ? (
          <Vacio icono={Syringe} titulo="Sin dosis registradas">
            {operativo ? 'Use "Vacunar ahora" para la atención de hoy, o el menú ⋯ para cargar antecedentes del carné.' : null}
          </Vacio>
        ) : (
          <Tabla>
            <thead><tr><th>Fecha</th><th>Vacuna</th><th>Lote</th><th>Lugar</th><th>Registró</th><th className="no-imprimir" /></tr></thead>
            <tbody>
              {nino.aplicaciones.map((a) => {
                const cumple = a.dosis.join(', ');
                return (
                  <tr key={a.id} className={a.anulada ? 'anulada' : ''}>
                    <td className="fuerte">{fecha(a.fecha_aplicacion)}</td>
                    <td>
                      <span className="tachar">{a.producto}{a.formulacion && ` (${a.formulacion === 'sur' ? 'Sur' : 'Norte'})`}</span>
                      {a.es_recuperacion && <span className="etiqueta">Recuperación</span>}
                      {!a.fuente_primaria && <span className="etiqueta">Antecedente</span>}
                      {a.digitado_desde_cuaderno && <span className="etiqueta">Desde cuaderno</span>}
                      {cumple && cumple !== a.producto && <span className="sub">Cumple: {cumple}</span>}
                      {a.anulada && <span className="sub" style={{ color: 'var(--rojo)' }}>Anulada: {a.motivo_anulacion}</span>}
                    </td>
                    <td>{a.lote || '—'}</td>
                    <td>{a.establecimiento || '—'}</td>
                    <td>{a.responsable_informacion}{a.cargo && <span className="sub">{a.cargo}</span>}</td>
                    <td className="no-imprimir celda-fin">
                      {usuario.rol === 'enfermera' && !a.anulada && (
                        <MenuMas etiqueta="Acciones de esta dosis" opciones={[{ texto: 'Anular dosis', icono: Trash2, peligro: true, onClick: () => anular(a) }]} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      {vacunar && <Vacunar ninoId={id} nombre={nino.nombre_completo} esquema={esquema} sinVacunar={vacunar === 'sin'}
        onCerrar={() => setVacunar(null)}
        onTerminado={(r) => { setVacunar(null); if (r.hechas.length) avisar(r.hechas.length === 1 ? 'Vacuna guardada.' : 'Vacunas guardadas.'); cargar(); refrescarAlertas(); }} />}
      {modal && <RegistrarDosis ninoId={id} esquema={esquema} columna={modal.columna} serieSugerida={modal.serie}
        onCerrar={() => setModal(null)} onRegistrado={alRegistrar} />}
    </>
  );
}

/** Por qué el niño está en Pendientes, en una sola tarjeta: motivos, último contacto y una única acción. */
function Seguimiento({ ninoId, casos, atrasadas, atrasoDesde, diasAtraso, estado, contactos }) {
  const tipos = new Set(casos.map((a) => a.tipo));
  const inasistencias = casos.filter((a) => a.tipo === 'inasistencia');
  const ultimo = contactos[0];
  return (
    <Tarjeta titulo="Por qué está en pendientes" icono={Bell} cuerpo={false}
      pie={<Link className="btn btn-primario btn-bloque" to={`/alertas?nino=${ninoId}`}><Phone size={16} />Registrar llamada o visita</Link>}>
      <div className="tarjeta-cuerpo motivos">
        <Estado de={estado === 'proximo' || estado === 'al_dia' ? [...tipos][0] : estado} grande />
        <ul>
          {tipos.has('dosis_cero') && <li><b>Dosis cero:</b> no ha recibido la primera pentavalente.</li>}
          {tipos.has('abandono') && <li><b>Abandono:</b> inició el esquema y lleva más de 90 días sin continuar.</li>}
          {atrasadas.length > 0 && (
            <li>
              <b>Atrasado en {plural(atrasadas.length, 'vacuna', 'vacunas')}</b> desde el {fecha(atrasoDesde)} ({plural(diasAtraso, 'día', 'días')}).
              <span className="sub">{atrasadas.map((d) => d.etiqueta).join(' · ')}</span>
            </li>
          )}
          {inasistencias.map((a) => (
            <li key={a.id}><CalendarX size={14} style={{ verticalAlign: '-2px', color: 'var(--morado)' }} /> No llegó a la jornada o cita (anotado el {fecha(a.fecha_generada)}).</li>
          ))}
        </ul>
        <div className="ultimo-contacto">
          {ultimo
            ? <>Último contacto: <b>{fecha(ultimo.fecha)}</b> · {MEDIOS[ultimo.medio]} · {RESULTADOS[ultimo.resultado]}{ultimo.fecha_compromiso && <> · vendrá el <b>{fecha(ultimo.fecha_compromiso)}</b></>}</>
            : 'Todavía nadie ha llamado ni visitado a la familia.'}
        </div>
      </div>
    </Tarjeta>
  );
}
