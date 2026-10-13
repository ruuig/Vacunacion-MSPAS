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
  if (d) require('../servicios/esquema').recalcularTodos(pool).catch((e) => console.error('[esquema] recálculo:', e.message));
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

// ---- Logo institucional ----
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO = 1024 * 1024; // 1 MB: suficiente para un logo nítido y liviano en el celular

// Recibe la imagen como data URL ("data:image/png;base64,..."); no se aceptan SVG (podrían llevar código)
router.put('/logo', async (req, res) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.imagen || '');
  if (!m || !TIPOS_LOGO.includes(m[1])) return res.status(400).json({ error: 'Suba una imagen PNG, JPG o WEBP.' });
  const datos = Buffer.from(m[2], 'base64');
  if (datos.length > MAX_LOGO) return res.status(400).json({ error: 'La imagen pesa más de 1 MB; redúzcala e intente de nuevo.' });
  await pool.query(`INSERT INTO archivo_config (clave, tipo, datos, actualizado, actualizado_por) VALUES ('logo', $1, $2, now(), $3)
                    ON CONFLICT (clave) DO UPDATE SET tipo = $1, datos = $2, actualizado = now(), actualizado_por = $3`,
  [m[1], datos, req.usuario.id]);
  await registrarBitacora(pool, req, 'editar', 'archivo_config', 'logo', null, { tipo: m[1], bytes: datos.length });
  res.json({ ok: true });
});

// Volver al logo original que trae el sistema
router.delete('/logo', async (req, res) => {
  await pool.query("DELETE FROM archivo_config WHERE clave = 'logo'");
  await registrarBitacora(pool, req, 'eliminar', 'archivo_config', 'logo');
  res.json({ ok: true });
});

// ---- Respaldos de la base de datos ----
const respaldos = require('../servicios/respaldos');

router.get('/respaldos', async (_req, res) => {
  const { rows: [p] } = await pool.query("SELECT valor FROM parametro WHERE clave = 'respaldo_retencion_dias'");
  res.json({ respaldos: respaldos.listar(), retencion_dias: Number(p?.valor) || 30, hora_automatica: '23:00' });
});

router.post('/respaldos', async (req, res) => {
  let r;
  try { r = await respaldos.crearRespaldo('manual'); } catch (e) { return res.status(500).json({ error: e.message }); }
  await registrarBitacora(pool, req, 'crear', 'respaldo', r.nombre, null, r);
  res.status(201).json(r);
});

// Descargar un respaldo al dispositivo para guardarlo fuera del servidor
router.get('/respaldos/:nombre', async (req, res) => {
  const r = respaldos.ruta(req.params.nombre);
  if (!r) return res.status(404).json({ error: 'Respaldo no encontrado.' });
  await registrarBitacora(pool, req, 'descargar', 'respaldo', req.params.nombre);
  res.download(r, req.params.nombre);
});

// Subir un respaldo guardado en el dispositivo (el archivo .dump viaja tal cual, sin JSON)
router.post('/respaldos/subir', require('express').raw({ type: 'application/octet-stream', limit: '300mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Elija un archivo de respaldo (.dump).' });
  let r;
  try { r = await respaldos.guardarSubido(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  await registrarBitacora(pool, req, 'crear', 'respaldo', r.nombre, null, { ...r, original: req.get('x-nombre-archivo') || null });
  res.status(201).json(r);
});

// Restaurar: antes se saca un respaldo del estado actual para poder deshacer
router.post('/respaldos/:nombre/restaurar', async (req, res) => {
  if (req.body?.confirmacion !== 'RESTAURAR') return res.status(400).json({ error: 'Escriba RESTAURAR para confirmar.' });
  if (!respaldos.ruta(req.params.nombre)) return res.status(404).json({ error: 'Respaldo no encontrado.' });
  let previo;
  try {
    previo = await respaldos.crearRespaldo('previo');
    await respaldos.restaurar(req.params.nombre);
  } catch (e) { return res.status(500).json({ error: e.message }); }
  // El respaldo puede ser de una versión anterior: se aplican las migraciones que falten y se recalculan las alertas
  await require('../../db/migrar').migrar(pool, { silencioso: true });
  await registrarBitacora(pool, req, 'restaurar', 'respaldo', req.params.nombre, null, { previo: previo.nombre });
  require('../servicios/esquema').recalcularTodos(pool).catch((e) => console.error('[restaurar] recálculo:', e.message));
  res.json({ ok: true, previo: previo.nombre });
});

router.delete('/respaldos/:nombre', async (req, res) => {
  const r = respaldos.ruta(req.params.nombre);
  if (!r) return res.status(404).json({ error: 'Respaldo no encontrado.' });
  require('fs').rmSync(r, { force: true });
  await registrarBitacora(pool, req, 'eliminar', 'respaldo', req.params.nombre);
  res.json({ ok: true });
});

module.exports = router;
