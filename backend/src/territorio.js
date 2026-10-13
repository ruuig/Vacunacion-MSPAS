// Comunidades a cargo de un usuario: las que tiene como responsable y, si es responsable de un puesto,
// las comunidades de ese puesto que no tienen un responsable propio.
const SQL_TERRITORIO = `
  SELECT c.id FROM comunidad c LEFT JOIN comunidad p ON p.id = c.comunidad_padre_id
  WHERE c.activo AND (c.responsable_id = $1 OR (c.responsable_id IS NULL AND p.responsable_id = $1))`;

async function territorioDe(db, usuarioId) {
  const { rows } = await db.query(SQL_TERRITORIO, [usuarioId]);
  return rows.map((r) => r.id);
}

module.exports = { territorioDe, SQL_TERRITORIO };
