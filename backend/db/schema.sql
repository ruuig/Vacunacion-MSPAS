-- Sistema de control de vacunación infantil — 25 tablas
-- Basado en el cuaderno SIGSA 5a (versión 2017) y el carné del niño menor de 7 años.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Búsqueda sin tildes ("MARIA" encuentra "MARÍA"); envoltura inmutable para poder indexarla
CREATE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- ===== Territorio: servicio -> territorio -> sector -> comunidad (carné) =====
CREATE TABLE establecimiento (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('centro','puesto','hospital','privado','otro_municipio')),
  es_local BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE territorio (
  id SERIAL PRIMARY KEY,
  servicio_id INT NOT NULL REFERENCES establecimiento(id),
  nombre TEXT NOT NULL,
  UNIQUE (servicio_id, nombre)
);

CREATE TABLE sector (
  id SERIAL PRIMARY KEY,
  territorio_id INT NOT NULL REFERENCES territorio(id),
  nombre TEXT NOT NULL,
  UNIQUE (territorio_id, nombre)
);

CREATE TABLE comunidad (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('casco_urbano','barrio','aldea','caserio','canton')),
  comunidad_padre_id INT REFERENCES comunidad(id),
  sector_id INT REFERENCES sector(id),
  distancia_km NUMERIC(6,2),
  activo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE poblacion_meta (
  comunidad_id INT NOT NULL REFERENCES comunidad(id),
  anio INT NOT NULL,
  grupo_edad TEXT NOT NULL CHECK (grupo_edad IN ('menor_1','1_anio','1_a_6')),
  cantidad INT NOT NULL CHECK (cantidad >= 0),
  PRIMARY KEY (comunidad_id, anio, grupo_edad)
);

-- Portada del 5a: cada cuaderno es de un año, un tipo de registro y una comunidad o sector
CREATE TABLE cuaderno (
  id SERIAL PRIMARY KEY,
  numero INT NOT NULL,
  anio INT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('produccion_cobertura','contactados','otros')),
  servicio_id INT NOT NULL REFERENCES establecimiento(id),
  comunidad_id INT REFERENCES comunidad(id),
  sector_id INT REFERENCES sector(id),
  UNIQUE (servicio_id, anio, numero)
);

CREATE TABLE usuario (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT '',
  usuario TEXT NOT NULL UNIQUE,
  hash_contrasena TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('administrador','enfermera','vacunador')),
  activo BOOLEAN NOT NULL DEFAULT true,
  intentos_fallidos INT NOT NULL DEFAULT 0,
  ultimo_acceso TIMESTAMPTZ
);

-- ===== Personas: páginas 1 y 2 del 5a =====
CREATE TABLE responsable (
  id SERIAL PRIMARY KEY,
  cui VARCHAR(13) CHECK (cui ~ '^\d{13}$'),
  primer_nombre TEXT NOT NULL,
  segundo_nombre TEXT,
  primer_apellido TEXT NOT NULL,
  segundo_apellido TEXT,
  nombre_completo TEXT GENERATED ALWAYS AS (
    primer_nombre || ' ' || coalesce(segundo_nombre || ' ', '') || primer_apellido || coalesce(' ' || segundo_apellido, '')) STORED,
  fecha_nacimiento DATE,
  departamento TEXT NOT NULL DEFAULT 'Jalapa',
  municipio TEXT NOT NULL DEFAULT 'San Luis Jilotepeque',
  comunidad_id INT NOT NULL REFERENCES comunidad(id),
  direccion_detalle TEXT,
  numero_casa TEXT,
  numero_sector TEXT,
  telefono VARCHAR(8) CHECK (telefono ~ '^\d{8}$'),
  idioma_preferente TEXT NOT NULL DEFAULT 'espanol' CHECK (idioma_preferente IN ('espanol','poqomam'))
);
CREATE UNIQUE INDEX ux_responsable_cui ON responsable(cui) WHERE cui IS NOT NULL;

CREATE TABLE nino (
  id SERIAL PRIMARY KEY,
  cuaderno_id INT REFERENCES cuaderno(id),
  fila SMALLINT CHECK (fila BETWEEN 1 AND 25),
  cui VARCHAR(13) CHECK (cui ~ '^\d{13}$'),
  primer_nombre TEXT NOT NULL,
  segundo_nombre TEXT,
  primer_apellido TEXT NOT NULL,
  segundo_apellido TEXT,
  nombre_completo TEXT GENERATED ALWAYS AS (
    primer_nombre || ' ' || coalesce(segundo_nombre || ' ', '') || primer_apellido || coalesce(' ' || segundo_apellido, '')) STORED,
  fecha_nacimiento DATE NOT NULL CHECK (fecha_nacimiento <= CURRENT_DATE),
  nacimiento_departamento TEXT,
  nacimiento_municipio TEXT,
  nacimiento_comunidad TEXT,
  sexo CHAR(1) NOT NULL CHECK (sexo IN ('H','M')),
  -- Códigos impresos en el 5a: pueblo 1 a 6; comunidad lingüística 1 a 23 (23 = No indica)
  pueblo SMALLINT NOT NULL CHECK (pueblo BETWEEN 1 AND 6),
  comunidad_linguistica SMALLINT NOT NULL DEFAULT 23 CHECK (comunidad_linguistica BETWEEN 1 AND 23),
  -- Comunidad donde vive: sale de la dirección del responsable; la usan alertas y jornadas
  comunidad_id INT NOT NULL REFERENCES comunidad(id),
  nombre_padre TEXT,
  numero_registro_carne TEXT,
  fecha_registro_carne DATE,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','fallecio','emigro','trasladado','egresado')),
  fecha_inscripcion DATE NOT NULL DEFAULT CURRENT_DATE,
  creado_por INT REFERENCES usuario(id),
  CHECK (pueblo = 2 OR comunidad_linguistica = 23),
  CHECK ((cuaderno_id IS NULL) = (fila IS NULL)),
  UNIQUE (cuaderno_id, fila)
);
CREATE UNIQUE INDEX ux_nino_cui ON nino(cui) WHERE cui IS NOT NULL;

CREATE TABLE nino_responsable (
  nino_id INT NOT NULL REFERENCES nino(id) ON DELETE CASCADE,
  responsable_id INT NOT NULL REFERENCES responsable(id),
  parentesco TEXT NOT NULL CHECK (parentesco IN ('madre','padre','otro')),
  es_principal BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (nino_id, responsable_id)
);
CREATE UNIQUE INDEX ux_nino_responsable_principal ON nino_responsable(nino_id) WHERE es_principal;

-- ===== Esquema (catálogo) =====
CREATE TABLE serie (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  estacional BOOLEAN NOT NULL DEFAULT false,   -- influenza: solo en temporada
  informativa BOOLEAN NOT NULL DEFAULT false   -- se registra pero no cuenta (SPR dosis cero)
);

CREATE TABLE producto (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  via TEXT,
  activo BOOLEAN NOT NULL DEFAULT true          -- inactivo: solo para digitar antecedentes (fIPV)
);

CREATE TABLE producto_serie (
  producto_id INT NOT NULL REFERENCES producto(id),
  serie_id INT NOT NULL REFERENCES serie(id),
  PRIMARY KEY (producto_id, serie_id)
);

CREATE TABLE esquema_dosis (
  id SERIAL PRIMARY KEY,
  serie_id INT NOT NULL REFERENCES serie(id),
  numero INT NOT NULL,
  etiqueta TEXT NOT NULL,
  edad_recomendada_dias INT NOT NULL,
  edad_minima_dias INT NOT NULL,
  edad_maxima_dias INT,
  intervalo_minimo_dias INT,
  intervalo_recomendado_dias INT,
  dosis_previa_id INT REFERENCES esquema_dosis(id),
  aplica_nacidos_desde DATE,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INT NOT NULL,
  UNIQUE (serie_id, numero),
  CHECK (edad_minima_dias <= edad_recomendada_dias),
  CHECK (edad_maxima_dias IS NULL OR edad_recomendada_dias <= edad_maxima_dias)
);

-- Cada columna impresa del cuaderno (páginas 3 a 5): alimenta la vista de cuaderno y el informe mensual
CREATE TABLE columna_5a (
  id SERIAL PRIMARY KEY,
  pagina TEXT NOT NULL CHECK (pagina IN ('menor_1','uno_a_7','recuperacion')),
  grupo TEXT NOT NULL,                          -- encabezado agrupador: "Polio", "12 meses", "6 a 11 meses", "Otras vacunas"
  etiqueta TEXT NOT NULL,
  orden INT NOT NULL,
  esquema_dosis_id INT NOT NULL REFERENCES esquema_dosis(id),
  producto_id INT REFERENCES producto(id),      -- columna exclusiva de un producto (fIPV)
  es_recuperacion BOOLEAN NOT NULL DEFAULT false,
  grupo_influenza TEXT CHECK (grupo_influenza IN ('6_11','12_23','24_35')),
  formulacion TEXT CHECK (formulacion IN ('sur','norte')),
  sombreada BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (pagina, orden)
);

-- ===== Jornadas =====
CREATE TABLE jornada (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'planificada' CHECK (estado IN ('planificada','cerrada','cancelada')),
  responsable_id INT REFERENCES usuario(id),
  porcentaje_reserva NUMERIC(5,2) NOT NULL DEFAULT 10,
  observaciones TEXT
);

CREATE TABLE jornada_comunidad (
  jornada_id INT NOT NULL REFERENCES jornada(id) ON DELETE CASCADE,
  comunidad_id INT NOT NULL REFERENCES comunidad(id),
  PRIMARY KEY (jornada_id, comunidad_id)
);

CREATE TABLE jornada_nino (
  jornada_id INT NOT NULL REFERENCES jornada(id) ON DELETE CASCADE,
  nino_id INT NOT NULL REFERENCES nino(id),
  dosis_programadas JSONB NOT NULL,
  asistio BOOLEAN,
  motivo_inasistencia TEXT,
  PRIMARY KEY (jornada_id, nino_id)
);

CREATE TABLE jornada_biologico (
  jornada_id INT NOT NULL REFERENCES jornada(id) ON DELETE CASCADE,
  producto_id INT NOT NULL REFERENCES producto(id),
  dosis_estimadas INT NOT NULL DEFAULT 0,
  dosis_llevadas INT,
  dosis_devueltas INT,
  PRIMARY KEY (jornada_id, producto_id)
);

-- ===== Vacunación =====
CREATE TABLE aplicacion (
  id SERIAL PRIMARY KEY,
  nino_id INT NOT NULL REFERENCES nino(id),
  producto_id INT NOT NULL REFERENCES producto(id),
  fecha_aplicacion DATE NOT NULL CHECK (fecha_aplicacion <= CURRENT_DATE),
  lote TEXT,
  establecimiento_id INT REFERENCES establecimiento(id),
  jornada_id INT REFERENCES jornada(id),
  origen TEXT NOT NULL CHECK (origen IN ('produccion_cobertura','contactados','otros')), -- tipo de cuaderno
  fuente_primaria BOOLEAN NOT NULL DEFAULT true,          -- false: antecedente tomado del carné
  digitado_desde_cuaderno BOOLEAN NOT NULL DEFAULT false,
  es_recuperacion BOOLEAN NOT NULL DEFAULT false,         -- calculado al guardar
  formulacion TEXT CHECK (formulacion IN ('sur','norte')), -- solo influenza
  grupo_influenza TEXT CHECK (grupo_influenza IN ('6_11','12_23','24_35')),
  observacion TEXT,
  anulada BOOLEAN NOT NULL DEFAULT false,
  motivo_anulacion TEXT,
  creado_por INT REFERENCES usuario(id),                  -- "Responsable de la información"
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT anulada OR motivo_anulacion IS NOT NULL)
);

CREATE TABLE aplicacion_dosis (
  aplicacion_id INT NOT NULL REFERENCES aplicacion(id),
  esquema_dosis_id INT NOT NULL REFERENCES esquema_dosis(id),
  nino_id INT NOT NULL REFERENCES nino(id),
  temporada INT NOT NULL DEFAULT 0,   -- año de inicio de la temporada de influenza; 0 en las demás
  anulada BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (aplicacion_id, esquema_dosis_id)
);
-- Impide la doble dosis en la base (CP-10); influenza se repite una vez por temporada
CREATE UNIQUE INDEX ux_aplicacion_dosis_vigente ON aplicacion_dosis(nino_id, esquema_dosis_id, temporada) WHERE NOT anulada;

CREATE FUNCTION fn_check_fecha_aplicacion() RETURNS trigger AS $$
BEGIN
  IF NEW.fecha_aplicacion < (SELECT fecha_nacimiento FROM nino WHERE id = NEW.nino_id) THEN
    RAISE EXCEPTION 'La fecha de aplicación es anterior al nacimiento';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_check_fecha_aplicacion BEFORE INSERT OR UPDATE ON aplicacion
  FOR EACH ROW EXECUTE FUNCTION fn_check_fecha_aplicacion();

-- ===== Seguimiento =====
CREATE TABLE alerta (
  id SERIAL PRIMARY KEY,
  nino_id INT NOT NULL REFERENCES nino(id),
  esquema_dosis_id INT REFERENCES esquema_dosis(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('proxima','atrasada','dosis_cero','abandono','inasistencia')),
  prioridad TEXT NOT NULL CHECK (prioridad IN ('alta','media','baja')),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','en_seguimiento','resuelta','cerrada')),
  fecha_generada DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre DATE,
  motivo_cierre TEXT,
  cerrada_por INT REFERENCES usuario(id)
);
CREATE UNIQUE INDEX ux_alerta_abierta ON alerta(nino_id, COALESCE(esquema_dosis_id, 0), tipo)
  WHERE estado IN ('abierta','en_seguimiento');

CREATE TABLE seguimiento (
  id SERIAL PRIMARY KEY,
  alerta_id INT NOT NULL REFERENCES alerta(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  medio TEXT NOT NULL CHECK (medio IN ('llamada','visita','lider_comunitario','jornada','otro')),
  resultado TEXT NOT NULL CHECK (resultado IN ('contactado','no_localizado','cita_acordada','rechazo','trasladado')),
  fecha_compromiso DATE,
  nota TEXT,
  usuario_id INT NOT NULL REFERENCES usuario(id)
);

-- ===== Sistema =====
CREATE TABLE parametro (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descripcion TEXT
);

CREATE TABLE bitacora (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuario(id),
  fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  accion TEXT NOT NULL,
  tabla TEXT,
  registro_id TEXT,
  antes JSONB,
  despues JSONB,
  ip TEXT
);

-- ===== Índices =====
CREATE INDEX ix_nino_nombre_trgm ON nino USING gin (f_unaccent(nombre_completo) gin_trgm_ops);
CREATE INDEX ix_responsable_nombre_trgm ON responsable USING gin (f_unaccent(nombre_completo) gin_trgm_ops);
CREATE INDEX ix_nino_comunidad ON nino(comunidad_id);
CREATE INDEX ix_nino_fecha_nac ON nino(fecha_nacimiento);
CREATE INDEX ix_aplicacion_nino ON aplicacion(nino_id);
CREATE INDEX ix_aplicacion_fecha ON aplicacion(fecha_aplicacion);
CREATE INDEX ix_alerta_estado_tipo ON alerta(estado, tipo);

-- Bitácora solo inserción (ejecutar con el rol de la aplicación):
-- REVOKE UPDATE, DELETE ON bitacora FROM app_vacunacion;
