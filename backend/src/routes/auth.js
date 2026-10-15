const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, transaccion, registrarBitacora } = require('../db');
const { autenticar } = require('../middleware/auth');

const MAX_INTENTOS = 5;
const CREDENCIALES_INVALIDAS = { error: 'Usuario o contraseña incorrectos.' };
const USUARIO_BLOQUEADO = {
  error: 'Usuario bloqueado. Contacte al administrador.',
};

// RF-01 inicio de sesión con bloqueo tras 5 intentos fallidos
router.post('/login', async (req, res) => {
  const { usuario, contrasena } = req.body || {};
  const { rows: [u] } = await pool.query('SELECT * FROM usuario WHERE usuario = $1', [usuario]);
  if (!u || !u.activo) return res.status(401).json(CREDENCIALES_INVALIDAS);
  if (u.intentos_fallidos >= MAX_INTENTOS) return res.status(423).json(USUARIO_BLOQUEADO);

  const ok = await bcrypt.compare(contrasena || '', u.hash_contrasena);
  await transaccion(async (c) => {
    const cambio = ok
      ? 'intentos_fallidos = 0, ultimo_acceso = now()'
      : 'intentos_fallidos = intentos_fallidos + 1';
    await c.query(`UPDATE usuario SET ${cambio} WHERE id = $1`, [u.id]);
    const autor = { ip: req.ip, usuario: { id: u.id } };
    await registrarBitacora(c, autor, ok ? 'login' : 'login_fallido', 'usuario', u.id);
  });
  if (!ok) return res.status(401).json(CREDENCIALES_INVALIDAS);

  const sector = (await require('../territorio').territorioDe(pool, u.id)).length;
  // Lugar principal del que está a cargo (el puesto; si no tiene puesto, sus barrios o aldeas): se muestra en la pantalla
  const { rows: lugares } = await pool.query(`
    SELECT CASE WHEN tipo = 'casco_urbano' THEN 'Casco urbano' WHEN es_central THEN 'Puesto ' || nombre
                WHEN tipo = 'barrio' THEN 'Barrio ' || nombre ELSE nombre END AS nombre
    FROM comunidad WHERE activo AND responsable_id = $1 ORDER BY es_central DESC, nombre`, [u.id]);
  const lugar = lugares.length ? (lugares[0].nombre.startsWith('Puesto') || lugares[0].nombre === 'Casco urbano' ? lugares[0].nombre : lugares.map((l) => l.nombre).join(', ')) : null;
  const perfil = { id: u.id, nombre: u.nombre, rol: u.rol, sector, lugar };
  const token = jwt.sign(perfil, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, usuario: perfil });
});

router.post('/logout', autenticar, async (req, res) => {
  await registrarBitacora(pool, req, 'logout', 'usuario', req.usuario.id);
  res.json({ ok: true });
});

// Comprobación de conexión de la app instalada (PWA): pública y sin datos
router.get('/ping', (_req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }));

module.exports = router;
