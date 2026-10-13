import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, BookPlus, Info, Plus, Save } from 'lucide-react';
import { api } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Cargando, Encabezado, Mensaje, Modal, Progreso, Tabla, Vacio } from '../componentes/ui.jsx';
import { Estado } from '../componentes/Estado.jsx';
import { TIPO_CUADERNO, edad, fecha, puede } from '../util.js';

// Lista de cuadernos físicos y alta de uno nuevo (portada del 5a)
export function ListaCuadernos() {
  const { usuario } = useSesion();
  const ir = useNavigate();
  const [cuadernos, setCuadernos] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState('');
  const cargar = useCallback(() => { api('/cuadernos').then(setCuadernos).catch((e) => setError(e.message)); }, []);
  useEffect(cargar, [cargar]);
  const puedeCrear = puede(usuario.rol, 'administrador', 'enfermera');
  // Por comunidad (así se buscan en el estante) y, dentro, del más reciente al más antiguo
  const ordenados = [...(cuadernos || [])].sort((a, b) => (a.comunidad || a.sector || '').localeCompare(b.comunidad || b.sector || '')
    || b.anio - a.anio || b.numero - a.numero);
  const llenos = (cuadernos || []).filter((c) => c.ocupadas >= 25).length;

  return (
    <>
      <Encabezado titulo="Cuadernos SIGSA 5a">
        {puedeCrear && <button className="btn btn-primario" onClick={() => setNuevo(true)}><BookPlus size={18} />Registrar cuaderno</button>}
      </Encabezado>
      <Mensaje tipo="error">{error}</Mensaje>
      {nuevo && <NuevoCuaderno onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); }} />}

      {cuadernos === null ? <Cargando /> : cuadernos.length === 0 ? (
        <div className="tarjeta">
          <Vacio icono={BookOpen} titulo="Todavía no hay cuadernos registrados"
            accion={puedeCrear && <button className="btn btn-primario" onClick={() => setNuevo(true)}><Plus size={17} />Registrar el primero</button>}>
            Registre la portada de cada cuaderno físico para ubicar a cada niño en su fila.
          </Vacio>
        </div>
      ) : (
        <>
          {llenos > 0 && (
            <Mensaje tipo="aviso">{llenos === 1 ? '1 cuaderno está lleno' : `${llenos} cuadernos están llenos`}: los niños nuevos de esa comunidad necesitan un cuaderno nuevo.</Mensaje>
          )}
          <Tabla>
            <thead><tr><th>Comunidad o sector</th><th>Cuaderno</th><th>Servicio</th><th>Filas ocupadas</th></tr></thead>
            <tbody>
              {ordenados.map((c) => (
                <tr key={c.id} className="clicable" onClick={() => ir(`/cuadernos/${c.id}`)}>
                  <td className="fuerte">{c.comunidad || c.sector || '—'}</td>
                  <td>
                    <Link className="nombre-link" to={`/cuadernos/${c.id}`}>No. {c.numero} / {c.anio}</Link>
                    {c.tipo !== 'produccion_cobertura' && <span className="etiqueta">{TIPO_CUADERNO[c.tipo]}</span>}
                  </td>
                  <td>{c.servicio}</td>
                  <td>
                    {c.ocupadas >= 25 ? <span className="chip ambar">Lleno · 25/25</span> : <Progreso valor={c.ocupadas} max={25} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}
    </>
  );
}

function NuevoCuaderno({ onCerrar, onCreado }) {
  const { avisar } = useDialogos();
  const comunidades = useCatalogo('comunidades');
  const establecimientos = useCatalogo('establecimientos');
  const [f, setF] = useState({ numero: '', anio: String(new Date().getFullYear()), tipo: 'produccion_cobertura', servicio_id: '', comunidad_id: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function guardar(e) {
    e.preventDefault();
    try {
      await api('/cuadernos', { method: 'POST', body: {
        ...f, numero: Number(f.numero), anio: Number(f.anio), servicio_id: Number(f.servicio_id || establecimientos[0]?.id),
        comunidad_id: f.comunidad_id ? Number(f.comunidad_id) : null } });
      avisar(`Cuaderno ${f.numero}/${f.anio} registrado.`);
      onCreado();
    } catch (err) { setError(err.message); }
  }

  return (
    <Modal titulo="Portada del cuaderno" onCerrar={onCerrar} onSubmit={guardar}
      pie={<><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button className="btn btn-primario"><Save size={17} />Guardar</button></>}>
      <div className="rejilla">
        <Campo etiqueta="Cuaderno No." requerido><input type="number" min="1" required value={f.numero} onChange={set('numero')} autoFocus /></Campo>
        <Campo etiqueta="Año" requerido><input type="number" min="2017" required value={f.anio} onChange={set('anio')} /></Campo>
        <Campo etiqueta="Tipo de registro" requerido className="ancho">
          <select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPO_CUADERNO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        <Campo etiqueta="Servicio de salud" requerido>
          <select required value={f.servicio_id || establecimientos[0]?.id || ''} onChange={set('servicio_id')}>
            {establecimientos.filter((x) => x.es_local).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Comunidad">
          <select value={f.comunidad_id} onChange={set('comunidad_id')}>
            <option value="">—</option>
            {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      </div>
      {error && <Mensaje tipo="error" className="mt">{error}</Mensaje>}
    </Modal>
  );
}

// Un cuaderno con sus 25 filas: flujo B de carga inicial desde el papel
export function CuadernoDetalle() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const [cu, setCu] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/cuadernos/' + id).then(setCu).catch((e) => setError(e.message)); }, [id]);
  const operativo = puede(usuario.rol, 'enfermera', 'vacunador');

  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!cu) return <Cargando filas={6} />;
  const ocupadas = cu.filas.filter((f) => f.nino).length;

  return (
    <>
      <Encabezado titulo={`Cuaderno No. ${cu.numero} / ${cu.anio}`} migas={[['Cuadernos', '/cuadernos'], [`No. ${cu.numero}/${cu.anio}`]]}
        descripcion={`${TIPO_CUADERNO[cu.tipo]} · ${cu.servicio}${cu.comunidad ? ` · ${cu.comunidad}` : ''}${cu.sector ? ` · sector ${cu.sector}` : ''}`}>
        <Progreso valor={ocupadas} max={25} />
      </Encabezado>
      <Tabla>
        <thead><tr><th>Fila</th><th>Niña o niño</th><th>Nacimiento</th><th>Responsable</th><th>Dosis</th><th>Estado</th></tr></thead>
        <tbody>
          {cu.filas.map(({ fila, nino }) => (
            <tr key={fila}>
              <td><span className="chip">Fila {fila}</span></td>
              {nino ? (
                <>
                  <td><Link className="nombre-link" to={`/ninos/${nino.id}`}>{nino.nombre_completo}</Link></td>
                  <td>{fecha(nino.fecha_nacimiento)} <span className="sub">{edad(nino.fecha_nacimiento)}</span></td>
                  <td>{nino.responsable || '—'}{nino.telefono && <span className="sub">{nino.telefono}</span>}</td>
                  <td>{nino.dosis}</td>
                  <td><Estado de={nino.estado} /></td>
                </>
              ) : (
                <td colSpan={5}>
                  {operativo
                    ? <Link className="btn btn-sm" to={`/ninos/nuevo?cuaderno=${cu.id}&fila=${fila}`}><Plus size={15} />Registrar en esta fila</Link>
                    : <span className="tenue">Libre</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}
