// Registro de niña o niño en 3 pasos (páginas 1 y 2 del SIGSA 5a). Una pregunta grande por pantalla;
// los campos menos usados quedan en "Más datos". El cuaderno y la fila se sugieren solos.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Baby, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Phone, User, Users } from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Encabezado, InputCui, InputNombreDoble, Mensaje } from '../componentes/ui.jsx';
import { DEPARTAMENTOS, ESTADO_REGISTRO, LINGUISTICAS, MUNICIPIOS, PUEBLOS, cuadernoFila, edad, fecha, hoy, sumarDias } from '../util.js';

const VACIO_NINO = {
  cuaderno_id: '', fila: '', cui: '', primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '',
  fecha_nacimiento: '', nacimiento_departamento: 'Jalapa', nacimiento_municipio: 'San Luis Jilotepeque', nacimiento_comunidad: '',
  sexo: '', pueblo: '', comunidad_linguistica: '23', numero_registro_carne: '', fecha_registro_carne: '', nombre_padre: '', estado: 'activo',
};
const VACIO_RESP = {
  id: null, cui: '', primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '', fecha_nacimiento: '',
  departamento: 'Jalapa', municipio: 'San Luis Jilotepeque', comunidad_id: '', direccion_detalle: '', numero_casa: '',
  numero_sector: '', telefono: '', idioma_preferente: 'espanol',
};
const hace7Anios = () => sumarDias(`${Number(hoy().slice(0, 4)) - 7}${hoy().slice(4)}`, 1);
const llenar = (vacio, datos) => Object.fromEntries(Object.keys(vacio).map((k) => [k, datos[k] ?? vacio[k] ?? '']));
const PASOS = ['La niña o el niño', 'Mamá, papá o responsable', 'Revisar y guardar'];

function Municipio({ departamento, ...props }) {
  const lista = MUNICIPIOS[departamento] || [];
  return (
    <>
      <input list={`mun-${departamento}`} {...props} />
      <datalist id={`mun-${departamento}`}>{lista.map((m) => <option key={m} value={m} />)}</datalist>
    </>
  );
}

function Plegable({ titulo, children, abierto: inicial = false, forzar = 0 }) {
  const [abierto, setAbierto] = useState(inicial);
  // Si falta un dato obligatorio adentro, se abre sola para mostrarlo
  useEffect(() => { if (forzar) setAbierto(true); }, [forzar]);
  return (
    <div style={{ marginTop: '1rem' }}>
      <button type="button" className="btn btn-fantasma" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <ChevronDown size={18} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />{titulo}
      </button>
      {abierto && <div style={{ marginTop: '.75rem' }}>{children}</div>}
    </div>
  );
}

export default function NinoForm() {
  const { id } = useParams();
  const editando = Boolean(id);
  const [params] = useSearchParams();
  const { usuario } = useSesion();
  const ir = useNavigate();
  const comunidades = useCatalogo('comunidades');
  const [paso, setPaso] = useState(1);
  const [abrirMas, setAbrirMas] = useState(0);
  const [cuadernos, setCuadernos] = useState([]);
  const [nino, setNino] = useState({ ...VACIO_NINO, cuaderno_id: params.get('cuaderno') || '', fila: params.get('fila') || '' });
  const [resp, setResp] = useState(VACIO_RESP);
  const [parentesco, setParentesco] = useState('madre');
  const [respExistente, setRespExistente] = useState(null);
  const [sugerido, setSugerido] = useState(null);
  const [cuadernoElegido, setCuadernoElegido] = useState(Boolean(params.get('cuaderno')));
  const [duplicados, setDuplicados] = useState([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api('/cuadernos').then(setCuadernos).catch(() => {}); }, []);

  useEffect(() => {
    if (!editando) return;
    api('/ninos/' + id).then((n) => {
      setNino(llenar(VACIO_NINO, { ...n, pueblo: String(n.pueblo), comunidad_linguistica: String(n.comunidad_linguistica) }));
      const r = n.responsables.find((x) => x.es_principal) || n.responsables[0];
      if (r) { setResp(llenar(VACIO_RESP, r)); setParentesco(r.parentesco); }
      setCuadernoElegido(true);
    }).catch((e) => setError(e.message));
  }, [id, editando]);

  // Sugerir cuaderno de la comunidad y la siguiente fila libre; se aplica solo si la persona no eligió otro
  useEffect(() => {
    if (editando || !resp.comunidad_id) { setSugerido(null); return; }
    api('/cuadernos/sugerido' + qs({ comunidad_id: resp.comunidad_id })).then((s) => {
      setSugerido(s);
      if (s && !cuadernoElegido) setNino((n) => ({ ...n, cuaderno_id: String(s.id), fila: String(s.fila) }));
    }).catch(() => {});
  }, [resp.comunidad_id, editando, cuadernoElegido]);

  // Duplicados: mismo CUI, nombre aproximado con la misma fecha, o mismo responsable con fecha cercana
  useEffect(() => {
    if (editando) return;
    const nombre = [nino.primer_nombre, nino.segundo_nombre, nino.primer_apellido, nino.segundo_apellido].filter(Boolean).join(' ');
    if (!(nino.cui.length === 13 || (nombre.length >= 4 && nino.fecha_nacimiento) || (resp.cui.length === 13 && nino.fecha_nacimiento))) {
      setDuplicados([]);
      return;
    }
    const t = setTimeout(() => {
      api('/ninos/duplicados' + qs({ nombre, fechaNac: nino.fecha_nacimiento, cui: nino.cui.length === 13 ? nino.cui : '',
        cuiResponsable: resp.cui.length === 13 ? resp.cui : '' })).then(setDuplicados).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [nino.primer_nombre, nino.segundo_nombre, nino.primer_apellido, nino.segundo_apellido, nino.fecha_nacimiento, nino.cui, resp.cui, editando]);

  // CUI del responsable ya registrado: reutilizar la persona (hermanos)
  async function buscarResponsable(cui) {
    if (editando || cui.length !== 13) return;
    const [r] = await api('/responsables' + qs({ cui })).catch(() => []);
    setRespExistente(r || null);
    if (r) setResp(llenar(VACIO_RESP, r));
  }

  const n = (k) => ({ value: nino[k], onChange: (e) => setNino({ ...nino, [k]: e.target.value }) });
  const r = (k) => ({ value: resp[k], onChange: (e) => setResp({ ...resp, [k]: e.target.value }) });
  const esMaya = nino.pueblo === '2';
  const cuadernosAnio = cuadernos.filter((c) => c.anio >= new Date().getFullYear() - 1 || String(c.id) === String(nino.cuaderno_id));
  const cuaderno = cuadernos.find((c) => String(c.id) === String(nino.cuaderno_id));
  const comunidad = comunidades.find((c) => String(c.id) === String(resp.comunidad_id));
  const avanzar = (e) => {
    e.preventDefault();
    const falta = (texto) => { setError(texto); setAbrirMas((x) => x + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    if (paso === 1 && !nino.sexo) { setError('Toque "Niña" o "Niño".'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (paso === 1 && !nino.nacimiento_departamento) return falta('Falta el departamento de nacimiento (en «Más datos del SIGSA 5a»).');
    if (paso === 1 && !String(nino.nacimiento_municipio).trim()) return falta('Falta el municipio de nacimiento (en «Más datos del SIGSA 5a»).');
    if (paso === 2 && !resp.departamento) return falta('Falta el departamento de la mamá o responsable (en «Más datos»).');
    if (paso === 2 && !String(resp.municipio).trim()) return falta('Falta el municipio de la mamá o responsable (en «Más datos»).');
    setError('');
    setPaso(paso + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const volver = () => { setPaso(paso - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  async function guardar(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const datos = { ...nino, pueblo: Number(nino.pueblo), comunidad_linguistica: esMaya ? Number(nino.comunidad_linguistica) : 23,
        cuaderno_id: nino.cuaderno_id ? Number(nino.cuaderno_id) : null, fila: nino.fila ? Number(nino.fila) : null };
      if (!editando || usuario.rol !== 'enfermera') delete datos.estado;
      const responsable = { ...resp, comunidad_id: Number(resp.comunidad_id) };
      let ninoId = id;
      if (editando) {
        await api('/ninos/' + id, { method: 'PUT', body: datos });
        if (resp.id) await api('/responsables/' + resp.id, { method: 'PUT', body: responsable });
      } else {
        ninoId = (await api('/ninos', { method: 'POST', body: { ...datos, parentesco, responsable } })).id;
      }
      ir('/ninos/' + ninoId);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const botones = (ultimo) => (
    <div className="acciones" style={{ justifyContent: 'space-between' }}>
      {paso > 1 ? <button type="button" className="btn btn-grande" onClick={volver}><ChevronLeft size={20} />Atrás</button>
        : <button type="button" className="btn btn-grande" onClick={() => ir(-1)}>Cancelar</button>}
      <button className={`btn btn-grande ${ultimo ? 'btn-verde' : 'btn-primario'}`} disabled={guardando} style={{ flex: '0 1 260px' }}>
        {ultimo ? <><Check size={20} />{guardando ? 'Guardando…' : 'Guardar ficha'}</> : <>Siguiente<ChevronRight size={20} /></>}
      </button>
    </div>
  );

  return (
    <>
      <Encabezado titulo={editando ? 'Editar ficha' : 'Registrar niña o niño nuevo'} migas={[['Niñas y niños', '/ninos'], [editando ? 'Editar' : 'Nuevo registro']]} />
      <div className="pasos-barra" aria-hidden="true">
        {PASOS.map((p, i) => <span key={p} className={i + 1 < paso ? 'hecho' : i + 1 === paso ? 'actual' : ''} />)}
      </div>
      <div className="paso-titulo">Paso {paso} de {PASOS.length} · {PASOS[paso - 1]}</div>
      <Mensaje tipo="error">{error}</Mensaje>

      {paso === 1 && (
        <form onSubmit={avanzar} className="tarjeta"><div className="tarjeta-cuerpo">
          <p className="paso-pregunta"><Baby size={24} style={{ verticalAlign: '-4px', color: 'var(--celeste-2)' }} /> ¿Cómo se llama?</p>
          <div className="rejilla">
            <Campo etiqueta="Nombres" requerido className="doble" ayuda="Uno o dos, como aparecen en la inscripción">
              <InputNombreDoble required autoFocus placeholder="Ej. María José" primero={nino.primer_nombre} segundo={nino.segundo_nombre}
                onCambio={(primer_nombre, segundo_nombre) => setNino((x) => ({ ...x, primer_nombre, segundo_nombre }))} />
            </Campo>
            <Campo etiqueta="Apellidos" requerido className="doble" ayuda="Del papá y de la mamá">
              <InputNombreDoble required placeholder="Ej. López García" primero={nino.primer_apellido} segundo={nino.segundo_apellido}
                onCambio={(primer_apellido, segundo_apellido) => setNino((x) => ({ ...x, primer_apellido, segundo_apellido }))} />
            </Campo>
          </div>
          <p className="paso-pregunta" style={{ marginTop: '1.5rem' }}>¿Es niña o niño?</p>
          <div className="opciones dos" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {[['M', 'Niña'], ['H', 'Niño']].map(([v, t]) => (
              <button key={v} type="button" className={`opcion ${nino.sexo === v ? 'marcada' : ''}`} onClick={() => setNino({ ...nino, sexo: v })} aria-pressed={nino.sexo === v}
                style={{ justifyContent: 'center', fontSize: '1.05rem' }}>{t}</button>
            ))}
          </div>
          <div className="rejilla" style={{ marginTop: '1rem' }}>
            <Campo etiqueta="Fecha de nacimiento" requerido ayuda={nino.fecha_nacimiento ? `Tiene ${edad(nino.fecha_nacimiento)}` : 'Como aparece en el carné'}>
              <input type="date" required min={editando ? undefined : hace7Anios()} max={hoy()} {...n('fecha_nacimiento')} />
            </Campo>
            <Campo etiqueta="Pueblo" requerido>
              <select required {...n('pueblo')}>
                <option value="">Elija…</option>
                {Object.entries(PUEBLOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="CUI del niño" ayuda={nino.cui ? `${nino.cui.length} de 13 números` : 'Si ya lo tiene (13 números)'}>
              <InputCui value={nino.cui} onCambio={(cui) => setNino({ ...nino, cui })} />
            </Campo>
          </div>
          <Plegable titulo="Más datos del SIGSA 5a (lugar de nacimiento, carné, padre)" abierto={editando} forzar={abrirMas}>
            <div className="rejilla">
              <Campo etiqueta="Departamento de nacimiento" requerido>
                <select required {...n('nacimiento_departamento')}>{DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}</select>
              </Campo>
              <Campo etiqueta="Municipio de nacimiento" requerido><Municipio required departamento={nino.nacimiento_departamento} {...n('nacimiento_municipio')} /></Campo>
              <Campo etiqueta="Comunidad de nacimiento"><input {...n('nacimiento_comunidad')} /></Campo>
              <Campo etiqueta="Comunidad lingüística" ayuda={esMaya ? null : 'Solo para pueblo Maya'}>
                <select disabled={!esMaya} {...n('comunidad_linguistica')} value={esMaya ? nino.comunidad_linguistica : '23'}>
                  {Object.entries(LINGUISTICAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="No. de registro del carné"><input {...n('numero_registro_carne')} /></Campo>
              <Campo etiqueta="Fecha de registro del carné"><input type="date" max={hoy()} {...n('fecha_registro_carne')} /></Campo>
              <Campo etiqueta="Nombre del padre"><input {...n('nombre_padre')} /></Campo>
              {editando && usuario.rol === 'enfermera' && (
                <Campo etiqueta="Estado del registro">
                  <select {...n('estado')}>
                    {Object.entries(ESTADO_REGISTRO).map(([k, v]) => <option key={k} value={k} disabled={k === 'egresado'}>{v}</option>)}
                  </select>
                </Campo>
              )}
            </div>
          </Plegable>
          {botones(false)}
        </div></form>
      )}

      {paso === 2 && (
        <form onSubmit={avanzar} className="tarjeta"><div className="tarjeta-cuerpo">
          <p className="paso-pregunta"><Users size={24} style={{ verticalAlign: '-4px', color: 'var(--celeste-2)' }} /> ¿Quién lo trae?</p>
          <div className="opciones" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[['madre', 'Mamá'], ['padre', 'Papá'], ['otro', 'Otra persona']].map(([v, t]) => (
              <button key={v} type="button" disabled={editando} className={`opcion ${parentesco === v ? 'marcada' : ''}`} onClick={() => setParentesco(v)}
                aria-pressed={parentesco === v} style={{ justifyContent: 'center' }}>{t}</button>
            ))}
          </div>
          <div className="rejilla" style={{ marginTop: '1rem' }}>
            <Campo etiqueta="CUI (DPI) de la mamá o responsable" ayuda="Si ya vino con otro hijo, sus datos se llenan solos" className="doble">
              <InputCui value={resp.cui} onCambio={(cui) => { setResp({ ...resp, cui }); buscarResponsable(cui); }} autoFocus />
            </Campo>
          </div>
          {respExistente && <Mensaje tipo="exito" className="mt">Ya está registrada ({respExistente.ninos} niño/s): se usarán sus datos.</Mensaje>}
          <div className="rejilla" style={{ marginTop: '1rem' }}>
            <Campo etiqueta="Nombres" requerido>
              <InputNombreDoble required placeholder="Ej. Ana Lucía" primero={resp.primer_nombre} segundo={resp.segundo_nombre}
                onCambio={(primer_nombre, segundo_nombre) => setResp((x) => ({ ...x, primer_nombre, segundo_nombre }))} />
            </Campo>
            <Campo etiqueta="Apellidos" requerido>
              <InputNombreDoble required placeholder="Ej. García Pérez" primero={resp.primer_apellido} segundo={resp.segundo_apellido}
                onCambio={(primer_apellido, segundo_apellido) => setResp((x) => ({ ...x, primer_apellido, segundo_apellido }))} />
            </Campo>
            <Campo etiqueta="Teléfono" ayuda={resp.telefono ? '8 números' : 'Muy importante para avisarle de sus citas'}>
              <div className="con-icono"><Phone size={18} />
                <input type="tel" inputMode="numeric" pattern="\d{8}" maxLength={8} title="8 dígitos" placeholder="Ej. 45261234" {...r('telefono')} /></div>
            </Campo>
            <Campo etiqueta="¿En qué comunidad vive?" requerido className="doble">
              <select required {...r('comunidad_id')}>
                <option value="">Elija la comunidad…</option>
                {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.sector ? ` · ${c.sector}` : ''}</option>)}
              </select>
            </Campo>
          </div>
          <Plegable titulo="Más datos (dirección, idioma, fecha de nacimiento)" abierto={editando} forzar={abrirMas}>
            <div className="rejilla">
              <Campo etiqueta="Fecha de nacimiento"><input type="date" max={hoy()} {...r('fecha_nacimiento')} /></Campo>
              <Campo etiqueta="Idioma en que prefiere que le hablen">
                <select {...r('idioma_preferente')}><option value="espanol">Español</option><option value="poqomam">Poqomam</option></select>
              </Campo>
              <Campo etiqueta="Calle, zona, cantón o sector" className="ancho"><input {...r('direccion_detalle')} /></Campo>
              <Campo etiqueta="No. de casa"><input {...r('numero_casa')} /></Campo>
              <Campo etiqueta="No. de sector"><input {...r('numero_sector')} /></Campo>
              <Campo etiqueta="Departamento" requerido>
                <select required {...r('departamento')}>{DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}</select>
              </Campo>
              <Campo etiqueta="Municipio" requerido><Municipio required departamento={resp.departamento} {...r('municipio')} /></Campo>
            </div>
          </Plegable>
          {botones(false)}
        </div></form>
      )}

      {paso === 3 && (
        <form onSubmit={guardar} className="tarjeta"><div className="tarjeta-cuerpo">
          {duplicados.length > 0 && (
            <Mensaje tipo="aviso">
              <strong>¿Ya está registrado? Encontramos niños parecidos.</strong> Revíselos antes de guardar uno nuevo:
              <ul>
                {duplicados.map((d) => (
                  <li key={d.id}><Link to={`/ninos/${d.id}`}>{d.nombre_completo}</Link> · nació el {fecha(d.fecha_nacimiento)} · {d.comunidad} · {cuadernoFila(d)}</li>
                ))}
              </ul>
            </Mensaje>
          )}
          <p className="paso-pregunta"><Check size={24} style={{ verticalAlign: '-4px', color: 'var(--verde)' }} /> Revise que todo esté bien</p>
          <div className="nota-papel" style={{ display: 'grid', gap: '.65rem' }}>
            <div className="lectura-item t-info"><Baby size={18} />
              <span><strong>{[nino.primer_nombre, nino.segundo_nombre, nino.primer_apellido, nino.segundo_apellido].filter(Boolean).join(' ').toUpperCase()}</strong>
                <br />{nino.sexo === 'M' ? 'Niña' : 'Niño'} · nació el {fecha(nino.fecha_nacimiento)} ({edad(nino.fecha_nacimiento)}) · {PUEBLOS[nino.pueblo]}</span></div>
            <div className="lectura-item t-info"><User size={18} />
              <span><strong>{[resp.primer_nombre, resp.segundo_nombre, resp.primer_apellido, resp.segundo_apellido].filter(Boolean).join(' ')}</strong> ({{ madre: 'mamá', padre: 'papá', otro: 'responsable' }[parentesco]})
                <br />{comunidad?.nombre || '—'} · {resp.telefono ? `Tel. ${resp.telefono}` : 'sin teléfono'}</span></div>
          </div>
          {!resp.telefono && <Mensaje tipo="aviso" className="mt">Sin teléfono no se le podrá llamar si se atrasa. Si lo tiene, vuelva al paso 2 y agréguelo.</Mensaje>}

          <p className="fuerte" style={{ margin: '1.25rem 0 .5rem', color: 'var(--marino)' }}><BookOpen size={18} style={{ verticalAlign: '-3px' }} /> ¿Dónde se anota en el cuaderno?</p>
          {cuaderno ? (
            <div className="lectura-item t-ok"><Check size={18} /><span>Cuaderno <strong>{cuaderno.numero}/{cuaderno.anio}</strong>, fila <strong>{nino.fila}</strong>
              {sugerido && String(sugerido.id) === String(nino.cuaderno_id) && ' (siguiente fila libre de su comunidad)'}</span></div>
          ) : <div className="lectura-item t-atencion"><AlertTriangle size={18} /><span>Sin cuaderno: se puede asignar después.</span></div>}
          <Plegable titulo="Cambiar cuaderno o fila">
            <div className="rejilla">
              <Campo etiqueta="Cuaderno No." className="doble">
                <select value={nino.cuaderno_id} onChange={(e) => { setCuadernoElegido(true); setNino({ ...nino, cuaderno_id: e.target.value, fila: e.target.value ? nino.fila : '' }); }}>
                  <option value="">Sin cuaderno</option>
                  {cuadernosAnio.map((c) => <option key={c.id} value={c.id}>{c.numero}/{c.anio} · {c.comunidad || c.sector || c.servicio} ({c.ocupadas}/25)</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Fila" requerido={Boolean(nino.cuaderno_id)}>
                <input type="number" min="1" max="25" required={Boolean(nino.cuaderno_id)} value={nino.fila}
                  onChange={(e) => { setCuadernoElegido(true); setNino({ ...nino, fila: e.target.value }); }} />
              </Campo>
            </div>
          </Plegable>
          {botones(true)}
        </div></form>
      )}
    </>
  );
}
