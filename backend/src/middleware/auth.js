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

/** Autorización por rol (matriz de la sección 4). */
const permitir = (...roles) => (req, res, next) => {
  if (roles.includes(req.usuario?.rol)) return next();
  res.status(403).json({ error: 'No tiene permiso para esta acción.' });
};

const TODOS = ['administrador', 'enfermera', 'vacunador'];
const OPERATIVOS = ['enfermera', 'vacunador'];

module.exports = { autenticar, permitir, TODOS, OPERATIVOS };
