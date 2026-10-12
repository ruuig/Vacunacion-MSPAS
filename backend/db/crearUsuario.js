// Crea o actualiza un usuario desde la terminal (mientras no exista la pantalla de administración).
// Uso: node db/crearUsuario.js <usuario> <contraseña> <rol> "<nombre>" "<cargo>"
//   rol: administrador | enfermera | vacunador
const bcrypt = require('bcrypt');
const { pool } = require('../src/db');

(async () => {
  const [usuario, contrasena, rol, nombre, cargo = ''] = process.argv.slice(2);
  if (!usuario || !contrasena || !rol || !nombre)
    throw new Error('Uso: node db/crearUsuario.js <usuario> <contraseña> <rol> "<nombre>" "<cargo>"');
  if (!['administrador', 'enfermera', 'vacunador'].includes(rol)) throw new Error('Rol no válido.');
  if (contrasena.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const hash = await bcrypt.hash(contrasena, 12);
  await pool.query(
    `INSERT INTO usuario (nombre, cargo, usuario, hash_contrasena, rol) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (usuario) DO UPDATE SET nombre = $1, cargo = $2, hash_contrasena = $4, rol = $5, intentos_fallidos = 0, activo = true`,
    [nombre, cargo, usuario, hash, rol]);
  console.log(`Usuario "${usuario}" (${rol}) listo.`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
