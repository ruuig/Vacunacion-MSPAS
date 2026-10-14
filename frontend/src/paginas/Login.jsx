import { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { api } from '../api.js';
import { Campo, Mensaje } from '../componentes/ui.jsx';
import Logo from '../componentes/Logo.jsx';
import { BotonInstalar } from '../componentes/Pwa.jsx';

export default function Login({ onEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      onEntrar(await api('/auth/login', { method: 'POST', body: { usuario, contrasena } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login">
      <section className="login-form-lado">
        <div className="login-caja">
          <Logo className="logo" />
          <div className="login-tarjeta">
            <h1 className="login-titulo">Control de vacunación infantil</h1>
            <p>C. S. San Luis Jilotepeque, Jalapa</p>
            <form onSubmit={enviar}>
              <Campo etiqueta="Usuario">
                <div className="con-icono">
                  <User size={18} />
                  <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required autoComplete="username"
                    autoCapitalize="none" placeholder="Su usuario" />
                </div>
              </Campo>
              <Campo etiqueta="Contraseña">
                <div className="con-icono">
                  <Lock size={18} />
                  <input type={verClave ? 'text' : 'password'} value={contrasena} onChange={(e) => setContrasena(e.target.value)}
                    required autoComplete="current-password" placeholder="••••••••" style={{ paddingRight: '3rem' }} />
                  <button type="button" className="btn btn-fantasma btn-sm btn-icono mostrar-clave" onClick={() => setVerClave(!verClave)}
                    aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {verClave ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </Campo>
              {error && <Mensaje tipo="error">{error}</Mensaje>}
              <button className="btn btn-primario btn-bloque" disabled={cargando}>{cargando ? 'Verificando…' : 'Entrar al sistema'}</button>
            </form>
          </div>
          <BotonInstalar className="en-login" />
          <p className="login-nota"><ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> Acceso restringido al personal autorizado. Toda acción queda registrada en la bitácora.</p>
        </div>
      </section>
    </div>
  );
}
