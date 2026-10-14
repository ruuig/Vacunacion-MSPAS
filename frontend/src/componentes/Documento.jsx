// Documento para imprimir: no es una captura de la pantalla, es una hoja formal con encabezado institucional,
// tablas ordenadas y espacio para firmas. En pantalla no se ve; al imprimir es lo único que sale.
import Logo from './Logo.jsx';
import { useSesion } from '../App.jsx';
import { fecha, hoy } from '../util.js';

export default function Documento({ titulo, periodo, detalle, firmas = ['Elaboró', 'Vo. Bo. Enfermera jefe'], children }) {
  const { usuario } = useSesion();
  return (
    <article className="documento solo-imprimir">
      <header className="doc-cab">
        <Logo alt="MSPAS" />
        <div className="doc-institucion">
          <strong>Ministerio de Salud Pública y Asistencia Social</strong>
          <span>Área de Salud de Jalapa · Distrito San Luis Jilotepeque</span>
          <span>Centro de Salud de San Luis Jilotepeque</span>
        </div>
      </header>
      <h1 className="doc-titulo">{titulo}</h1>
      <dl className="doc-datos">
        {periodo && <div><dt>Período</dt><dd>{periodo}</dd></div>}
        {detalle && <div><dt>Lugar</dt><dd>{detalle}</dd></div>}
        <div><dt>Elaborado</dt><dd>{fecha(hoy())}</dd></div>
        <div><dt>Por</dt><dd>{usuario?.nombre}</dd></div>
      </dl>
      {children}
      {firmas.length > 0 && (
        <footer className="doc-firmas">
          {firmas.map((f) => <div key={f}><span className="doc-linea" />{f}</div>)}
        </footer>
      )}
    </article>
  );
}

/** Tabla del documento: encabezado que se repite en cada hoja y filas que no se parten. */
export function TablaDoc({ columnas, filas, vacio = 'Sin registros.' }) {
  return (
    <table className="doc-tabla">
      <thead><tr>{columnas.map((c) => <th key={c.titulo} className={c.num ? 'num' : ''} style={c.ancho ? { width: c.ancho } : undefined}>{c.titulo}</th>)}</tr></thead>
      <tbody>
        {filas.length === 0 ? <tr><td colSpan={columnas.length}>{vacio}</td></tr> : filas.map((f, i) => (
          <tr key={i}>{columnas.map((c) => <td key={c.titulo} className={c.num ? 'num' : ''}>{typeof c.valor === 'function' ? c.valor(f) : f[c.valor]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
