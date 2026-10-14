// Gráficas del tablero (Recharts). Reglas: un solo eje por gráfica; colores categóricos fijos y validados para
// daltonismo; los colores de estado solo para estados; leyenda visible y tabla de datos en cada gráfica.
import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { Table2 } from 'lucide-react';

// Paleta categórica (validada: CVD ΔE ≥ 8 entre vecinos) y tono de magnitud
export const SERIE = ['#2a78d6', '#eb6834', '#1baf7a'];
export const MAGNITUD = '#2a78d6';
export const MAGNITUD_CLARO = '#b7d3f6';
const REFERENCIA = '#8a93a8';
const EJE = { fontSize: 12, fill: '#5b6680' };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Contenedor de gráfica con botón "Ver tabla". */
export function ConTabla({ tabla, children, alta, baja, libre }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-.25rem' }} className="no-imprimir">
        <button type="button" className="btn btn-sm btn-fantasma" onClick={() => setVerTabla(!verTabla)}>
          <Table2 size={15} />{verTabla ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </div>
      {verTabla ? tabla : <div className={`grafica ${alta ? 'alta' : ''} ${baja ? 'baja' : ''} ${libre ? 'libre' : ''}`}>{children}</div>}
    </>
  );
}

function Leyenda({ items }) {
  return (
    <div className="leyenda-grafica">
      {items.map(([texto, color, tipo]) => (
        <span key={texto}><i className={tipo || ''} style={{ background: color }} />{texto}</span>
      ))}
    </div>
  );
}

const Globo = ({ titulo, filas }) => (
  <div className="tooltip-grafica">
    <strong>{titulo}</strong>
    {filas.filter(Boolean).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
  </div>
);
const pct = (v) => (v == null ? '—' : `${v} %`);

/** Monitoreo mensual: cobertura acumulada contra la línea ideal (8,3 % por mes) y la meta del 95 %. */
export function GraficaMonitoreo({ datos }) {
  const filas = datos.meses.map((m) => ({ ...m, nombre: MESES[m.mes - 1] }));
  const series = [['p1', 'Penta/Hexa 1'], ['p3', 'Penta/Hexa 3'], ['spr1', 'SPR 1']];
  // Último mes con datos: ahí termina cada línea con su valor; los meses que faltan van sombreados
  const ultimo = filas.reduce((u, f, i) => (series.some(([k]) => f[k] != null) ? i : u), -1);
  const etiquetaFinal = (k, color) => ({ index, x, y, value }) => (index === ultimo && value != null ? (
    <text x={x + 8} y={y + 4} fill={color} fontSize={12} fontWeight={700}>{value} %</text>
  ) : null);
  const tabla = (
    <div className="tabla-caja"><table>
      <thead><tr><th>Mes</th><th className="celda-num">Ideal</th>{series.map(([, t]) => <th key={t} className="celda-num">{t}</th>)}</tr></thead>
      <tbody>{filas.map((f) => (
        <tr key={f.mes}><td>{f.nombre}</td><td className="celda-num">{f.ideal} %</td>
          <td className="celda-num">{pct(f.p1)}</td><td className="celda-num">{pct(f.p3)}</td><td className="celda-num">{pct(f.spr1)}</td></tr>
      ))}</tbody>
    </table></div>
  );
  return (
    <>
      <Leyenda items={[...series.map(([, t], i) => [t, SERIE[i]]), ['Ritmo ideal', REFERENCIA, 'discontinua']]} />
      <ConTabla tabla={tabla} alta>
        <ResponsiveContainer>
          <LineChart data={filas} margin={{ top: 10, right: 44, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#eef1f6" vertical={false} />
            <XAxis dataKey="nombre" tick={EJE} axisLine={false} tickLine={false} />
            <YAxis tick={EJE} axisLine={false} tickLine={false} domain={[0, (max) => Math.max(100, Math.ceil(max / 10) * 10)]} unit="%" />
            {ultimo >= 0 && ultimo < filas.length - 1 && (
              <ReferenceArea x1={filas[ultimo + 1].nombre} x2={filas[filas.length - 1].nombre} fill="#f3f6fa" fillOpacity={1}
                label={{ value: 'Meses por venir', position: 'insideTop', fill: '#8a93a8', fontSize: 11 }} />
            )}
            <ReferenceLine y={95} stroke="#157a4a" strokeDasharray="2 4" label={{ value: 'Meta 95 %', position: 'insideTopLeft', fill: '#157a4a', fontSize: 11 }} />
            <Line dataKey="ideal" stroke={REFERENCIA} strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
            {series.map(([k], i) => (
              <Line key={k} dataKey={k} stroke={SERIE[i]} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: SERIE[i] }} activeDot={{ r: 6 }} connectNulls={false}
                label={etiquetaFinal(k, SERIE[i])} />
            ))}
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
              <Globo titulo={label} filas={[['Ritmo ideal', `${payload[0].payload.ideal} %`],
                ...series.map(([k, t]) => [t, payload[0].payload[k] != null ? `${payload[0].payload[k]} % (${payload[0].payload['acumulado_' + k]} niños)` : '—'])]} />
            ) : null} />
          </LineChart>
        </ResponsiveContainer>
      </ConTabla>
    </>
  );
}

/** Barras horizontales ordenadas (un tono: magnitud). */
export function GraficaBarras({ datos, campo, etiqueta, unidad = '', onClic, colorPor }) {
  const alto = Math.max(160, datos.length * 34 + 30);
  const tabla = (
    <div className="tabla-caja"><table>
      <thead><tr><th>Nombre</th><th className="celda-num">{etiqueta}</th></tr></thead>
      <tbody>{datos.map((d) => <tr key={d.nombre}><td>{d.nombre}</td><td className="celda-num">{d[campo]}{unidad}</td></tr>)}</tbody>
    </table></div>
  );
  return (
    // La altura la da el número de barras (no la fija de las demás gráficas)
    <ConTabla tabla={tabla} libre>
      <div style={{ height: alto }}>
        <ResponsiveContainer>
          <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }} barCategoryGap={6}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="nombre" tick={{ ...EJE, fill: '#18213a', fontWeight: 600 }} width={118} axisLine={false} tickLine={false} />
            <Bar dataKey={campo} radius={[0, 4, 4, 0]} cursor={onClic ? 'pointer' : 'default'} onClick={(d) => onClic?.(d.payload || d)} maxBarSize={24}>
              {datos.map((d) => <Cell key={d.nombre} fill={colorPor ? colorPor(d) : MAGNITUD} />)}
              <LabelList dataKey={campo} position="right" formatter={(v) => `${v}${unidad}`} style={{ fontSize: 12, fontWeight: 700, fill: '#18213a' }} />
            </Bar>
            <Tooltip cursor={{ fill: '#f3f6fa' }} content={({ active, payload }) => active && payload?.length ? (
              <Globo titulo={payload[0].payload.nombre} filas={[[etiqueta, `${payload[0].value}${unidad}`], payload[0].payload.extra && ['', payload[0].payload.extra]]} />
            ) : null} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ConTabla>
  );
}

/** Líneas mensuales de conteos (tendencias desde la foto mensual). */
export function GraficaTendencia({ filas, series }) {
  const tabla = (
    <div className="tabla-caja"><table>
      <thead><tr><th>Mes</th>{series.map(([, t]) => <th key={t} className="celda-num">{t}</th>)}</tr></thead>
      <tbody>{filas.map((f) => <tr key={f.mes}><td>{MESES[f.mes - 1]}</td>{series.map(([k]) => <td key={k} className="celda-num">{f[k] ?? '—'}</td>)}</tr>)}</tbody>
    </table></div>
  );
  return (
    <>
      <Leyenda items={series.map(([, t], i) => [t, SERIE[i]])} />
      <ConTabla tabla={tabla} baja>
        <ResponsiveContainer>
          <LineChart data={filas.map((f) => ({ ...f, nombre: MESES[f.mes - 1] }))} margin={{ top: 10, right: 16, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#eef1f6" vertical={false} />
            <XAxis dataKey="nombre" tick={EJE} axisLine={false} tickLine={false} />
            <YAxis tick={EJE} axisLine={false} tickLine={false} allowDecimals={false} />
            {series.map(([k], i) => <Line key={k} dataKey={k} stroke={SERIE[i]} strokeWidth={2.5} dot={{ r: 3.5, strokeWidth: 0, fill: SERIE[i] }} activeDot={{ r: 6 }} />)}
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
              <Globo titulo={label} filas={series.map(([k, t]) => [t, payload[0].payload[k] ?? '—'])} />
            ) : null} />
          </LineChart>
        </ResponsiveContainer>
      </ConTabla>
    </>
  );
}

/** Acceso (Penta/Hexa 1) contra utilización (deserción): cuadrantes de la estrategia RED de la OMS. */
export function GraficaCuadrantes({ comunidades, umbralAcceso, umbralDesercion, onClic }) {
  const puntos = comunidades.filter((c) => c.C1 != null && c.D1 != null)
    .map((c) => ({ ...c, x: Math.min(c.C1, 130), y: Math.max(-10, Math.min(c.D1, 100)), z: Math.max(1, c.sin_vacunar || 1) }));
  const etiquetar = new Set([...puntos].sort((a, b) => (b.sin_vacunar || 0) - (a.sin_vacunar || 0)).slice(0, 6).map((p) => p.id));
  const maxY = Math.max(40, Math.ceil(Math.max(...puntos.map((p) => p.y), 0) / 10) * 10 + 10);
  const tabla = (
    <div className="tabla-caja"><table>
      <thead><tr><th>Comunidad</th><th className="celda-num">Acceso (Penta/Hexa 1)</th><th className="celda-num">Deserción</th><th>Categoría</th></tr></thead>
      <tbody>{puntos.map((p) => <tr key={p.id}><td>{p.nombre}</td><td className="celda-num">{p.C1} %</td><td className="celda-num">{p.D1} %</td><td>{p.estrategia?.titulo}</td></tr>)}</tbody>
    </table></div>
  );
  return (
    <ConTabla tabla={tabla} alta>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 18, left: -6 }}>
          <CartesianGrid stroke="#eef1f6" />
          <ReferenceArea x1={0} x2={umbralAcceso} y1={umbralDesercion} y2={maxY} fill="#fef3f2" fillOpacity={0.7} />
          <ReferenceArea x1={umbralAcceso} x2={130} y1={-10} y2={umbralDesercion} fill="#ecfdf3" fillOpacity={0.7} />
          <XAxis type="number" dataKey="x" domain={[0, 130]} tick={EJE} unit="%" name="Acceso"
            label={{ value: 'Acceso: cobertura de la 1.ª dosis →', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#5b6680' }} />
          <YAxis type="number" dataKey="y" domain={[-10, maxY]} tick={EJE} unit="%" name="Deserción"
            label={{ value: 'No regresan ↑', angle: -90, position: 'insideLeft', offset: 18, fontSize: 11, fill: '#5b6680' }} />
          <ZAxis type="number" dataKey="z" range={[70, 520]} />
          <ReferenceLine x={umbralAcceso} stroke={REFERENCIA} strokeDasharray="5 4" />
          <ReferenceLine y={umbralDesercion} stroke={REFERENCIA} strokeDasharray="5 4" />
          <Scatter data={puntos} fill={MAGNITUD} fillOpacity={0.85} stroke="#fff" strokeWidth={2} cursor="pointer" onClick={(d) => onClic?.(d.payload || d)}>
            <LabelList dataKey="nombre" content={({ x, y, value, index }) => (etiquetar.has(puntos[index]?.id)
              ? <text x={x} y={y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#18213a">{value}</text> : null)} />
          </Scatter>
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? (
            <Globo titulo={payload[0].payload.nombre} filas={[
              ['Acceso (1.ª dosis)', `${payload[0].payload.C1} %`], ['Deserción', `${payload[0].payload.D1} %`],
              ['Sin 3.ª dosis', payload[0].payload.sin_vacunar ?? '—'], ['', payload[0].payload.estrategia?.titulo]]} />
          ) : null} />
        </ScatterChart>
      </ResponsiveContainer>
    </ConTabla>
  );
}

/** Barra 100 % apilada: a tiempo y tarde (dos intensidades del mismo tono). */
export function GraficaOportunidad({ filas }) {
  const datos = filas.map((f) => ({ nombre: f.vacuna, a_tiempo: f.a_tiempo, tarde: f.tarde, valor: f.valor, total: f.total }));
  const tabla = (
    <div className="tabla-caja"><table>
      <thead><tr><th>Vacuna</th><th className="celda-num">A tiempo</th><th className="celda-num">Tarde</th><th className="celda-num">% a tiempo</th></tr></thead>
      <tbody>{datos.map((d) => <tr key={d.nombre}><td>{d.nombre}</td><td className="celda-num">{d.a_tiempo}</td><td className="celda-num">{d.tarde}</td><td className="celda-num">{d.valor} %</td></tr>)}</tbody>
    </table></div>
  );
  return (
    <>
      <Leyenda items={[['A tiempo', MAGNITUD, 'punto'], ['Tarde', MAGNITUD_CLARO, 'punto']]} />
      <ConTabla tabla={tabla}>
        <div style={{ height: Math.max(180, datos.length * 34 + 20) }}>
          <ResponsiveContainer>
            <BarChart data={datos} layout="vertical" stackOffset="expand" margin={{ top: 0, right: 44, bottom: 0, left: 8 }} barCategoryGap={6}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="nombre" tick={{ ...EJE, fill: '#18213a', fontWeight: 600 }} width={118} axisLine={false} tickLine={false} />
              <Bar dataKey="a_tiempo" stackId="a" fill={MAGNITUD} maxBarSize={22} />
              <Bar dataKey="tarde" stackId="a" fill={MAGNITUD_CLARO} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="valor" position="right" formatter={(v) => `${v} %`} style={{ fontSize: 12, fontWeight: 700, fill: '#18213a' }} />
              </Bar>
              <Tooltip cursor={{ fill: '#f3f6fa' }} content={({ active, payload }) => active && payload?.length ? (
                <Globo titulo={payload[0].payload.nombre} filas={[['A tiempo', payload[0].payload.a_tiempo], ['Tarde', payload[0].payload.tarde], ['% a tiempo', `${payload[0].payload.valor} %`]]} />
              ) : null} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ConTabla>
    </>
  );
}

/** Convocados y vacunados por jornada (dos series, barras agrupadas). */
export function GraficaJornadas({ jornadas }) {
  const datos = jornadas.map((j) => ({ nombre: j.fecha.slice(5).split('-').reverse().join('/'), convocados: j.convocados, vacunados: j.vacunados_lista, comunidades: j.comunidades }));
  const tabla = (
    <div className="tabla-caja"><table>
      <thead><tr><th>Fecha</th><th>Comunidades</th><th className="celda-num">Convocados</th><th className="celda-num">Vacunados</th></tr></thead>
      <tbody>{datos.map((d) => <tr key={d.nombre + d.comunidades}><td>{d.nombre}</td><td>{d.comunidades}</td><td className="celda-num">{d.convocados}</td><td className="celda-num">{d.vacunados}</td></tr>)}</tbody>
    </table></div>
  );
  return (
    <>
      <Leyenda items={[['Convocados', SERIE[0], 'punto'], ['Vacunados de la lista', SERIE[2], 'punto']]} />
      <ConTabla tabla={tabla} baja>
        <ResponsiveContainer>
          <BarChart data={datos} margin={{ top: 10, right: 10, bottom: 0, left: -20 }} barGap={2}>
            <CartesianGrid stroke="#eef1f6" vertical={false} />
            <XAxis dataKey="nombre" tick={EJE} axisLine={false} tickLine={false} />
            <YAxis tick={EJE} axisLine={false} tickLine={false} allowDecimals={false} />
            <Bar dataKey="convocados" fill={SERIE[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="vacunados" fill={SERIE[2]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Tooltip cursor={{ fill: '#f3f6fa' }} content={({ active, payload }) => active && payload?.length ? (
              <Globo titulo={payload[0].payload.comunidades} filas={[['Convocados', payload[0].payload.convocados], ['Vacunados', payload[0].payload.vacunados]]} />
            ) : null} />
          </BarChart>
        </ResponsiveContainer>
      </ConTabla>
    </>
  );
}
