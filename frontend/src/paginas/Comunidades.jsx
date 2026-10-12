import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Baby, CalendarX, Clock, Download, Save, Truck, UserX } from 'lucide-react';
import { api } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { Campo, Cargando, Encabezado, Kpi, Mensaje, Pestanas, Tabla } from '../componentes/ui.jsx';
import { Cuenta, NIVELES, Nivel, nivelComunidad, plural, puntaje } from '../componentes/Estado.jsx';
import { descargarCSV, fecha, pct, puede } from '../util.js';

const TIPO_LUGAR = { casco_urbano: 'Casco urbano', barrio: 'Barrio', aldea: 'Aldea', caserio: 'Caserío', canton: 'Cantón' };

// Tablero por comunidad (objetivo 3) y población meta
export default function Comunidades() {
  const { usuario } = useSesion();
  const [vista, setVista] = useState('tablero');
  const editaMeta = puede(usuario.rol, 'enfermera', 'administrador');

  return (
    <>
      <Encabezado titulo="Comunidades" descripcion="Situación de cada lugar poblado para decidir a dónde ir primero con la jornada extramural.">
        {usuario.rol === 'enfermera' && <Link className="btn btn-primario" to="/jornadas/nueva"><Truck size={18} />Planificar jornada</Link>}
      </Encabezado>
      <Pestanas valor={vista} onCambio={setVista} opciones={[['tablero', 'Tablero territorial'], ['meta', 'Población meta']]} />
      {vista === 'tablero' ? <Tablero rol={usuario.rol} onIrMeta={() => setVista('meta')} /> : <PoblacionMeta editable={editaMeta} />}
    </>
  );
}

// Más de 100 % no es buena noticia: la población meta está subestimada y la cobertura no es confiable
function Cobertura({ valor, sinMeta, onIrMeta }) {
  if (sinMeta || valor == null) {
    return onIrMeta ? <button type="button" className="enlace-tenue" onClick={onIrMeta}>Sin meta · cargarla</button> : <span className="tenue">Sin meta</span>;
  }
  if (valor > 100) {
    return <span className="chip ambar" title="La cobertura no puede pasar de 100 %: revise la población meta"><AlertTriangle size={13} />{pct(valor)} · revisar meta</span>;
  }
  const color = valor >= 95 ? 'var(--verde)' : valor >= 80 ? '#e09a2a' : 'var(--rojo)';
  return (
    <span className="barra-progreso">
      <span className="pista"><span className="lleno" style={{ width: `${valor}%`, background: color }} /></span>
      <span>{pct(valor)}</span>
    </span>
  );
}

function Tablero({ rol, onIrMeta }) {
  const ir = useNavigate();
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/comunidades/tablero').then(setFilas).catch((e) => setError(e.message)); }, []);
  const ordenadas = [...(filas || [])].sort((a, b) => puntaje(b) - puntaje(a) || b.activos - a.activos);
  const maximo = ordenadas.length ? puntaje(ordenadas[0]) : 0;
  const total = (k) => (filas || []).reduce((s, c) => s + (c[k] || 0), 0);

  function exportar() {
    descargarCSV('tablero-comunidades', [
      { titulo: 'Comunidad', valor: 'nombre' }, { titulo: 'Sector', valor: 'sector' }, { titulo: 'Activos', valor: 'activos' },
      { titulo: 'Menores de 1 año', valor: 'menores_1' }, { titulo: 'Dosis cero', valor: 'dosis_cero' }, { titulo: 'Abandono', valor: 'abandono' },
      { titulo: 'Atrasados', valor: 'atrasados' }, { titulo: 'Inasistencia', valor: 'inasistencia' },
      { titulo: 'Cobertura DPT3 %', valor: 'cobertura_dpt3' }, { titulo: 'Última jornada', valor: 'ultima_jornada' },
    ], ordenadas);
  }

  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!filas) return <Cargando />;

  return (
    <>
      <div className="kpis">
        <Kpi valor={total('activos')} rotulo="Niños activos" icono={Baby} color="marino" />
        <Kpi resaltar valor={total('dosis_cero')} rotulo="Dosis cero" icono={AlertOctagon} color="rojo" to="/alertas?tipo=dosis_cero" />
        <Kpi resaltar valor={total('abandono')} rotulo="Abandono" icono={UserX} color="rojo" to="/alertas?tipo=abandono" />
        <Kpi resaltar valor={total('atrasados')} rotulo="Atrasados" icono={Clock} color="ambar" to="/alertas?tipo=atrasada" />
        <Kpi resaltar valor={total('inasistencia')} rotulo="Inasistencias" icono={CalendarX} color="morado" to="/alertas?tipo=inasistencia" />
      </div>

      <div className="pagina-cab" style={{ marginBottom: '.75rem', alignItems: 'center' }}>
        <p className="tenue" style={{ margin: 0 }}>
          Ordenadas de mayor a menor necesidad. Cada niño cuenta una vez, en su caso más grave (dosis cero y abandono pesan más).
        </p>
        <button className="btn btn-sm" onClick={exportar}><Download size={15} />Exportar a Excel</button>
      </div>

      <Tabla className="tabla-comunidades">
        <thead>
          <tr><th>#</th><th>Comunidad</th><th className="celda-num">Dosis cero</th><th className="celda-num">Abandono</th><th className="celda-num">Atrasados</th>
            <th className="celda-num">Inasist.</th><th>Cobertura Penta 3</th><th /></tr>
        </thead>
        <tbody>
          {ordenadas.map((c, i) => {
            const nivel = nivelComunidad(c, maximo);
            const casos = c.dosis_cero + c.abandono + c.atrasados + c.inasistencia;
            // Toda la fila abre la comunidad: sus casos por contactar o, si no tiene, la lista de sus niños
            const destino = casos ? `/alertas?comunidad=${c.id}` : `/ninos?comunidad=${c.id}`;
            return (
              <tr key={c.id} className={`riel clicable t-${NIVELES[nivel][1]}`} onClick={() => ir(destino)}
                title={casos ? `Ver los ${casos} niños por contactar de ${c.nombre}` : `Ver los niños de ${c.nombre}`}>
                <td data-label="Orden"><span className={`posicion-num t-${NIVELES[nivel][1]}`}>{i + 1}</span></td>
                <td>
                  <Link className="nombre-link" to={destino}>{c.nombre}</Link>
                  <span className="sub" title={`${c.menores_1} menores de 1 año`}>
                    {c.sector ? `Sector ${c.sector} · ` : TIPO_LUGAR[c.tipo] !== c.nombre ? `${TIPO_LUGAR[c.tipo]} · ` : ''}{plural(c.activos, 'niño', 'niños')}
                    {' · '}{c.ultima_jornada ? `última jornada ${fecha(c.ultima_jornada)}` : 'sin jornadas'}
                  </span>
                  <Nivel de={nivel} />
                </td>
                <td className="celda-num"><Cuenta n={c.dosis_cero} tono="critico" /></td>
                <td className="celda-num"><Cuenta n={c.abandono} tono="critico" /></td>
                <td className="celda-num"><Cuenta n={c.atrasados} tono="atencion" /></td>
                <td className="celda-num"><Cuenta n={c.inasistencia} tono="ausencia" /></td>
                <td onClick={(e) => c.meta_menor_1 == null && e.stopPropagation()}><Cobertura valor={c.cobertura_dpt3} sinMeta={c.meta_menor_1 == null} onIrMeta={onIrMeta} /></td>
                <td className="celda-fin">
                  <span className="botones-fila" onClick={(e) => e.stopPropagation()}>
                    {rol === 'enfermera' && casos > 0 && (
                      <Link className="btn btn-sm btn-primario" to={`/jornadas/nueva?comunidad=${c.id}`} title="Planificar una jornada en esta comunidad">
                        <Truck size={14} />Jornada aquí
                      </Link>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tabla>
    </>
  );
}

function PoblacionMeta({ editable }) {
  const { avisar } = useDialogos();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => { api(`/comunidades/poblacion-meta?anio=${anio}`).then(setFilas).catch((e) => setError(e.message)); }, [anio]);
  useEffect(cargar, [cargar]);
  const set = (i, k) => (e) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: e.target.value } : f)));

  async function guardar() {
    setError('');
    try {
      await api('/comunidades/poblacion-meta', { method: 'PUT', body: { anio, filas } });
      avisar('Población meta guardada.');
    } catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="filtros">
        <Campo etiqueta="Año" className="" ><input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ maxWidth: 140 }} /></Campo>
        <p className="tenue" style={{ flex: '3 1 300px', paddingBottom: '.7rem' }}>Denominador de las coberturas. Fuente: Área de Salud de Jalapa.</p>
      </div>
      <Mensaje tipo="error">{error}</Mensaje>
      {!filas ? <Cargando /> : (
        <Tabla>
          <thead><tr><th>Comunidad</th><th>Menores de 1 año</th><th>1 año</th><th>1 a 6 años</th></tr></thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.comunidad_id}>
                <td className="fuerte">{f.nombre}</td>
                {['menor_1', '1_anio', '1_a_6'].map((k) => (
                  <td key={k}>{editable ? <input type="number" min="0" className="num-input" value={f[k] ?? ''} onChange={set(i, k)} /> : f[k] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {editable && filas && <div className="acciones"><button className="btn btn-primario" onClick={guardar}><Save size={17} />Guardar población meta</button></div>}
    </>
  );
}
