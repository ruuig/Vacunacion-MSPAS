// Deja lista la demostración del asesor: la doctora (Dirección) y cada enfermera encargada con usuario y enlazada a su puesto o barrio.
// Se puede correr varias veces: no duplica usuarios ni cambia contraseñas que ya existen.
//   DEMO_CONTRASENA=... node scripts/preparar-demostracion.js  → crea los usuarios que falten y los enlaza a sus lugares
//   node scripts/preparar-demostracion.js --revisar             → solo muestra cómo queda, sin cambiar nada
// La contraseña de los usuarios nuevos sale de DEMO_CONTRASENA; si no se da, se genera una al azar y se muestra al final.
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../src/db');

const CONTRASENA = process.env.DEMO_CONTRASENA || crypto.randomBytes(9).toString('base64url');
// Enfermeras encargadas de puesto o barrio (usuario, nombre como está anotado en el territorio, cargo)
const PERSONAL = [
  ['yoseline.lorenzo', 'Yoseline Lorenzo', 'Auxiliar de enfermería'],
  ['sandra.damian', 'Sandra Damián', 'Auxiliar de enfermería'],
  ['victor.agustin', 'Víctor Agustín', 'Técnico en salud rural'],
  ['fabio.damian', 'Fabio Damián', 'Técnico en salud rural'],
  ['migdalia.hernandez', 'Migdalia Hernández', 'Auxiliar de enfermería'],
  ['ludvin.portela', 'Ludvin Portela', 'Técnico en salud rural'],
  ['dora.felipe', 'Dora Felipe', 'Auxiliar de enfermería'],
  ['eunice.damian', 'Eunice Damián', 'Auxiliar de enfermería'],
  ['dorca.perez', 'Dorca Pérez', 'Auxiliar de enfermería'],
  ['karina.gregorio', 'Karina Gregorio', 'Auxiliar de enfermería'],
];
const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

(async () => {
  const revisar = process.argv.includes('--revisar');
  if (!revisar) {
    const hash = await bcrypt.hash(CONTRASENA, 12);
    for (const [usuario, nombre, cargo] of PERSONAL) {
      await pool.query(`INSERT INTO usuario (nombre, cargo, usuario, hash_contrasena, rol) VALUES ($1,$2,$3,$4,'enfermera')
        ON CONFLICT (usuario) DO UPDATE SET rol = 'enfermera', cargo = CASE WHEN usuario.cargo = '' THEN EXCLUDED.cargo ELSE usuario.cargo END`, [nombre, cargo, usuario, hash]);
      await pool.query('INSERT INTO cargo (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [cargo]);
    }
    // La doctora, coordinadora del distrito: rol Dirección (administrador)
    await pool.query(`INSERT INTO usuario (nombre, cargo, usuario, hash_contrasena, rol)
      VALUES ('Doctora del distrito', 'Coordinadora del distrito', 'doctora', $1, 'administrador') ON CONFLICT (usuario) DO NOTHING`, [hash]);
    await pool.query("INSERT INTO cargo (nombre) VALUES ('Coordinadora del distrito') ON CONFLICT (nombre) DO NOTHING");
    // Cada lugar con el nombre de su responsable anotado queda enlazado al usuario de esa persona
    const { rows: usuarios } = await pool.query("SELECT id, nombre FROM usuario WHERE activo AND rol = 'enfermera'");
    const { rows: lugares } = await pool.query('SELECT id, nombre, responsable FROM comunidad WHERE activo AND responsable IS NOT NULL');
    for (const l of lugares) {
      const u = usuarios.find((x) => sinTildes(x.nombre) === sinTildes(l.responsable));
      if (u) await pool.query('UPDATE comunidad SET responsable_id = $2 WHERE id = $1', [l.id, u.id]);
    }
  }
  const { rows } = await pool.query(`
    SELECT u.usuario, u.nombre, string_agg(CASE WHEN c.es_central THEN 'Puesto ' || c.nombre ELSE c.nombre END, ', ' ORDER BY c.nombre) AS a_cargo
    FROM usuario u LEFT JOIN comunidad c ON c.responsable_id = u.id AND c.activo
    WHERE u.activo AND u.rol = 'enfermera' GROUP BY u.id ORDER BY u.nombre`);
  console.log('\nEnfermeras encargadas y su puesto' + (revisar ? '' : ' (contraseña de los usuarios nuevos: ' + CONTRASENA + ')') + '\n');
  for (const r of rows) console.log(`  ${r.usuario.padEnd(20)} ${r.nombre.padEnd(28)} ${r.a_cargo || '— sin lugar (ve todo el municipio)'}`);
  const { rows: sin } = await pool.query(`SELECT c.nombre FROM comunidad c LEFT JOIN comunidad p ON p.id = c.comunidad_padre_id
    WHERE c.activo AND c.responsable_id IS NULL AND (p.id IS NULL OR p.responsable_id IS NULL) AND c.tipo <> 'casco_urbano' ORDER BY 1`);
  if (sin.length) console.log('\nLugares sin responsable con usuario: ' + sin.map((x) => x.nombre).join(', '));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
