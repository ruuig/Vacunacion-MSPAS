// Datos de demostración para ver el flujo completo y el tablero de decisiones.
// Pasa por la API real (el motor calcula estados y alertas igual que en el uso diario) y usa SQL solo para
// fechar la historia que en la vida real se habría ido acumulando: alertas antiguas y contactos pasados.
// Uso: con el backend corriendo (npm run dev), en otra terminal: npm run db:demo
// Para volver a una base vacía: restaurar el respaldo de respaldos/ con pg_restore --clean.
require('dotenv').config();
const { pool } = require('../src/db');

const BASE = `http://localhost:${process.env.PORT || 3100}/api`;
const CONTRASENA_DEMO = 'Demo2026!';
const TOTAL_NINOS = 200;

// Aleatorio con semilla: los mismos datos en cada ejecución
let semilla = 20261012;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const uno = (l) => l[Math.floor(azar() * l.length)];
const ponderado = (pares) => { let r = azar() * pares.reduce((s, [, p]) => s + p, 0); for (const [v, p] of pares) { if ((r -= p) <= 0) return v; } return pares[0][0]; };

const HOY = require('../src/fecha').hoy();
const sumar = (f, dias) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const menor = (a, b) => (a < b ? a : b);

async function llamar(token, ruta, { method = 'GET', body } = {}) {
  const r = await fetch(BASE + ruta, {
    method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`${method} ${ruta}: ${d.error || r.status}`); e.status = r.status; throw e; }
  return d;
}

// Visitas del esquema regular (edad en días → vacunas que se aplican juntas)
const VISITAS = [
  [0, ['HB_PED', 'BCG']],
  [60, ['HEXA', 'ROTA', 'NEUMO']],
  [120, ['HEXA', 'ROTA', 'NEUMO']],
  [180, ['HEXA']],
  [365, ['NEUMO', 'SPR']],
  [456, ['VARICELA']],
  [548, ['HEXA', 'OPV', 'SPR']], // R1: hexavalente + OPV
  [1461, ['DPT', 'OPV', 'VARICELA']],
];
// Antes de la hexavalente (supuesto de la demostración: nacidos antes de 2024) la serie primaria era
// Pentavalente con Polio aparte: IPV en la 1a dosis y OPV en las siguientes
const INICIO_HEXA = '2024-01-01';
const ANTES_HEXA = { 60: ['PENTA', 'IPV', 'ROTA', 'NEUMO'], 120: ['PENTA', 'OPV', 'ROTA', 'NEUMO'], 180: ['PENTA', 'OPV'] };
const vacunasDe = (edadDias, vacunas, nacimiento) => (nacimiento < INICIO_HEXA && ANTES_HEXA[edadDias]) || vacunas;
// Lotes recibidos en el servicio (vigentes): uno por vencer para ver el aviso
const LOTES = [
  ['HEXA', 'HX24-118', 210], ['HEXA', 'HX25-031', 30], ['PENTA', 'PT24-552', 150], ['IPV', 'IP24-207', 260], ['OPV', 'OP25-014', 120],
  ['ROTA', 'RT25-090', 180], ['NEUMO', 'NM25-233', 240], ['SPR', 'SR25-076', 200], ['VARICELA', 'VR25-012', 300],
  ['BCG', 'BC25-140', 160], ['HB_PED', 'HB25-061', 190], ['DPT', 'DP24-310', 220], ['INFL_PED', 'FL26-N08', 140],
];
// Serie del esquema que cumple cada producto (para registrar la vacuna que no se aplicó)
const SERIE_DE = { ROTA: 'ROTA', NEUMO: 'NEUMO', SPR: 'SPR', VARICELA: 'VARICELA', BCG: 'BCG', HB_PED: 'HB_RN' };
const MOTIVOS = [['falsa_contraindicacion', 35], ['desabastecimiento', 25], ['rechazo', 15], ['posterga_personal', 15], ['contraindicacion', 10]];

const NOMBRES_M = ['Ashley', 'Keyla', 'Génesis', 'Nayeli', 'Britany', 'Heidy', 'Yoselin', 'Evelyn', 'Angie', 'Lesly', 'Marisol', 'Esmeralda',
  'Jazmín', 'Maritza', 'Wendy', 'Katherine', 'Jennifer', 'Melany', 'Dayana', 'Allison', 'Emily', 'Sara', 'Rocío', 'Fátima', 'Itzel', 'Valentina'];
const NOMBRES_H = ['Wilmer', 'Edgar', 'Byron', 'Kenneth', 'Anthony', 'Jefferson', 'Eddy', 'Cristian', 'Javier', 'Óscar', 'Marvin', 'Selvin',
  'Henry', 'Jairo', 'Walter', 'Alexander', 'Gerson', 'Yeferson', 'Rony', 'Jeremy', 'Emanuel', 'Isaac', 'Mario', 'Fredy', 'Joel', 'Derek'];
const APELLIDOS = ['Sandoval', 'Lemus', 'Ruano', 'Arana', 'Flores', 'Martínez', 'Gómez', 'Aguirre', 'Chegüén', 'Tobar', 'Linares', 'Salguero',
  'Guerra', 'Pinto', 'Ortiz', 'Contreras', 'Barrera', 'Duarte', 'Morataya', 'Najarro', 'Osorio', 'Zepeda', 'Pérez', 'Hernández', 'Ramírez', 'Cruz'];
const MADRES = ['Floridalma', 'Magdalena', 'Reyna', 'Albertina', 'Eluvia', 'Mirna', 'Glenda', 'Ingrid', 'Heidy', 'Karla', 'Vilma', 'Zoila',
  'Dora', 'Leticia', 'Aracely', 'Yolanda', 'Mayra', 'Telma', 'Cindy', 'Lourdes'];
// Establecimiento más cercano a cada comunidad (ids del seed)
// Establecimiento de cada comunidad: el puesto de su sector; el casco urbano y sus barrios, el centro de salud
let PUESTO = {};
const NOTAS = {
  contactado: 'La madre indicó que vendrá esta semana.', no_localizado: 'No contestó; se intentará con el promotor.',
  cita_acordada: 'Se acordó fecha con la madre.', rechazo: 'La familia no quiere vacunar por ahora.',
};

(async () => {
  console.log('Datos de demostración →', BASE);
  const admin = (await llamar(null, '/auth/login', { method: 'POST', body: { usuario: process.env.ADMIN_USUARIO || 'admin', contrasena: process.env.ADMIN_CONTRASENA } })).token;
  const yaHay = (await llamar(admin, '/comunidades/tablero')).reduce((s, c) => s + c.activos, 0);
  if (yaHay) { console.log('La base ya tiene niños registrados: no se cargan datos de demostración.'); return; }

  // 1. Personal
  const usuarios = [
    { nombre: 'Ana Lucía López Pérez', cargo: 'Enfermera profesional', usuario: 'enfermera', rol: 'enfermera' },
    { nombre: 'Luis Fernando Ramírez Cruz', cargo: 'Auxiliar de enfermería', usuario: 'vacunador', rol: 'vacunador' },
    { nombre: 'Marta Elena Aquino Ramos', cargo: 'Auxiliar de enfermería', usuario: 'vacunador2', rol: 'vacunador' },
  ];
  for (const u of usuarios) {
    try { await llamar(admin, '/admin/usuarios', { method: 'POST', body: { ...u, contrasena: CONTRASENA_DEMO } }); } catch (e) { if (e.status !== 409) throw e; }
  }
  const token = {};
  for (const u of usuarios) token[u.usuario] = (await llamar(null, '/auth/login', { method: 'POST', body: { usuario: u.usuario, contrasena: CONTRASENA_DEMO } })).token;
  const enf = token.enfermera;
  const operativo = () => uno([token.enfermera, token.vacunador, token.vacunador2]);
  const ids = Object.fromEntries((await llamar(enf, '/casos/personal')).map((u) => [u.nombre, u.id]));
  const idDe = (usuario) => ids[usuarios.find((u) => u.usuario === usuario).nombre];
  console.log('✓ Usuarios: enfermera, vacunador, vacunador2');

  // Los niños viven en aldeas, caseríos y barrios (el «Casco urbano» agrupa a los barrios)
  const catTerritorio = await llamar(enf, '/catalogos/comunidades');
  const comunidades = catTerritorio.filter((c) => c.tipo !== 'casco_urbano');
  const establecimientos = await llamar(enf, '/catalogos/establecimientos');
  PUESTO = Object.fromEntries(comunidades.map((c) => {
    const central = c.es_central ? c.nombre : c.puesto;
    return [c.nombre, establecimientos.find((e) => e.nombre === `Puesto de Salud ${central}`)?.id || 1];
  }));
  const productos = await llamar(enf, '/catalogos/productos');
  const P = Object.fromEntries(productos.map((p) => [p.codigo, p.id]));
  const anio = Number(HOY.slice(0, 4));

  // Temporada de influenza en curso (la fija el MSPAS cada año): así se ve la influenza en citas y jornadas
  const temporada = Number(HOY.slice(5, 7)) >= 7 ? anio : anio - 1;
  for (const [clave, valor] of [['influenza_inicio', `${temporada}-10-01`], ['influenza_fin', `${temporada + 1}-02-28`]]) {
    await pool.query('UPDATE parametro SET valor = $2 WHERE clave = $1', [clave, valor]);
  }
  // Lotes recibidos: las vacunas de los últimos meses se registran con ellos, como en el uso diario
  const loteDe = {};
  for (const [codigo, numero, diasVence] of LOTES) {
    const l = await llamar(enf, '/lotes', { method: 'POST', body: { producto_id: P[codigo], codigo: numero, fecha_vencimiento: sumar(HOY, diasVence) } });
    (loteDe[codigo] ||= []).push(l.id);
  }
  console.log(`✓ Temporada de influenza ${temporada}-${temporada + 1} · ${LOTES.length} lotes`);

  // 2. Cuadernos SIGSA 5a: uno por comunidad y uno más para el casco urbano
  for (const [i, c] of comunidades.entries()) {
    await llamar(enf, '/cuadernos', { method: 'POST', body: { numero: i + 1, anio, tipo: 'produccion_cobertura', servicio_id: PUESTO[c.nombre] || 1, comunidad_id: c.id } });
  }
  const urbano = null; // un cuaderno por comunidad o barrio
  console.log('✓ Cuadernos:', comunidades.length + (urbano ? 1 : 0));

  // 3. Niñas y niños con distintos perfiles. Cada comunidad tiene su "carácter" para que el tablero muestre problemas distintos:
  //    unas con buen acceso y abandono (categoría 2), otras con poco acceso (3), otras sin problema (1)
  const caracter = Object.fromEntries(comunidades.map((c, i) => [c.id, ['bien', 'abandona', 'bien', 'no_llega', 'abandona', 'bien', 'no_llega', 'mixto'][i % 8]]));
  const peso = (c) => (c.tipo === 'barrio' ? 5 : c.tipo === 'aldea' ? 5 : 3);
  const bolsa = comunidades.flatMap((c) => Array(peso(c)).fill(c));
  const resumen = { al_dia: 0, atrasado: 0, abandono: 0, dosis_cero: 0, recien_nacido: 0, recuperado: 0 };
  const familias = [];
  const recuperados = []; // dosis aplicadas tarde: generan historia de alerta resuelta
  let ninos = 0, dosis = 0, perdidas = 0;

  for (let i = 0; i < TOTAL_NINOS; i++) {
    const com = uno(bolsa);
    const car = caracter[com.id];
    const edad = i < 8 ? entre(3, 50) : uno([entre(60, 365), entre(60, 365), entre(60, 365), entre(366, 760), entre(761, 2400)]);
    const nacimiento = sumar(HOY, -edad);
    const sexo = azar() < 0.5 ? 'M' : 'H';
    const maya = azar() < 0.7;

    // Qué visitas cumplió según el perfil y el carácter de su comunidad
    const vencidas = VISITAS.map((_, k) => k).filter((k) => VISITAS[k][0] <= edad);
    let perfil = edad < 60 ? 'recien_nacido' : 'al_dia';
    let hasta = vencidas.length - 1;
    const pAbandono = car === 'abandona' ? 0.2 : car === 'mixto' ? 0.12 : 0.05;
    const pCero = car === 'no_llega' ? 0.14 : 0.02;
    const pAtraso = car === 'abandona' ? 0.18 : 0.12;
    const corte = (min, max) => vencidas.filter((k) => k < vencidas.length - 1 && edad - VISITAS[k + 1][0] >= min && edad - VISITAS[k + 1][0] <= max);
    const r = azar();
    if (perfil === 'al_dia' && r < pCero && edad > 95 && edad < 700) { perfil = 'dosis_cero'; hasta = 0; }
    else if (perfil === 'al_dia' && r < pCero + pAbandono && corte(95, 900).filter((k) => k >= 1).length) { perfil = 'abandono'; hasta = uno(corte(95, 900).filter((k) => k >= 1)); }
    else if (perfil === 'al_dia' && r < pCero + pAbandono + pAtraso && corte(32, 85).length) { perfil = 'atrasado'; hasta = uno(corte(32, 85)); }
    else if (perfil === 'al_dia' && hasta > 0 && edad - VISITAS[hasta][0] < 12 && azar() < 0.6) hasta--;
    // Recuperado: una visita se atrasó entre 35 y 80 días y luego se vacunó (historia de alerta resuelta)
    const visitaTarde = perfil === 'al_dia' && hasta >= 1 && azar() < 0.3 ? entre(1, hasta) : null;
    if (visitaTarde != null) perfil = 'recuperado';

    let responsable;
    const familia = familias.find((f) => f.comunidad === com.id && azar() < 0.25);
    const apellidoMadre = familia?.apellido || uno(APELLIDOS);
    if (familia) responsable = { id: familia.id };
    else responsable = {
      cui: String(entre(1000, 3999)) + String(entre(10000, 99999)) + '2104', primer_nombre: uno(MADRES), segundo_nombre: uno(['', 'Elizabeth', 'Marisol', 'Yolanda']),
      primer_apellido: apellidoMadre, segundo_apellido: uno(APELLIDOS), fecha_nacimiento: sumar(nacimiento, -entre(18, 38) * 365),
      departamento: 'Jalapa', municipio: 'San Luis Jilotepeque', comunidad_id: com.id, numero_casa: String(entre(1, 180)),
      direccion_detalle: com.tipo === 'barrio' ? `${entre(1, 6)}a. calle, zona ${entre(1, 3)}` : '',
      telefono: azar() < (car === 'no_llega' ? 0.55 : 0.85) ? String(entre(3, 5)) + String(entre(1000000, 9999999)) : '',
      idioma_preferente: maya && azar() < 0.3 ? 'poqomam' : 'espanol',
    };

    const sug = await llamar(enf, `/cuadernos/sugerido?comunidad_id=${com.id}`);
    const nombres = sexo === 'M' ? NOMBRES_M : NOMBRES_H;
    const n = await llamar(operativo(), '/ninos', { method: 'POST', body: {
      cuaderno_id: sug?.id || null, fila: sug?.fila || null,
      primer_nombre: uno(nombres), segundo_nombre: azar() < 0.7 ? uno(nombres) : '', primer_apellido: uno(APELLIDOS), segundo_apellido: apellidoMadre,
      sexo, fecha_nacimiento: nacimiento, nacimiento_departamento: 'Jalapa', nacimiento_municipio: 'San Luis Jilotepeque',
      nacimiento_comunidad: com.nombre, pueblo: maya ? 2 : 1, comunidad_linguistica: maya ? 14 : 23,
      cui: azar() < 0.55 ? String(entre(2000, 3999)) + String(entre(10000, 99999)) + '2103' : '',
      numero_registro_carne: String(anio).slice(2) + String(i + 1).padStart(4, '0'), fecha_registro_carne: sumar(nacimiento, entre(0, 10)),
      parentesco: 'madre', responsable,
    } }).catch(async (e) => { if (e.status === 409) return null; throw e; });
    if (!n) continue;
    if (!familia) {
      const [rr] = await llamar(enf, `/responsables?cui=${responsable.cui}`);
      if (rr) familias.push({ id: rr.id, comunidad: com.id, apellido: apellidoMadre });
    }
    ninos++;
    resumen[perfil]++;

    // Dosis de cada visita cumplida
    const establecimiento = PUESTO[com.nombre] || 1;
    let ultima = nacimiento, retraso = 0;
    for (let k = 0; k <= hasta; k++) {
      const [e, delEsquema] = VISITAS[k];
      const vacunas = vacunasDe(e, delEsquema, nacimiento);
      if (k === visitaTarde) retraso = entre(35, 80);
      let fecha = sumar(nacimiento, e + retraso + (e === 0 ? entre(0, 2) : entre(0, 10)));
      if (fecha <= ultima && e > 0) fecha = sumar(ultima, 28);
      if (fecha > HOY) break;
      ultima = fecha;
      const reciente = dias(fecha, HOY) <= 30;
      // Oportunidad perdida: en visitas de los últimos 9 meses, a veces una vacuna que tocaba no se aplica
      const saltable = vacunas.filter((v) => SERIE_DE[v]);
      const saltada = k >= 1 && dias(fecha, HOY) <= 270 && saltable.length && azar() < 0.15 ? uno(saltable) : null;
      const usuario = operativo();
      for (const v of vacunas) {
        if (v === saltada) continue;
        // Últimos 6 meses: lote registrado en el sistema; antes, el lote anotado a mano en el cuaderno
        const conLote = dias(fecha, HOY) <= 180 && loteDe[v] ? { lote_id: uno(loteDe[v]) } : { lote: `${v.slice(0, 2)}${String(fecha).slice(2, 4)}-${entre(100, 999)}` };
        const body = { producto_id: P[v], fecha_aplicacion: fecha, ...conLote,
          establecimiento_id: establecimiento, modo: reciente ? 'atencion' : 'cuaderno' };
        try { await llamar(usuario, `/ninos/${n.id}/aplicaciones`, { method: 'POST', body }); dosis++; }
        catch (err) {
          if (err.status !== 422) throw err;
          try { await llamar(usuario, `/ninos/${n.id}/aplicaciones`, { method: 'POST', body: { ...body, modo: 'cuaderno' } }); dosis++; } catch { /* ya cumplida */ }
        }
      }
      if (k === visitaTarde) {
        recuperados.push({ ninoId: n.id, programada: sumar(nacimiento, e), aplicada: fecha, usuario: idDe(uno(['vacunador', 'vacunador2', 'enfermera'])) });
      }
      if (saltada) {
        const esq = await llamar(enf, `/ninos/${n.id}/esquema?fecha=${fecha}`);
        const d = esq.dosis.find((x) => x.serieCodigo === SERIE_DE[saltada] && x.estado !== 'aplicada');
        if (d) {
          await llamar(usuario, `/ninos/${n.id}/visitas`, { method: 'POST', body: { fecha, establecimiento_id: establecimiento,
            no_aplicadas: [{ esquema_dosis_id: d.esquemaDosisId, motivo: ponderado(MOTIVOS), detalle: '' }] } });
          perdidas++;
          // La mitad la recupera un mes después
          const despues = sumar(fecha, 30);
          if (azar() < 0.5 && despues <= HOY) {
            await llamar(usuario, `/ninos/${n.id}/aplicaciones`, { method: 'POST', body: { producto_id: P[saltada], fecha_aplicacion: despues,
              lote: `${saltada.slice(0, 3)}${entre(100, 999)}`, establecimiento_id: establecimiento, modo: 'cuaderno' } }).catch(() => {});
          }
        }
      }
    }
  }
  console.log(`✓ Niños: ${ninos} (${Object.entries(resumen).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')}) · dosis: ${dosis} · oportunidades perdidas: ${perdidas}`);

  // 3b. Suplementación: la mayoría recibe vitamina A, micronutrientes y desparasitante cerca de su fecha
  const { rows: menores3 } = await pool.query("SELECT id FROM nino WHERE fecha_nacimiento > CURRENT_DATE - 1095");
  let suplementos = 0;
  for (const { id } of menores3) {
    for (let pasada = 0; pasada < 3; pasada++) { // la 2a depende de la 1a
      const { dosis: ds } = await llamar(enf, `/suplementos/nino/${id}`);
      for (const d of ds.filter((x) => x.programada && x.programada < HOY && ['le_toca', 'no_dada'].includes(x.estado))) {
        if (azar() > 0.72) continue;
        const fecha = menor(HOY, sumar(d.programada, entre(0, 25)));
        try { await llamar(operativo(), `/suplementos/nino/${id}`, { method: 'POST', body: { ids: [d.id], fecha, establecimiento_id: 1 } }); suplementos++; }
        catch { /* fuera del rango de edad en esa fecha */ }
      }
    }
  }
  console.log(`✓ Suplementación: ${suplementos} entregas a ${menores3.length} niños menores de 3 años`);

  // 4. Población meta proporcional a los niños de cada comunidad (en la vida real la entrega el área de salud)
  const { rows: porCom } = await pool.query(`
    SELECT comunidad_id, count(*) FILTER (WHERE fecha_nacimiento > CURRENT_DATE - 365)::int AS menores_1,
           count(*) FILTER (WHERE fecha_nacimiento BETWEEN CURRENT_DATE - 730 AND CURRENT_DATE - 365)::int AS de_1,
           count(*)::int AS total
    FROM nino GROUP BY 1`);
  await llamar(enf, '/comunidades/poblacion-meta', { method: 'PUT', body: { anio, filas: comunidades.map((c) => {
    const x = porCom.find((p) => p.comunidad_id === c.id) || { menores_1: 0, de_1: 0, total: 0 };
    const factor = caracter[c.id] === 'no_llega' ? 1.6 : caracter[c.id] === 'bien' ? 1.05 : 1.2;
    // Dos caseríos quedan sin meta para mostrar el control de calidad Q7
    if (c.tipo === 'caserio' && ['Los Magueyes', 'Zanja de Agua'].includes(c.nombre)) return { comunidad_id: c.id, menor_1: '', '1_anio': '', '1_a_6': '' };
    return { comunidad_id: c.id, menor_1: Math.max(2, Math.round(x.menores_1 * factor)), '1_anio': Math.max(2, Math.round(x.de_1 * factor)), '1_a_6': Math.max(4, Math.round(x.total * 1.3)) };
  }) } });
  console.log('✓ Población meta', anio);

  // 5. Historia de alertas: las abiertas se fechan cuando la dosis se atrasó; los recuperados tienen alertas resueltas con contactos
  // Las alertas que se abrieron y cerraron durante la misma carga no existirían en la vida real
  await pool.query("DELETE FROM alerta WHERE estado = 'resuelta' AND fecha_generada = CURRENT_DATE AND fecha_cierre = CURRENT_DATE");
  const { rows: abiertas } = await pool.query(`
    SELECT a.id, a.nino_id, a.tipo, a.esquema_dosis_id FROM alerta a WHERE a.estado IN ('abierta','en_seguimiento')`);
  const cacheEsq = new Map();
  for (const a of abiertas) {
    if (!a.esquema_dosis_id) continue;
    if (!cacheEsq.has(a.nino_id)) cacheEsq.set(a.nino_id, await llamar(enf, `/ninos/${a.nino_id}/esquema`));
    const d = cacheEsq.get(a.nino_id).dosis.find((x) => x.esquemaDosisId === a.esquema_dosis_id);
    if (!d?.fechaProgramada) continue;
    const fecha = a.tipo === 'proxima' ? menor(HOY, sumar(d.fechaProgramada, -7)) : menor(HOY, sumar(d.fechaProgramada, 28));
    await pool.query('UPDATE alerta SET fecha_generada = $2 WHERE id = $1', [a.id, fecha]);
  }
  let resueltas = 0;
  for (const rc of recuperados) {
    const generada = sumar(rc.programada, 28);
    if (generada >= rc.aplicada) continue;
    const { rows: ds } = await pool.query(`
      SELECT ad.esquema_dosis_id FROM aplicacion_dosis ad JOIN aplicacion a ON a.id = ad.aplicacion_id
      WHERE ad.nino_id = $1 AND a.fecha_aplicacion = $2 AND NOT ad.anulada`, [rc.ninoId, rc.aplicada]);
    let primera = null;
    for (const d of ds) {
      const { rows: [al] } = await pool.query(`
        INSERT INTO alerta (nino_id, esquema_dosis_id, tipo, prioridad, estado, fecha_generada, fecha_cierre, motivo_cierre)
        VALUES ($1,$2,'atrasada','media','resuelta',$3,$4,'Dosis aplicada') RETURNING id`, [rc.ninoId, d.esquema_dosis_id, generada, rc.aplicada]);
      primera = primera || al.id;
      resueltas++;
    }
    // Contactos entre que se atrasó y que se vacunó
    const intentos = entre(1, 3);
    for (let k = 0; k < intentos && primera; k++) {
      const fecha = sumar(generada, entre(1, Math.max(2, dias(generada, rc.aplicada) - 1)));
      const ultimo = k === intentos - 1;
      const resultado = ultimo ? 'cita_acordada' : uno(['no_localizado', 'contactado']);
      await pool.query(`INSERT INTO seguimiento (nino_id, alerta_id, fecha, medio, resultado, fecha_compromiso, nota, usuario_id)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [rc.ninoId, primera, menor(fecha, rc.aplicada), uno(['llamada', 'llamada', 'visita', 'lider_comunitario']), resultado,
        ultimo ? rc.aplicada : null, NOTAS[resultado], rc.usuario]);
    }
  }
  console.log(`✓ Historia: ${resueltas} alertas resueltas de ${recuperados.length} niños que se atrasaron y se vacunaron`);

  // 6. Asignación de casos y contactos de los casos abiertos (fechados después de que se abrió el caso)
  const casos = await llamar(enf, '/casos');
  const asignar = { vacunador: [], vacunador2: [] };
  casos.filter((c) => c.peor !== 'proxima').forEach((c, i) => { if (i % 5 !== 4) asignar[i % 2 ? 'vacunador2' : 'vacunador'].push(c.nino_id); });
  for (const [u, lista] of Object.entries(asignar)) if (lista.length) await llamar(enf, '/casos/asignar', { method: 'POST', body: { nino_ids: lista, usuario_id: idDe(u) } });
  let contactos = 0;
  for (const c of casos.filter((x) => x.peor !== 'proxima' && azar() < 0.55)) {
    const intentos = entre(1, 4);
    for (let k = 0; k < intentos; k++) {
      // El primer contacto suele llegar en la primera semana; los siguientes, días después
      const fecha = menor(HOY, sumar(c.desde, k === 0 ? entre(1, azar() < 0.6 ? 6 : 20) : entre(7, Math.max(8, dias(c.desde, HOY)))));
      const resultado = k === intentos - 1 && azar() < 0.4 ? 'cita_acordada' : ponderado([['no_localizado', 4], ['contactado', 3], ['rechazo', 1]]);
      await pool.query(`INSERT INTO seguimiento (nino_id, alerta_id, fecha, medio, resultado, fecha_compromiso, nota, usuario_id)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c.nino_id, c.alertas[0].id, fecha, c.telefono ? ponderado([['llamada', 3], ['visita', 1]]) : uno(['visita', 'lider_comunitario']), resultado,
        resultado === 'cita_acordada' ? sumar(fecha, entre(-10, 10)) : null, NOTAS[resultado], idDe(uno(['vacunador', 'vacunador2']))]);
      contactos++;
    }
    await pool.query("UPDATE alerta SET estado = 'en_seguimiento' WHERE nino_id = $1 AND estado = 'abierta'", [c.nino_id]);
  }
  console.log(`✓ Casos: ${casos.length} niños por contactar, ${asignar.vacunador.length + asignar.vacunador2.length} asignados, ${contactos} intentos de contacto`);

  // 7. Jornadas: una realizada hoy y cerrada, otra planificada para la próxima semana
  const tablero = await llamar(enf, '/comunidades/tablero');
  const necesidad = (c) => c.dosis_cero * 3 + c.abandono * 3 + c.atrasados * 2;
  const rurales = tablero.filter((c) => !['casco_urbano', 'barrio'].includes(c.tipo)).sort((a, b) => necesidad(b) - necesidad(a));
  const j1 = await llamar(enf, '/jornadas', { method: 'POST', body: { fecha: HOY, comunidad_ids: rurales.slice(0, 2).map((c) => c.id), porcentaje_reserva: 10, equipo_ids: [idDe('vacunador'), idDe('vacunador2')],
    observaciones: 'Punto de vacunación en la escuela de la aldea.' } });
  const det = await llamar(enf, `/jornadas/${j1.id}`);
  // Preparación (vacunas a llevar) y, el día de la jornada, se inicia para poder vacunar
  await llamar(enf, `/jornadas/${j1.id}/biologicos`, { method: 'PUT', body: { biologicos: det.biologicos.map((b) => ({ ...b, dosis_llevadas: b.dosis_llevadas ?? Math.ceil(b.dosis_estimadas * 1.1) })) } });
  await llamar(enf, `/jornadas/${j1.id}/iniciar`, { method: 'POST' });
  const SERIE = { HB_RN: 'HB_PED', BCG: 'BCG', ROTA: 'ROTA', NEUMO: 'NEUMO', SPR: 'SPR', SPR_CERO: 'SPR', VARICELA: 'VARICELA', INFLUENZA: 'INFL_PED' };
  let vacunados = 0, faltaron = 0;
  for (const n of det.ninos) {
    if (azar() < 0.25) {
      await llamar(enf, `/jornadas/${j1.id}/asistencia`, { method: 'POST', body: { nino_id: n.nino_id, asistio: false, motivo_inasistencia: uno(['No estaba en casa', 'Niño enfermo', 'Salieron a la finca']) } });
      faltaron++;
      continue;
    }
    for (const d of n.dosis_programadas) {
      const conPenta = n.dosis_programadas.some((x) => x.serieCodigo === 'DPT_HIB_HB' && x.numero === d.numero);
      const codigo = d.serieCodigo === 'POLIO' ? (d.numero <= 3 && conPenta ? 'HEXA' : d.numero === 1 ? 'IPV' : 'OPV')
        : d.serieCodigo === 'DPT_HIB_HB' ? (d.numero <= 4 ? 'HEXA' : 'DPT') : SERIE[d.serieCodigo];
      if (!codigo) continue;
      try {
        await llamar(operativo(), `/ninos/${n.nino_id}/aplicaciones`, { method: 'POST', body: { producto_id: P[codigo], fecha_aplicacion: HOY,
          ...(loteDe[codigo] ? { lote_id: loteDe[codigo][0] } : {}), jornada_id: j1.id, modo: 'atencion', establecimiento_id: 1 } });
      } catch (e) { if (!/ya está registrada|ya cubr|no corresponde/i.test(e.message)) console.log('  ·', n.nombre_completo, codigo, e.message); }
    }
    vacunados++;
  }
  await llamar(enf, `/jornadas/${j1.id}/cerrar`, { method: 'POST', body: { devueltas: det.biologicos.map((b) => ({ producto_id: b.producto_id, dosis_devueltas: entre(0, 2) })) } });
  const j2 = await llamar(enf, '/jornadas', { method: 'POST', body: { fecha: sumar(HOY, 7), comunidad_ids: rurales.slice(2, 5).map((c) => c.id), porcentaje_reserva: 10,
    observaciones: 'Coordinar transporte con la municipalidad.', responsable_id: idDe('vacunador') } });
  // Una jornada de ayer que nadie cerró: el sistema la muestra "por cerrar" en Inicio y en Jornadas
  const j0 = await llamar(enf, '/jornadas', { method: 'POST', body: { fecha: HOY, comunidad_ids: rurales.slice(5, 6).map((c) => c.id), porcentaje_reserva: 10,
    observaciones: 'Salón comunal.', responsable_id: idDe('vacunador2') } });
  await pool.query('UPDATE jornada SET fecha = $2 WHERE id = $1', [j0.id, sumar(HOY, -1)]);
  console.log(`✓ Jornadas: #${j1.id} hoy y cerrada (${vacunados} vacunados, ${faltaron} inasistencias) · #${j2.id} planificada para ${sumar(HOY, 7)} · #${j0.id} de ayer por cerrar`);

  // 8. Plan de acción de la última sala situacional
  const territorio = await llamar(enf, '/tablero/territorio');
  const cat2 = territorio.comunidades.find((c) => c.categoria === 2);
  const cat3 = territorio.comunidades.find((c) => c.categoria === 3 || c.categoria === 4);
  const acciones = [
    { fecha: sumar(HOY, -35), comunidad_id: cat2?.id || null, indicador_codigo: 'D1', problema: `${cat2?.nombre || 'Una comunidad'}: los niños empiezan el esquema pero no regresan`,
      accion: 'Asignar los casos a la auxiliar del sector y llamar un día antes de cada cita', responsable_id: idDe('vacunador'),
      fecha_limite: sumar(HOY, -5), estado: 'cumplida', valor_inicial: 28, valor_final: 14, resultado: 'La deserción bajó a la mitad' },
    { fecha: sumar(HOY, -35), comunidad_id: cat3?.id || null, indicador_codigo: 'C1', problema: `${cat3?.nombre || 'Una comunidad'}: pocos niños llegan al servicio`,
      accion: 'Jornada extramural con búsqueda casa a casa de niños sin registrar', responsable_id: idDe('enfermera'),
      fecha_limite: sumar(HOY, 10), estado: 'en_curso', valor_inicial: cat3?.C1 ?? null },
    { fecha: sumar(HOY, -35), indicador_codigo: 'N6', problema: 'Se pospone la vacuna cuando el niño tiene resfriado',
      accion: 'Sesión de 30 minutos con el personal sobre contraindicaciones verdaderas', responsable_id: idDe('enfermera'),
      fecha_limite: sumar(HOY, -3), estado: 'pendiente' },
  ];
  for (const a of acciones) await llamar(enf, '/acciones', { method: 'POST', body: a });
  console.log(`✓ Plan de acción: ${acciones.length} acciones`);

  // 9. Fotos mensuales del año para las tendencias del tablero
  const f = await llamar(admin, '/admin/fotos', { method: 'POST', body: { anio } });
  console.log(`✓ Fotos mensuales: ${f.meses.length} meses, ${f.indicadores} indicadores`);

  await require('../src/servicios/esquema').recalcularTodos(pool);
  const res = await llamar(enf, '/alertas/resumen');
  console.log('✓ Alertas abiertas:', res.map((r) => `${r.tipo} ${r.total}`).join(', '));
  console.log(`\nListo. Usuarios de prueba (contraseña ${CONTRASENA_DEMO}): enfermera, vacunador, vacunador2`);
})().catch((e) => { console.error('✗', e.message); process.exitCode = 1; }).finally(() => pool.end());
