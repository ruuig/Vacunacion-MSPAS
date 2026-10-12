// Crea las tablas y carga los catálogos (schema.sql + seed.sql + migraciones) usando DATABASE_URL.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { migrar } = require('./migrar');

(async () => {
  for (const f of ['schema.sql', 'seed.sql']) {
    await pool.query(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    console.log(`${f} aplicado`);
  }
  await migrar(pool);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
