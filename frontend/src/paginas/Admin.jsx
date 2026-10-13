import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ArchiveRestore, Building2, DatabaseBackup, Download, ImageUp, KeyRound, Upload, ListTree, MapPin, Plus, RotateCcw, Save, ScrollText, SlidersHorizontal, Syringe, Trash2, UserPlus, Users,
} from 'lucide-react';
import { api, descargarArchivo, qs, subirArchivo } from '../api.js';
import Logo, { recargarLogo } from '../componentes/Logo.jsx';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { invalidarCatalogo, useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Cargando, Encabezado, Mensaje, Modal, Pestanas, Tabla, Tarjeta, Vacio, iniciales } from '../componentes/ui.jsx';
import { Estado } from '../componentes/Estado.jsx';

const VISTAS = [
  ['usuarios', <><Users size={15} />Usuarios</>],
  ['parametros', <><SlidersHorizontal size={15} />Parámetros</>],
  ['esquema', <><Syringe size={15} />Esquema</>],
  ['territorio', <><MapPin size={15} />Puestos y comunidades</>],
  ['bitacora', <><ScrollText size={15} />Bitácora</>],
  ['respaldos', <><DatabaseBackup size={15} />Respaldos</>],
  ['logo', <><ImageUp size={15} />Logo</>],
];
const ROLES = { administrador: 'Administrador', enfermera: 'Enfermera', vacunador: 'Personal de vacunación', encargado: 'Encargada (solo consulta)' };
const TIPOS_COMUNIDAD = { casco_urbano: 'Casco urbano', barrio: 'Barrio', aldea: 'Aldea', caserio: 'Caserío', canton: 'Cantón' };

export default function Admin() {
  const [vista, setVista] = useState('usuarios');
  return (
    <>
      <Encabezado titulo="Administración" />
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
const CAMPOS_ESQUEMA = [
  ['edad_recomendada_dias', 'Edad (días)'], ['edad_minima_dias', 'Desde (días)'], ['edad_maxima_dias', 'Hasta (días)'],
  ['intervalo_minimo_dias', 'Días desde la anterior'], ['intervalo_recomendado_dias', 'Días recomendados'],
];

function Esquema() {
  const [dosis, cargar, error, setError] = useCarga('/admin/esquema');
  const accion = useAccion(cargar, setError);
  const { confirmar } = useDialogos();
  async function activar(d) {
    const ok = await confirmar({ titulo: d.activo ? `Dejar de usar ${d.etiqueta}` : `Volver a usar ${d.etiqueta}`,
      mensaje: d.activo ? 'Ya no aparecerá en las fichas, en el control del mes ni en las jornadas. Lo ya registrado se conserva.'
        : 'Volverá a calcularse para todos los niños.', aceptar: d.activo ? 'Dejar de usar' : 'Volver a usar', peligro: d.activo });
    if (ok) accion(() => api('/admin/esquema/' + d.id, { method: 'PUT', body: { activo: !d.activo } }), `${d.etiqueta} actualizada.`);
  }
  const [edit, setEdit] = useState({});
  const valor = (d, k) => edit[d.id]?.[k] ?? d[k] ?? '';
  const set = (d, k) => (e) => setEdit({ ...edit, [d.id]: { ...edit[d.id], [k]: e.target.value } });
  async function guardar(d) {
    if (!(await confirmar({ titulo: `Cambiar ${d.etiqueta}`, aceptar: 'Guardar', mensaje: 'Las fechas de todos los niños se volverán a calcular con este cambio.' }))) return;
    const body = Object.fromEntries(Object.entries(edit[d.id]).map(([k, v]) => [k, v === '' ? null : Number(v)]));
    if (await accion(() => api('/admin/esquema/' + d.id, { method: 'PUT', body }), `${d.etiqueta} actualizada.`)) setEdit({ ...edit, [d.id]: undefined });
  }
  return (
    <>
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      <Tabla>
        <thead><tr><th>Dosis</th><th>Se pone</th>{CAMPOS_ESQUEMA.map(([, t]) => <th key={t}>{t}</th>)}<th /></tr></thead>
        <tbody>
          {dosis.map((d) => (
            <tr key={d.id} className={d.activo ? '' : 'anulada'}>
              <td><span className="fuerte">{d.etiqueta}</span><span className="sub">{d.serie}{d.estacional && ' · por temporada'}{d.informativa && ' · no cuenta'}</span></td>
              <td><label className="interruptor"><input type="checkbox" checked={d.activo} onChange={() => activar(d)} />{d.activo ? 'Sí' : 'No'}</label></td>
              {CAMPOS_ESQUEMA.map(([k]) => <td key={k}><input type="number" min="0" className="num-input" value={valor(d, k)} onChange={set(d, k)} /></td>)}
              <td className="celda-fin">{edit[d.id] && <button className="btn btn-sm btn-primario" onClick={() => guardar(d)}><Save size={14} />Guardar</button>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}

/** Territorio real: cada puesto (comunidad central) con su responsable y las comunidades que atiende; el casco urbano con sus barrios. */
function Territorio() {
  const comunidades = useCatalogo('comunidades');
  const [usuarios] = useCarga('/admin/usuarios');
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState(null); // { comunidad_padre_id, tipo }
  const [, refrescar] = useState(0);
  const accion = useAccion(() => { invalidarCatalogo('comunidades'); refrescar((n) => n + 1); window.location.reload(); }, setError);
  const personal = usuarios.filter((u) => u.activo && u.rol !== 'administrador');
  const centrales = comunidades.filter((c) => c.es_central).sort((x, y) => (x.tipo === 'casco_urbano') - (y.tipo === 'casco_urbano') || x.nombre.localeCompare(y.nombre));
  const sueltas = comunidades.filter((c) => !c.es_central && !c.comunidad_padre_id);
  const guardar = (c, cambios) => accion(() => api('/comunidades/' + c.id, { method: 'PUT', body: cambios }), `${c.nombre} actualizada.`);

  const Responsable = ({ c }) => (
    <select className="selector-chico" value={c.responsable_id || ''} onChange={(e) => guardar(c, { responsable_id: e.target.value ? Number(e.target.value) : null })}
      aria-label={`Responsable de ${c.nombre}`}>
      <option value="">{c.es_central ? 'Sin responsable' : 'El del puesto'}</option>
      {personal.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
    </select>
  );
  return (
    <>
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      {centrales.map((c) => {
        const hijas = comunidades.filter((h) => h.comunidad_padre_id === c.id).sort((x, y) => x.nombre.localeCompare(y.nombre));
        const urbano = c.tipo === 'casco_urbano';
        return (
          <Tarjeta key={c.id} titulo={urbano ? 'Casco urbano · centro de salud' : `Puesto ${c.nombre}`} icono={urbano ? Building2 : MapPin} cuerpo={false}
            acciones={<span className="botones-fila">{!urbano && <Responsable c={c} />}
              <button className="btn btn-sm" onClick={() => setNueva({ comunidad_padre_id: c.id, tipo: urbano ? 'barrio' : 'aldea' })}><Plus size={14} />{urbano ? 'Barrio' : 'Comunidad'}</button></span>}>
            <Tabla>
              <thead><tr><th>{urbano ? 'Barrio' : 'Comunidad'}</th><th>Responsable</th><th className="celda-num">Km</th><th /></tr></thead>
              <tbody>
                {hijas.map((h) => (
                  <tr key={h.id}>
                    <td className="fuerte">{h.nombre}<span className="sub">{TIPOS_COMUNIDAD[h.tipo]}</span></td>
                    <td><Responsable c={h} /></td>
                    <td className="celda-num"><input type="number" min="0" className="num-input" defaultValue={h.distancia_km != null ? Number(h.distancia_km) : ''}
                      onBlur={(e) => Number(e.target.value) !== Number(h.distancia_km ?? -1) && guardar(h, { distancia_km: e.target.value === '' ? null : Number(e.target.value) })} aria-label={`Distancia de ${h.nombre}`} /></td>
                    <td className="celda-fin">
                      <select className="selector-chico" value={h.comunidad_padre_id} onChange={(e) => guardar(h, { comunidad_padre_id: Number(e.target.value) })} aria-label="Mover a otro puesto">
                        {centrales.map((x) => <option key={x.id} value={x.id}>{x.tipo === 'casco_urbano' ? 'Casco urbano' : `Puesto ${x.nombre}`}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {hijas.length === 0 && <tr><td colSpan={4} className="tenue">{urbano ? 'Sin barrios' : 'Solo la aldea del puesto'}</td></tr>}
              </tbody>
            </Tabla>
          </Tarjeta>
        );
      })}
      {sueltas.length > 0 && (
        <Tarjeta titulo="Sin puesto asignado" icono={MapPin} cuerpo={false}>
          <Tabla>
            <tbody>{sueltas.map((h) => (
              <tr key={h.id}><td className="fuerte">{h.nombre}</td>
                <td className="celda-fin"><select className="selector-chico" value="" onChange={(e) => guardar(h, { comunidad_padre_id: Number(e.target.value) })}>
                  <option value="">Elegir puesto…</option>{centrales.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></td></tr>
            ))}</tbody>
          </Tabla>
        </Tarjeta>
      )}
      {nueva && (
        <Modal titulo={nueva.tipo === 'barrio' ? 'Nuevo barrio' : 'Nueva comunidad'} chico onCerrar={() => setNueva(null)}
          onSubmit={async (e) => { e.preventDefault(); if (await accion(() => api('/comunidades', { method: 'POST', body: nueva }), 'Agregada.')) setNueva(null); }}
          pie={<><button type="button" className="btn" onClick={() => setNueva(null)}>Cancelar</button><button className="btn btn-primario"><Plus size={16} />Agregar</button></>}>
          <div className="rejilla">
            <Campo etiqueta="Nombre" requerido className="ancho"><input required autoFocus value={nueva.nombre || ''} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><select value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })}>
              {Object.entries(TIPOS_COMUNIDAD).filter(([k]) => k !== 'casco_urbano').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo etiqueta="Km desde la cabecera"><input type="number" min="0" value={nueva.distancia_km || ''} onChange={(e) => setNueva({ ...nueva, distancia_km: e.target.value })} /></Campo>
          </div>
        </Modal>
      )}
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
    <Tarjeta titulo="Logo institucional" icono={ImageUp}>
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
    </Tarjeta>
  );
}
