const jwt = require('jsonwebtoken');

async function autenticar(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  let datos;
  try {
    datos = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión no válida o vencida.' });
  }
  // El rol vigente es el de la base, no el que tenía al iniciar sesión (así un cambio de rol vale de inmediato)
  const { rows: [u] } = await require('../db').pool.query('SELECT rol, activo FROM usuario WHERE id = $1', [datos.id]);
  if (!u || !u.activo) return res.status(401).json({ error: 'Su usuario ya no está activo. Hable con la Dirección.' });
  req.usuario = { ...datos, rol: u.rol };
  next();
}

/**
 * Autorización por rol. Tres roles: administrador (configura y puede todo), enfermera y personal de vacunación.
 */
const permitir = (...roles) => (req, res, next) => {
  const rol = req.usuario?.rol;
  if (rol === 'administrador' || roles.includes(rol)) return next();
  res.status(403).json({ error: 'Esta opción no corresponde a su rol.', sin_permiso: true });
};

const TODOS = ['administrador', 'enfermera', 'vacunador'];
const OPERATIVOS = ['enfermera', 'vacunador'];

module.exports = { autenticar, permitir, TODOS, OPERATIVOS };
