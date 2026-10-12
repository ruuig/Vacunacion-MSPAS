import { Fragment, useCallback, useEffect, useState } from 'react';
import { Building2, KeyRound, ListTree, MapPin, Plus, Save, ScrollText, SlidersHorizontal, Syringe, UserPlus, Users } from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { invalidarCatalogo, useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Encabezado, Mensaje, Pestanas, Tabla, Tarjeta, iniciales } from '../componentes/ui.jsx';
import { Estado } from '../componentes/Estado.jsx';

const VISTAS = [
  ['usuarios', <><Users size={15} />Usuarios</>],
  ['parametros', <><SlidersHorizontal size={15} />Parámetros</>],
  ['esquema', <><Syringe size={15} />Esquema</>],
  ['territorio', <><MapPin size={15} />Territorio</>],
  ['bitacora', <><ScrollText size={15} />Bitácora</>],
];
const ROLES = { administrador: 'Administrador', enfermera: 'Enfermera', vacunador: 'Personal de vacunación' };
const TIPOS_COMUNIDAD = { casco_urbano: 'Casco urbano', barrio: 'Barrio', aldea: 'Aldea', caserio: 'Caserío', canton: 'Cantón' };

export default function Admin() {
  const [vista, setVista] = useState('usuarios');
  return (
    <>
      <Encabezado titulo="Administración" descripcion="Usuarios, parámetros del motor de cálculo, esquema de vacunación, catálogo territorial y auditoría." />
      <Pestanas valor={vista} onCambio={setVista} opciones={VISTAS} />
      {vista === 'usuarios' && <Usuarios />}
      {vista === 'parametros' && <Parametros />}
      {vista === 'esquema' && <Esquema />}
      {vista === 'territorio' && <Territorio />}
      {vista === 'bitacora' && <Bitacora />}
    </>
  );
}

function useCarga(ruta) {
  const [datos, setDatos] = useState([]);
  const [error, setError] = useState('');
  const cargar = useCallback(() => { api(ruta).then(setDatos).catch((e) => setError(e.message)); }, [ruta]);
  useEffect(cargar, [cargar]);
  return [datos, cargar, error, setError];
}

/** Ejecuta una acción, muestra el aviso y recarga; los errores van al mensaje de la pantalla. */
function useAccion(cargar, setError) {
  const { avisar } = useDialogos();
  return async (fn, ok) => {
    setError('');
    try { await fn(); avisar(ok); cargar(); return true; } catch (e) { setError(e.message); return false; }
  };
}

function Usuarios() {
  const { usuario: yo } = useSesion();
  const { pedirTexto } = useDialogos();
  const [usuarios, cargar, error, setError] = useCarga('/admin/usuarios');
  const accion = useAccion(cargar, setError);
  const VACIO = { nombre: '', cargo: '', usuario: '', contrasena: '', rol: 'vacunador' };
  const [nuevo, setNuevo] = useState(VACIO);
  const set = (k) => (e) => setNuevo({ ...nuevo, [k]: e.target.value });

  const crear = async (e) => {
    e.preventDefault();
    if (await accion(() => api('/admin/usuarios', { method: 'POST', body: nuevo }), `Usuario ${nuevo.usuario} creado.`)) setNuevo(VACIO);
  };
  const cambiar = (u, body, ok) => accion(() => api('/admin/usuarios/' + u.id, { method: 'PUT', body }), ok);
  const nuevaContrasena = async (u) => {
    const c = await pedirTexto({ titulo: `Nueva contraseña para ${u.usuario}`, etiqueta: 'Contraseña (mínimo 8 caracteres)', aceptar: 'Cambiar contraseña',
      mensaje: 'El usuario queda desbloqueado. Comuníquele la contraseña en persona.' });
    if (c) cambiar(u, { contrasena: c }, 'Contraseña cambiada y usuario desbloqueado.');
  };

  return (
    <>
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      <form onSubmit={crear}>
        <Tarjeta titulo="Nuevo usuario" icono={UserPlus}
          pie={<div className="acciones"><button className="btn btn-primario"><Plus size={17} />Crear usuario</button></div>}>
          <div className="rejilla">
            <Campo etiqueta="Nombre completo" requerido><input required value={nuevo.nombre} onChange={set('nombre')} /></Campo>
            <Campo etiqueta="Cargo"><input placeholder="Auxiliar de enfermería…" value={nuevo.cargo} onChange={set('cargo')} /></Campo>
            <Campo etiqueta="Usuario" requerido><input required value={nuevo.usuario} onChange={set('usuario')} autoComplete="off" autoCapitalize="none" /></Campo>
            <Campo etiqueta="Contraseña" requerido ayuda="Mínimo 8 caracteres"><input required type="password" minLength={8} value={nuevo.contrasena} onChange={set('contrasena')} autoComplete="new-password" /></Campo>
            <Campo etiqueta="Rol" requerido><select value={nuevo.rol} onChange={set('rol')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          </div>
        </Tarjeta>
      </form>
      <Tabla>
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Último acceso</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className={u.activo ? '' : 'anulada'}>
              <td>
                <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center' }}>
                  <span className="avatar" style={{ width: 34, height: 34, fontSize: '.75rem' }}>{iniciales(u.nombre)}</span>
                  <div><span className="fuerte">{u.nombre}</span><span className="sub">{u.cargo}</span></div>
                </div>
              </td>
              <td><code>{u.usuario}</code></td>
              <td>
                <select value={u.rol} disabled={u.id === yo.id} onChange={(e) => cambiar(u, { rol: e.target.value }, 'Rol actualizado.')} style={{ minWidth: 170 }}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td>{u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-GT') : '—'}</td>
              <td><Estado de={!u.activo ? 'desactivado' : u.intentos_fallidos >= 5 ? 'bloqueado' : 'activo'} /></td>
              <td className="celda-fin">
                <span className="botones-fila">
                  <button className="btn btn-sm" onClick={() => nuevaContrasena(u)}><KeyRound size={14} />Contraseña</button>
                  {u.intentos_fallidos >= 5 && <button className="btn btn-sm" onClick={() => cambiar(u, { desbloquear: true }, 'Usuario desbloqueado.')}>Desbloquear</button>}
                  {u.id !== yo.id && <button className={`btn btn-sm ${u.activo ? 'btn-peligro' : ''}`} onClick={() => cambiar(u, { activo: !u.activo }, u.activo ? 'Usuario desactivado.' : 'Usuario activado.')}>{u.activo ? 'Desactivar' : 'Activar'}</button>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}

function Parametros() {
  const [parametros, cargar, error, setError] = useCarga('/admin/parametros');
  const accion = useAccion(cargar, setError);
  const [editados, setEditados] = useState({});
  async function guardar(p) {
    if (await accion(() => api('/admin/parametros/' + p.clave, { method: 'PUT', body: { valor: editados[p.clave] } }), `${p.clave} actualizado.`))
      setEditados({ ...editados, [p.clave]: undefined });
  }
  return (
    <>
      <Mensaje tipo="info">Valores iniciales a validar con la enfermera jefa. Los cambios aplican desde el siguiente cálculo del motor.</Mensaje>
      <RecalcularFotos />
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      <Tabla>
        <thead><tr><th>Parámetro</th><th>Descripción</th><th>Valor</th><th /></tr></thead>
        <tbody>
          {parametros.map((p) => {
            const cambiado = editados[p.clave] !== undefined && editados[p.clave] !== p.valor;
            return (
              <tr key={p.clave}>
                <td><code>{p.clave}</code></td>
                <td style={{ maxWidth: 420 }}>{p.descripcion}</td>
                <td><input value={editados[p.clave] ?? p.valor} onChange={(e) => setEditados({ ...editados, [p.clave]: e.target.value })} style={{ maxWidth: 200 }} /></td>
                <td className="celda-fin">{cambiado && <button className="btn btn-sm btn-primario" onClick={() => guardar(p)}><Save size={14} />Guardar</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </>
  );
}

/** Las tendencias del tablero salen de una foto mensual que se guarda sola el día 1; aquí se puede repetir. */
function RecalcularFotos() {
  const { avisar } = useDialogos();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [ocupado, setOcupado] = useState(false);
  async function recalcular() {
    setOcupado(true);
    try {
      const r = await api('/admin/fotos', { method: 'POST', body: { anio } });
      avisar(`Tablero actualizado: ${r.meses.length} meses de ${anio}.`);
    } catch (e) { avisar(e.message, 'error'); }
    setOcupado(false);
  }
  return (
    <Tarjeta titulo="Tendencias del tablero" icono={SlidersHorizontal} sub="La foto de cada mes se guarda sola el día 1. Recalcule si cambió parámetros o corrigió datos antiguos.">
      <div className="filtros" style={{ marginBottom: 0 }}>
        <Campo etiqueta="Año"><input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ maxWidth: 140 }} /></Campo>
        <div style={{ flex: '0 0 auto' }}><button className="btn btn-primario" disabled={ocupado} onClick={recalcular}>{ocupado ? 'Calculando…' : 'Recalcular meses del año'}</button></div>
      </div>
    </Tarjeta>
  );
}

const CAMPOS_ESQUEMA = [
  ['edad_recomendada_dias', 'Edad rec.'], ['edad_minima_dias', 'Edad mín.'], ['edad_maxima_dias', 'Edad máx.'],
  ['intervalo_minimo_dias', 'Interv. mín.'], ['intervalo_recomendado_dias', 'Interv. rec.'],
];

function Esquema() {
  const [dosis, cargar, error, setError] = useCarga('/admin/esquema');
  const accion = useAccion(cargar, setError);
  const [edit, setEdit] = useState({});
  const valor = (d, k) => edit[d.id]?.[k] ?? d[k] ?? '';
  const set = (d, k) => (e) => setEdit({ ...edit, [d.id]: { ...edit[d.id], [k]: e.target.value } });
  async function guardar(d) {
    const body = Object.fromEntries(Object.entries(edit[d.id]).map(([k, v]) => [k, v === '' ? null : Number(v)]));
    if (await accion(() => api('/admin/esquema/' + d.id, { method: 'PUT', body }), `${d.etiqueta} actualizada.`)) setEdit({ ...edit, [d.id]: undefined });
  }
  return (
    <>
      <Mensaje tipo="info">Edades e intervalos en días. El esquema se guarda como datos: cambiarlo no requiere tocar el código.</Mensaje>
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      <Tabla>
        <thead><tr><th>Dosis</th>{CAMPOS_ESQUEMA.map(([, t]) => <th key={t}>{t}</th>)}<th /></tr></thead>
        <tbody>
          {dosis.map((d) => (
            <tr key={d.id}>
              <td><span className="fuerte">{d.etiqueta}</span><span className="sub">{d.serie}{d.estacional && ' · estacional'}{d.informativa && ' · no cuenta'}</span></td>
              {CAMPOS_ESQUEMA.map(([k]) => <td key={k}><input type="number" min="0" className="num-input" value={valor(d, k)} onChange={set(d, k)} /></td>)}
              <td className="celda-fin">{edit[d.id] && <button className="btn btn-sm btn-primario" onClick={() => guardar(d)}><Save size={14} />Guardar</button>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}

function Territorio() {
  const [territorios, cargarT, error, setError] = useCarga('/comunidades/territorios');
  const [comunidades, setComunidades] = useState([]);
  const establecimientos = useCatalogo('establecimientos');
  const [nuevaC, setNuevaC] = useState({ nombre: '', tipo: 'aldea', sector_id: '' });
  const [nuevoT, setNuevoT] = useState({ servicio_id: '', nombre: '' });
  const [nuevoS, setNuevoS] = useState({ territorio_id: '', nombre: '' });
  const cargarC = useCallback(() => { api('/catalogos/comunidades').then(setComunidades).catch(() => {}); }, []);
  useEffect(cargarC, [cargarC]);
  const accion = useAccion(() => { invalidarCatalogo('comunidades'); cargarT(); cargarC(); }, setError);
  const sectores = territorios.flatMap((t) => t.sectores.map((s) => ({ ...s, territorio: t.nombre })));

  return (
    <>
      <Mensaje tipo="info">Jerarquía del carné: servicio de salud → territorio → sector → comunidad. Las jornadas y alertas usan la comunidad.</Mensaje>
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      <div className="dos-col" style={{ marginBottom: '1.25rem' }}>
        <form onSubmit={(e) => { e.preventDefault(); accion(() => api('/comunidades/territorios', { method: 'POST', body: { ...nuevoT, servicio_id: Number(nuevoT.servicio_id) } }), 'Territorio creado.'); }}>
          <Tarjeta titulo="Territorio" icono={Building2} pie={<div className="acciones"><button className="btn btn-sm"><Plus size={15} />Agregar territorio</button></div>}>
            <div className="rejilla">
              <Campo etiqueta="Servicio" requerido><select required value={nuevoT.servicio_id} onChange={(e) => setNuevoT({ ...nuevoT, servicio_id: e.target.value })}>
                <option value="">Seleccione…</option>{establecimientos.filter((x) => x.es_local).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select></Campo>
              <Campo etiqueta="Nombre o código" requerido><input required value={nuevoT.nombre} onChange={(e) => setNuevoT({ ...nuevoT, nombre: e.target.value })} /></Campo>
            </div>
          </Tarjeta>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); accion(() => api('/comunidades/sectores', { method: 'POST', body: { ...nuevoS, territorio_id: Number(nuevoS.territorio_id) } }), 'Sector creado.'); }}>
          <Tarjeta titulo="Sector" icono={ListTree} pie={<div className="acciones"><button className="btn btn-sm"><Plus size={15} />Agregar sector</button></div>}>
            <div className="rejilla">
              <Campo etiqueta="Territorio" requerido><select required value={nuevoS.territorio_id} onChange={(e) => setNuevoS({ ...nuevoS, territorio_id: e.target.value })}>
                <option value="">Seleccione…</option>{territorios.map((t) => <option key={t.id} value={t.id}>{t.servicio} · {t.nombre}</option>)}
              </select></Campo>
              <Campo etiqueta="Número o nombre" requerido><input required value={nuevoS.nombre} onChange={(e) => setNuevoS({ ...nuevoS, nombre: e.target.value })} /></Campo>
            </div>
          </Tarjeta>
        </form>
      </div>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (await accion(() => api('/comunidades', { method: 'POST', body: { ...nuevaC, sector_id: nuevaC.sector_id ? Number(nuevaC.sector_id) : null } }), 'Comunidad creada.'))
          setNuevaC({ nombre: '', tipo: 'aldea', sector_id: '' });
      }}>
        <Tarjeta titulo="Nueva comunidad" icono={MapPin} pie={<div className="acciones"><button className="btn btn-primario"><Plus size={17} />Agregar comunidad</button></div>}>
          <div className="rejilla">
            <Campo etiqueta="Nombre" requerido><input required value={nuevaC.nombre} onChange={(e) => setNuevaC({ ...nuevaC, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><select value={nuevaC.tipo} onChange={(e) => setNuevaC({ ...nuevaC, tipo: e.target.value })}>
              {Object.entries(TIPOS_COMUNIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo etiqueta="Sector"><select value={nuevaC.sector_id} onChange={(e) => setNuevaC({ ...nuevaC, sector_id: e.target.value })}>
              <option value="">—</option>{sectores.map((s) => <option key={s.id} value={s.id}>{s.territorio} · {s.nombre}</option>)}</select></Campo>
          </div>
        </Tarjeta>
      </form>
      <Tabla>
        <thead><tr><th>Comunidad</th><th>Tipo</th><th>Sector</th></tr></thead>
        <tbody>
          {comunidades.map((c) => (
            <tr key={c.id}>
              <td className="fuerte">{c.nombre}</td>
              <td>{TIPOS_COMUNIDAD[c.tipo]}</td>
              <td>
                <select value={c.sector_id || ''} style={{ minWidth: 200 }}
                  onChange={(e) => accion(() => api('/comunidades/' + c.id, { method: 'PUT', body: { sector_id: e.target.value ? Number(e.target.value) : null } }), `${c.nombre} actualizada.`)}>
                  <option value="">Sin sector</option>
                  {sectores.map((s) => <option key={s.id} value={s.id}>{s.territorio} · {s.nombre}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}

function Bitacora() {
  const [f, setF] = useState({ desde: '', hasta: '', tabla: '', accion: '' });
  const [filas] = useCarga('/admin/bitacora' + qs(f));
  const [abierta, setAbierta] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="tarjeta"><div className="tarjeta-cuerpo">
        <div className="filtros" style={{ marginBottom: 0 }}>
          <Campo etiqueta="Desde"><input type="date" value={f.desde} onChange={set('desde')} /></Campo>
          <Campo etiqueta="Hasta"><input type="date" value={f.hasta} onChange={set('hasta')} /></Campo>
          <Campo etiqueta="Tabla"><select value={f.tabla} onChange={set('tabla')}>
            <option value="">Todas</option>
            {['nino', 'responsable', 'aplicacion', 'alerta', 'seguimiento', 'jornada', 'cuaderno', 'usuario', 'parametro', 'esquema_dosis'].map((t) => <option key={t}>{t}</option>)}
          </select></Campo>
          <Campo etiqueta="Acción"><select value={f.accion} onChange={set('accion')}>
            <option value="">Todas</option>
            {['login', 'login_fallido', 'crear', 'editar', 'anular', 'cerrar', 'cambiar_contrasena'].map((a) => <option key={a}>{a}</option>)}
          </select></Campo>
        </div>
      </div></div>
      <p className="tenue" style={{ marginBottom: '.75rem' }}>Solo inserción: ningún registro de la bitácora se puede modificar ni borrar. Últimos 300. Toque una fila para ver el detalle.</p>
      <Tabla adaptable={false}>
        <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Tabla</th><th>Registro</th><th>IP</th></tr></thead>
        <tbody>
          {filas.map((b) => (
            <Fragment key={b.id}>
              <tr className={`clicable ${abierta === b.id ? 'seleccionada' : ''}`} onClick={() => setAbierta(abierta === b.id ? null : b.id)}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(b.fecha_hora).toLocaleString('es-GT')}</td><td>{b.usuario || '—'}</td>
                <td><span className="chip">{b.accion}</span></td>
                <td><code>{b.tabla}</code></td><td>{b.registro_id}</td><td className="tenue">{b.ip}</td>
              </tr>
              {abierta === b.id && (
                <tr><td colSpan={6}>
                  <div className="dos-col">
                    <div><div className="seccion-titulo" style={{ marginTop: 0 }}>Antes</div><pre className="json">{b.antes ? JSON.stringify(b.antes, null, 1) : '—'}</pre></div>
                    <div><div className="seccion-titulo" style={{ marginTop: 0 }}>Después</div><pre className="json">{b.despues ? JSON.stringify(b.despues, null, 1) : '—'}</pre></div>
                  </div>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
