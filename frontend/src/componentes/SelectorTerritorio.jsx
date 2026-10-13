// Selector del territorio: todo el municipio, un puesto (con las comunidades que tiene a cargo), el casco urbano
// (con sus barrios) o una sola comunidad. Valor: { puesto, comunidad } (ids como texto, vacíos si no aplica).
import { useCatalogo } from './useCatalogo.js';

export function useTerritorio() {
  const comunidades = useCatalogo('comunidades');
  const centrales = comunidades.filter((c) => c.es_central).sort((a, b) => (a.tipo === 'casco_urbano') - (b.tipo === 'casco_urbano') || a.nombre.localeCompare(b.nombre));
  const grupos = centrales.map((c) => ({ ...c, hijas: comunidades.filter((h) => h.comunidad_padre_id === c.id).sort((a, b) => a.nombre.localeCompare(b.nombre)) }));
  const sueltas = comunidades.filter((c) => !c.es_central && !c.comunidad_padre_id);
  /** Nombre y responsable de lo elegido, para encabezados e impresión. */
  const describir = ({ puesto, comunidad }) => {
    if (puesto) {
      const c = comunidades.find((x) => String(x.id) === String(puesto));
      if (!c) return { nombre: '', responsable: null };
      return { nombre: c.tipo === 'casco_urbano' ? 'Casco urbano (todos los barrios)' : `Puesto ${c.nombre} y comunidades a cargo`, responsable: c.responsable };
    }
    if (comunidad) {
      const c = comunidades.find((x) => String(x.id) === String(comunidad));
      if (!c) return { nombre: '', responsable: null };
      return { nombre: c.tipo === 'barrio' ? `Barrio ${c.nombre}` : c.nombre, responsable: c.responsable || c.responsable_puesto };
    }
    return { nombre: 'Todo el municipio', responsable: null };
  };
  return { comunidades, grupos, sueltas, describir };
}

export default function SelectorTerritorio({ puesto, comunidad, onCambio, ...resto }) {
  const { grupos, sueltas } = useTerritorio();
  const valor = puesto ? `p:${puesto}` : comunidad ? `c:${comunidad}` : '';
  const cambiar = (v) => onCambio({ puesto: v.startsWith('p:') ? v.slice(2) : '', comunidad: v.startsWith('c:') ? v.slice(2) : '' });
  const con = (r) => (r ? ` · ${r}` : '');
  return (
    <select value={valor} onChange={(e) => cambiar(e.target.value)} aria-label="Puesto, barrio o comunidad" {...resto}>
      <option value="">Todo el municipio</option>
      {grupos.map((g) => (
        <optgroup key={g.id} label={g.tipo === 'casco_urbano' ? 'Casco urbano (centro de salud)' : `Puesto ${g.nombre}${con(g.responsable)}`}>
          <option value={`p:${g.id}`}>{g.tipo === 'casco_urbano' ? 'Todos los barrios' : `Todo el sector de ${g.nombre}`}</option>
          {g.tipo !== 'casco_urbano' && <option value={`c:${g.id}`}>{g.nombre} (solo la aldea del puesto)</option>}
          {g.hijas.map((h) => <option key={h.id} value={`c:${h.id}`}>{h.tipo === 'barrio' ? `Barrio ${h.nombre}` : h.nombre}{con(h.responsable)}</option>)}
        </optgroup>
      ))}
      {sueltas.length > 0 && (
        <optgroup label="Otras comunidades">{sueltas.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.nombre}</option>)}</optgroup>
      )}
    </select>
  );
}
