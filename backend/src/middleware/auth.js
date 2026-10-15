const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión no válida o vencida.' });
  }
}

/**
 * Autorización por rol. Tres roles: administrador (configura y puede todo), enfermera y personal de vacunación.
 */
const permitir = (...roles) => (req, res, next) => {
  const rol = req.usuario?.rol;
  if (rol === 'administrador' || roles.includes(rol)) return next();
  res.status(403).json({ error: 'No tiene permiso para esta acción.' });
};

const TODOS = ['administrador', 'enfermera', 'vacunador'];
const OPERATIVOS = ['enfermera', 'vacunador'];

module.exports = { autenticar, permitir, TODOS, OPERATIVOS };
