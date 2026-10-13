// Tablero para la toma de decisiones (análisis del flujo operativo, sección 5).
// Cada vista responde una pregunta concreta y termina en una acción sugerida.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon, AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, Clock, Gauge, LayoutDashboard, ListChecks, MapPinned,
  Phone, Plus, Printer, ShieldCheck, Stethoscope, Target, TrendingUp, Truck, UserX, Users, XCircle,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../App.jsx';
import { useDialogos } from '../componentes/Dialogos.jsx';
import { useCatalogo } from '../componentes/useCatalogo.js';
import { Campo, Cargando, Encabezado, EncabezadoImpresion, Kpi, Mensaje, Modal, Pestanas, Tabla, Tarjeta, Vacio } from '../componentes/ui.jsx';
import { plural } from '../componentes/Estado.jsx';
import {
  GraficaBarras, GraficaCuadrantes, GraficaJornadas, GraficaMonitoreo, GraficaOportunidad, GraficaTendencia, SERIE,
} from '../componentes/Graficas.jsx';
import { MESES, fecha, hoy } from '../util.js';

// Tres preguntas y lo que se acordó hacer; los indicadores técnicos (homogeneidad, cuadrantes) van en la sala situacional impresa
const VISTAS = [
  ['resumen', <><Gauge size={15} />¿Cómo vamos?</>],
  ['territorio', <><MapPinned size={15} />¿Dónde?</>],
  ['porque', <><Stethoscope size={15} />¿Por qué?</>],
  ['acciones', <><ListChecks size={15} />Plan de acción</>],
];
const sumar = (f, d) => { const x = new Date(f + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const TONO_LECTURA = { ok: 't-ok', atencion: 't-atencion', critico: 't-critico', revisar: 't-neutro' };
const ICONO_LECTURA = { ok: CheckCircle2, atencion: AlertTriangle, critico: AlertOctagon, revisar: AlertTriangle };
const RANGO = {
  sin_meta: ['Sin meta', 't-neutro'], mayor_100: ['Revisar dato', 't-neutro'], '95_100': ['En meta', 't-ok'],
  '80_94': ['Cerca', 't-atencion'], '50_79': ['Bajo', 't-critico'], menor_50: ['Muy bajo', 't-critico'],
};
const rangoDe = (v) => (v == null ? 'sin_meta' : v > 100 ? 'mayor_100' : v >= 95 ? '95_100' : v >= 80 ? '80_94' : v >= 50 ? '50_79' : 'menor_50');
const PRIORIDAD = { 1: ['Prioridad 1', 't-critico'], 2: ['Prioridad 2', 't-atencion'], 3: ['Prioridad 3', 't-info'], 0: ['Aceptado', 't-ok'] };
const CAUSA = { personal: 'Del personal', servicio: 'Del servicio', familia: 'De la familia', otro: 'Otro' };
const MOTIVO = {
  falsa_contraindicacion: 'Gripe o calentura leve', contraindicacion: 'Contraindicación verdadera', desabastecimiento: 'No había vacuna',
  rechazo: 'La familia no quiso', posterga_personal: 'Se dejó para otro día', otro: 'Otro motivo',
};
const MEDIO = { llamada: 'Llamada', visita: 'Visita a la casa', lider_comunitario: 'Líder comunitario', jornada: 'Jornada', otro: 'Otro' };

// Varias alertas críticas seguidas se leen como una sola en un bloque: el rojo repetido pierde fuerza
function Lectura({ items }) {
  if (!items?.length) return null;
  const criticos = items.filter((l) => l.estado === 'critico');
  const otros = items.filter((l) => l.estado !== 'critico');
  return (
    <div className="lectura">
      {criticos.length > 1 ? (
        <div className="lectura-item t-critico">
          <AlertOctagon size={17} />
          <span><strong>Hace falta un plan de recuperación:</strong>
            <ul className="lectura-lista">{criticos.map((l) => <li key={l.texto}>{l.texto.replace(/: hace falta un plan de recuperación\./, '.')}</li>)}</ul>
          </span>
        </div>
      ) : criticos.map((l) => <div key={l.texto} className="lectura-item t-critico"><AlertOctagon size={17} /><span>{l.texto}</span></div>)}
      {otros.map((l) => {
        const Ic = ICONO_LECTURA[l.estado] || CheckCircle2;
        return <div key={l.texto} className={`lectura-item ${TONO_LECTURA[l.estado] || 't-info'}`}><Ic size={17} /><span>{l.texto}</span></div>;
      })}
    </div>
  );
}

/** Barra de avance con la marca de dónde deberíamos ir. */
function Barra({ rotulo, valor, meta }) {
  const v = Math.min(100, valor ?? 0);
  return (
    <div className="barra-simple">
      <div className="bs-cab"><span>{rotulo}</span><strong className={valor >= meta ? 'verde' : 'rojo'}>{valor != null ? `${valor} %` : '—'}</strong></div>
      <div className="bs-pista"><span className={`bs-lleno ${valor >= meta ? 'ok' : ''}`} style={{ width: `${v}%` }} />{meta != null && <i style={{ left: `${Math.min(100, meta)}%` }} title={`Deberíamos ir en ${meta} %`} />}</div>
    </div>
  );
}

const CeldaCobertura = ({ valor, num, den }) => {
  const [t, tono] = RANGO[rangoDe(valor)];
  return <span className={`celda-rango ${tono}`} title={t}>{valor != null ? `${valor} %` : t}{den != null && <small>{num}/{Math.round(den)}</small>}</span>;
};

export default function Tablero() {
  const { usuario } = useSesion();
  const [params, setParams] = useSearchParams();
  const anterior = { seguimiento: 'porque', servicio: 'porque', jornadas: 'territorio', calidad: 'resumen' };
  const vista = anterior[params.get('vista')] || params.get('vista') || 'resumen';
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(Number(params.get('anio')) || anioActual);
  const [periodo, setPeriodo] = useState('anio');
  const [rango, setRango] = useState({ desde: `${anioActual}-01-01`, hasta: hoy() });
  const [comunidad, setComunidad] = useState(params.get('comunidad') || '');
  const comunidades = useCatalogo('comunidades');

  const filtro = useMemo(() => {
    const finAnio = [`${anio}-12-31`, hoy()].sort()[0];
    if (periodo === 'mes') return { desde: [`${anio}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, `${anio}-12-01`].sort()[0], hasta: finAnio };
    if (periodo === 'trimestre') return { desde: [sumar(finAnio, -90), `${anio}-01-01`].sort()[1], hasta: finAnio };
    if (periodo === 'rango') return rango;
    return { desde: `${anio}-01-01`, hasta: finAnio };
  }, [anio, periodo, rango]);
  const consulta = qs({ anio, desde: filtro.desde, hasta: filtro.hasta, comunidad });
  const cambiarVista = (v) => { const p = new URLSearchParams(params); p.set('vista', v); setParams(p, { replace: true }); };

  if (vista === 'sala') return <HojaSala anio={anio} volver={() => cambiarVista('resumen')} />;

  return (
    <>
      <Encabezado titulo="Tablero de vacunación">
        <button className="btn" onClick={() => cambiarVista('sala')}><Printer size={17} />Sala situacional</button>
      </Encabezado>
      <div className="tablero-filtros no-imprimir">
        <Campo etiqueta="Año">
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[anioActual, anioActual - 1, anioActual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Período">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="anio">En lo que va del año</option>
            <option value="trimestre">Últimos 3 meses</option>
            <option value="mes">Este mes</option>
            <option value="rango">Elegir fechas…</option>
          </select>
        </Campo>
        {periodo === 'rango' && (
          <>
            <Campo etiqueta="Desde"><input type="date" value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></Campo>
            <Campo etiqueta="Hasta"><input type="date" value={rango.hasta} min={rango.desde} max={hoy()} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></Campo>
          </>
        )}
        <Campo etiqueta="Comunidad">
          <select value={comunidad} onChange={(e) => setComunidad(e.target.value)}>
            <option value="">Todo el municipio</option>
            {comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      </div>
      <Pestanas valor={vista} onCambio={cambiarVista} opciones={VISTAS} />

      {vista === 'resumen' && <Resumen consulta={consulta} anio={anio} comunidad={comunidad} elegirComunidad={setComunidad} />}
      {vista === 'territorio' && <><Territorio consulta={consulta} rol={usuario.rol} elegirComunidad={setComunidad} /><Jornadas anio={anio} /></>}
      {vista === 'porque' && <><Servicio consulta={consulta} /><Seguimiento consulta={consulta} /></>}
      {vista === 'acciones' && <Acciones rol={usuario.rol} />}
    </>
  );
}

function useDatos(ruta) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => { setDatos(null); setError(''); api(ruta).then(setDatos).catch((e) => setError(e.message)); }, [ruta]);
  useEffect(cargar, [cargar]);
  return [datos, error, cargar];
}

/* ---------------- Resumen ---------------- */
function Resumen({ consulta, anio, comunidad, elegirComunidad }) {
  const [r, error] = useDatos('/tablero/resumen' + consulta);
  const [mon] = useDatos('/tablero/monitoreo' + qs({ anio, comunidad }));
  const [tend] = useDatos('/tablero/tendencia' + qs({ anio, comunidad, codigos: 'N1,N3_abandono,N3_atrasado' }));
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!r) return <Cargando filas={6} />;
  const k = r.kpis, ideal = r.ideal_al_mes;
  const filasTend = tend ? Object.values(tend.reduce((m, t) => { m[t.mes] = m[t.mes] || { mes: t.mes }; m[t.mes][t.codigo] = t.valor; return m; }, {})) : [];
  const delta = (v, ant) => (ant == null || v == null ? null : Math.round((v - ant) * 10) / 10);

  return (
    <>
      <div className="kpis tres">
        <Kpi valor={k.C2.valor != null ? `${k.C2.valor} %` : '—'} rotulo="Niños con sus 3 dosis" icono={Target} color={k.C2.valor >= ideal ? 'verde' : 'rojo'} resaltar
          pie={r.faltan_p3_para_meta ? `Faltan ${r.faltan_p3_para_meta} niños para el 95 %` : `Deberíamos ir en ${ideal ?? '—'} %`} />
        <Kpi valor={k.N1.valor} rotulo="Dosis cero" icono={AlertOctagon} color="rojo" to="/alertas?tipo=dosis_cero"
          pie={k.N1.anterior != null ? `${delta(k.N1.valor, k.N1.anterior) > 0 ? '▲' : delta(k.N1.valor, k.N1.anterior) < 0 ? '▼' : '='} ${Math.abs(delta(k.N1.valor, k.N1.anterior))} contra el mes pasado` : 'Ver quiénes'} />
        <Kpi valor={k.D1.valor != null ? `${k.D1.valor} %` : '—'} rotulo="Empiezan y no terminan" icono={UserX} to="/alertas?tipo=abandono"
          color={k.D1.valor > r.umbrales.umbral_desercion ? 'rojo' : 'verde'} pie={`Lo aceptado es hasta ${r.umbrales.umbral_desercion} %`} />
      </div>

      <Tarjeta titulo="¿Llegaremos al 95 % este año?" icono={TrendingUp}>
        {mon ? <GraficaMonitoreo datos={mon} /> : <Cargando />}
      </Tarjeta>

      <div className="dos-col">
        <Tarjeta titulo="Primera dosis y sarampión" icono={Users}>
          <div className="barras-simples">
            <Barra rotulo="Primera dosis Penta/Hexa (llegan)" valor={k.C1.valor} meta={ideal} />
            <Barra rotulo="SPR 1 (sarampión)" valor={k.C3.valor} meta={ideal} />
            <Barra rotulo="Al día con sus vacunas" valor={k.N2.valor} meta={95} />
          </div>
        </Tarjeta>
        <Tarjeta titulo="¿Hay menos niños atrasados que antes?" icono={TrendingUp}>
          {filasTend.length ? (
            <GraficaTendencia filas={filasTend} series={[['N1', 'Dosis cero'], ['N3_abandono', 'Abandono'], ['N3_atrasado', 'Atrasados']]} />
          ) : <Vacio icono={TrendingUp} titulo="Se verá a partir del próximo mes" />}
        </Tarjeta>
      </div>
    </>
  );
}

/* ---------------- Territorio ---------------- */
function Territorio({ consulta, rol, elegirComunidad }) {
  const [r, error] = useDatos('/tablero/territorio' + consulta);
  const [faltan] = useDatos('/tablero/resumen' + consulta);
  const [nueva, setNueva] = useState(null);
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!r) return <Cargando filas={6} />;
  return (
    <>
      <Tarjeta titulo="¿A dónde ir primero?" icono={Target} cuerpo={false}>
        {r.prioritarias.length === 0 ? <Vacio icono={CheckCircle2} titulo="Todas las comunidades con meta están en el rango aceptado" /> : (
          <Tabla>
            <thead><tr><th>Comunidad</th><th>Qué pasa</th><th className="celda-num">Sin 3.ª dosis</th><th>Qué hacer</th><th /></tr></thead>
            <tbody>
              {r.prioritarias.map((c) => (
                <tr key={c.id} className={`riel ${PRIORIDAD[c.prioridad][1]}`}>
                  <td><span className="nombre-link">{c.nombre}</span><span className="sub">{plural(c.activos, 'niño activo', 'niños activos')}</span></td>
                  <td><strong>{c.estrategia?.titulo}</strong><span className="sub">Llegan {c.C1 ?? '—'} % · no terminan {c.D1 ?? '—'} %</span></td>
                  <td className="celda-num fuerte">{c.sin_vacunar ?? '—'}</td>
                  <td style={{ maxWidth: 260 }}>{c.estrategia?.accion}</td>
                  <td className="celda-fin">
                    <span className="botones-fila">
                      {[3, 4].includes(c.categoria) && rol === 'enfermera' && <Link className="btn btn-sm btn-primario" to={`/jornadas/nueva?comunidad=${c.id}`}><Truck size={14} />Jornada</Link>}
                      {[2, 4].includes(c.categoria) && <Link className="btn btn-sm" to={`/alertas?comunidad=${c.id}`}><Phone size={14} />Casos</Link>}
                      {rol === 'enfermera' && <button className="btn btn-sm btn-fantasma" onClick={() => setNueva({ comunidad_id: c.id, indicador_codigo: 'C2', valor_inicial: c.C2,
                        problema: `${c.nombre}: ${c.estrategia?.titulo.toLowerCase()}`, accion: c.estrategia?.accion || '' })}><Plus size={14} />Acción</button>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta titulo="¿Dónde faltan más niños con sus 3 dosis?" icono={Users}>
        {faltan?.sin_vacunar?.length ? (
          <GraficaBarras datos={faltan.sin_vacunar.slice(0, 10)} campo="sin_vacunar" etiqueta="Niños sin 3.ª dosis" onClic={(d) => elegirComunidad(String(d.id))} />
        ) : <Vacio icono={CheckCircle2} titulo="Ninguna comunidad debajo de la meta" />}
      </Tarjeta>
      {nueva && <FormAccion inicial={nueva} onCerrar={() => setNueva(null)} onGuardada={() => setNueva(null)} />}
    </>
  );
}

/* ---------------- Seguimiento ---------------- */
function Seguimiento({ consulta }) {
  const [r, error] = useDatos('/tablero/seguimiento' + consulta);
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!r) return <Cargando filas={6} />;
  const max = Math.max(1, ...r.embudo.map((e) => e.valor));
  const mejor = r.S5[0];
  return (
    <>
      <div className="seccion-titulo">En el seguimiento de los atrasados</div>
      <div className="kpis">
        <Kpi valor={r.S2.valor != null ? `${r.S2.valor} %` : '—'} rotulo="Contactados en la primera semana" icono={Phone} color={r.S2.valor >= 80 ? 'verde' : 'ambar'} pie={`${r.S2.numerador} de ${r.S2.denominador} casos · meta 80 %`} />
        <Kpi valor={r.S3.valor != null ? `${r.S3.valor} %` : '—'} rotulo="Vacunados en menos de 30 días" icono={CheckCircle2} color={r.S3.valor >= 60 ? 'verde' : 'ambar'} pie={`${r.S3.numerador} de ${r.S3.denominador} · meta 60 %`} />
        <Kpi valor={r.S4.valor != null ? `${r.S4.valor} días` : '—'} rotulo="Tiempo hasta vacunar (mediana)" icono={Clock} color="azul" pie={`${r.S4.n} vacunas atrasadas que se pusieron`} />
        <Kpi valor={r.S6.valor != null ? `${r.S6.valor} %` : '—'} rotulo="Citas acordadas que se cumplieron" icono={CalendarClock} color={r.S6.valor >= 70 ? 'verde' : 'ambar'} pie={`${r.S6.numerador} de ${r.S6.denominador}`} />
      </div>
      <div className="dos-col">
        <Tarjeta titulo="¿El seguimiento funciona?" icono={TrendingUp}>
          <div className="embudo">
            {r.embudo.map((e) => (
              <div key={e.paso} className="embudo-fila">
                <span>{e.paso}</span>
                <span className="pista"><span className="lleno" style={{ width: `${(e.valor / max) * 100}%` }} /></span>
                <b>{e.valor}</b>
              </div>
            ))}
          </div>
          {r.S7 > 0 && <div className="lectura-item t-atencion" style={{ marginTop: '1rem' }}><UserX size={17} /><span>{plural(r.S7, 'familia rechazó', 'familias rechazaron')} la vacuna: requieren consejería.</span></div>}
        </Tarjeta>
        <Tarjeta titulo="¿Qué medio de contacto sirve más?" icono={Phone}>
          {r.S5.length ? (
            <>
              <GraficaBarras datos={r.S5.map((m) => ({ nombre: MEDIO[m.medio] || m.medio, valor: m.valor ?? 0, extra: `${m.resueltos} de ${m.contactados} casos` }))} campo="valor" etiqueta="Vacunados" unidad=" %"
                colorPor={(d) => (d.nombre === (MEDIO[mejor.medio] || mejor.medio) ? SERIE[0] : '#b7d3f6')} />
              <div className="lectura-item t-info" style={{ marginTop: '.6rem' }}><CheckCircle2 size={17} />
                <span>{MEDIO[mejor.medio]} es lo que más resultado da ({mejor.valor} %). Úsela primero con los casos más difíciles.</span></div>
            </>
          ) : <Vacio icono={Phone} titulo="Sin contactos registrados en el período" />}
        </Tarjeta>
      </div>
      <Tarjeta titulo="Carga por persona" icono={Users} sub={`${plural(r.sin_asignar, 'caso sin asignar', 'casos sin asignar')}`} cuerpo={false}
        acciones={r.sin_asignar > 0 && <Link className="btn btn-sm btn-primario" to="/alertas">Asignar casos</Link>}>
        {r.carga.length ? (
          <Tabla>
            <thead><tr><th>Persona</th><th className="celda-num">Casos asignados</th><th className="celda-num">Contactados esta semana</th></tr></thead>
            <tbody>{r.carga.map((c) => <tr key={c.id}><td className="fuerte">{c.nombre}</td><td className="celda-num">{c.asignados}</td><td className="celda-num">{c.contactados_semana}</td></tr>)}</tbody>
          </Tabla>
        ) : <Vacio icono={Users} titulo="Todavía no hay casos asignados" accion={<Link className="btn btn-sm" to="/alertas">Asignar casos</Link>} />}
      </Tarjeta>
    </>
  );
}

/* ---------------- Servicio ---------------- */
function Servicio({ consulta }) {
  const [r, error] = useDatos('/tablero/servicio' + consulta);
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!r) return <Cargando filas={6} />;
  const colorCausa = { personal: SERIE[0], servicio: SERIE[1], familia: SERIE[2], valida: '#c4cad6', otro: '#8a93a8' };
  return (
    <>
      <div className="seccion-titulo">En el servicio</div>
      <div className="kpis">
        <Kpi valor={r.N6.valor != null ? `${r.N6.valor} %` : '—'} rotulo="Se fueron sin una vacuna que les tocaba" icono={XCircle} color={r.N6.valor > 10 ? 'rojo' : 'verde'}
          pie={`${r.N6.numerador} de ${r.N6.denominador} visitas · aceptado hasta 10 %`} />
        <Kpi valor={r.N5.valor != null ? `${r.N5.valor} %` : '—'} rotulo="Vacunas puestas a tiempo" icono={Clock} color={r.N5.valor >= 80 ? 'verde' : 'ambar'}
          pie={`${r.N5.numerador} de ${r.N5.denominador} · meta 80 %`} />
      </div>
      <div className="dos-col">
        <Tarjeta titulo="¿Por qué no se vacunó cuando le tocaba?" icono={Stethoscope}>
          {r.motivos.length ? (
            <>
              <div className="leyenda-grafica">{['personal', 'servicio', 'familia'].map((c) => <span key={c}><i className="punto" style={{ background: colorCausa[c] }} />{CAUSA[c]}</span>)}</div>
              <GraficaBarras datos={r.motivos.map((m) => ({ nombre: MOTIVO[m.motivo], total: m.total, causa: m.causa, extra: CAUSA[m.causa] || 'No es oportunidad perdida' }))}
                campo="total" etiqueta="Veces" colorPor={(d) => colorCausa[d.causa]} />
              {r.accion && <div className="lectura-item t-atencion" style={{ marginTop: '.6rem' }}><AlertTriangle size={17} />
                <span>La causa más frecuente es <strong>{CAUSA[r.accion.causa].toLowerCase()}</strong>: {r.accion.texto.toLowerCase()}.</span></div>}
            </>
          ) : <Vacio icono={CheckCircle2} titulo="Nadie se fue sin vacunar" />}
        </Tarjeta>
        <Tarjeta titulo="¿Se vacuna a tiempo?" icono={Clock}>
          {r.porVacuna.length ? <GraficaOportunidad filas={r.porVacuna} /> : <Vacio icono={Clock} titulo="Sin vacunas en el período" />}
        </Tarjeta>
      </div>
    </>
  );
}

/* ---------------- Jornadas ---------------- */
function Jornadas({ anio }) {
  const [r, error] = useDatos('/tablero/jornadas' + qs({ anio }));
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!r) return <Cargando filas={6} />;
  if (!r.jornadas.length) return null;
  return (
    <>
      <div className="seccion-titulo">Jornadas de {anio}</div>
      <Tarjeta titulo="¿Llegan los niños que convocamos?" icono={Truck}>
        <GraficaJornadas jornadas={r.jornadas} />
      </Tarjeta>
      <Tarjeta titulo="Resultados por jornada" icono={ClipboardList} cuerpo={false}>
        <Tabla>
          <thead><tr><th>Fecha</th><th>Comunidades</th><th className="celda-num">Asistencia</th><th className="celda-num">Niños nuevos captados</th><th className="celda-num">Uso de vacunas</th><th className="celda-num">Inasistencias</th></tr></thead>
          <tbody>
            {r.jornadas.map((j) => (
              <tr key={j.id}>
                <td><Link className="nombre-link" to={`/jornadas/${j.id}`}>{fecha(j.fecha)}</Link></td>
                <td>{j.comunidades}</td>
                <td className="celda-num">{j.J1 != null ? `${j.J1} %` : '—'}<span className="sub">{j.vacunados_lista} de {j.convocados}</span></td>
                <td className="celda-num">{j.captados}</td>
                <td className="celda-num">{j.J3 != null ? `${j.J3} %` : '—'}<span className="sub">{j.aplicadas} de {j.llevadas} llevadas</span></td>
                <td className="celda-num">{j.inasistencias}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>
      {r.motivos_inasistencia.length > 0 && (
        <Tarjeta titulo="¿Por qué no llegaron?" icono={UserX}>
          <GraficaBarras datos={r.motivos_inasistencia.map((m) => ({ nombre: m.motivo, total: m.total }))} campo="total" etiqueta="Niños" />
        </Tarjeta>
      )}
    </>
  );
}

/* ---------------- Calidad ---------------- */
export function Calidad({ consulta }) {
  const [r, error] = useDatos('/tablero/calidad' + consulta);
  const [abierto, setAbierto] = useState(null);
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!r) return <Cargando filas={6} />;
  const pendientes = r.filter((c) => !c.ok && c.grave).length;
  return (
    <>
      <Mensaje tipo={pendientes ? 'aviso' : 'exito'}>
        {pendientes ? `Hay ${plural(pendientes, 'punto', 'puntos')} por revisar antes de enviar el informe del mes.` : 'Los datos están listos para el informe del mes.'}
      </Mensaje>
      <div className="lista-tarjetas">
        {r.map((c) => (
          <section key={c.codigo} className="tarjeta" style={{ marginBottom: 0 }}>
            <button type="button" className="tarjeta-cab" style={{ width: '100%', background: 'none', border: 'none', cursor: c.cantidad ? 'pointer' : 'default', textAlign: 'left', font: 'inherit' }}
              onClick={() => c.cantidad && setAbierto(abierto === c.codigo ? null : c.codigo)}>
              <div style={{ display: 'flex', gap: '.85rem', alignItems: 'flex-start' }}>
                <span className={`estado grande ${c.ok ? 't-ok' : c.grave ? 't-atencion' : 't-neutro'}`} style={{ padding: '.3rem' }}>
                  <span className="ic">{c.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
                </span>
                <div><h2 style={{ fontSize: '.98rem' }}>{c.titulo}</h2><div className="sub">{c.ayuda}</div></div>
              </div>
              <strong style={{ fontSize: '1.3rem', color: c.ok ? 'var(--verde)' : 'var(--marino)' }}>{c.ok ? '✓' : c.cantidad}</strong>
            </button>
            {abierto === c.codigo && (
              <ul className="lista-items">
                {c.filas.slice(0, 15).map((f, i) => (
                  <li key={i}>
                    <div className="crece">
                      {f.nino_id ? <Link className="nombre-link" to={`/ninos/${f.nino_id}`}>{f.nombre_completo}</Link> : <strong>{f.nombre}</strong>}
                      <div className="tenue">
                        {f.dias != null && `Aplicada el ${fecha(f.fecha_aplicacion)}, registrada ${f.dias} días después`}
                        {f.sin_cui != null && [f.sin_cui && 'sin CUI', f.sin_telefono && 'sin teléfono', f.sin_cuaderno && 'sin cuaderno'].filter(Boolean).join(' · ')}
                        {f.otro_nombre && `Parecido a ${f.otro_nombre} · nació el ${fecha(f.fecha_nacimiento)}`}
                        {f.D1 != null && `Deserción ${f.D1} %`}
                        {f.C2 != null && `Cobertura ${f.C2} %`}
                        {f.motivo_anulacion && `Anulada: ${f.motivo_anulacion}`}
                      </div>
                    </div>
                    {f.otro_id && <Link className="btn btn-sm" to={`/ninos/${f.otro_id}`}>Ver el otro</Link>}
                  </li>
                ))}
                {c.filas.length > 15 && <li className="tenue">Y {c.filas.length - 15} más…</li>}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

/* ---------------- Plan de acción ---------------- */
const ESTADO_ACCION = { pendiente: 'Por hacer', en_curso: 'En curso', cumplida: 'Cumplida' };

function Acciones({ rol }) {
  const [lista, setLista] = useState(null);
  const [nueva, setNueva] = useState(null);
  const { pedirTexto, avisar } = useDialogos();
  const cargar = useCallback(() => { api('/acciones').then(setLista).catch(() => setLista([])); }, []);
  useEffect(cargar, [cargar]);
  const puedeEditar = rol === 'enfermera';

  async function mover(a, estado) {
    let extra = {};
    if (estado === 'cumplida') {
      const resultado = await pedirTexto({ titulo: 'Marcar como cumplida', etiqueta: '¿Qué resultado se logró?', opcional: true, aceptar: 'Marcar cumplida',
        placeholder: 'Ej. la deserción bajó de 28 % a 14 %' });
      if (resultado === null) return;
      extra = { resultado };
    }
    await api(`/acciones/${a.id}`, { method: 'PUT', body: { estado, ...extra } }).then(() => { avisar('Acción actualizada.'); cargar(); }).catch((e) => avisar(e.message, 'error'));
  }

  if (!lista) return <Cargando />;
  const columnas = ['pendiente', 'en_curso', 'cumplida'];
  return (
    <>
      <div className="pagina-cab" style={{ marginBottom: '1rem', alignItems: 'center' }}>
        {puedeEditar && <button className="btn btn-primario" onClick={() => setNueva({})}><Plus size={17} />Nueva acción</button>}
      </div>
      <div className="acciones-columnas">
        {columnas.map((col) => (
          <div key={col}>
            <div className="col-titulo"><span>{ESTADO_ACCION[col]}</span><span className="chip">{lista.filter((a) => a.estado === col).length}</span></div>
            {lista.filter((a) => a.estado === col).map((a) => (
              <div key={a.id} className={`accion-tarjeta ${a.vencida ? 't-critico' : ''}`} style={a.vencida ? { borderColor: 'var(--rojo-borde)' } : undefined}>
                <span className="problema">{a.problema}</span>
                <span>{a.accion}</span>
                <span className="meta-accion">
                  {a.responsable && <span><Users size={13} style={{ verticalAlign: '-2px' }} /> {a.responsable}</span>}
                  {a.fecha_limite && <span style={a.vencida ? { color: 'var(--rojo)' } : undefined}><CalendarClock size={13} style={{ verticalAlign: '-2px' }} /> {a.vencida ? 'Venció el' : 'Para el'} {fecha(a.fecha_limite)}</span>}
                  {a.comunidad && <span><MapPinned size={13} style={{ verticalAlign: '-2px' }} /> {a.comunidad}</span>}
                </span>
                {(a.valor_inicial != null || a.resultado) && (
                  <span className="lectura-item t-ok" style={{ fontSize: '.8rem' }}><TrendingUp size={15} />
                    <span>{a.valor_inicial != null && `Antes: ${Number(a.valor_inicial)} %`}{a.valor_final != null && ` → después: ${Number(a.valor_final)} %`}{a.resultado && ` · ${a.resultado}`}</span></span>
                )}
                {puedeEditar && col !== 'cumplida' && (
                  <div className="botones-fila" style={{ justifyContent: 'flex-start' }}>
                    {col === 'pendiente' && <button className="btn btn-sm" onClick={() => mover(a, 'en_curso')}>Empezar</button>}
                    <button className="btn btn-sm btn-verde" onClick={() => mover(a, 'cumplida')}><CheckCircle2 size={14} />Cumplida</button>
                  </div>
                )}
              </div>
            ))}
            {!lista.some((a) => a.estado === col) && <p className="tenue">Nada aquí.</p>}
          </div>
        ))}
      </div>
      {nueva && <FormAccion inicial={nueva} onCerrar={() => setNueva(null)} onGuardada={() => { setNueva(null); cargar(); }} />}
    </>
  );
}

function FormAccion({ inicial, onCerrar, onGuardada }) {
  const comunidades = useCatalogo('comunidades');
  const { avisar } = useDialogos();
  const [personal, setPersonal] = useState([]);
  const [f, setF] = useState({ problema: '', accion: '', comunidad_id: '', responsable_id: '', fecha_limite: sumar(hoy(), 30), ...inicial });
  const [error, setError] = useState('');
  useEffect(() => { api('/casos/personal').then(setPersonal).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function guardar(e) {
    e.preventDefault();
    try {
      await api('/acciones', { method: 'POST', body: { ...f, comunidad_id: f.comunidad_id || null, responsable_id: f.responsable_id || null } });
      avisar('Acción agregada al plan.');
      onGuardada();
    } catch (err) { setError(err.message); }
  }
  return (
    <Modal titulo="Nueva acción del plan" onCerrar={onCerrar} onSubmit={guardar}
      pie={<><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button className="btn btn-primario"><Plus size={17} />Agregar</button></>}>
      <div className="rejilla">
        <Campo etiqueta="¿Cuál es el problema?" requerido className="ancho"><input required value={f.problema} onChange={set('problema')} placeholder="Ej. En Chiquirín los niños no regresan a la 3.ª dosis" /></Campo>
        <Campo etiqueta="¿Qué se va a hacer?" requerido className="ancho"><textarea required rows={2} value={f.accion} onChange={set('accion')} /></Campo>
        <Campo etiqueta="Comunidad">
          <select value={f.comunidad_id || ''} onChange={set('comunidad_id')}><option value="">Todo el municipio</option>{comunidades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </Campo>
        <Campo etiqueta="Responsable">
          <select value={f.responsable_id || ''} onChange={set('responsable_id')}><option value="">—</option>{personal.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        </Campo>
        <Campo etiqueta="Para cuándo"><input type="date" value={f.fecha_limite || ''} onChange={set('fecha_limite')} /></Campo>
      </div>
      {error && <Mensaje tipo="error" className="mt">{error}</Mensaje>}
    </Modal>
  );
}

/* ---------------- Informe de sala situacional (una página imprimible) ---------------- */
function HojaSala({ anio, volver }) {
  const mes = anio === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
  const [r, error] = useDatos('/informes/sala-situacional' + qs({ anio, mes }));
  const { avisar, confirmar } = useDialogos();
  // Constancia de que el informe de este mes ya se entregó (no envía nada por internet)
  const [enviado, setEnviado] = useState(undefined);
  const cargarEnviado = useCallback(() => {
    api('/informes/enviados' + qs({ anio })).then((l) => setEnviado(l.find((x) => x.tipo === 'sala_situacional' && x.mes === mes) || null)).catch(() => setEnviado(null));
  }, [anio, mes]);
  useEffect(cargarEnviado, [cargarEnviado]);
  if (error) return <Mensaje tipo="error">{error}</Mensaje>;
  if (!r) return <Cargando filas={8} />;
  const t = r.total, e = r.encabezado;
  const marcarEnviado = async () => {
    if (!(await confirmar({ titulo: 'Marcar como enviado', mensaje: `Se registrará que el informe de ${MESES[mes - 1]} ${anio} ya se entregó al distrito o al área de salud.`, aceptar: 'Marcar como enviado' }))) return;
    api('/informes/enviado', { method: 'POST', body: { tipo: 'sala_situacional', anio, mes, datos: { C1: t.C1, C2: t.C2, D1: t.D1 } } })
      .then(() => { avisar('Quedó registrado como enviado.'); cargarEnviado(); }).catch((x) => avisar(x.message, 'error'));
  };
  return (
    <>
      <div className="pagina-cab no-imprimir">
        <div><div className="miga"><button className="btn btn-sm btn-fantasma" onClick={volver}>‹ Volver al tablero</button></div><h1>Informe de sala situacional</h1></div>
        <div className="acciones">
          {enviado ? <span className="lectura-item t-ok"><CheckCircle2 size={17} /><span>Enviado el {fecha(String(enviado.fecha).slice(0, 10))} por {enviado.usuario}</span></span>
            : enviado === null && <button className="btn" onClick={marcarEnviado}><CheckCircle2 size={17} />Marcar como enviado</button>}
          <button className="btn btn-primario" onClick={() => window.print()}><Printer size={17} />Imprimir o guardar PDF</button>
        </div>
      </div>
      <EncabezadoImpresion titulo="Sala situacional de vacunación" detalle={`${MESES[e.mes - 1]} ${e.anio} · datos al ${fecha(e.hasta)}`} />
      <div className="hoja-sala">
        <p className="suave no-imprimir" style={{ marginBottom: '.75rem' }}>Área de salud {e.area_salud} · Distrito {e.distrito} · {MESES[e.mes - 1]} {e.anio} · datos al {fecha(e.hasta)}</p>
        <div className="kpis-hoja">
          <div><strong>{t.C1 ?? '—'} %</strong><span>Penta/Hexa 1 (acceso)</span></div>
          <div><strong>{t.C2 ?? '—'} %</strong><span>Penta/Hexa 3 · ideal {r.monitoreo.meses[r.monitoreo.mes_actual - 1]?.ideal ?? '—'} %</span></div>
          <div><strong>{t.C3 ?? '—'} %</strong><span>SPR 1</span></div>
          <div><strong>{t.D1 ?? '—'} %</strong><span>Deserción</span></div>
          <div><strong>{t.dosis_cero}</strong><span>Niños en dosis cero</span></div>
          <div><strong>{t.N2 ?? '—'} %</strong><span>Niños al día</span></div>
          <div><strong>{r.seguimiento.S2.valor ?? '—'} %</strong><span>Casos contactados en 7 días</span></div>
          <div><strong>{r.seguimiento.S4.valor ?? '—'} días</strong><span>Hasta vacunar (mediana)</span></div>
        </div>
        <h2>Monitoreo mensual</h2>
        <GraficaMonitoreo datos={r.monitoreo} />
        <Lectura items={r.monitoreo.lecturas} />
        <h2>Comunidades prioritarias</h2>
        <div className="tabla-caja"><table>
          <thead><tr><th>Comunidad</th><th>Prioridad</th><th>Problema</th><th className="celda-num">Sin 3.ª dosis</th><th>Acción sugerida</th></tr></thead>
          <tbody>{r.prioritarias.map((c) => (
            <tr key={c.id}><td className="fuerte">{c.nombre}</td><td>{PRIORIDAD[c.prioridad][0]}</td><td>{c.estrategia?.titulo}</td><td className="celda-num">{c.sin_vacunar ?? '—'}</td><td>{c.estrategia?.accion}</td></tr>
          ))}</tbody>
        </table></div>
        <h2>Acciones acordadas</h2>
        {r.acciones.length ? (
          <div className="tabla-caja"><table>
            <thead><tr><th>Problema</th><th>Acción</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th></tr></thead>
            <tbody>{r.acciones.map((a) => (
              <tr key={a.id}><td>{a.problema}</td><td>{a.accion}</td><td>{a.responsable || '—'}</td><td>{fecha(a.fecha_limite)}</td><td>{ESTADO_ACCION[a.estado] || a.estado}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="tenue">Sin acciones registradas.</p>}
        <p className="tenue" style={{ marginTop: '1rem' }}>Elaborado por {e.responsable}. Fuentes: registro nominal del centro de salud; fórmulas del Módulo 2 SIINSAN-OPS y estrategia RED de la OMS.</p>
      </div>
    </>
  );
}
