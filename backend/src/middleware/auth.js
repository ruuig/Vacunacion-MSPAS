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
 * Autorización por rol. El administrador puede todo (superusuario).
 * La encargada consulta lo mismo que la enfermera, pero no registra ni cambia nada (solo lecturas).
 */
const permitir = (...roles) => (req, res, next) => {
  const rol = req.usuario?.rol;
  if (rol === 'administrador' || roles.includes(rol)) return next();
  if (rol === 'encargado' && req.method === 'GET' && (roles.includes('enfermera') || roles.includes('vacunador'))) return next();
  res.status(403).json({ error: 'No tiene permiso para esta acción.' });
};

const TODOS = ['administrador', 'enfermera', 'vacunador', 'encargado'];
const OPERATIVOS = ['enfermera', 'vacunador'];

module.exports = { autenticar, permitir, TODOS, OPERATIVOS };
