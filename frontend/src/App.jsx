import { createContext, lazy, Suspense, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Baby, Bell, CalendarCheck, BookOpen, FileText, Home, LayoutDashboard, LogOut, MapPinned, Menu, Package, Search, Settings, Truck, MoreHorizontal,
} from 'lucide-react';
import { api, sesionGuardada, guardarSesion } from './api.js';
import { cola } from './componentes/fueraDeLinea.js';
import { limpiarCatalogos } from './componentes/useCatalogo.js';
import { Cargando, iniciales } from './componentes/ui.jsx';
import { AvisoActualizacion, AvisoConexion, BotonInstalar, ColaSinEnviar, borrarDatosGuardados } from './componentes/Pwa.jsx';
import Logo from './componentes/Logo.jsx';
import Login from './paginas/Login.jsx';
import Inicio from './paginas/Inicio.jsx';
import Buscar from './paginas/Buscar.jsx';
import NinoForm from './paginas/NinoForm.jsx';
import Ficha from './paginas/Ficha.jsx';
import Alertas from './paginas/Alertas.jsx';
import { ListaCuadernos, CuadernoDetalle } from './paginas/Cuadernos.jsx';
import Comunidades from './paginas/Comunidades.jsx';
import { ListaJornadas, NuevaJornada, JornadaDetalle } from './paginas/Jornadas.jsx';
import Informes from './paginas/Informes.jsx';
import Admin from './paginas/Admin.jsx';
import Vacunas from './paginas/Vacunas.jsx';
import Listado from './paginas/Listado.jsx';
import { centroActual, centroCorto, useCentro } from './componentes/useCentro.js';
// El tablero (con la librería de gráficas) se descarga solo al abrirlo
const Tablero = lazy(() => import('./paginas/Tablero.jsx'));

const Sesion = createContext(null);
export const useSesion = () => useContext(Sesion);

export const ROL = { administrador: 'Dirección', enfermera: 'Enfermera encargada de puesto', vacunador: 'Personal de vacunación' };

export default function App() {
  const [sesion, setSesion] = useState(sesionGuardada);
  useCentro();
  const [resumen, setResumen] = useState([]);
  const [pendientes, setPendientes] = useState({ total: 0, mios: 0 });
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  // Al cambiar de usuario se olvidan las listas guardadas en memoria (cada rol ve otras comunidades)
  const entrar = async (s) => { limpiarCatalogos(); await borrarDatosGuardados(); guardarSesion(s); setSesion(s); };
  const salir = async () => {
    // Lo registrado sin señal está solo en este teléfono: salir no lo borra, pero se envía con la sesión de quien entre
    if (cola().length && !window.confirm('Hay registros guardados sin enviar en este teléfono. ¿Salir de todos modos? Se enviarán cuando alguien vuelva a entrar con señal.')) return;
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sesión ya vencida */ }
    guardarSesion(null);
    await borrarDatosGuardados();
    limpiarCatalogos();
    setSesion(null);
  };

  // Perfil vigente: al abrir y cada vez que el servidor dice que algo no corresponde al rol.
  // Si la Dirección le cambió el rol o el lugar, el menú y las pantallas se ajustan sin volver a entrar.
  const ir = useNavigate();
  const actualizarPerfil = useCallback((volverAlInicio = false) => {
    const s = sesionGuardada();
    if (!s?.token) return;
    api('/auth/yo').then((u) => {
      if (volverAlInicio) ir('/', { replace: true });
      if (JSON.stringify(u) === JSON.stringify(s.usuario)) return;
      limpiarCatalogos();
      const nueva = { ...s, usuario: u };
      guardarSesion(nueva); setSesion(nueva);
    }).catch(() => {});
  }, [ir]);
  useEffect(() => { actualizarPerfil(); }, [sesion?.token, actualizarPerfil]);
  useEffect(() => {
    const alNegar = () => actualizarPerfil(true);
    window.addEventListener('sin-permiso', alNegar);
    return () => window.removeEventListener('sin-permiso', alNegar);
  }, [actualizarPerfil]);

  // RF-16: contador de alertas en el menú
  const refrescarAlertas = useCallback(() => {
    if (!sesion) return;
    api('/alertas/resumen').then(setResumen).catch(() => {});
    // Mismo cálculo que Inicio y Control del mes: niños con vacunas retrasadas (de su sector, si tiene uno)
    api('/seguimiento/mes').then((d) => {
      const n = d.pendientes.filter((p) => p.situacion !== 'por_venir').length;
      setPendientes({ total: n, mios: n });
    }).catch(() => {});
  }, [sesion]);
  useEffect(refrescarAlertas, [refrescarAlertas]);

  // Al navegar: cerrar el menú del celular y volver arriba
  useEffect(() => { setMenuAbierto(false); window.scrollTo(0, 0); }, [pathname]);

  if (!sesion) {
    return (
      <Routes>
        <Route path="*" element={<Login onEntrar={entrar} />} />
      </Routes>
    );
  }

  const { rol, nombre } = sesion.usuario;
  const centro = centroActual();
  // El número del menú es de niños con vacunas retrasadas: lo que el personal tiene que atender
  const totalAlertas = pendientes.total;
  // Tres roles: Dirección (la doctora: todo), enfermera encargada de puesto (su puesto y aldeas) y personal (sus jornadas)
  const direccion = rol === 'administrador';
  const personal = rol === 'vacunador';
  const verInformes = direccion || rol === 'enfermera'; // Tablero e informes: la encargada, de su sector
  const contador = totalAlertas > 0 && <b className="contador-menu">{totalAlertas > 99 ? '99+' : totalAlertas}</b>;

  return (
    <Sesion.Provider value={{ ...sesion, refrescarAlertas, resumen, pendientes }}>
      <div className={`app ${menuAbierto ? 'menu-abierto' : ''}`}>
        <div className="franja-gob">
          <span>Gobierno de la República de Guatemala</span>
          <i className="sep" />
          <span>Ministerio de Salud Pública y Asistencia Social</span>
        </div>

        <aside className="lateral" aria-label="Menú principal">
          <div className="lateral-logo">
            <Logo />
            <div className="sistema">
              <strong>Control de Vacunación</strong>
              <span>{centroCorto(centro)}</span>
            </div>
          </div>
          <nav className="menu">
            <div className="menu-titulo">Principal</div>
            <NavLink to="/" end><Home size={19} />Inicio</NavLink>
            <NavLink to="/ninos"><Baby size={19} />Niños</NavLink>
            {!personal && <NavLink to="/alertas"><CalendarCheck size={19} />Control del mes{contador}</NavLink>}
            <div className="menu-titulo">{direccion ? 'Territorio' : 'Mi trabajo'}</div>
            {direccion && <NavLink to="/comunidades"><MapPinned size={19} />Comunidades</NavLink>}
            <NavLink to="/jornadas"><Truck size={19} />Jornadas</NavLink>
            <NavLink to="/cuadernos"><BookOpen size={19} />Cuadernos SIGSA 5a</NavLink>
            {!personal && <NavLink to="/vacunas"><Package size={19} />{direccion ? 'Vacunas' : 'Vacunas de mi puesto'}</NavLink>}
            {verInformes && <div className="menu-titulo">{direccion ? 'Dirección' : 'Mi puesto'}</div>}
            {verInformes && <NavLink to="/tablero"><LayoutDashboard size={19} />Tablero</NavLink>}
            {verInformes && <NavLink to="/informes"><FileText size={19} />Informes</NavLink>}
            {direccion && <NavLink to="/admin"><Settings size={19} />Administración</NavLink>}
          </nav>
          <BotonInstalar className="en-lateral" />
          <div className="lateral-pie">
            <div className="avatar">{iniciales(nombre)}</div>
            <div className="quien">
              <strong>{nombre}</strong>
              <span>{sesion.usuario.lugar || ROL[rol]}</span>
            </div>
            <button className="btn btn-fantasma btn-icono" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={18} /></button>
          </div>
        </aside>
        <div className="velo" onClick={() => setMenuAbierto(false)} />

        <div className="principal">
          <header className="barra-sup">
            <Logo alt="MSPAS" />
            <div className="titulo-app">
              <strong>Control de Vacunación</strong>
              <span>{centro.municipio || centro.nombre}</span>
            </div>
            <button className="btn btn-fantasma btn-icono" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          </header>

          <AvisoConexion />
          <ColaSinEnviar />
          <main className="contenido">
            <Routes>
              <Route path="/" element={<Inicio />} />
              <Route path="/ninos" element={<Buscar />} />
              <Route path="/ninos/nuevo" element={<NinoForm />} />
              <Route path="/ninos/:id" element={<Ficha />} />
              <Route path="/ninos/:id/editar" element={<NinoForm />} />
              {!personal && <Route path="/alertas" element={<Alertas />} />}
              {!personal && <Route path="/listado" element={<Listado />} />}
              <Route path="/cuadernos" element={<ListaCuadernos />} />
              <Route path="/cuadernos/:id" element={<CuadernoDetalle />} />
              {direccion && <Route path="/comunidades" element={<Comunidades />} />}
              <Route path="/jornadas" element={<ListaJornadas />} />
              <Route path="/jornadas/nueva" element={personal ? <Navigate to="/jornadas" replace /> : <NuevaJornada />} />
              <Route path="/jornadas/:id" element={<JornadaDetalle />} />
              {verInformes && <Route path="/informes" element={<Informes />} />}
              {!personal && <Route path="/vacunas" element={<Vacunas />} />}
              {verInformes && <Route path="/tablero" element={<Suspense fallback={<Cargando filas={6} />}><Tablero /></Suspense>} />}
              {rol === 'administrador' && <Route path="/admin" element={<Admin />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
          <footer className="pie-app">
            Ministerio de Salud Pública y Asistencia Social · {centro.nombre}{centro.departamento ? `, ${centro.departamento}` : ''} · {new Date().getFullYear()}
          </footer>
        </div>

        <AvisoActualizacion />
        <nav className="barra-inf" aria-label="Navegación rápida">
          <NavLink to="/" end><span className="ic-burbuja"><Home size={21} /></span>Inicio</NavLink>
          <NavLink to="/ninos"><span className="ic-burbuja"><Baby size={21} /></span>Niños</NavLink>
          {!personal && <NavLink to="/alertas"><span className="ic-burbuja"><CalendarCheck size={21} />{contador}</span>Control</NavLink>}
          <NavLink to="/jornadas"><span className="ic-burbuja"><Truck size={21} /></span>Jornadas</NavLink>
          <button onClick={() => setMenuAbierto(true)}><span className="ic-burbuja"><MoreHorizontal size={21} /></span>Más</button>
        </nav>
      </div>
    </Sesion.Provider>
  );
}
