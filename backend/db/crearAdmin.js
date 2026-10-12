// Crea el usuario administrador inicial a partir de ADMIN_USUARIO / ADMIN_CONTRASENA.
const bcrypt = require('bcrypt');
const { pool } = require('../src/db');

(async () => {
  const { ADMIN_USUARIO, ADMIN_CONTRASENA } = process.env;
  if (!ADMIN_USUARIO || !ADMIN_CONTRASENA) throw new Error('Defina ADMIN_USUARIO y ADMIN_CONTRASENA en .env');
  const hash = await bcrypt.hash(ADMIN_CONTRASENA, 12);
  await pool.query(
    `INSERT INTO usuario (nombre, cargo, usuario, hash_contrasena, rol) VALUES ('Administrador','Administrador del sistema',$1,$2,'administrador')
     ON CONFLICT (usuario) DO NOTHING`, [ADMIN_USUARIO, hash]);
  console.log(`Administrador "${ADMIN_USUARIO}" listo.`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
