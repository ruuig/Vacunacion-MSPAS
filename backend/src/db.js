require('dotenv').config();
const { Pool, types } = require('pg');

types.setTypeParser(1082, (v) => v); // DATE como 'YYYY-MM-DD', sin zona horaria

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Ejecuta fn(client) dentro de una transacción. */
async function transaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Inserta en bitácora (solo inserción). */
function registrarBitacora(client, req, accion, tabla, registroId, antes = null, despues = null) {
  return client.query(
    `INSERT INTO bitacora (usuario_id, accion, tabla, registro_id, antes, despues, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [req.usuario?.id ?? null, accion, tabla, registroId != null ? String(registroId) : null, antes, despues, req.ip]
  );
}

module.exports = { pool, transaccion, registrarBitacora };
