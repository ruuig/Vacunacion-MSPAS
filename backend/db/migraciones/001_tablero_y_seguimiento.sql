-- Análisis del flujo operativo y tablero de decisiones, sección 7.
-- Visitas y oportunidades perdidas, seguimiento por niño, asignación de casos,
-- foto mensual de indicadores, plan de acción y constancia de informes.

-- Cada contacto del niño con el servicio. Una aplicación pertenece a una visita (denominador de N6).
CREATE TABLE IF NOT EXISTS visita (
  id SERIAL PRIMARY KEY,
  nino_id INT NOT NULL REFERENCES nino(id),
  fecha DATE NOT NULL CHECK (fecha <= CURRENT_DATE),
  establecimiento_id INT REFERENCES establecimiento(id),
  jornada_id INT REFERENCES jornada(id),
  usuario_id INT REFERENCES usuario(id),
  tipo TEXT NOT NULL DEFAULT 'vacunacion' CHECK (tipo IN ('vacunacion','sin_vacuna')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_visita_nino_fecha ON visita(nino_id, fecha);
CREATE INDEX IF NOT EXISTS ix_visita_fecha ON visita(fecha);

ALTER TABLE aplicacion ADD COLUMN IF NOT EXISTS visita_id INT REFERENCES visita(id);

-- Las dosis aplicadas por el servicio antes de esta migración se agrupan en visitas (niño, fecha, lugar, jornada)
WITH g AS (
  SELECT nino_id, fecha_aplicacion, establecimiento_id, jornada_id, min(creado_por) AS usuario_id, min(creado_en) AS creado_en
  FROM aplicacion WHERE visita_id IS NULL AND fuente_primaria
  GROUP BY nino_id, fecha_aplicacion, establecimiento_id, jornada_id
), ins AS (
  INSERT INTO visita (nino_id, fecha, establecimiento_id, jornada_id, usuario_id, tipo, creado_en)
  SELECT nino_id, fecha_aplicacion, establecimiento_id, jornada_id, usuario_id, 'vacunacion', creado_en FROM g
  RETURNING id, nino_id, fecha, establecimiento_id, jornada_id
)
UPDATE aplicacion a SET visita_id = ins.id FROM ins
WHERE a.visita_id IS NULL AND a.fuente_primaria AND a.nino_id = ins.nino_id AND a.fecha_aplicacion = ins.fecha
  AND a.establecimiento_id IS NOT DISTINCT FROM ins.establecimiento_id AND a.jornada_id IS NOT DISTINCT FROM ins.jornada_id;

-- Dosis que le tocaban y no se aplicaron en una visita, con su motivo (OPS: oportunidad perdida de vacunación)
CREATE TABLE IF NOT EXISTS dosis_no_aplicada (
  id SERIAL PRIMARY KEY,
  visita_id INT NOT NULL REFERENCES visita(id) ON DELETE CASCADE,
  nino_id INT NOT NULL REFERENCES nino(id),
  esquema_dosis_id INT NOT NULL REFERENCES esquema_dosis(id),
  motivo TEXT NOT NULL CHECK (motivo IN ('contraindicacion','desabastecimiento','rechazo','falsa_contraindicacion','posterga_personal','otro')),
  detalle TEXT,
  -- Solo la contraindicación verdadera no es oportunidad perdida
  es_oportunidad_perdida BOOLEAN GENERATED ALWAYS AS (motivo <> 'contraindicacion') STORED,
  UNIQUE (visita_id, esquema_dosis_id)
);
CREATE INDEX IF NOT EXISTS ix_dna_nino ON dosis_no_aplicada(nino_id);

-- El seguimiento es con la familia del niño, no con cada dosis: un contacto por niño
ALTER TABLE seguimiento ADD COLUMN IF NOT EXISTS nino_id INT REFERENCES nino(id);
UPDATE seguimiento s SET nino_id = a.nino_id FROM alerta a WHERE a.id = s.alerta_id AND s.nino_id IS NULL;
DELETE FROM seguimiento s USING seguimiento t
WHERE s.nino_id = t.nino_id AND s.fecha = t.fecha AND s.medio = t.medio AND s.resultado = t.resultado
  AND s.fecha_compromiso IS NOT DISTINCT FROM t.fecha_compromiso AND s.nota IS NOT DISTINCT FROM t.nota
  AND s.usuario_id = t.usuario_id AND s.id > t.id;
ALTER TABLE seguimiento ALTER COLUMN nino_id SET NOT NULL;
ALTER TABLE seguimiento ALTER COLUMN alerta_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ix_seguimiento_nino ON seguimiento(nino_id, fecha);

-- Quién se encarga de contactar a cada niño ("Mis casos")
CREATE TABLE IF NOT EXISTS caso_asignacion (
  nino_id INT PRIMARY KEY REFERENCES nino(id),
  usuario_id INT NOT NULL REFERENCES usuario(id),
  asignado_por INT REFERENCES usuario(id),
  asignado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foto mensual de indicadores (tendencias y "antes y después"). comunidad_id 0 = todo el municipio.
CREATE TABLE IF NOT EXISTS indicador_mensual (
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  comunidad_id INT NOT NULL DEFAULT 0,
  codigo TEXT NOT NULL,
  numerador NUMERIC,
  denominador NUMERIC,
  valor NUMERIC,
  calculado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (anio, mes, comunidad_id, codigo)
);

-- Plan de acción de la sala situacional (F7)
CREATE TABLE IF NOT EXISTS accion (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  comunidad_id INT REFERENCES comunidad(id),
  indicador_codigo TEXT,
  problema TEXT NOT NULL,
  accion TEXT NOT NULL,
  responsable_id INT REFERENCES usuario(id),
  fecha_limite DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','cumplida','cancelada')),
  valor_inicial NUMERIC,
  valor_final NUMERIC,
  resultado TEXT,
  creado_por INT REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constancia de cierre de mes y de informes enviados al área de salud
CREATE TABLE IF NOT EXISTS informe_enviado (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensual_5a','sala_situacional')),
  anio INT NOT NULL,
  mes INT NOT NULL,
  usuario_id INT REFERENCES usuario(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  datos JSONB
);

-- Umbrales del tablero como datos (análisis, sección 7.2)
INSERT INTO parametro (clave, valor, descripcion) VALUES
 ('umbral_cobertura','95','Cobertura meta (%) del PNI'),
 ('umbral_acceso','80','Penta/Hexa 1 mínimo para considerar buen acceso (OMS RED)'),
 ('umbral_desercion','10','Deserción máxima aceptada (%). La guía guatemalteca usa 5: confirmar con el distrito'),
 ('dias_contacto_oportuno','7','Días para contactar un caso nuevo'),
 ('dias_resolucion','30','Días para considerar un caso resuelto a tiempo'),
 ('intentos_escalamiento','3','Intentos sin localizar antes de sugerir visita o líder comunitario'),
 ('dias_digitacion_tardia','7','Días entre aplicar y registrar para marcar digitación tardía')
ON CONFLICT (clave) DO NOTHING;
