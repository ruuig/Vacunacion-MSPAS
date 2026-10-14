// Listado para vacunar: a quién le toca, con cuatro filtros que se combinan (lugar, vacuna, edad y periodo)
// y una hoja impresa con el título según lo elegido. Ej.: «Hexavalente · Puesto Los Trapichitos · Esta semana».
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Printer, Users } from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import Documento, { TablaDoc } from '../componentes/Documento.jsx';
import SelectorTerritorio, { useTerritorio } from '../componentes/SelectorTerritorio.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Cargando, Encabezado, Mensaje, Vacio } from '../componentes/ui.jsx';
import { plural } from '../componentes/Estado.jsx';
import { edad, fecha, hoy, sumarDias } from '../util.js';

const finSemana = () => sumarDias(hoy(), (7 - new Date(`${hoy()}T12:00:00Z`).getUTCDay()) % 7 || 7);
const PERIODOS = [
  ['atrasados', 'Atrasados'],
  ['semana', 'Esta semana'],
  ['mes', 'Este mes'],
  ['proximo', 'Próximo mes'],
];
// Edad el día que le toca la vacuna
const EDADES = [
  ['', 'Todas las edades'], ['menor_1', 'Menores de 1 año'], ['1', '1 año'], ['2_3', '2 y 3 años'], ['4_6', '4 a 6 años'],
];
const anios = (nac, f) => {
  const [a, m, d] = nac.slice(0, 10).split('-').map(Number);
  const [fa, fm, fd] = f.slice(0, 10).split('-').map(Number);
  return fa - a - (fm < m || (fm === m && fd < d) ? 1 : 0);
};
const enEdad = (n, e) => {
  if (!e) return true;
  const x = anios(n.fecha_nacimiento, n.fecha || hoy());
  return e === 'menor_1' ? x < 1 : e === '1' ? x === 1 : e === '2_3' ? x >= 2 && x <= 3 : x >= 4;
};

export default function Listado() {
  const { usuario } = useSesion();
  const productos = useCatalogo('productos');
  const { describir } = useTerritorio();
  const [lugar, setLugar] = useState({ puesto: '', comunidad: '' });
  const [vacuna, setVacuna] = useState('');
  const [edadSel, setEdadSel] = useState('');
  const [periodo, setPeriodo] = useState('semana');
  const [conAtrasados, setConAtrasados] = useState(true);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDatos(null);
    api('/seguimiento/proyeccion' + qs(lugar)).then(setDatos).catch((e) => setError(e.message));
  }, [lugar]);

  const ninos = useMemo(() => {
    if (!datos) return [];
    const col = (clave) => datos.columnas.find((c) => c.clave === clave)?.ninos || [];
    const atrasados = col('atrasadas').map((n) => ({ ...n, atrasado: true }));
    let lista;
    if (periodo === 'atrasados') lista = atrasados;
    else {
      const delPeriodo = periodo === 'proximo' ? datos.columnas[2].ninos
        : col('este_mes').filter((n) => periodo === 'mes' || n.fecha <= finSemana());
      lista = [...(conAtrasados ? atrasados : []), ...delPeriodo];
    }
    return lista.filter((n) => (!vacuna || (n.productos || []).includes(vacuna)) && enEdad(n, edadSel))
      .sort((a, b) => (a.lugar || a.comunidad).localeCompare(b.lugar || b.comunidad) || a.comunidad.localeCompare(b.comunidad)
        || (a.atrasado === b.atrasado ? a.fecha.localeCompare(b.fecha) : a.atrasado ? -1 : 1) || a.nombre_completo.localeCompare(b.nombre_completo));
  }, [datos, periodo, conAtrasados, vacuna, edadSel]);

  // Para el título del documento y del resumen
  const nombreVacuna = productos.find((p) => p.codigo === vacuna)?.nombre;
  const nombrePeriodo = periodo === 'proximo' ? (datos?.columnas[2]?.nombre || 'Próximo mes').replace(/^\w/, (x) => x.toUpperCase())
    : PERIODOS.find((p) => p[0] === periodo)[1];
  const titulo = [nombreVacuna || 'Niños a vacunar', describir(lugar).nombre, nombrePeriodo].join(' · ');
  const porComunidad = Object.values(ninos.reduce((m, n) => { (m[n.comunidad] ||= { nombre: n.comunidad, lugar: n.lugar, ninos: [] }).ninos.push(n); return m; }, {}));
  const porVacuna = Object.entries(ninos.flatMap((n) => (n.productos || []).filter((p) => !vacuna || p === vacuna)).reduce((m, p) => ({ ...m, [p]: (m[p] || 0) + 1 }), {}))
    .map(([c, k]) => [productos.find((p) => p.codigo === c)?.nombre || c, k]).sort((a, b) => b[1] - a[1]);
  const vacunasConNinos = productos.filter((p) => p.activo !== false);

  return (
    <div className="con-documento">
      <Documento titulo={nombreVacuna ? `Niños a vacunar con ${nombreVacuna}` : 'Niños a vacunar'}
        periodo={`${nombrePeriodo}${periodo !== 'atrasados' && conAtrasados ? ' (incluye atrasados)' : ''}`}
        detalle={`${describir(lugar).nombre}${edadSel ? ` · ${EDADES.find((e) => e[0] === edadSel)[1]}` : ''} · ${plural(ninos.length, 'niño', 'niños')}`}>
        {porComunidad.map((g) => (
          <section key={g.nombre}>
            <h2 className="doc-seccion">{g.nombre}{g.lugar && g.lugar !== g.nombre ? ` (${g.lugar})` : ''} · {g.ninos.length}</h2>
            <TablaDoc columnas={[
              { titulo: 'Fecha', valor: (n) => (n.atrasado ? 'Atrasado' : fecha(n.fecha)), ancho: '11%' },
              { titulo: 'Niña o niño', valor: (n) => <><strong>{n.nombre_completo}</strong><br />{edad(n.fecha_nacimiento)}</>, ancho: '28%' },
              { titulo: 'Mamá o responsable', valor: (n) => <>{n.responsable || '—'}<br />{n.telefono || ''}</>, ancho: '25%' },
              { titulo: 'Vacunas', valor: (n) => n.dosis.join(', ') },
              { titulo: 'Vacunado', valor: () => '☐', ancho: '9%' },
            ]} filas={g.ninos} />
          </section>
        ))}
      </Documento>

      <Encabezado titulo="Listado para vacunar">
        <button className="btn btn-primario" onClick={() => window.print()} disabled={!ninos.length}><Printer size={17} />Imprimir listado</button>
      </Encabezado>
      <Mensaje tipo="error">{error}</Mensaje>

      <div className="tarjeta listado-filtros"><div className="tarjeta-cuerpo">
        <div className="lf-fila">
          <label className="lf-campo"><span>Lugar</span>
            {usuario.sector ? <strong className="chip-sector">Su sector</strong>
              : <SelectorTerritorio puesto={lugar.puesto} comunidad={lugar.comunidad} onCambio={setLugar} />}
          </label>
          <label className="lf-campo"><span>Vacuna</span>
            <select value={vacuna} onChange={(e) => setVacuna(e.target.value)}>
              <option value="">Todas las vacunas</option>
              {vacunasConNinos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
            </select>
          </label>
          <label className="lf-campo"><span>Edad</span>
            <select value={edadSel} onChange={(e) => setEdadSel(e.target.value)}>
              {EDADES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="lf-fila">
          <div className="segmentado" role="group" aria-label="Periodo">
            {PERIODOS.map(([k, t]) => <button key={k} type="button" className={periodo === k ? 'activa' : ''} onClick={() => setPeriodo(k)}>{t}</button>)}
          </div>
          {periodo !== 'atrasados' && (
            <label className="interruptor"><input type="checkbox" checked={conAtrasados} onChange={(e) => setConAtrasados(e.target.checked)} />Sumar los atrasados</label>
          )}
        </div>
      </div></div>

      {!datos ? <Cargando filas={5} /> : ninos.length === 0 ? (
        <div className="tarjeta"><Vacio icono={ClipboardList} titulo="Nadie con estos filtros" /></div>
      ) : (
        <>
          <div className="listado-resumen">
            <span className="lr-total"><Users size={18} /><strong>{ninos.length}</strong> {ninos.length === 1 ? 'niño' : 'niños'}</span>
            {porVacuna.map(([v, k]) => <span key={v} className="ficha-vacuna le_toca">{v} · {k}</span>)}
          </div>
          {porComunidad.map((g) => (
            <section key={g.nombre} className="grupo-casos">
              <div className="grupo-casos-cab"><strong>{g.nombre}</strong><span className="chip">{g.ninos.length}</span></div>
              <div className="casos-filas">
                {g.ninos.map((n) => (
                  <Link key={`${n.id}-${n.atrasado ? 'a' : n.fecha}`} to={`/ninos/${n.id}`} className="fila-caso fila-simple">
                    <div className="fc-cuerpo"><strong>{n.nombre_completo}</strong>
                      <span className="tenue">{edad(n.fecha_nacimiento)}{n.responsable ? ` · ${n.responsable}` : ''}</span>
                      <span className="fichas-hoy">{n.dosis.map((d) => <span key={d} className={`ficha-vacuna ${n.atrasado ? 'atrasada' : 'le_toca'}`}>{d}</span>)}</span></div>
                    <span className="fs-fecha">{n.atrasado ? 'Atrasado' : n.fecha === hoy() ? 'Hoy' : fecha(n.fecha).slice(0, 5)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
