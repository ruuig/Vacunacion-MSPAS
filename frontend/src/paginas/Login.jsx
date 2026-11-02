import { useState } from 'react';
import { ShieldCheck, User } from 'lucide-react';
import { api } from '../api.js';
import { Campo, EntradaClave, Mensaje } from '../componentes/ui.jsx';
import Logo from '../componentes/Logo.jsx';
import { BotonInstalar } from '../componentes/Pwa.jsx';
import { centroCorto, useCentro } from '../componentes/useCentro.js';

export default function Login({ onEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const centro = useCentro();

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
            <p>{centroCorto(centro)}</p>
            <form onSubmit={enviar}>
              <Campo etiqueta="Usuario">
                <div className="con-icono">
                  <User size={18} />
                  <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required autoComplete="username"
                    autoCapitalize="none" placeholder="Su usuario" />
                </div>
              </Campo>
              <Campo etiqueta="Contraseña">
                <EntradaClave value={contrasena} onChange={(e) => setContrasena(e.target.value)}
                  required autoComplete="current-password" placeholder="••••••••" />
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
