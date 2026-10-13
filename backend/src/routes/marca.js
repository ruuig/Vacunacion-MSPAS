// Logo institucional (sin sesión: también se muestra en la pantalla de inicio de sesión).
// Si el administrador no ha subido uno, responde 404 y la página usa el logo que trae incluido.
const router = require('express').Router();
const { pool } = require('../db');

router.get('/logo', async (req, res) => {
  const { rows: [a] } = await pool.query("SELECT tipo, datos, actualizado FROM archivo_config WHERE clave = 'logo'");
  if (!a) return res.status(404).json({ error: 'Sin logo personalizado.' });
  const etiqueta = `"logo-${new Date(a.actualizado).getTime()}"`;
  res.set({ 'Cache-Control': 'no-cache', ETag: etiqueta, 'Content-Type': a.tipo, 'X-Content-Type-Options': 'nosniff' });
  if (req.headers['if-none-match'] === etiqueta) return res.status(304).end();
  res.send(a.datos);
});

module.exports = router;
