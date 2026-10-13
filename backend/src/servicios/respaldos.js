// Respaldos de la base de datos en el servidor (pg_dump en formato custom, el que lee pg_restore).
// Cada respaldo se verifica con pg_restore --list antes de darlo por bueno.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const ejecutar = promisify(execFile);
const CARPETA = process.env.RESPALDO_DIR || path.join(__dirname, '..', '..', 'respaldos');
// Carpeta de los binarios de PostgreSQL si no están en el PATH (por ejemplo, C:\Program Files\PostgreSQL\16\bin)
const binario = (nombre) => (process.env.PG_BIN ? path.join(process.env.PG_BIN, nombre) : nombre);
// Solo nombres que genera el propio sistema: evita que se pida un archivo fuera de la carpeta
// auto: el de cada noche · manual: creado por el administrador · subido: traído desde un dispositivo ·
// previo: el que se saca solo antes de restaurar (para poder deshacer)
const NOMBRE_VALIDO = /^vacunacion-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?-(auto|manual|subido|previo)\.dump$/;
const ORIGENES = ['auto', 'manual', 'subido', 'previo'];
const nombreNuevo = (origen) => {
  let nombre = `vacunacion-${marcaDeTiempo()}-${origen}.dump`;
  for (let i = 2; fs.existsSync(path.join(CARPETA, nombre)); i++) nombre = `vacunacion-${marcaDeTiempo()}-${i}-${origen}.dump`;
  return nombre;
};

function marcaDeTiempo() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`;
}

async function crearRespaldo(origen = 'manual') {
  fs.mkdirSync(CARPETA, { recursive: true });
  const nombre = nombreNuevo(ORIGENES.includes(origen) ? origen : 'manual');
  const destino = path.join(CARPETA, nombre);
  const temporal = `${destino}.tmp`;
  try {
    await ejecutar(binario('pg_dump'), ['--format=custom', '--no-owner', `--file=${temporal}`, `--dbname=${process.env.DATABASE_URL}`], { maxBuffer: 1 << 20 });
    await ejecutar(binario('pg_restore'), ['--list', temporal], { maxBuffer: 16 << 20 }); // se puede leer
    fs.renameSync(temporal, destino);
  } catch (e) {
    fs.rmSync(temporal, { force: true });
    const falta = e.code === 'ENOENT';
    throw new Error(falta
      ? 'No se encontró pg_dump en el servidor. Instale las herramientas de PostgreSQL o indique su carpeta en PG_BIN.'
      : `No se pudo crear el respaldo: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
  return info(nombre);
}

function info(nombre) {
  const st = fs.statSync(path.join(CARPETA, nombre));
  return { nombre, tamano: st.size, creado: st.mtime.toISOString(), origen: /-(\w+)\.dump$/.exec(nombre)[1] };
}

function listar() {
  if (!fs.existsSync(CARPETA)) return [];
  return fs.readdirSync(CARPETA).filter((n) => NOMBRE_VALIDO.test(n)).map(info).sort((a, b) => b.creado.localeCompare(a.creado));
}

/** Ruta de un respaldo existente, o null si el nombre no es válido. */
function ruta(nombre) {
  if (!NOMBRE_VALIDO.test(nombre)) return null;
  const r = path.join(CARPETA, nombre);
  return fs.existsSync(r) ? r : null;
}

/** Borra los respaldos automáticos más viejos que la retención; los manuales solo se borran a mano. */
function limpiar(dias) {
  const limite = Date.now() - dias * 864e5;
  const borrados = listar().filter((r) => r.origen === 'auto' && Date.parse(r.creado) < limite);
  for (const r of borrados) fs.rmSync(path.join(CARPETA, r.nombre), { force: true });
  return borrados.length;
}

/** Guarda un respaldo traído desde un dispositivo, después de comprobar que pg_restore lo puede leer. */
async function guardarSubido(datos) {
  fs.mkdirSync(CARPETA, { recursive: true });
  const nombre = nombreNuevo('subido');
  const destino = path.join(CARPETA, nombre);
  const temporal = `${destino}.tmp`;
  fs.writeFileSync(temporal, datos);
  try {
    await ejecutar(binario('pg_restore'), ['--list', temporal], { maxBuffer: 16 << 20 });
  } catch {
    fs.rmSync(temporal, { force: true });
    throw new Error('El archivo no es un respaldo válido de este sistema (debe ser un .dump creado aquí).');
  }
  fs.renameSync(temporal, destino);
  return info(nombre);
}

/**
 * Reemplaza toda la base con el contenido de un respaldo. Va en una sola transacción:
 * si algo falla, la base queda exactamente como estaba.
 */
async function restaurar(nombre) {
  const r = ruta(nombre);
  if (!r) throw new Error('Respaldo no encontrado.');
  try {
    await ejecutar(binario('pg_restore'), ['--clean', '--if-exists', '--no-owner', '--single-transaction', '--exit-on-error',
      `--dbname=${process.env.DATABASE_URL}`, r], { maxBuffer: 16 << 20 });
  } catch (e) {
    throw new Error(e.code === 'ENOENT'
      ? 'No se encontró pg_restore en el servidor. Instale las herramientas de PostgreSQL o indique su carpeta en PG_BIN.'
      : `No se pudo restaurar; la información quedó como estaba. ${String(e.stderr || e.message).trim().split('\n').pop()}`);
  }
}

module.exports = { crearRespaldo, guardarSubido, restaurar, listar, ruta, limpiar, CARPETA };
