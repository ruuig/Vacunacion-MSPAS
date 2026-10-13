require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cron = require('node-cron');
const { pool } = require('./db');
const { autenticar } = require('./middleware/auth');
const { recalcularTodos } = require('./servicios/esquema');
const { tomarFoto } = require('./indicadores/consultas');
const { migrar } = require('../db/migrar');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' })); // el logo llega como imagen en base64

const api = express.Router();
api.use('/auth', require('./routes/auth'));
api.use('/marca', require('./routes/marca')); // logo: sin sesión, lo usa el inicio de sesión
api.use(autenticar);
api.use('/ninos', require('./routes/ninos'));
api.use('/aplicaciones', require('./routes/aplicaciones'));
api.use('/alertas', require('./routes/alertas'));
api.use('/catalogos', require('./routes/catalogos'));
api.use('/responsables', require('./routes/responsables'));
api.use('/cuadernos', require('./routes/cuadernos'));
api.use('/comunidades', require('./routes/comunidades'));
api.use('/jornadas', require('./routes/jornadas'));
api.use('/informes', require('./routes/informes'));
api.use('/admin', require('./routes/admin'));
api.use('/tablero', require('./routes/tablero'));
api.use('/casos', require('./routes/casos'));
api.use('/acciones', require('./routes/acciones'));
api.use('/lotes', require('./routes/lotes'));
api.use('/seguimiento', require('./routes/seguimiento'));
api.use('/suplementos', require('./routes/suplementos'));
app.use('/api', api);

// Producción: sirve el frontend compilado (frontend/dist) desde el mismo proceso
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Traduce restricciones de la base a mensajes para el personal
app.use((err, _req, res, _next) => {
  if (err.constraint === 'ux_aplicacion_dosis_vigente') return res.status(409).json({ error: 'Esa dosis ya está registrada para este niño.' });
  if (err.constraint === 'nino_cuaderno_id_fila_key') return res.status(409).json({ error: 'Esa fila del cuaderno ya está ocupada.' });
  if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos (CUI o usuario duplicado).' });
  if (err.code === '23514' || err.code === 'P0001') return res.status(422).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno.' });
});

if (require.main === module) {
  // F2: cálculo diario a las 05:00, hora de Guatemala
  cron.schedule('0 5 * * *', async () => {
    const n = await recalcularTodos(pool);
    console.log(`[motor] recalculados ${n} niños`);
  }, { timezone: 'America/Guatemala' });

  // Foto mensual: el día 1 a las 05:15 se guarda el mes que cerró (tendencias)
  cron.schedule('15 5 1 * *', async () => {
    const d = new Date(); d.setDate(0); // último día del mes anterior
    const [anio, mes] = [d.getFullYear(), d.getMonth() + 1];
    const n = await tomarFoto(pool, anio, mes);
    console.log(`[tablero] foto de ${mes}/${anio}: ${n} indicadores`);
  }, { timezone: 'America/Guatemala' });

  // Respaldo automático cada noche a las 23:00; se borran los automáticos más viejos que la retención
  cron.schedule('0 23 * * *', async () => {
    try {
      const respaldos = require('./servicios/respaldos');
      const r = await respaldos.crearRespaldo('auto');
      const { rows: [p] } = await pool.query("SELECT valor FROM parametro WHERE clave = 'respaldo_retencion_dias'");
      const borrados = respaldos.limpiar(Number(p?.valor) || 30);
      console.log(`[respaldo] ${r.nombre} (${Math.round(r.tamano / 1024)} KB), ${borrados} antiguos borrados`);
    } catch (e) { console.error('[respaldo] falló:', e.message); }
  }, { timezone: 'America/Guatemala' });

  const PORT = process.env.PORT || 3100;
  // Las migraciones pendientes se aplican al arrancar: actualizar el sistema no requiere pasos manuales
  migrar(pool, { silencioso: true })
    .then(() => {
      const servidor = app.listen(PORT, () => console.log(`API en http://localhost:${PORT}/api`));
      // Mantiene abiertas las conexiones más que el proxy que las reutiliza (evita ECONNRESET tras unos segundos sin uso)
      servidor.keepAliveTimeout = 65_000;
      servidor.headersTimeout = 66_000;
    })
    .catch((e) => { console.error('No se pudo migrar la base:', e.message); process.exit(1); });
}

module.exports = app;
