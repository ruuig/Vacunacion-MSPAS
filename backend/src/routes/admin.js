// Administración: usuarios, parámetros, esquema y bitácora (RF-23, RF-24)
const router = require('express').Router();
const bcrypt = require('bcrypt');
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir } = require('../middleware/auth');
const { tomarFoto } = require('../indicadores/consultas');

router.use(permitir('administrador'));

const SIN_HASH = 'id, nombre, cargo, usuario, rol, activo, intentos_fallidos, ultimo_acceso';

router.get('/usuarios', async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${SIN_HASH} FROM usuario ORDER BY activo DESC, nombre`);
  res.json(rows);
});

router.post('/usuarios', async (req, res) => {
  const { nombre, cargo = '', usuario, contrasena, rol } = req.body || {};
  if (!nombre || !usuario || !rol) return res.status(400).json({ error: 'Indique nombre, usuario y rol.' });
  if (!contrasena || contrasena.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  const u = await transaccion(async (c) => {
    const { rows: [u] } = await c.query(
      `INSERT INTO usuario (nombre, cargo, usuario, hash_contrasena, rol) VALUES ($1,$2,$3,$4,$5) RETURNING ${SIN_HASH}`,
      [nombre, cargo, usuario.trim().toLowerCase(), await bcrypt.hash(contrasena, 12), rol]);
    await registrarBitacora(c, req, 'crear', 'usuario', u.id, null, u);
    return u;
  });
  res.status(201).json(u);
});

// Editar, desactivar, desbloquear o cambiar contraseña
router.put('/usuarios/:id', async (req, res) => {
  const { nombre, cargo, rol, activo, contrasena, desbloquear } = req.body || {};
  if (contrasena && contrasena.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  if (Number(req.params.id) === req.usuario.id && (activo === false || (rol && rol !== 'administrador')))
    return res.status(400).json({ error: 'No puede desactivarse ni quitarse el rol de administrador a sí mismo.' });
  const u = await transaccion(async (c) => {
    const { rows: [antes] } = await c.query(`SELECT ${SIN_HASH} FROM usuario WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!antes) return null;
    const hash = contrasena ? await bcrypt.hash(contrasena, 12) : null;
    const { rows: [u] } = await c.query(
      `UPDATE usuario SET nombre = $2, cargo = $3, rol = $4, activo = $5,
         hash_contrasena = coalesce($6, hash_contrasena),
         intentos_fallidos = CASE WHEN $7 OR $6 IS NOT NULL THEN 0 ELSE intentos_fallidos END
       WHERE id = $1 RETURNING ${SIN_HASH}`,
      [antes.id, nombre ?? antes.nombre, cargo ?? antes.cargo, rol ?? antes.rol, activo ?? antes.activo, hash, Boolean(desbloquear)]);
    await registrarBitacora(c, req, contrasena ? 'cambiar_contrasena' : 'editar', 'usuario', u.id, antes, u);
    return u;
  });
  u ? res.json(u) : res.status(404).json({ error: 'Usuario no encontrado.' });
});

router.get('/parametros', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM parametro ORDER BY clave');
  res.json(rows);
});

router.put('/parametros/:clave', async (req, res) => {
  const { valor } = req.body || {};
  if (valor == null || valor === '') return res.status(400).json({ error: 'Indique un valor.' });
  const p = await transaccion(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM parametro WHERE clave = $1', [req.params.clave]);
    if (!antes) return null;
    const { rows: [p] } = await c.query('UPDATE parametro SET valor = $2 WHERE clave = $1 RETURNING *', [antes.clave, String(valor)]);
    await registrarBitacora(c, req, 'editar', 'parametro', p.clave, antes, p);
    return p;
  });
  p ? res.json(p) : res.status(404).json({ error: 'Parámetro no encontrado.' });
});

// Esquema como datos: edades e intervalos editables sin tocar el código
router.get('/esquema', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT d.*, s.nombre AS serie, s.estacional, s.informativa FROM esquema_dosis d JOIN serie s ON s.id = d.serie_id ORDER BY d.orden`);
  res.json(rows);
});

router.put('/esquema/:id', async (req, res) => {
  const campos = ['edad_recomendada_dias', 'edad_minima_dias', 'edad_maxima_dias', 'intervalo_minimo_dias', 'intervalo_recomendado_dias',
    'aplica_nacidos_desde', 'activo'];
  const o = Object.fromEntries(campos.filter((k) => req.body?.[k] !== undefined).map((k) => [k, req.body[k] === '' ? null : req.body[k]]));
  if (!Object.keys(o).length) return res.status(400).json({ error: 'Nada que actualizar.' });
  const d = await transaccion(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM esquema_dosis WHERE id = $1', [req.params.id]);
    if (!antes) return null;
    const { rows: [d] } = await c.query(
      `UPDATE esquema_dosis SET ${Object.keys(o).map((k, i) => `${k} = $${i + 2}`)} WHERE id = $1 RETURNING *`,
      [antes.id, ...Object.values(o)]);
    await registrarBitacora(c, req, 'editar', 'esquema_dosis', d.id, antes, d);
    return d;
  });
  d ? res.json(d) : res.status(404).json({ error: 'Dosis no encontrada.' });
});

router.get('/bitacora', async (req, res) => {
  const { desde, hasta, usuario, tabla, accion } = req.query;
  const { rows } = await pool.query(`
    SELECT b.id, b.fecha_hora, b.accion, b.tabla, b.registro_id, b.ip, b.antes, b.despues, u.nombre AS usuario
    FROM bitacora b LEFT JOIN usuario u ON u.id = b.usuario_id
    WHERE ($1::date IS NULL OR b.fecha_hora >= $1::date) AND ($2::date IS NULL OR b.fecha_hora < $2::date + 1)
      AND ($3::int IS NULL OR b.usuario_id = $3) AND ($4::text IS NULL OR b.tabla = $4) AND ($5::text IS NULL OR b.accion = $5)
    ORDER BY b.fecha_hora DESC LIMIT 300`, [desde || null, hasta || null, usuario || null, tabla || null, accion || null]);
  res.json(rows);
});

// Recalcular la foto mensual de indicadores de un año (o de un mes) para las tendencias del tablero
router.post('/fotos', async (req, res) => {
  const anio = Number(req.body?.anio) || new Date().getFullYear();
  const ahora = new Date();
  const ultimo = anio < ahora.getFullYear() ? 12 : ahora.getMonth() + 1;
  const meses = req.body?.mes ? [Number(req.body.mes)] : Array.from({ length: ultimo }, (_, i) => i + 1);
  let total = 0;
  for (const m of meses) total += await tomarFoto(pool, anio, m);
  await registrarBitacora(pool, req, 'editar', 'indicador_mensual', anio, null, { anio, meses });
  res.json({ anio, meses, indicadores: total });
});

module.exports = router;
