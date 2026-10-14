// "Vacunar ahora": registro guiado en pasos para personal con poca experiencia en el celular.
//   1. ¿Qué vacunas le puso hoy?  (las que le tocan, marcadas; se toca para quitar)
//   2. ¿Por qué no se puso…?      (solo si quitó alguna: botones grandes = oportunidad perdida, OPS)
//   3. ¡Listo!                    (qué anotar en el carné y en el cuaderno)
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CalendarCheck, Check, CheckCircle2, ChevronLeft, Printer, ClipboardList, HeartPulse, PackageX, Thermometer, UserX, Clock, HelpCircle, Syringe,
} from 'lucide-react';
import { api } from '../api.js';
import { useCatalogo } from './useCatalogo.js';
import { Modal, Mensaje } from './ui.jsx';
import { catalogoGuardado, encolar } from './fueraDeLinea.js';
import { fecha, hoy } from '../util.js';


/** Hoja pequeña con la próxima cita para entregar a la mamá (por si pierde o no trae el carné). */
function imprimirCita(nombre, cita, vacunas) {
  const v = window.open('', '_blank', 'width=420,height=560');
  if (!v) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  v.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Próxima cita</title>
    <style>body{font-family:system-ui,sans-serif;margin:24px;color:#1b2a5c}h1{font-size:15px;margin:0 0 4px}p{margin:4px 0}
    .fecha{font-size:34px;font-weight:800;margin:14px 0 6px}.caja{border:2px solid #1b2a5c;border-radius:12px;padding:16px}small{color:#555}</style></head>
    <body><div class="caja"><h1>Ministerio de Salud Pública y Asistencia Social</h1><small>Centro de Salud de San Luis Jilotepeque</small>
    <p style="margin-top:14px"><strong>${esc(nombre)}</strong></p><p>Próxima vacuna:</p><div class="fecha">${esc(fecha(cita))}</div>
    <p>${esc(vacunas.join(', '))}</p><p style="margin-top:14px"><small>Traiga el carné de vacunación.</small></p></div>
    <script>window.onload=()=>{window.print();}</script></body></html>`);
  v.document.close();
}

/** Producto que se aplica para una dosis del esquema (la hexavalente cubre Penta y Polio del mismo número). */
function productoPara(d) {
  switch (d.serieCodigo) {
    case 'HB_RN': return 'HB_PED';
    case 'BCG': return 'BCG';
    case 'ROTA': return 'ROTA';
    case 'NEUMO': return 'NEUMO';
    case 'SPR': case 'SPR_CERO': return 'SPR';
    case 'INFLUENZA': return 'INFL_PED';
    case 'VARICELA': return 'VARICELA';
    case 'DPT_HIB_HB': return d.numero >= 5 ? 'DPT' : 'HEXA';
    case 'POLIO': return d.numero >= 4 ? 'OPV' : 'HEXA'; // el R1 de polio es OPV (gotas), aparte de la hexavalente
    default: return null;
  }
}

/** Agrupa las dosis que le tocan en "tarjetas de vacuna": una hexavalente = Penta n + Polio n. */
function agrupar(dosis, productos) {
  const tarjetas = [];
  // La hexavalente se usa cuando tocan juntas la polio y la pentavalente del mismo número; si solo falta la polio,
  // se pone IPV (1a) u OPV, porque la hexa también adelantaría la siguiente pentavalente
  const conPenta = new Set(dosis.filter((d) => d.serieCodigo === 'DPT_HIB_HB').map((d) => d.numero));
  for (const d of dosis) {
    let codigo = productoPara(d);
    if (d.serieCodigo === 'POLIO' && codigo === 'HEXA' && !conPenta.has(d.numero)) codigo = d.numero === 1 ? 'IPV' : 'OPV';
    const producto = productos.find((p) => p.codigo === codigo);
    if (!producto) continue;
    const t = codigo === 'HEXA' && tarjetas.find((x) => x.codigo === 'HEXA' && x.numero === d.numero);
    if (t) { t.dosis.push(d); continue; }
    tarjetas.push({ clave: `${codigo}-${d.esquemaDosisId}`, codigo, numero: d.numero, producto, dosis: [d] });
  }
  return tarjetas;
}

const MOTIVOS = [
  { id: 'falsa_contraindicacion', texto: 'Tiene gripe, tos o calentura leve', ayuda: 'Ojo: esto no impide vacunar', icono: Thermometer },
  { id: 'contraindicacion', texto: 'Está enfermo de verdad', ayuda: 'Contraindicación médica', icono: HeartPulse },
  { id: 'desabastecimiento', texto: 'No hay vacuna hoy', ayuda: 'Se terminó en el servicio', icono: PackageX },
  { id: 'rechazo', texto: 'La mamá no quiso', ayuda: 'El responsable no aceptó', icono: UserX },
  { id: 'posterga_personal', texto: 'Se pondrá otro día', ayuda: 'Por muchas inyecciones u otra razón', icono: Clock },
  { id: 'otro', texto: 'Otro motivo', ayuda: '', icono: HelpCircle },
];

export default function Vacunar({ ninoId, nombre, esquema, jornadaId, fechaDefecto, sinVacunar = false, onCerrar, onTerminado }) {
  const productos = useCatalogo('productos');
  const establecimientos = useCatalogo('establecimientos');
  const tarjetas = useMemo(() => agrupar(esquema.leTocaHoy, productos), [esquema.leTocaHoy, productos]);
  const [paso, setPaso] = useState(1);
  // Vacunas que la persona tocó. Normalmente tocar = quitar; si vino sin vacunarse, tocar = sí se la puso.
  const [tocadas, setTocadas] = useState(() => new Set());
  const [motivos, setMotivos] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const fechaAplicacion = fechaDefecto && fechaDefecto < hoy() ? fechaDefecto : hoy();
  const establecimientoId = establecimientos.find((e) => e.es_local)?.id || establecimientos[0]?.id || null;
  const estaQuitada = (t) => (sinVacunar ? !tocadas.has(t.clave) : tocadas.has(t.clave));
  const alternar = (t) => setTocadas((s) => {
    const n = new Set(s);
    if (n.has(t.clave)) n.delete(t.clave); else n.add(t.clave);
    return n;
  });
  const aplicar = tarjetas.filter((t) => !estaQuitada(t));
  const noAplicar = tarjetas.filter(estaQuitada);
  const faltaMotivo = noAplicar.some((t) => !motivos[t.clave]);

  async function guardar() {
    setGuardando(true);
    const hechas = [], errores = [];
    let ultima = null, sinConexion = 0;
    // En jornada, sin señal: el registro queda en el teléfono y se envía solo al volver la conexión
    const enCola = (ruta, body, descripcion) => {
      encolar({ ruta, method: 'POST', body, descripcion, tipo: ruta.endsWith('/visitas') ? 'visita' : 'aplicacion', jornada_id: jornadaId, nino_id: Number(ninoId) });
      sinConexion++;
    };
    for (const t of aplicar) {
      const body = {
        producto_id: t.producto.id, fecha_aplicacion: fechaAplicacion, establecimiento_id: establecimientoId,
        modo: 'atencion', jornada_id: jornadaId || null,
      };
      try {
        const r = await api(`/ninos/${ninoId}/aplicaciones`, { method: 'POST', body });
        hechas.push({ nombre: t.producto.nombre, dosis: r.dosis, donde: r.dondeAnotar.texto });
        ultima = r;
      } catch (e) {
        if (e.sinRed && jornadaId) {
          enCola(`/ninos/${ninoId}/aplicaciones`, body, `${nombre} · ${t.producto.nombre}`);
          hechas.push({ nombre: t.producto.nombre, dosis: t.dosis.map((d) => d.etiqueta), donde: 'su fila del cuaderno, como siempre (la columna exacta se verá en la ficha al enviar)' });
        } else errores.push(`${t.producto.nombre}: ${e.message}`);
      }
    }
    if (noAplicar.length) {
      const body = {
        fecha: fechaAplicacion, establecimiento_id: establecimientoId, jornada_id: jornadaId || null,
        no_aplicadas: noAplicar.flatMap((t) => t.dosis.map((d) => ({ esquema_dosis_id: d.esquemaDosisId, motivo: motivos[t.clave] }))),
      };
      try {
        await api(`/ninos/${ninoId}/visitas`, { method: 'POST', body });
      } catch (e) {
        if (e.sinRed && jornadaId) enCola(`/ninos/${ninoId}/visitas`, body, `${nombre} · motivo de no vacunar`);
        else errores.push(`No se pudo guardar el motivo: ${e.message}`);
      }
    }
    // Próxima cita actualizada aunque no se haya aplicado nada
    let cita = ultima ? { proximaCita: ultima.proximaCita, vacunas: ultima.proximaCitaVacunas } : null;
    if (!cita) {
      const e = await api(`/ninos/${ninoId}/esquema`).catch(() => null);
      if (e) cita = { proximaCita: e.proximaCita, vacunas: e.proximaCitaVacunas };
    }
    setResultado({ hechas, errores, cita, sinConexion, advertencias: ultima?.advertencias || [] });
    setPaso(3);
    setGuardando(false);
  }

  const siguiente = () => (noAplicar.length ? setPaso(2) : guardar());
  const pasos = noAplicar.length ? 3 : 2;
  const pasoVisible = paso === 3 ? pasos : paso;

  const barra = (
    <div className="pasos-barra" aria-hidden="true">
      {Array.from({ length: pasos }, (_, i) => <span key={i} className={i + 1 < pasoVisible ? 'hecho' : i + 1 === pasoVisible ? 'actual' : ''} />)}
    </div>
  );

  if (paso === 3 && resultado) {
    const r = resultado;
    return (
      <Modal titulo={nombre} className="modal-completo" onCerrar={() => onTerminado(r)}
        pie={(
          <>
            {r.cita?.proximaCita && <button className="btn btn-grande" onClick={() => imprimirCita(nombre, r.cita.proximaCita, r.cita.vacunas)}><Printer size={20} />Imprimir cita</button>}
            <button className="btn btn-primario btn-grande" style={{ flex: 1 }} onClick={() => onTerminado(r)}><Check size={20} />Terminar</button>
          </>
        )}>
        <div className="confirmacion">
          <div className="sello"><CheckCircle2 size={46} /></div>
          <h2>{r.hechas.length ? `¡Listo! Se ${r.hechas.length === 1 ? 'guardó 1 vacuna' : `guardaron ${r.hechas.length} vacunas`}` : 'Se guardó la visita'}</h2>
          {noAplicar.length > 0 && <p className="suave" style={{ marginTop: '.35rem' }}>También quedó anotado por qué no se puso {noAplicar.length === 1 ? 'una vacuna' : `${noAplicar.length} vacunas`}.</p>}
          <div className="nota-papel">
            {r.cita?.proximaCita && (
              <div><CalendarCheck size={22} /><span>Anote en el carné la <strong>próxima cita</strong>:
                <span className="cita-grande">{fecha(r.cita.proximaCita)}</span>{r.cita.vacunas.join(', ')}</span></div>
            )}
            {r.hechas.map((h) => (
              <div key={h.nombre}><BookOpen size={20} /><span><strong>{h.nombre}</strong> ({h.dosis.join(' y ')}). Anote en: {h.donde}.</span></div>
            ))}
          </div>
          {r.sinConexion > 0 && (
            <Mensaje tipo="aviso" className="mt">Sin señal: quedó guardado en este teléfono y se enviará solo cuando vuelva la conexión. No borre los datos del navegador.</Mensaje>
          )}
          {r.advertencias.length > 0 && <Mensaje tipo="aviso" className="mt">{r.advertencias.join(' ')}</Mensaje>}
          {r.errores.length > 0 && <Mensaje tipo="error" className="mt"><strong>No se guardó:</strong><ul>{r.errores.map((e) => <li key={e}>{e}</li>)}</ul></Mensaje>}
        </div>
      </Modal>
    );
  }

  if (paso === 2) {
    return (
      <Modal titulo={nombre} className="modal-completo" onCerrar={onCerrar}
        pie={(
          <>
            <button className="btn btn-grande" onClick={() => setPaso(1)}><ChevronLeft size={20} />Atrás</button>
            <button className="btn btn-primario btn-grande" style={{ flex: 1 }} disabled={faltaMotivo || guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : <><Check size={20} />Guardar</>}
            </button>
          </>
        )}>
        {barra}
        <div className="paso-titulo">Paso 2 de {pasos}</div>
        {noAplicar.map((t) => (
          <div key={t.clave} style={{ marginBottom: '1.25rem' }}>
            <p className="paso-pregunta">¿Por qué no se puso {t.producto.nombre}?</p>
            <div className="opciones dos">
              {MOTIVOS.map((m) => (
                <button key={m.id} type="button" className={`opcion ${motivos[t.clave] === m.id ? 'marcada' : ''}`}
                  onClick={() => setMotivos({ ...motivos, [t.clave]: m.id })} aria-pressed={motivos[t.clave] === m.id}>
                  <span className="ic"><m.icono size={20} /></span>
                  <span>{m.texto}{m.ayuda && <small>{m.ayuda}</small>}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Modal>
    );
  }

  return (
    <Modal titulo={nombre} className="modal-completo" onCerrar={onCerrar}
      pie={(
        <>
          <button className="btn btn-grande" onClick={onCerrar}>Cancelar</button>
          <button className={`btn btn-grande ${aplicar.length ? 'btn-verde' : 'btn-primario'}`} style={{ flex: 1 }} disabled={!tarjetas.length || guardando} onClick={siguiente}>
            {guardando ? 'Guardando…' : noAplicar.length ? 'Siguiente' : <><Check size={20} />Guardar {aplicar.length === 1 ? '1 vacuna' : `${aplicar.length} vacunas`}</>}
          </button>
        </>
      )}>
      {barra}
      <div className="paso-titulo">Paso 1 de {pasos}</div>
      <p className="paso-pregunta">{sinVacunar ? '¿Se le puso alguna vacuna?' : '¿Qué vacunas le puso hoy?'}</p>
      <p className="suave" style={{ marginTop: '-.5rem', marginBottom: '1rem', fontSize: '.88rem' }}>
        {sinVacunar ? 'Toque las que sí se puso. Las demás quedan como no aplicadas.' : 'Están marcadas las que le tocan. Toque una para quitarla si no se la puso.'}
      </p>
      {!tarjetas.length ? (
        <Mensaje tipo="info">Hoy no le toca ninguna vacuna.</Mensaje>
      ) : (
        <div className="vacunas-marcar">
          {tarjetas.map((t) => {
            const marcada = !estaQuitada(t);
            const atrasada = t.dosis.some((d) => d.estado === 'atrasada');
            return (
              <div key={t.clave} className={`vacuna-marcar ${marcada ? 'marcada' : ''}`} onClick={() => alternar(t)} role="checkbox" aria-checked={marcada}
                tabIndex={0} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar(t); } }}>
                <span className="caja">{marcada && <Check size={20} strokeWidth={3} />}</span>
                <strong><Syringe size={16} style={{ verticalAlign: '-2px', color: 'var(--celeste-2)' }} /> {t.producto.nombre}</strong>
                <span className={`det ${atrasada ? 'rojo' : ''}`}>
                  {t.dosis.map((d) => d.etiqueta).join(' + ')}{atrasada && ` · atrasada ${Math.max(...t.dosis.map((d) => d.diasAtraso || 0))} días`}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="tenue" style={{ marginTop: '1rem' }}>
        <ClipboardList size={13} style={{ verticalAlign: '-2px' }} /> Fecha: {fecha(fechaAplicacion)}{jornadaId ? ' · en jornada' : ''}
      </p>
    </Modal>
  );
}
