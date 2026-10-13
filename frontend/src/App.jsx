import { createContext, lazy, Suspense, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import {
  Baby, Bell, CalendarCheck, BookOpen, FileText, Home, LayoutDashboard, LogOut, MapPinned, Menu, Package, Search, Settings, Truck, MoreHorizontal,
} from 'lucide-react';
import { api, sesionGuardada, guardarSesion } from './api.js';
import { cola } from './componentes/fueraDeLinea.js';
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
// El tablero (con la librería de gráficas) se descarga solo al abrirlo
const Tablero = lazy(() => import('./paginas/Tablero.jsx'));

const Sesion = createContext(null);
export const useSesion = () => useContext(Sesion);

export const ROL = { administrador: 'Administrador', enfermera: 'Enfermera', vacunador: 'Personal de vacunación' };

export default function App() {
  const [sesion, setSesion] = useState(sesionGuardada);
  const [resumen, setResumen] = useState([]);
  const [pendientes, setPendientes] = useState({ total: 0, mios: 0 });
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  const entrar = (s) => { guardarSesion(s); setSesion(s); };
  const salir = async () => {
    // Lo registrado sin señal está solo en este teléfono: salir no lo borra, pero se envía con la sesión de quien entre
    if (cola().length && !window.confirm('Hay registros guardados sin enviar en este teléfono. ¿Salir de todos modos? Se enviarán cuando alguien vuelva a entrar con señal.')) return;
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* sesión ya vencida */ }
    guardarSesion(null);
    await borrarDatosGuardados();
    setSesion(null);
  };

  // RF-16: contador de alertas en el menú
  const refrescarAlertas = useCallback(() => {
    if (!sesion) return;
    api('/alertas/resumen').then(setResumen).catch(() => {});
    api('/casos/conteo').then(setPendientes).catch(() => {});
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
  // El número del menú es de niños por contactar (no de alertas): lo que el personal tiene que hacer
  const totalAlertas = pendientes.total;
  const verInformes = ['enfermera', 'administrador'].includes(rol);
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
              <span>C. S. San Luis Jilotepeque, Jalapa</span>
            </div>
          </div>
          <nav className="menu">
            <div className="menu-titulo">Principal</div>
            <NavLink to="/" end><Home size={19} />Inicio</NavLink>
            <NavLink to="/ninos"><Baby size={19} />Niños</NavLink>
            <NavLink to="/alertas"><CalendarCheck size={19} />Control del mes{contador}</NavLink>
            <div className="menu-titulo">Territorio</div>
            <NavLink to="/comunidades"><MapPinned size={19} />Comunidades</NavLink>
            <NavLink to="/jornadas"><Truck size={19} />Jornadas</NavLink>
            <NavLink to="/cuadernos"><BookOpen size={19} />Cuadernos SIGSA 5a</NavLink>
            {(verInformes || rol === 'administrador') && <div className="menu-titulo">Gestión</div>}
            {verInformes && <NavLink to="/tablero"><LayoutDashboard size={19} />Tablero</NavLink>}
            {verInformes && <NavLink to="/informes"><FileText size={19} />Informes</NavLink>}
            {verInformes && <NavLink to="/vacunas"><Package size={19} />Vacunas</NavLink>}
            {rol === 'administrador' && <NavLink to="/admin"><Settings size={19} />Administración</NavLink>}
          </nav>
          <BotonInstalar className="en-lateral" />
          <div className="lateral-pie">
            <div className="avatar">{iniciales(nombre)}</div>
            <div className="quien">
              <strong>{nombre}</strong>
              <span>{ROL[rol]}</span>
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
              <span>San Luis Jilotepeque</span>
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
              <Route path="/alertas" element={<Alertas />} />
              <Route path="/cuadernos" element={<ListaCuadernos />} />
              <Route path="/cuadernos/:id" element={<CuadernoDetalle />} />
              <Route path="/comunidades" element={<Comunidades />} />
              <Route path="/jornadas" element={<ListaJornadas />} />
              <Route path="/jornadas/nueva" element={<NuevaJornada />} />
              <Route path="/jornadas/:id" element={<JornadaDetalle />} />
              {verInformes && <Route path="/informes" element={<Informes />} />}
              {verInformes && <Route path="/vacunas" element={<Vacunas />} />}
              {verInformes && <Route path="/tablero" element={<Suspense fallback={<Cargando filas={6} />}><Tablero /></Suspense>} />}
              {rol === 'administrador' && <Route path="/admin" element={<Admin />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
          <footer className="pie-app">
            Ministerio de Salud Pública y Asistencia Social · Centro de Salud San Luis Jilotepeque, Jalapa · {new Date().getFullYear()}
          </footer>
        </div>

        <AvisoActualizacion />
        <nav className="barra-inf" aria-label="Navegación rápida">
          <NavLink to="/" end><span className="ic-burbuja"><Home size={21} /></span>Inicio</NavLink>
          <NavLink to="/ninos"><span className="ic-burbuja"><Baby size={21} /></span>Niños</NavLink>
          <NavLink to="/alertas"><span className="ic-burbuja"><CalendarCheck size={21} />{contador}</span>Control</NavLink>
          <NavLink to="/jornadas"><span className="ic-burbuja"><Truck size={21} /></span>Jornadas</NavLink>
          <button onClick={() => setMenuAbierto(true)}><span className="ic-burbuja"><MoreHorizontal size={21} /></span>Más</button>
        </nav>
      </div>
    </Sesion.Provider>
  );
}
