// Aplica en orden las migraciones de db/migraciones que aún no se aplicaron (tabla migracion).
// Cada archivo corre en una transacción: si falla, no queda a medias.
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function migrar(db = pool, { silencioso = false } = {}) {
  await db.query('CREATE TABLE IF NOT EXISTS migracion (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())');
  const hechas = new Set((await db.query('SELECT nombre FROM migracion')).rows.map((r) => r.nombre));
  const dir = path.join(__dirname, 'migraciones');
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('INSERT INTO migracion (nombre) VALUES ($1)', [f]);
      await c.query('COMMIT');
      if (!silencioso) console.log(`migración ${f} aplicada`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`${f}: ${e.message}`);
    } finally {
      c.release();
    }
  }
}

module.exports = { migrar };

if (require.main === module) {
  migrar().then(() => pool.end()).catch((e) => { console.error(e.message); process.exit(1); });
}
