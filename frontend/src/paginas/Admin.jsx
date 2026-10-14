import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ArchiveRestore, BadgeCheck, Building2, DatabaseBackup, Download, Hospital, ImageUp, KeyRound, Upload, ListTree, MapPin, Plus, RotateCcw, Save, ScrollText, SlidersHorizontal, Syringe, Trash2, UserPlus, Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { recargarCentro } from '../componentes/useCentro.js';
import { DEPARTAMENTOS, MUNICIPIOS } from '../util.js';
import { api, descargarArchivo, qs, subirArchivo } from '../api.js';
import Logo, { recargarLogo } from '../componentes/Logo.jsx';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { invalidarCatalogo, useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Cargando, Encabezado, Mensaje, Modal, Pestanas, Tabla, Tarjeta, Vacio, iniciales } from '../componentes/ui.jsx';
import { Estado, plural } from '../componentes/Estado.jsx';

// El administrador configura todo desde aquí, sin tocar código: centro, territorio, personas, roles y cargos, esquema
const VISTAS = [
  ['centro', <><Hospital size={15} />Centro de salud</>],
  ['territorio', <><MapPin size={15} />Puestos y comunidades</>],
  ['usuarios', <><Users size={15} />Usuarios</>],
  ['roles', <><BadgeCheck size={15} />Roles y cargos</>],
  ['esquema', <><Syringe size={15} />Esquema</>],
  ['parametros', <><SlidersHorizontal size={15} />Parámetros</>],
  ['bitacora', <><ScrollText size={15} />Bitácora</>],
  ['respaldos', <><DatabaseBackup size={15} />Respaldos</>],
  ['logo', <><ImageUp size={15} />Logo</>],
];
const ROLES = { administrador: 'Administrador', enfermera: 'Enfermera', vacunador: 'Personal de vacunación', encargado: 'Encargada (solo consulta)' };
const TIPOS_COMUNIDAD = { casco_urbano: 'Casco urbano', barrio: 'Barrio', aldea: 'Aldea', caserio: 'Caserío', canton: 'Cantón' };

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') || 'centro';
  const setVista = (v) => setParams({ vista: v }, { replace: true });
  return (
    <>
      <Encabezado titulo="Administración" />
      <Pestanas valor={vista} onCambio={setVista} opciones={VISTAS} />
      {vista === 'centro' && <CentroSalud />}
      {vista === 'roles' && <RolesCargos />}
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

/** Cargo de la lista; «Agregar otro…» lo crea en el catálogo. */
function SelectorCargo({ valor, onCambio, cargos, onNuevo, ...resto }) {
  const { pedirTexto } = useDialogos();
  return (
    <select value={valor} {...resto} onChange={async (e) => {
      if (e.target.value !== '__nuevo') { onCambio(e.target.value); return; }
      const nombre = await pedirTexto({ titulo: 'Nuevo cargo', etiqueta: 'Nombre del cargo', aceptar: 'Agregar' });
      if (!nombre) return;
      const c = await api('/admin/cargos', { method: 'POST', body: { nombre } });
      onNuevo?.(); onCambio(c.nombre);
    }}>
      <option value="">Sin cargo</option>
      {cargos.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
      {valor && !cargos.some((c) => c.nombre === valor) && <option value={valor}>{valor}</option>}
      <option value="__nuevo">+ Agregar otro cargo…</option>
    </select>
  );
}

function Usuarios() {
  const { usuario: yo } = useSesion();
  const { pedirTexto } = useDialogos();
  const [usuarios, cargar, error, setError] = useCarga('/admin/usuarios');
  const [cargos, cargarCargos] = useCarga('/catalogos/cargos');
  const comunidades = useCatalogo('comunidades');
  const aCargo = (id) => comunidades.filter((c) => c.responsable_id === id).map((c) => (c.es_central ? `Puesto ${c.nombre}` : c.nombre));
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
            <Campo etiqueta="Cargo"><SelectorCargo valor={nuevo.cargo} cargos={cargos} onNuevo={cargarCargos} onCambio={(v) => setNuevo({ ...nuevo, cargo: v })} /></Campo>
            <Campo etiqueta="Usuario" requerido><input required value={nuevo.usuario} onChange={set('usuario')} autoComplete="off" autoCapitalize="none" /></Campo>
            <Campo etiqueta="Contraseña" requerido ayuda="Mínimo 8 caracteres"><input required type="password" minLength={8} value={nuevo.contrasena} onChange={set('contrasena')} autoComplete="new-password" /></Campo>
            <Campo etiqueta="Rol" requerido><select value={nuevo.rol} onChange={set('rol')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          </div>
        </Tarjeta>
      </form>
      <Tabla>
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol y cargo</th><th>A cargo de</th><th>Último acceso</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className={u.activo ? '' : 'anulada'}>
              <td>
                <div style={{ display: 'flex', gap: '.7rem', alignItems: 'center' }}>
                  <span className="avatar" style={{ width: 34, height: 34, fontSize: '.75rem' }}>{iniciales(u.nombre)}</span>
                  <div><span className="fuerte">{u.nombre}</span></div>
                </div>
              </td>
              <td><code>{u.usuario}</code></td>
              <td>
                <select value={u.rol} disabled={u.id === yo.id} onChange={(e) => cambiar(u, { rol: e.target.value }, 'Rol actualizado.')} style={{ minWidth: 170 }}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <SelectorCargo className="selector-chico" valor={u.cargo || ''} cargos={cargos} onNuevo={cargarCargos} aria-label={`Cargo de ${u.nombre}`}
                  onCambio={(v) => cambiar(u, { cargo: v }, 'Cargo actualizado.')} style={{ marginTop: '.35rem', minWidth: 170 }} />
              </td>
              <td>{u.rol === 'vacunador' ? (aCargo(u.id).length ? aCargo(u.id).join(', ')
                : <span className="rojo" title="Sin lugar a cargo ve todo el municipio">Sin lugar · <a href="?vista=territorio">asignar</a></span>) : <span className="tenue">Todo el municipio</span>}</td>
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

/** Territorio: centro → puestos → aldeas, caseríos y barrios. Se crea, mueve, desactiva o elimina; cada lugar tiene su responsable. */
function Territorio() {
  const comunidades = useCatalogo('comunidades');
  const [usuarios] = useCarga('/admin/usuarios');
  const [inactivas] = useCarga('/comunidades/inactivas');
  const { confirmar } = useDialogos();
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState(null); // { comunidad_padre_id, tipo }
  const [nuevoPuesto, setNuevoPuesto] = useState(null);
  const [quitarPuesto, setQuitarPuesto] = useState(null);
  const accion = useAccion(() => { invalidarCatalogo('comunidades'); window.location.reload(); }, setError);
  const personal = usuarios.filter((u) => u.activo && u.rol !== 'administrador');
  const centrales = comunidades.filter((c) => c.es_central).sort((x, y) => (x.tipo === 'casco_urbano') - (y.tipo === 'casco_urbano') || x.nombre.localeCompare(y.nombre));
  const sueltas = comunidades.filter((c) => !c.es_central && !c.comunidad_padre_id);
  const nombrePuesto = (x) => (x.tipo === 'casco_urbano' ? 'Casco urbano' : `Puesto ${x.nombre}`);
  const guardar = (c, cambios, ok = `${c.nombre} actualizada.`) => accion(() => api('/comunidades/' + c.id, { method: 'PUT', body: cambios }), ok);

  // Quitar: si nunca se usó se elimina; si ya tiene registros, se ofrece desactivarla (se conserva el historial)
  async function quitar(c) {
    if (!(await confirmar({ titulo: `Quitar ${c.nombre}`, mensaje: 'Si no tiene registros se elimina; si ya los tiene, se desactiva y deja de aparecer en las listas.', aceptar: 'Quitar', peligro: true }))) return;
    try {
      await api('/comunidades/' + c.id, { method: 'DELETE' });
      invalidarCatalogo('comunidades'); window.location.reload();
    } catch (e) {
      if (!/desactívela/.test(e.message)) { setError(e.message); return; }
      if (await confirmar({ titulo: `Desactivar ${c.nombre}`, mensaje: 'Ya tiene niños, familias, cuadernos o jornadas. Se desactiva: deja de aparecer, pero su historial se conserva y se puede volver a activar.', aceptar: 'Desactivar', peligro: true }))
        accion(() => api(`/comunidades/${c.id}/desactivar`, { method: 'POST' }), `${c.nombre} desactivada.`);
    }
  }

  async function crearPuesto(e) {
    e.preventDefault();
    const p = nuevoPuesto;
    await accion(async () => {
      let id = Number(p.existente_id);
      if (p.modo === 'nuevo') {
        const c = await api('/comunidades', { method: 'POST', body: { nombre: p.nombre, tipo: 'aldea', es_central: true, responsable_id: p.responsable_id ? Number(p.responsable_id) : null } });
        id = c.id;
      } else {
        await api('/comunidades/' + id, { method: 'PUT', body: { es_central: true, comunidad_padre_id: null, responsable_id: p.responsable_id ? Number(p.responsable_id) : null } });
      }
      for (const a of p.aldeas) await api('/comunidades/' + a, { method: 'PUT', body: { comunidad_padre_id: id } });
    }, 'Puesto creado.');
    setNuevoPuesto(null);
  }

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
      <div className="acciones" style={{ justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primario" onClick={() => setNuevoPuesto({ modo: 'nuevo', nombre: '', existente_id: '', responsable_id: '', aldeas: [] })}>
          <Plus size={17} />Nuevo puesto de salud
        </button>
      </div>
      {centrales.map((c) => {
        const hijas = comunidades.filter((h) => h.comunidad_padre_id === c.id).sort((x, y) => x.nombre.localeCompare(y.nombre));
        const urbano = c.tipo === 'casco_urbano';
        return (
          <Tarjeta key={c.id} titulo={urbano ? 'Casco urbano · centro de salud' : `Puesto ${c.nombre}`} icono={urbano ? Building2 : MapPin} cuerpo={false}
            sub={`${plural(hijas.length, 'comunidad a cargo', 'comunidades a cargo')}${!c.responsable_id && c.responsable ? ` · Anotado: ${c.responsable} (falta enlazar su usuario)` : ''}`}
            acciones={<span className="botones-fila">{!urbano && <Responsable c={c} />}
              <button className="btn btn-sm" onClick={() => setNueva({ comunidad_padre_id: c.id, tipo: urbano ? 'barrio' : 'aldea' })}><Plus size={14} />{urbano ? 'Barrio' : 'Aldea o caserío'}</button>
              {!urbano && centrales.length > 1 && <button className="btn btn-sm" onClick={() => setQuitarPuesto({ puesto: c, destino_id: '' })}><ArchiveRestore size={14} />Dejar de ser puesto</button>}</span>}>
            <Tabla>
              <thead><tr><th>{urbano ? 'Barrio' : 'Comunidad'}</th><th>Tipo</th><th>Responsable</th><th className="celda-num">Km</th><th>Puesto</th><th /></tr></thead>
              <tbody>
                {hijas.map((h) => (
                  <tr key={h.id}>
                    <td className="fuerte">{h.nombre}</td>
                    <td><select className="selector-chico" value={h.tipo} onChange={(e) => guardar(h, { tipo: e.target.value })} aria-label={`Tipo de ${h.nombre}`}>
                      {Object.entries(TIPOS_COMUNIDAD).filter(([k]) => k !== 'casco_urbano').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td><Responsable c={h} /></td>
                    <td className="celda-num"><input type="number" min="0" className="num-input" defaultValue={h.distancia_km != null ? Number(h.distancia_km) : ''}
                      onBlur={(e) => Number(e.target.value) !== Number(h.distancia_km ?? -1) && guardar(h, { distancia_km: e.target.value === '' ? null : Number(e.target.value) })} aria-label={`Distancia de ${h.nombre}`} /></td>
                    <td>
                      <select className="selector-chico" value={h.comunidad_padre_id} onChange={(e) => guardar(h, { comunidad_padre_id: Number(e.target.value) }, `${h.nombre} pasó a otro puesto.`)} aria-label="Pasar a otro puesto">
                        {centrales.map((x) => <option key={x.id} value={x.id}>{nombrePuesto(x)}</option>)}
                      </select>
                    </td>
                    <td className="celda-fin"><button className="btn btn-sm btn-icono" onClick={() => quitar(h)} aria-label={`Quitar ${h.nombre}`} title="Quitar"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
                {hijas.length === 0 && <tr><td colSpan={6} className="tenue">{urbano ? 'Sin barrios' : 'Solo la aldea del puesto'}</td></tr>}
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
                  <option value="">Elegir puesto…</option>{centrales.map((x) => <option key={x.id} value={x.id}>{nombrePuesto(x)}</option>)}</select></td></tr>
            ))}</tbody>
          </Tabla>
        </Tarjeta>
      )}
      {inactivas.length > 0 && (
        <Tarjeta titulo="Desactivadas" icono={ArchiveRestore} sub="No aparecen en las listas; su historial se conserva" cuerpo={false}>
          <Tabla>
            <tbody>{inactivas.map((h) => (
              <tr key={h.id}><td className="fuerte">{h.nombre}<span className="sub">{TIPOS_COMUNIDAD[h.tipo]}</span></td>
                <td className="celda-fin"><button className="btn btn-sm" onClick={() => accion(() => api(`/comunidades/${h.id}/activar`, { method: 'POST' }), `${h.nombre} activada.`)}><RotateCcw size={14} />Activar</button></td></tr>
            ))}</tbody>
          </Tabla>
        </Tarjeta>
      )}
      {nueva && (
        <Modal titulo={nueva.tipo === 'barrio' ? 'Nuevo barrio' : 'Nueva aldea o caserío'} chico onCerrar={() => setNueva(null)}
          onSubmit={async (e) => { e.preventDefault(); if (await accion(() => api('/comunidades', { method: 'POST', body: nueva }), 'Agregada.')) setNueva(null); }}
          pie={<><button type="button" className="btn" onClick={() => setNueva(null)}>Cancelar</button><button className="btn btn-primario"><Plus size={16} />Agregar</button></>}>
          <div className="rejilla">
            <Campo etiqueta="Nombre" requerido className="ancho"><input required autoFocus value={nueva.nombre || ''} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Tipo"><select value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })}>
              {Object.entries(TIPOS_COMUNIDAD).filter(([k]) => k !== 'casco_urbano').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
            <Campo etiqueta="Responsable"><select value={nueva.responsable_id || ''} onChange={(e) => setNueva({ ...nueva, responsable_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">El del puesto</option>{personal.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
            <Campo etiqueta="Km desde la cabecera"><input type="number" min="0" value={nueva.distancia_km || ''} onChange={(e) => setNueva({ ...nueva, distancia_km: e.target.value })} /></Campo>
          </div>
        </Modal>
      )}
      {nuevoPuesto && (
        <Modal titulo="Nuevo puesto de salud" onCerrar={() => setNuevoPuesto(null)} onSubmit={crearPuesto}
          pie={<><button type="button" className="btn" onClick={() => setNuevoPuesto(null)}>Cancelar</button><button className="btn btn-primario"><Plus size={16} />Crear puesto</button></>}>
          <div className="segmentado" role="group" style={{ marginBottom: '1rem', width: 'fit-content' }}>
            <button type="button" className={nuevoPuesto.modo === 'nuevo' ? 'activa' : ''} onClick={() => setNuevoPuesto({ ...nuevoPuesto, modo: 'nuevo' })}>Aldea nueva</button>
            <button type="button" className={nuevoPuesto.modo === 'existente' ? 'activa' : ''} onClick={() => setNuevoPuesto({ ...nuevoPuesto, modo: 'existente' })}>Una aldea que ya existe</button>
          </div>
          <div className="rejilla">
            {nuevoPuesto.modo === 'nuevo' ? (
              <Campo etiqueta="Nombre de la aldea del puesto" requerido className="ancho"><input required autoFocus value={nuevoPuesto.nombre} onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, nombre: e.target.value })} /></Campo>
            ) : (
              <Campo etiqueta="Aldea donde queda el puesto" requerido className="ancho"><select required value={nuevoPuesto.existente_id} onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, existente_id: e.target.value, aldeas: nuevoPuesto.aldeas.filter((x) => String(x) !== e.target.value) })}>
                <option value="">Elija…</option>{comunidades.filter((c) => !c.es_central).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
            )}
            <Campo etiqueta="Responsable del puesto" className="ancho"><select value={nuevoPuesto.responsable_id} onChange={(e) => setNuevoPuesto({ ...nuevoPuesto, responsable_id: e.target.value })}>
              <option value="">Sin responsable por ahora</option>{personal.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
          </div>
          <div className="seccion-titulo">Comunidades que atenderá</div>
          <div className="casillas casillas-chicas">
            {comunidades.filter((c) => !c.es_central && String(c.id) !== String(nuevoPuesto.existente_id)).map((c) => {
              const si = nuevoPuesto.aldeas.includes(c.id);
              return (
                <label key={c.id} className={`casilla ${si ? 'marcada' : ''}`}>
                  <input type="checkbox" checked={si} onChange={() => setNuevoPuesto({ ...nuevoPuesto, aldeas: si ? nuevoPuesto.aldeas.filter((x) => x !== c.id) : [...nuevoPuesto.aldeas, c.id] })} />
                  <span className="casilla-texto"><span className="casilla-nombre">{c.nombre}</span><span className="sub">Hoy: {c.puesto || 'sin puesto'}</span></span>
                </label>
              );
            })}
          </div>
        </Modal>
      )}
      {quitarPuesto && (
        <Modal titulo={`Dejar de ser puesto: ${quitarPuesto.puesto.nombre}`} chico onCerrar={() => setQuitarPuesto(null)}
          onSubmit={async (e) => { e.preventDefault(); if (await accion(() => api(`/comunidades/${quitarPuesto.puesto.id}/quitar-puesto`, { method: 'POST', body: { destino_id: Number(quitarPuesto.destino_id) } }), 'Listo: sus comunidades pasaron al otro puesto.')) setQuitarPuesto(null); }}
          pie={<><button type="button" className="btn" onClick={() => setQuitarPuesto(null)}>Cancelar</button><button className="btn btn-peligro">Pasar comunidades y quitar puesto</button></>}>
          <p className="suave" style={{ marginBottom: '.8rem' }}>{quitarPuesto.puesto.nombre} y todas sus comunidades pasan al puesto que elija. No se pierde ningún registro.</p>
          <Campo etiqueta="Pasan al puesto" requerido><select required value={quitarPuesto.destino_id} onChange={(e) => setQuitarPuesto({ ...quitarPuesto, destino_id: e.target.value })}>
            <option value="">Elija…</option>{centrales.filter((x) => x.id !== quitarPuesto.puesto.id).map((x) => <option key={x.id} value={x.id}>{nombrePuesto(x)}</option>)}</select></Campo>
        </Modal>
      )}
    </>
  );
}

/** Datos del centro (encabezados, documentos, inicio de sesión) y establecimientos donde se vacuna. */
function CentroSalud() {
  const [centro, setCentro] = useState(null);
  const [establecimientos, cargarEst] = useCarga('/catalogos/establecimientos?todos=1');
  const [error, setError] = useState('');
  const accion = useAccion(cargarEst, setError);
  const [nuevoEst, setNuevoEst] = useState({ nombre: '', tipo: 'puesto' });
  useEffect(() => { api('/marca/centro').then(setCentro).catch((e) => setError(e.message)); }, []);
  if (!centro) return <Cargando />;
  const set = (k) => (e) => setCentro({ ...centro, [k]: e.target.value });
  const TIPOS_EST = { centro: 'Centro de salud', puesto: 'Puesto de salud', hospital: 'Hospital', privado: 'Clínica privada', otro_municipio: 'Otro municipio / externo' };
  return (
    <>
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      <form onSubmit={async (e) => { e.preventDefault(); if (await accion(() => api('/admin/centro', { method: 'PUT', body: centro }), 'Datos del centro guardados.')) recargarCentro(); }}>
        <Tarjeta titulo="Datos del centro de salud" icono={Hospital} sub="Salen en el encabezado, en el inicio de sesión y en todo lo que se imprime"
          pie={<div className="acciones"><button className="btn btn-primario"><Save size={16} />Guardar</button></div>}>
          <div className="rejilla">
            <Campo etiqueta="Nombre del centro" requerido className="ancho"><input required value={centro.nombre} onChange={set('nombre')} /></Campo>
            <Campo etiqueta="Departamento"><select value={centro.departamento} onChange={(e) => setCentro({ ...centro, departamento: e.target.value, municipio: '' })}>
              <option value="">Elija…</option>{DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}</select></Campo>
            <Campo etiqueta="Municipio"><select value={centro.municipio} onChange={set('municipio')}>
              <option value="">Elija…</option>{(MUNICIPIOS[centro.departamento] || []).map((m) => <option key={m}>{m}</option>)}
              {centro.municipio && !(MUNICIPIOS[centro.departamento] || []).includes(centro.municipio) && <option>{centro.municipio}</option>}</select></Campo>
            <Campo etiqueta="Área de salud"><input value={centro.area_salud} onChange={set('area_salud')} placeholder="Área de Salud de …" /></Campo>
            <Campo etiqueta="Distrito"><input value={centro.distrito} onChange={set('distrito')} placeholder="Distrito …" /></Campo>
          </div>
        </Tarjeta>
      </form>
      <Tarjeta titulo="Establecimientos" icono={Building2} sub="Dónde se vacuna: el centro, los puestos y los lugares externos (para registrar vacunas puestas fuera)" cuerpo={false}
        pie={<form className="acciones" style={{ justifyContent: 'flex-start' }} onSubmit={async (e) => { e.preventDefault(); if (await accion(() => api('/admin/establecimientos', { method: 'POST', body: nuevoEst }), 'Establecimiento agregado.')) setNuevoEst({ nombre: '', tipo: 'puesto' }); }}>
          <input required placeholder="Nombre del establecimiento" value={nuevoEst.nombre} onChange={(e) => setNuevoEst({ ...nuevoEst, nombre: e.target.value })} style={{ maxWidth: 300 }} />
          <select value={nuevoEst.tipo} onChange={(e) => setNuevoEst({ ...nuevoEst, tipo: e.target.value })} style={{ maxWidth: 220 }}>
            {Object.entries(TIPOS_EST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="btn btn-primario"><Plus size={16} />Agregar</button>
        </form>}>
        <Tabla>
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {establecimientos.map((x) => (
              <tr key={x.id} className={x.activo ? '' : 'anulada'}>
                <td><input className="input-tabla" defaultValue={x.nombre} aria-label="Nombre" onBlur={(e) => e.target.value.trim() && e.target.value !== x.nombre && accion(() => api('/admin/establecimientos/' + x.id, { method: 'PUT', body: { nombre: e.target.value } }), 'Nombre actualizado.')} /></td>
                <td><select className="selector-chico" value={x.tipo} onChange={(e) => accion(() => api('/admin/establecimientos/' + x.id, { method: 'PUT', body: { tipo: e.target.value } }), 'Tipo actualizado.')}>
                  {Object.entries(TIPOS_EST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td><Estado de={x.activo ? 'activo' : 'desactivado'} /></td>
                <td className="celda-fin"><button className="btn btn-sm" onClick={() => accion(() => api('/admin/establecimientos/' + x.id, { method: 'PUT', body: { activo: !x.activo } }), x.activo ? 'Desactivado.' : 'Activado.')}>{x.activo ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>
    </>
  );
}

// Qué puede hacer cada rol (los permisos los decide el rol; el cargo es solo el nombre del puesto de trabajo)
const PERMISOS = [
  ['Ver niños', 'Su sector', 'Todos', 'Todos (solo ver)', 'Todos'],
  ['Registrar niños, vacunar y entregar suplementos', '✓', '✓', '—', '✓'],
  ['Llamar o visitar y anotar el seguimiento', 'Su sector', '✓', '—', '✓'],
  ['Iniciar una jornada y vacunar en ella', 'Si va en el equipo', '✓', '—', '✓'],
  ['Planificar, cerrar y cancelar jornadas', '—', '✓', '—', '✓'],
  ['Anular registros equivocados', '—', '✓', '—', '✓'],
  ['Tablero, informes y pedido de vacunas', '—', '✓', '✓ (solo ver)', '✓'],
  ['Centro, territorio, usuarios, roles y cargos, esquema, respaldos', '—', '—', '—', '✓'],
];

function RolesCargos() {
  const [cargos, cargar, error, setError] = useCarga('/catalogos/cargos?todos=1');
  const [usuarios] = useCarga('/admin/usuarios');
  const accion = useAccion(cargar, setError);
  const [nuevo, setNuevo] = useState('');
  const cuantos = (rol) => usuarios.filter((u) => u.activo && u.rol === rol).length;
  return (
    <>
      <Mensaje tipo="error" onCerrar={() => setError('')}>{error}</Mensaje>
      <Tarjeta titulo="Roles" icono={BadgeCheck} sub="El rol decide qué puede hacer cada persona; se asigna en Usuarios" cuerpo={false}>
        <Tabla adaptable={false} className="tabla-roles">
          <thead><tr><th>Puede…</th><th>Personal de vacunación<span className="sub">{cuantos('vacunador')} usuarios</span></th><th>Enfermera<span className="sub">{cuantos('enfermera')} usuarios</span></th>
            <th>Encargada (consulta)<span className="sub">{cuantos('encargado')} usuarios</span></th><th>Administrador<span className="sub">{cuantos('administrador')} usuarios</span></th></tr></thead>
          <tbody>{PERMISOS.map(([p, ...v]) => <tr key={p}><td className="fuerte">{p}</td>{v.map((x, i) => <td key={i} className={x === '—' ? 'tenue' : ''}>{x}</td>)}</tr>)}</tbody>
        </Tabla>
      </Tarjeta>
      <Tarjeta titulo="Cargos" icono={Users} sub="Nombre del puesto de trabajo de cada persona; aparece como lista al crear un usuario" cuerpo={false}
        pie={<form className="acciones" style={{ justifyContent: 'flex-start' }} onSubmit={async (e) => { e.preventDefault(); if (await accion(() => api('/admin/cargos', { method: 'POST', body: { nombre: nuevo } }), 'Cargo agregado.')) setNuevo(''); }}>
          <input required placeholder="Nuevo cargo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} style={{ maxWidth: 320 }} />
          <button className="btn btn-primario"><Plus size={16} />Agregar cargo</button>
        </form>}>
        <Tabla>
          <thead><tr><th>Cargo</th><th>Personas</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {cargos.map((c) => (
              <tr key={c.id} className={c.activo ? '' : 'anulada'}>
                <td><input className="input-tabla" defaultValue={c.nombre} aria-label="Nombre del cargo" onBlur={(e) => e.target.value.trim() && e.target.value !== c.nombre && accion(() => api('/admin/cargos/' + c.id, { method: 'PUT', body: { nombre: e.target.value } }), 'Cargo actualizado.')} /></td>
                <td>{usuarios.filter((u) => u.cargo === c.nombre).length}</td>
                <td><Estado de={c.activo ? 'activo' : 'desactivado'} /></td>
                <td className="celda-fin"><button className="btn btn-sm" onClick={() => accion(() => api('/admin/cargos/' + c.id, { method: 'PUT', body: { activo: !c.activo } }), c.activo ? 'Cargo desactivado.' : 'Cargo activado.')}>{c.activo ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>
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
