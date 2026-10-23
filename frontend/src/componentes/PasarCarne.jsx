// "Pasar carné de papel": para niños que entran al sistema con vacunas ya puestas.
// Todo el esquema en una lista: se copia la fecha de cada vacuna del carné y se guarda de una vez.
// Lo puesto en el distrito se registra como digitado del cuaderno; lo de otro lugar, como antecedente del carné.
// Las reglas solo advierten (el papel manda); solo se rechaza una dosis repetida o antes del nacimiento.
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, XCircle } from 'lucide-react';
import { api } from '../api.js';
import { useCatalogo } from './useCatalogo.js';
import { Mensaje, Modal } from './ui.jsx';
import { fecha, hoy } from '../util.js';

/** Producto que suele estar en el carné para cada dosis (esquema 2026). */
function productoComun(d) {
  switch (d.serieCodigo) {
    case 'HB_RN': return 'HB_PED';
    case 'BCG': return 'BCG';
    case 'ROTA': return 'ROTA';
    case 'NEUMO': return 'NEUMO';
    case 'SPR': return 'SPR';
    case 'VARICELA': return 'VARICELA';
    case 'OPV_4M': return 'OPV';
    case 'DPT_HIB_HB': return d.numero >= 5 ? 'DPT' : 'HEXA';
    case 'POLIO': return 'OPV';
    default: return null;
  }
}

/** Filas del carné: cada dosis regular que falta. La polio 1a a 3a va dentro de la hexavalente del mismo número. */
function filasDe(esquema) {
  return esquema.dosis
    .filter((d) => d.tipo === 'regular' && d.estado !== 'aplicada')
    .sort((a, b) => a.edadRecomendadaDias - b.edadRecomendadaDias || a.serieCodigo.localeCompare(b.serieCodigo))
    .map((d) => ({ ...d, producto: productoComun(d) }));
}

export default function PasarCarne({ ninoId, nombre, fechaNacimiento, esquema, onCerrar, onTerminado }) {
  const productos = useCatalogo('productos');
  const establecimientos = useCatalogo('establecimientos');
  const filas = useMemo(() => filasDe(esquema), [esquema]);
  const [fechas, setFechas] = useState({});
  const [elegidos, setElegidos] = useState({}); // producto elegido por fila (si no es el común)
  const [lugar, setLugar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const lugarId = lugar || (establecimientos.find((e) => e.es_local) ? String(establecimientos.find((e) => e.es_local).id) : '');
  const externo = establecimientos.find((x) => String(x.id) === lugarId)?.es_local === false;
  const productoDe = (f) => elegidos[f.esquemaDosisId] || f.producto;
  const opciones = (f) => productos.filter((p) => p.series.includes(f.serieCodigo) && !(f.serieCodigo === 'POLIO' && p.codigo === 'HEXA'));

  // La polio 1a a 3a se cumple con la hexavalente del mismo número: esa fila no pide fecha propia
  const hexaDe = (f) => f.serieCodigo === 'POLIO' && f.numero <= 3
    && filas.find((x) => x.serieCodigo === 'DPT_HIB_HB' && x.numero === f.numero && productoDe(x) === 'HEXA');
  const llenas = filas.filter((f) => fechas[f.esquemaDosisId] && !hexaDe(f));
  const fueraDeRango = llenas.filter((f) => fechas[f.esquemaDosisId] < fechaNacimiento || fechas[f.esquemaDosisId] > hoy());

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    const hechas = [], errores = [], advertencias = [];
    // En orden de fecha: así cada dosis encuentra registrada la anterior
    for (const f of [...llenas].sort((a, b) => fechas[a.esquemaDosisId].localeCompare(fechas[b.esquemaDosisId]))) {
      const producto = productos.find((p) => p.codigo === productoDe(f));
      const polio = productoDe(f) === 'HEXA' && filas.find((x) => x.serieCodigo === 'POLIO' && x.numero === f.numero && f.numero <= 3);
      const ids = [f.esquemaDosisId, ...(polio ? [polio.esquemaDosisId] : [])];
      const etiqueta = polio ? `${f.etiqueta} (con ${polio.etiqueta})` : f.etiqueta;
      try {
        const r = await api(`/ninos/${ninoId}/aplicaciones`, { method: 'POST', body: {
          producto_id: producto.id, fecha_aplicacion: fechas[f.esquemaDosisId], establecimiento_id: lugarId ? Number(lugarId) : null,
          modo: externo ? 'antecedente' : 'cuaderno', esquema_dosis_ids: ids, observacion: 'Pasado del carné de papel',
        } });
        hechas.push(etiqueta);
        for (const a of r.advertencias || []) advertencias.push(`${etiqueta}: ${a}`);
      } catch (err) {
        errores.push(`${etiqueta}: ${err.message}`);
      }
    }
    setGuardando(false);
    setResultado({ hechas, errores, advertencias });
  }

  if (resultado) {
    return (
      <Modal titulo="Carné pasado al sistema" sub={nombre} onCerrar={() => onTerminado(resultado)}
        pie={<button type="button" className="btn btn-primario" onClick={() => onTerminado(resultado)}>Listo</button>}>
        {resultado.hechas.length > 0 && (
          <div className="msg msg-exito"><CheckCircle2 size={18} />
            <span>Se guardaron {resultado.hechas.length} {resultado.hechas.length === 1 ? 'vacuna' : 'vacunas'}: {resultado.hechas.join(', ')}.</span></div>
        )}
        {resultado.advertencias.length > 0 && (
          <Mensaje tipo="aviso" className="mt">
            <strong>Se guardaron, pero revise el carné:</strong>
            <ul className="lista-simple">{resultado.advertencias.map((a) => <li key={a}>{a}</li>)}</ul>
          </Mensaje>
        )}
        {resultado.errores.length > 0 && (
          <Mensaje tipo="error" className="mt">
            <strong>No se guardaron:</strong>
            <ul className="lista-simple">{resultado.errores.map((a) => <li key={a}>{a}</li>)}</ul>
          </Mensaje>
        )}
      </Modal>
    );
  }

  return (
    <Modal titulo="Pasar carné de papel" sub={`${nombre} · nació el ${fecha(fechaNacimiento)}`} onCerrar={onCerrar} onSubmit={guardar}
      className="pasar-carne"
      pie={(
        <>
          <span className="tenue pc-cuenta">{llenas.length ? `${llenas.length} con fecha` : 'Escriba la fecha de las que tiene el carné'}</span>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={guardando || !llenas.length || fueraDeRango.length > 0}>
            <Save size={17} />{guardando ? 'Guardando…' : 'Guardar todas'}
          </button>
        </>
      )}>
      <p className="pc-ayuda">Copie la fecha de cada vacuna que aparece en el carné. Las que no tiene, déjelas en blanco.
        La influenza y los suplementos se registran aparte.</p>
      <label className="campo pc-lugar">
        <span>¿Dónde se las pusieron?</span>
        <select value={lugarId} onChange={(e) => setLugar(e.target.value)}>
          {establecimientos.map((x) => <option key={x.id} value={x.id}>{x.es_local ? x.nombre : 'En otro lugar (IGSS, privado, otro municipio u otro país)'}</option>)}
        </select>
      </label>
      {externo && <Mensaje tipo="info" className="mt">Se guardan como antecedente del carné: cuentan para su esquema, no como vacunas puestas por el servicio.</Mensaje>}

      <ol className="pc-lista">
        {filas.map((f) => {
          const dentro = hexaDe(f);
          const valor = fechas[f.esquemaDosisId] || '';
          const malo = valor && (valor < fechaNacimiento || valor > hoy());
          const ops = opciones(f);
          return (
            <li key={f.esquemaDosisId} className={`pc-fila ${dentro ? 'pc-dentro' : ''}`}>
              <div className="pc-nombre">
                <strong>{f.etiqueta}</strong>
                {dentro ? <span className="tenue">Va en la hexavalente {f.numero}a</span>
                  : ops.length > 1 ? (
                    <select aria-label={`Vacuna de ${f.etiqueta}`} value={productoDe(f)} onChange={(e) => setElegidos({ ...elegidos, [f.esquemaDosisId]: e.target.value })}>
                      {ops.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
                    </select>
                  ) : <span className="tenue">{ops[0]?.nombre}</span>}
              </div>
              {!dentro && (
                <input type="date" aria-label={`Fecha de ${f.etiqueta}`} min={fechaNacimiento} max={hoy()} value={valor}
                  className={malo ? 'invalido' : ''} onChange={(e) => setFechas({ ...fechas, [f.esquemaDosisId]: e.target.value })} />
              )}
              {malo && <span className="pc-error"><XCircle size={14} />Fecha antes del nacimiento o futura</span>}
              {!dentro && !malo && valor && f.fechaLimite && valor > f.fechaLimite && (
                <span className="pc-aviso"><AlertTriangle size={14} />Pasada la edad máxima ({fecha(f.fechaLimite)})</span>
              )}
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
