// Lenguaje visual único para estados y alertas: ícono en un recuadro suave + texto oscuro.
// El ícono distingue el tipo sin depender solo del color (accesible e impreso en blanco y negro).
import {
  AlertOctagon, Ban, CalendarCheck, PlayCircle, CalendarClock, CalendarX, CheckCircle2, Circle, CircleDot, Clock, Lock, MinusCircle,
  PhoneCall, ShieldCheck, UserX, XCircle,
} from 'lucide-react';

// tono: critico | atencion | ausencia | info | ok | neutro
const ESTADOS = {
  // Alertas
  dosis_cero: ['Dosis cero', AlertOctagon, 'critico'],
  abandono: ['Abandono', UserX, 'critico'],
  atrasada: ['Atrasada', Clock, 'atencion'],
  inasistencia: ['Inasistencia', CalendarX, 'ausencia'],
  proxima: ['Próxima', CalendarClock, 'info'],
  // Esquema del niño
  atrasado: ['Atrasado', Clock, 'atencion'],
  proximo: ['Próximo', CalendarClock, 'info'],
  al_dia: ['Al día', CheckCircle2, 'ok'],
  esquema_completo: ['Esquema completo', ShieldCheck, 'ok'],
  inactivo: ['Inactivo', MinusCircle, 'neutro'],
  // Registro
  activo: ['Activo', CheckCircle2, 'ok'],
  fallecio: ['Falleció', MinusCircle, 'neutro'],
  emigro: ['Emigró', MinusCircle, 'neutro'],
  trasladado: ['Trasladado', MinusCircle, 'neutro'],
  egresado: ['Egresado (7 años)', ShieldCheck, 'info'],
  // Seguimiento de alertas
  abierta: ['Sin contactar', CircleDot, 'neutro'],
  en_seguimiento: ['En seguimiento', PhoneCall, 'info'],
  // Jornadas
  planificada: ['Planificada', CalendarCheck, 'info'],
  en_curso: ['En curso', PlayCircle, 'ok'],
  por_cerrar: ['Por cerrar', CalendarClock, 'atencion'],
  cerrada: ['Realizada', CheckCircle2, 'ok'],
  cancelada: ['Cancelada', XCircle, 'neutro'],
  // Usuarios
  bloqueado: ['Bloqueado', Lock, 'critico'],
  desactivado: ['Inactivo', Ban, 'neutro'],
};

export const tonoDe = (clave) => ESTADOS[clave]?.[2] || 'neutro';

export function Estado({ de, texto, grande, solo }) {
  const [etiqueta, Icono = Circle, tono = 'neutro'] = ESTADOS[de] || [de];
  return (
    <span className={`estado t-${tono} ${grande ? 'grande' : ''}`} title={solo ? texto || etiqueta : undefined}>
      <span className="ic"><Icono size={grande ? 16 : 13} strokeWidth={2.4} /></span>
      {!solo && <span>{texto || etiqueta}</span>}
    </span>
  );
}

// Prioridad de una comunidad: relativa a la de mayor necesidad, para que el tablero distinga a dónde ir primero
export const NIVELES = {
  critica: ['Prioridad alta', 'critico'],
  atencion: ['Prioridad media', 'atencion'],
  seguimiento: ['Prioridad baja', 'ausencia'],
  al_dia: ['Al día', 'ok'],
};
/** Necesidad de una comunidad: dosis cero y abandono pesan más que el atraso; la inasistencia, menos. */
export const puntaje = (c) => c.dosis_cero * 3 + c.abandono * 3 + c.atrasados * 2 + c.inasistencia;
export function nivelComunidad(c, maximo = puntaje(c)) {
  const p = puntaje(c);
  if (!p) return 'al_dia';
  if (p >= maximo * 0.6) return 'critica';
  if (p >= maximo * 0.3) return 'atencion';
  return 'seguimiento';
}
export function Nivel({ de }) {
  const [texto, tono] = NIVELES[de];
  return <span className={`nivel t-${tono}`}><i />{texto}</span>;
}

/** Número de casos: cero en gris tenue, con valor en el tono de su gravedad. */
export function Cuenta({ n, tono }) {
  return <span className={`cuenta-caso ${n ? `t-${tono}` : 'cero'}`}>{n || '—'}</span>;
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
