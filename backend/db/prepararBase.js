// Arranque en un servidor nuevo (Render): crea las tablas y catálogos si la base está vacía,
// aplica las migraciones pendientes y crea el administrador inicial. Se puede correr en cada arranque.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('../src/db');
const { migrar } = require('./migrar');

(async () => {
  const { rows: [{ existe }] } = await pool.query("SELECT to_regclass('public.nino') IS NOT NULL AS existe");
  if (!existe) {
    for (const f of ['schema.sql', 'seed.sql']) await pool.query(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    console.log('Base nueva: tablas y catálogos creados');
  }
  await migrar(pool, { silencioso: true });
  const { ADMIN_USUARIO, ADMIN_CONTRASENA } = process.env;
  if (ADMIN_USUARIO && ADMIN_CONTRASENA) {
    const { rowCount } = await pool.query(
      `INSERT INTO usuario (nombre, cargo, usuario, hash_contrasena, rol) VALUES ('Administrador','Administrador del sistema',$1,$2,'administrador')
       ON CONFLICT (usuario) DO NOTHING`, [ADMIN_USUARIO, await bcrypt.hash(ADMIN_CONTRASENA, 12)]);
    if (rowCount) console.log(`Administrador "${ADMIN_USUARIO}" creado`);
  }
  await pool.end();
})().catch((e) => { console.error('No se pudo preparar la base:', e.message); process.exit(1); });
