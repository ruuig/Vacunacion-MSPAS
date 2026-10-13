// Etiquetas, códigos del cuaderno SIGSA 5a y formatos compartidos.
export const ESTADO_DOSIS = {
  aplicada: 'Aplicada', le_toca: 'Le toca', atrasada: 'Atrasada', proxima: 'Próxima',
  pendiente: 'Pendiente', en_espera: 'En espera', no_aplicable: 'Ya no aplica',
};

export const ESTADO_ESQUEMA = {
  dosis_cero: 'Dosis cero', abandono: 'Abandono', atrasado: 'Atrasado', proximo: 'Próximo',
  al_dia: 'Al día', esquema_completo: 'Esquema completo', inactivo: 'Inactivo',
};

export const ESTADO_REGISTRO = { activo: 'Activo', fallecio: 'Falleció', emigro: 'Emigró', trasladado: 'Trasladado', egresado: 'Egresado (7 años)' };

export const TIPO_ALERTA = {
  dosis_cero: 'Dosis cero', abandono: 'Abandono', atrasada: 'Atrasada', proxima: 'Próxima', inasistencia: 'Inasistencia',
};

// Color de la etiqueta (clase .chip) para cada estado
export const COLOR_ESQUEMA = {
  dosis_cero: 'rojo', abandono: 'rojo', atrasado: 'ambar', proximo: 'azul', al_dia: 'verde', esquema_completo: 'verde', inactivo: '',
};
export const COLOR_DOSIS = {
  aplicada: 'verde', le_toca: 'azul', atrasada: 'rojo', proxima: 'azul', pendiente: '', en_espera: '', no_aplicable: '',
};
export const COLOR_ALERTA = { dosis_cero: 'rojo', abandono: 'rojo', atrasada: 'ambar', inasistencia: 'morado', proxima: 'azul' };
export const COLOR_PRIORIDAD = { alta: 'rojo', media: 'ambar', baja: 'azul' };
export const COLOR_REGISTRO = { activo: 'verde', fallecio: '', emigro: '', trasladado: '', egresado: 'azul' };

export const TIPO_CUADERNO ={ produccion_cobertura: 'Producción / Cobertura', contactados: 'Contactados', otros: 'Otros' };

export const MEDIOS = { llamada: 'Llamada', visita: 'Visita', lider_comunitario: 'Líder comunitario', jornada: 'Jornada', otro: 'Otro' };
export const RESULTADOS = {
  contactado: 'Contactado', no_localizado: 'No localizado', cita_acordada: 'Cita acordada', rechazo: 'Rechazo', trasladado: 'Trasladado',
};

// Códigos impresos en el cuaderno
export const PUEBLOS = { 1: 'Mestizo', 2: 'Maya', 3: 'Garífuna', 4: 'Xinca', 5: 'Otra', 6: 'No se indica' };
export const LINGUISTICAS = {
  1: "Achi'", 2: 'Akateka', 3: 'Awakateka', 4: "Ch'orti'", 5: 'Chalchiteka', 6: 'Chuj', 7: "Itza'", 8: 'Ixil',
  9: 'Jakalteka', 10: 'Kaqchikel', 11: "K'iche'", 12: 'Mam', 13: 'Mopan', 14: 'Poqomam', 15: "Poqomchi'",
  16: "Q'anjob'al", 17: "Q'eqchi'", 18: 'Sakapulteka', 19: 'Sipakapensa', 20: 'Tektiteka', 21: "Tz'utujil",
  22: 'Uspanteka', 23: 'No indica',
};

export const DEPARTAMENTOS = [
  'Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla', 'Guatemala', 'Huehuetenango',
  'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez', 'San Marcos',
  'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa',
];
// Municipios de los departamentos más frecuentes; los demás se escriben (TODO: lista oficial completa)
export const MUNICIPIOS = {
  Jalapa: ['Jalapa', 'Mataquescuintla', 'Monjas', 'San Carlos Alzatate', 'San Luis Jilotepeque', 'San Manuel Chaparrón', 'San Pedro Pinula'],
  Chiquimula: ['Camotán', 'Chiquimula', 'Concepción Las Minas', 'Esquipulas', 'Ipala', 'Jocotán', 'Olopa', 'Quezaltepeque',
    'San Jacinto', 'San José La Arada', 'San Juan Ermita'],
};

export const PAGINAS = [
  { id: 'menor_1', nombre: 'Menor de 1 año', corto: 'Menor de 1' },
  { id: 'uno_a_7', nombre: '1 año a menor de 7', corto: '1 a 6 años' },
  { id: 'recuperacion', nombre: 'Recuperación', corto: 'Recuperación' },
];

// Fecha de hoy en Guatemala. toISOString() daría la fecha en hora universal: después de las 6 p. m. ya sería mañana
export const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
/** Suma días a una fecha 'YYYY-MM-DD' (cálculo en UTC al mediodía: no lo afectan zona horaria ni horario de verano). */
export const sumarDias = (f, dias) => {
  const x = new Date(`${f}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + dias);
  return x.toISOString().slice(0, 10);
};

export function fecha(f) {
  if (!f) return '—';
  const [a, m, d] = f.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function edad(nacimiento, ref = hoy()) {
  const n = new Date(nacimiento), r = new Date(ref);
  let meses = (r.getFullYear() - n.getFullYear()) * 12 + r.getMonth() - n.getMonth();
  if (r.getDate() < n.getDate()) meses--;
  if (meses < 1) return `${Math.max(0, Math.round((r - n) / 86400000))} días`;
  if (meses < 24) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  return `${Math.floor(meses / 12)} años ${meses % 12} m`;
}

export const cuadernoFila = (x) => (x.cuaderno_numero ? `Cuad. ${x.cuaderno_numero}/${x.cuaderno_anio} · fila ${x.fila}` : 'Sin cuaderno');

// El administrador puede todo (superusuario); la encargada solo consulta (no aparece en las acciones)
export const puede = (rol, ...roles) => rol === 'administrador' || roles.includes(rol);

/** Descarga filas como CSV que Excel abre directamente (separador ; y BOM para tildes). */
export function descargarCSV(nombre, columnas, filas) {
  const celda = (v) => {
    const t = v == null ? '' : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = [columnas.map((c) => celda(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => celda(typeof c.valor === 'function' ? c.valor(f) : f[c.valor])).join(';'))];
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${nombre}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const pct = (v) => (v == null ? '—' : `${v}%`);

// Niños abiertos hace poco en este equipo: atajo en Buscar (solo en el navegador, nunca obligatorio)
const CLAVE_RECIENTES = 'vacunacion.recientes';
export function recientes() {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECIENTES)) || []; } catch { return []; }
}
export function recordarNino(n) {
  try {
    const lista = [{ id: n.id, nombre_completo: n.nombre_completo, fecha_nacimiento: n.fecha_nacimiento, comunidad: n.comunidad, sexo: n.sexo },
      ...recientes().filter((x) => x.id !== n.id)].slice(0, 6);
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch { /* sin almacenamiento local: el atajo simplemente no aparece */ }
}

/** Días entre hoy y una fecha (positivo = ya pasó). */
export const diasDesde = (f) => Math.round((Date.parse(hoy()) - Date.parse(String(f).slice(0, 10))) / 86400000);
