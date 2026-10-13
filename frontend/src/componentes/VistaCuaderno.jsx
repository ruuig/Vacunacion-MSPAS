import { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronDown, Clock, Syringe } from 'lucide-react';
import { PAGINAS, fecha, hoy } from '../util.js';

/**
 * Carné de vacunación del niño.
 * En pantalla: igual al carné de la familia, una franja de color por edad; las edades completas se resumen en una línea.
 * Al imprimir: las páginas del cuaderno SIGSA 5a (menor de 1 año, 1 a menor de 7, recuperación) con sus columnas.
 */

// Cada casilla dice qué significa su fecha: así no se confunde la fecha en que le toca con la fecha en que se aplicó
const ESTADOS = {
  aplicada: { antes: 'Aplicada el', icono: Check },
  atrasada: { antes: 'Atrasada desde el', icono: AlertCircle },
  le_toca: { antes: 'Le toca desde el', icono: Syringe },
  proxima: { antes: 'Programada para el', icono: Clock },
  pendiente: { antes: 'Programada para el' },
  en_espera: { solo: 'Después de la dosis anterior' },
  no_aplicable: { solo: 'Ya no se pone a su edad' },
  vacia: { solo: '' },
};
const corta = (f) => fecha(f).slice(0, 5);

// Franjas por edad con los colores del carné que el MSPAS entrega a la familia
const EDADES = [
  [0, 'Al nacer', 'rosa'], [60, '2 meses', 'celeste'], [120, '4 meses', 'durazno'], [180, '6 meses', 'lila'],
  [210, '7 meses', 'amarillo'], [365, '12 meses', 'durazno'], [456, '15 meses', 'amarillo'], [548, '18 meses', 'celeste'],
  [1461, '4 a menor de 7 años', 'verde'],
];
const franja = (dias) => EDADES.reduce((f, e) => (dias >= e[0] ? e : f), EDADES[0]);

function Dosis({ d, etiqueta, estado, fechaDosis, hexa, onTocar }) {
  const info = ESTADOS[estado] || {};
  const Ic = info.icono;
  // Se puede adelantar: aún no es su fecha, pero ya cumplió la edad mínima (o la cumple antes de la fecha)
  const desde = d && ['pendiente', 'proxima'].includes(estado) && d.fechaMinima && d.fechaMinima < d.fechaProgramada ? d.fechaMinima : null;
  const tocable = onTocar && d && !['aplicada', 'no_aplicable', 'en_espera'].includes(estado);
  const Contenedor = tocable ? 'button' : 'div';
  return (
    <Contenedor type={tocable ? 'button' : undefined} className={`dosis-carne estado-${estado} ${tocable ? 'tocable' : ''}`}
      onClick={tocable ? () => onTocar(d) : undefined}>
      <span className="dc-cab">
        <span className="dc-etq">{etiqueta}</span>
        {Ic && <Ic size={15} strokeWidth={2.6} className="dc-ic" />}
      </span>
      {info.solo !== undefined ? <span className="dc-est">{info.solo}</span> : (
        <>
          <span className="dc-est">{info.antes}</span>
          <strong className="dc-fecha">{fechaDosis ? fecha(fechaDosis) : '—'}{hexa && <b className="dc-hex">HEX</b>}</strong>
        </>
      )}
      {estado === 'atrasada' && d?.diasAtraso > 0 && <span className="dc-extra">hace {d.diasAtraso} días</span>}
      {desde && <span className="dc-extra">{desde <= hoy() ? 'Ya se puede adelantar' : `Se puede desde el ${corta(desde)}`}</span>}
    </Contenedor>
  );
}

/** Pantalla: el carné por edad, con los mismos colores que el de papel. */
function CarnePorEdad({ dosis, hexa, onTocar }) {
  const [abiertas, setAbiertas] = useState(new Set());
  const filas = [];
  for (const d of [...dosis].sort((a, b) => (a.edadRecomendadaDias ?? 0) - (b.edadRecomendadaDias ?? 0))) {
    const [desde, nombre, color] = franja(d.edadRecomendadaDias ?? 0);
    let f = filas.find((x) => x.desde === desde);
    if (!f) filas.push(f = { desde, nombre, color, dosis: [] });
    f.dosis.push(d);
  }
  // Las edades ya completas (todo aplicado o que ya no aplica) se juntan en una línea: lo que importa es lo que falta
  const completa = (f) => f.dosis.every((d) => ['aplicada', 'no_aplicable'].includes(d.estado));
  const completas = filas.filter(completa);
  const verCompletas = abiertas.has('todas');
  // Más adelante: después de las dos primeras edades con algo pendiente, lo demás se agrupa (es lejano y sin acción)
  const conPendiente = filas.filter((f) => !completa(f));
  const lejanas = conPendiente.slice(2).filter((f) => f.dosis.every((d) => ['en_espera', 'pendiente'].includes(d.estado)));
  const verLejanas = abiertas.has('lejanas');
  const alternar = (k) => setAbiertas((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="carne-edad">
      {completas.length > 0 && (
        <button type="button" className="carne-completas" onClick={() => alternar('todas')} aria-expanded={verCompletas}>
          <CheckCircle2 size={20} />
          <span><strong>{completas.map((f) => f.nombre).join(', ')}</strong> · completas</span>
          <ChevronDown size={18} className={verCompletas ? 'girada' : ''} />
        </button>
      )}
      {filas.filter((f) => (!completa(f) || verCompletas) && (!lejanas.includes(f) || verLejanas)).map((f) => (
        <div key={f.desde} className={`franja-edad franja-${f.color}`}>
          <div className="franja-nombre">{f.nombre}</div>
          <div className="franja-dosis">
            {f.dosis.map((d) => (
              <Dosis key={`${d.esquemaDosisId}-${d.temporada ?? ''}`} d={d} etiqueta={d.etiqueta} estado={d.estado} onTocar={onTocar}
                fechaDosis={d.estado === 'aplicada' ? d.fechaAplicada : d.fechaProgramada} hexa={hexa.has(d.esquemaDosisId)} />
            ))}
          </div>
        </div>
      ))}
      {lejanas.length > 0 && (
        <button type="button" className="carne-completas lejanas" onClick={() => alternar('lejanas')} aria-expanded={verLejanas}>
          <Clock size={20} />
          <span>Más adelante: <strong>{lejanas.map((f) => f.nombre).join(', ')}</strong></span>
          <ChevronDown size={18} className={verLejanas ? 'girada' : ''} />
        </button>
      )}
    </div>
  );
}

// "1A (IPV)" → "1a · IPV"; una columna que repite el nombre del grupo (Hep. "B", BCG) es dosis única
const etiquetaCorta = (t) => t.replace(/^(\d)A\b/, '$1a').replace(/\s*\((.+)\)$/, ' · $1');
const normal = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Impresión: las tres páginas del cuaderno SIGSA 5a con cada dosis en su columna. */
function CuadernoImpreso({ columnas, celdas, dosis }) {
  const porColumna = new Map(celdas.filter((c) => c.columna_id).map((c) => [c.columna_id, c]));
  const estadoDosis = new Map(dosis.map((d) => [d.esquemaDosisId, d]));
  const grupos = (p) => columnas.filter((c) => c.pagina === p).reduce((out, c) => {
    const g = out.find((x) => x.nombre === c.grupo);
    if (g) g.columnas.push(c); else out.push({ nombre: c.grupo, columnas: [c] });
    return out;
  }, []);
  return PAGINAS.map((p) => (
    <div key={p.id} className="carne" style={{ '--columnas': Math.max(1, ...grupos(p.id).map((g) => g.columnas.length)) }}>
      <h3>{p.nombre}</h3>
      {grupos(p.id).map((g) => (
        <div className="fila-carne" key={g.nombre}>
          <div className="fila-carne-nombre">{g.nombre}</div>
          <div className="fila-carne-dosis">
            {g.columnas.map((col) => {
              const llena = porColumna.get(col.id);
              const calc = !llena && col.pagina !== 'recuperacion' && !col.producto_id && !col.grupo_influenza ? estadoDosis.get(col.esquema_dosis_id) : null;
              const unica = g.columnas.length === 1 && normal(col.etiqueta) === normal(g.nombre);
              return (
                <div key={col.id} className={col.sombreada && !llena ? 'sombreada-papel' : ''}>
                  <Dosis d={calc} etiqueta={unica ? 'Dosis única' : etiquetaCorta(col.etiqueta)} estado={llena ? 'aplicada' : calc?.estado || 'vacia'}
                    fechaDosis={llena ? llena.fecha : calc?.fechaProgramada} hexa={llena?.producto_codigo === 'HEXA'} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  ));
}

export default function VistaCuaderno({ columnas, celdas, dosis, onTocar }) {
  const hexa = new Set(celdas.filter((c) => c.producto_codigo === 'HEXA').map((c) => c.esquema_dosis_id));
  return (
    <>
      <div className="no-imprimir"><CarnePorEdad dosis={dosis} hexa={hexa} onTocar={onTocar} /></div>
      <div className="solo-imprimir"><CuadernoImpreso columnas={columnas} celdas={celdas} dosis={dosis} /></div>
    </>
  );
}
