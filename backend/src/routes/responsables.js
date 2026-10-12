const router = require('express').Router();
const { pool, transaccion, registrarBitacora } = require('../db');
const { permitir, TODOS, OPERATIVOS } = require('../middleware/auth');
const esq = require('../servicios/esquema');

const NOMBRES = ['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido'];
const CAMPOS = [...NOMBRES, 'cui', 'fecha_nacimiento', 'departamento', 'municipio', 'comunidad_id', 'direccion_detalle',
  'numero_casa', 'numero_sector', 'telefono', 'idioma_preferente'];

function normalizar(datos) {
  const o = {};
  for (const k of CAMPOS) if (datos[k] !== undefined) o[k] = datos[k] === '' ? null : datos[k];
  for (const k of NOMBRES) if (o[k]) o[k] = o[k].trim().toUpperCase();
  return o;
}

/**
 * Crea o reutiliza el responsable dentro de una transacción. Si trae id o un CUI ya registrado,
 * se reutiliza la persona (hermanos) y se actualizan sus datos.
 */
async function guardarResponsable(c, req, datos) {
  const o = normalizar(datos);
  let existente = null;
  if (datos.id) existente = (await c.query('SELECT * FROM responsable WHERE id = $1', [datos.id])).rows[0];
  else if (o.cui) existente = (await c.query('SELECT * FROM responsable WHERE cui = $1', [o.cui])).rows[0];

  if (existente) {
    const claves = Object.keys(o);
    if (!claves.length) return existente;
    const { rows: [r] } = await c.query(
      `UPDATE responsable SET ${claves.map((k, i) => `${k} = $${i + 2}`)} WHERE id = $1 RETURNING *`,
      [existente.id, ...Object.values(o)]);
    await registrarBitacora(c, req, 'editar', 'responsable', r.id, existente, r);
    return r;
  }
  const claves = Object.keys(o);
  const { rows: [r] } = await c.query(
    `INSERT INTO responsable (${claves}) VALUES (${claves.map((_, i) => '$' + (i + 1))}) RETURNING *`, Object.values(o));
  await registrarBitacora(c, req, 'crear', 'responsable', r.id, null, r);
  return r;
}

// Buscar responsable por CUI para reutilizarlo al registrar un hermano
router.get('/', permitir(...TODOS), async (req, res) => {
  const { cui } = req.query;
  if (!cui) return res.json([]);
  const { rows } = await pool.query(
    `SELECT r.*, (SELECT count(*)::int FROM nino_responsable nr WHERE nr.responsable_id = r.id) AS ninos
     FROM responsable r WHERE r.cui = $1`, [cui]);
  res.json(rows);
});

// Editar responsable; si cambia de comunidad, sus niños (como responsable principal) cambian también
router.put('/:id', permitir(...OPERATIVOS), async (req, res) => {
  const r = await transaccion(async (c) => {
    const r = await guardarResponsable(c, req, { ...req.body, id: Number(req.params.id) });
    const { rows: ninos } = await c.query(
      `UPDATE nino n SET comunidad_id = $2 FROM nino_responsable nr
       WHERE nr.nino_id = n.id AND nr.responsable_id = $1 AND nr.es_principal AND n.comunidad_id <> $2 RETURNING n.*`,
      [r.id, r.comunidad_id]);
    for (const n of ninos) await esq.sincronizarAlertas(c, n);
    return r;
  });
  res.json(r);
});

module.exports = router;
module.exports.guardarResponsable = guardarResponsable;
