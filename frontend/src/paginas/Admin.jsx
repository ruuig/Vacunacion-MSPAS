import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ArchiveRestore, Building2, DatabaseBackup, Download, ImageUp, KeyRound, Upload, ListTree, MapPin, Plus, RotateCcw, Save, ScrollText, SlidersHorizontal, Syringe, Trash2, UserPlus, Users,
} from 'lucide-react';
import { api, descargarArchivo, qs, subirArchivo } from '../api.js';
import Logo, { recargarLogo } from '../componentes/Logo.jsx';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { invalidarCatalogo, useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Cargando, Encabezado, Mensaje, Pestanas, Tabla, Tarjeta, Vacio, iniciales } from '../componentes/ui.jsx';
import { Estado } from '../componentes/Estado.jsx';

const VISTAS = [
  ['usuarios', <><Users size={15} />Usuarios</>],
  ['parametros', <><SlidersHorizontal size={15} />Parámetros</>],
  ['esquema', <><Syringe size={15} />Esquema</>],
  ['territorio', <><MapPin size={15} />Territorio</>],
  ['bitacora', <><ScrollText size={15} />Bitácora</>],
  ['respaldos', <><DatabaseBackup size={15} />Respaldos</>],
  ['logo', <><ImageUp size={15} />Logo</>],
];
const ROLES = { administrador: 'Administrador', enfermera: 'Enfermera', vacunador: 'Personal de vacunación' };
const TIPOS_COMUNIDAD = { casco_urbano: 'Casco urbano', barrio: 'Barrio', aldea: 'Aldea', caserio: 'Caserío', canton: 'Cantón' };

export default function Admin() {
  const [vista, setVista] = useState('usuarios');
  return (
    <>
      <Encabezado titulo="Administración" descripcion="Usuarios, parámetros del motor de cálculo, esquema de vacunación, catálogo territorial, auditoría, respaldos y logo." />
      <Pestanas valor={vista} onCambio={setVista} opciones={VISTAS} />
      {vista === 'usuarios' && <Usuarios />}
      {vista === 'parametros' && <Parametros />}
      {vista === 'esquema' && <Esquema />}
      {vista === 'territorio' && <Territorio />}
      {vista === 'bitacora' && <Bitacora />}
      {vista === 'respaldos' && <Respaldos />}
      {vista === 'logo' && <CambiarLogo />}
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

/* ---------------- Respaldos ---------------- */
const tamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const cuando = (iso) => new Date(iso).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });

const ORIGEN_RESPALDO = {
  auto: ['Automático', 'azul'], manual: ['Manual', ''], subido: ['Subido', 'morado'], previo: ['Antes de restaurar', 'ambar'],
};

function Respaldos() {
  const { avisar, confirmar, pedirTexto } = useDialogos();
  const [restaurando, setRestaurando] = useState(null);
  const [datos, setDatos] = useState(null);
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  const cargar = useCallback(() => { api('/admin/respaldos').then(setDatos).catch((e) => setError(e.message)); }, []);
  useEffect(cargar, [cargar]);

  async function crear(descargar) {
    setError('');
    setTrabajando(descargar ? 'descargar' : 'crear');
    try {
      const r = await api('/admin/respaldos', { method: 'POST' });
      if (descargar) await descargarArchivo(`/admin/respaldos/${r.nombre}`, r.nombre);
      avisar(descargar ? 'Respaldo creado y descargado en este dispositivo.' : 'Respaldo creado en el servidor.');
      cargar();
    } catch (e) { setError(e.message); }
    setTrabajando('');
  }
  const descargar = (r) => descargarArchivo(`/admin/respaldos/${r.nombre}`, r.nombre).catch((e) => avisar(e.message, 'error'));
  async function subir(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.name.endsWith('.dump')) { setError('Elija un archivo .dump descargado de este sistema.'); return; }
    setError('');
    setTrabajando('subir');
    try {
      const r = await subirArchivo('/admin/respaldos/subir', f);
      avisar(`Respaldo «${f.name}» subido. Ya puede restaurarlo desde la lista.`);
      cargar();
      return r;
    } catch (err) { setError(err.message); } finally { setTrabajando(''); }
  }
  // Restaurar reemplaza toda la información: se confirma escribiendo RESTAURAR y antes se saca un respaldo del estado actual
  async function restaurar(r) {
    const texto = await pedirTexto({
      titulo: 'Restaurar este respaldo', peligro: true, aceptar: 'Restaurar',
      mensaje: `Toda la información del sistema se reemplazará por la del respaldo del ${cuando(r.creado)}; lo que se registró después se perderá. `
        + 'Antes de restaurar se guardará un respaldo del estado actual para poder deshacerlo. Escriba RESTAURAR para confirmar.',
      etiqueta: 'Confirmación', placeholder: 'RESTAURAR',
    });
    if (texto == null) return;
    if (texto.trim() !== 'RESTAURAR') { avisar('No se restauró: debe escribir RESTAURAR exactamente.', 'error'); return; }
    setRestaurando(r);
    try {
      const res = await api(`/admin/respaldos/${r.nombre}/restaurar`, { method: 'POST', body: { confirmacion: 'RESTAURAR' } });
      avisar(`Información restaurada. El estado anterior quedó guardado como «${res.previo}».`);
      setTimeout(() => window.location.reload(), 2500); // los datos cambiaron: se vuelve a cargar todo
    } catch (err) { setRestaurando(null); setError(err.message); }
  }
  async function borrar(r) {
    if (!(await confirmar({ titulo: 'Eliminar respaldo', mensaje: `Se borrará ${r.nombre} del servidor. Esta acción no se puede deshacer.`, aceptar: 'Eliminar', peligro: true }))) return;
    api(`/admin/respaldos/${r.nombre}`, { method: 'DELETE' }).then(() => { avisar('Respaldo eliminado.'); cargar(); }).catch((e) => avisar(e.message, 'error'));
  }

  return (
    <>
      <Tarjeta titulo="Respaldos de la base de datos" icono={DatabaseBackup}
        sub={datos ? `El servidor saca uno automático cada noche a las ${datos.hora_automatica} y conserva los de los últimos ${datos.retencion_dias} días (se cambia en Parámetros). Los manuales no se borran solos.` : 'Copias completas de la información del sistema.'}>
        <div className="acciones izq" style={{ marginTop: 0 }}>
          <button className="btn btn-primario" onClick={() => crear(false)} disabled={!!trabajando}><DatabaseBackup size={17} />{trabajando === 'crear' ? 'Creando…' : 'Crear respaldo ahora'}</button>
          <button className="btn" onClick={() => crear(true)} disabled={!!trabajando}><Download size={17} />{trabajando === 'descargar' ? 'Preparando…' : 'Crear y descargar a este dispositivo'}</button>
          <label className={`btn ${trabajando ? 'deshabilitado' : ''}`}>
            <Upload size={17} />{trabajando === 'subir' ? 'Subiendo…' : 'Subir un respaldo desde este dispositivo'}
            <input type="file" accept=".dump" onChange={subir} disabled={!!trabajando} hidden />
          </label>
        </div>
        <Mensaje tipo="error" className="mt">{error}</Mensaje>
        <p className="tenue mt">Guarde las descargas en un lugar distinto del servidor (una memoria USB o la nube del centro de salud).
          Para volver a una copia anterior use <strong>Restaurar</strong> en la lista: reemplaza toda la información y antes guarda el estado actual por si hay que deshacerlo.</p>
      </Tarjeta>
      {restaurando && (
        <div className="modal-fondo"><div className="modal chico"><div className="modal-cuerpo restaurando">
          <span className="sello-espera"><ArchiveRestore size={34} /></span>
          <h2>Restaurando la información…</h2>
          <p className="suave">Respaldo del {cuando(restaurando.creado)}. No cierre esta ventana; puede tardar unos minutos.</p>
        </div></div></div>
      )}
      <Tarjeta titulo="Respaldos guardados en el servidor" icono={ScrollText} cuerpo={false}>
        {!datos ? <Cargando /> : !datos.respaldos.length ? <Vacio icono={DatabaseBackup} titulo="Todavía no hay respaldos">Cree el primero con el botón de arriba.</Vacio> : (
          <Tabla>
            <thead><tr><th>Fecha</th><th>Tipo</th><th className="celda-num">Tamaño</th><th /></tr></thead>
            <tbody>
              {datos.respaldos.map((r) => (
                <tr key={r.nombre}>
                  <td className="fuerte">{cuando(r.creado)}<span className="sub">{r.nombre}</span></td>
                  <td><span className={`chip ${ORIGEN_RESPALDO[r.origen]?.[1] || ''}`}>{ORIGEN_RESPALDO[r.origen]?.[0] || r.origen}</span></td>
                  <td className="celda-num">{tamano(r.tamano)}</td>
                  <td className="celda-fin">
                    <span className="botones-fila">
                      <button className="btn btn-sm" onClick={() => descargar(r)}><Download size={14} />Descargar</button>
                      <button className="btn btn-sm btn-peligro" onClick={() => restaurar(r)} disabled={!!restaurando}><ArchiveRestore size={14} />Restaurar</button>
                      <button className="btn btn-sm btn-fantasma" onClick={() => borrar(r)} aria-label={`Eliminar ${r.nombre}`}><Trash2 size={14} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}

/* ---------------- Logo ---------------- */
const MAX_LOGO = 1024 * 1024;

function CambiarLogo() {
  const { avisar, confirmar } = useDialogos();
  const [nuevo, setNuevo] = useState(null); // data URL de la imagen elegida, antes de guardarla
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  function elegir(e) {
    setError('');
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { setError('Elija una imagen PNG, JPG o WEBP.'); return; }
    if (f.size > MAX_LOGO) { setError('La imagen pesa más de 1 MB; redúzcala e intente de nuevo.'); return; }
    const lector = new FileReader();
    lector.onload = () => setNuevo(lector.result);
    lector.readAsDataURL(f);
  }
  async function guardar() {
    setGuardando(true);
    try {
      await api('/admin/logo', { method: 'PUT', body: { imagen: nuevo } });
      await recargarLogo();
      setNuevo(null);
      avisar('Logo actualizado: ya se ve en el menú, el inicio de sesión y los documentos impresos.');
    } catch (e) { setError(e.message); }
    setGuardando(false);
  }
  async function restaurar() {
    if (!(await confirmar({ titulo: 'Volver al logo original', mensaje: 'Se quitará el logo que se subió y se usará el que trae el sistema.', aceptar: 'Volver al original' }))) return;
    try { await api('/admin/logo', { method: 'DELETE' }); await recargarLogo(); avisar('Se restauró el logo original.'); } catch (e) { setError(e.message); }
  }

  return (
    <Tarjeta titulo="Logo institucional" icono={ImageUp}
      sub="Aparece en el menú, en la pantalla de inicio de sesión y en el encabezado de lo que se imprime. Use una imagen horizontal con fondo transparente o blanco.">
      <div className="logo-comparar">
        <figure><figcaption>Logo actual</figcaption><div className="logo-marco"><Logo /></div></figure>
        {nuevo && <figure><figcaption>Logo nuevo (vista previa)</figcaption><div className="logo-marco nuevo"><img src={nuevo} alt="Logo nuevo" /></div></figure>}
      </div>
      <Mensaje tipo="error" className="mt">{error}</Mensaje>
      <div className="acciones izq">
        <label className="btn">
          <ImageUp size={17} />Elegir imagen…
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={elegir} hidden />
        </label>
        {nuevo && <button className="btn btn-primario" onClick={guardar} disabled={guardando}><Save size={17} />{guardando ? 'Guardando…' : 'Guardar logo'}</button>}
        {nuevo && <button className="btn btn-fantasma" onClick={() => setNuevo(null)}>Cancelar</button>}
        {!nuevo && <button className="btn btn-fantasma" onClick={restaurar}><RotateCcw size={16} />Volver al logo original</button>}
      </div>
      <p className="tenue mt">PNG, JPG o WEBP de hasta 1 MB. Se guarda en la base de datos, así que también queda en los respaldos.</p>
    </Tarjeta>
  );
}
