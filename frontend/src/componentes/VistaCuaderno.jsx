import { AlertCircle, Check, Clock, Syringe } from 'lucide-react';
import { PAGINAS, fecha } from '../util.js';

/**
 * Carné de vacunación del niño.
 * En pantalla: igual al carné de la familia, una franja de color por edad.
 * Al imprimir: las páginas del cuaderno SIGSA 5a (menor de 1 año, 1 a menor de 7, recuperación) con sus columnas.
 */

const ESTADOS = {
  aplicada: { texto: 'Aplicada', icono: Check },
  atrasada: { texto: 'Atrasada', icono: AlertCircle },
  le_toca: { texto: 'Le toca hoy', icono: Syringe },
  proxima: { texto: 'Próxima', icono: Clock },
  pendiente: { texto: 'Programada' },
  en_espera: { texto: 'Espera la anterior' },
  no_aplicable: { texto: 'Ya no aplica' },
};

// Franjas por edad con los colores del carné que el MSPAS entrega a la familia
const EDADES = [
  [0, 'Al nacer', 'rosa'], [60, '2 meses', 'celeste'], [120, '4 meses', 'durazno'], [180, '6 meses', 'lila'],
  [210, '7 meses', 'amarillo'], [365, '12 meses', 'durazno'], [456, '15 meses', 'amarillo'], [548, '18 meses', 'celeste'],
  [1461, '4 a menor de 7 años', 'verde'],
];
const franja = (dias) => EDADES.reduce((f, e) => (dias >= e[0] ? e : f), EDADES[0]);

function Dosis({ etiqueta, estado, fechaDosis, diasAtraso, hexa }) {
  const info = ESTADOS[estado] || {};
  const Ic = info.icono;
  return (
    <div className={`dosis-carne estado-${estado}`}>
      <span className="dc-cab">
        <span className="dc-etq">{etiqueta}</span>
        {Ic && <Ic size={15} strokeWidth={2.6} className="dc-ic" />}
      </span>
      <strong className="dc-fecha">{fechaDosis ? fecha(fechaDosis) : '—'}</strong>
      <span className="dc-est">
        {estado === 'atrasada' && diasAtraso ? `Atrasada · ${diasAtraso} días` : info.texto}
        {hexa && <b className="dc-hex">HEX</b>}
      </span>
    </div>
  );
}

/** Pantalla: el carné por edad, con los mismos colores que el de papel. */
function CarnePorEdad({ dosis, hexa }) {
  const filas = [];
  for (const d of [...dosis].sort((a, b) => (a.edadRecomendadaDias ?? 0) - (b.edadRecomendadaDias ?? 0))) {
    const [desde, nombre, color] = franja(d.edadRecomendadaDias ?? 0);
    let f = filas.find((x) => x.desde === desde);
    if (!f) filas.push(f = { desde, nombre, color, dosis: [] });
    f.dosis.push(d);
  }
  return (
    <div className="carne-edad">
      {filas.map((f) => (
        <div key={f.desde} className={`franja-edad franja-${f.color}`}>
          <div className="franja-nombre">{f.nombre}</div>
          <div className="franja-dosis">
            {f.dosis.map((d) => (
              <Dosis key={`${d.esquemaDosisId}-${d.temporada ?? ''}`} etiqueta={d.etiqueta} estado={d.estado} diasAtraso={d.diasAtraso}
                fechaDosis={d.estado === 'aplicada' ? d.fechaAplicada : d.fechaProgramada} hexa={hexa.has(d.esquemaDosisId)} />
            ))}
          </div>
        </div>
      ))}
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
                  <Dosis etiqueta={unica ? 'Dosis única' : etiquetaCorta(col.etiqueta)} estado={llena ? 'aplicada' : calc?.estado || 'vacia'}
                    fechaDosis={llena ? llena.fecha : calc?.fechaProgramada} diasAtraso={calc?.diasAtraso} hexa={llena?.producto_codigo === 'HEXA'} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  ));
}

export default function VistaCuaderno({ columnas, celdas, dosis }) {
  const hexa = new Set(celdas.filter((c) => c.producto_codigo === 'HEXA').map((c) => c.esquema_dosis_id));
  return (
    <>
      <div className="no-imprimir"><CarnePorEdad dosis={dosis} hexa={hexa} /></div>
      <div className="solo-imprimir"><CuadernoImpreso columnas={columnas} celdas={celdas} dosis={dosis} /></div>
      <div className="leyenda-carne no-imprimir">
        <span className="estado-aplicada"><Check size={14} strokeWidth={2.6} />Aplicada</span>
        <span className="estado-le_toca"><Syringe size={14} />Le toca hoy</span>
        <span className="estado-atrasada"><AlertCircle size={14} />Atrasada</span>
        <span className="estado-proxima"><Clock size={14} />Próxima (en 7 días)</span>
        <span className="estado-pendiente">Programada</span>
        <span className="estado-en_espera">Espera la dosis anterior</span>
      </div>
    </>
  );
}
