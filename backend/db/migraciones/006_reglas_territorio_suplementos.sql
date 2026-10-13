-- Ajustes con la práctica del Centro de Salud de San Luis Jilotepeque (octubre 2026)

-- ---- Reglas del esquema ----
-- Hepatitis B: solo de recién nacido, antes de cumplir 1 mes
UPDATE esquema_dosis d SET edad_maxima_dias = 29 FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'HB_RN';
-- Rotavirus: 2 meses entre dosis y nada después de los 8 meses
UPDATE esquema_dosis d SET intervalo_minimo_dias = 60 FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'ROTA' AND d.numero = 2;
-- Neumococo: la 2a solo antes del año (si la 1a fue a los 11 meses, la 2a se pierde); el refuerzo, desde el año
UPDATE esquema_dosis d SET edad_maxima_dias = 364 FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'NEUMO' AND d.numero = 2;
UPDATE esquema_dosis d SET edad_minima_dias = 365 FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'NEUMO' AND d.numero = 3;
-- Nombres como en el cuaderno: el R1 de los 18 meses es hexavalente (inyectada) + OPV (gotas)
UPDATE esquema_dosis d SET etiqueta = 'R1 Hexavalente' FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'DPT_HIB_HB' AND d.numero = 4;
UPDATE esquema_dosis d SET etiqueta = 'R1 (OPV)' FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'POLIO' AND d.numero = 4;
UPDATE esquema_dosis d SET etiqueta = 'R2 (OPV)' FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'POLIO' AND d.numero = 5;
UPDATE esquema_dosis d SET etiqueta = 'R2 (DPT)' FROM serie s WHERE s.id = d.serie_id AND s.codigo = 'DPT_HIB_HB' AND d.numero = 5;

-- Hasta qué dosis de cada serie cubre un producto: la hexavalente cubre Polio 1a a 3a (el R1 de polio es OPV)
-- y Penta 1a al R1; la pentavalente, solo la serie primaria
ALTER TABLE producto_serie ADD COLUMN IF NOT EXISTS numero_hasta INT;
UPDATE producto_serie ps SET numero_hasta = 3 FROM producto p, serie s
 WHERE p.id = ps.producto_id AND s.id = ps.serie_id AND p.codigo = 'HEXA' AND s.codigo = 'POLIO';
UPDATE producto_serie ps SET numero_hasta = 4 FROM producto p, serie s
 WHERE p.id = ps.producto_id AND s.id = ps.serie_id AND p.codigo = 'HEXA' AND s.codigo = 'DPT_HIB_HB';
UPDATE producto_serie ps SET numero_hasta = 3 FROM producto p, serie s
 WHERE p.id = ps.producto_id AND s.id = ps.serie_id AND p.codigo = 'PENTA' AND s.codigo = 'DPT_HIB_HB';

-- ---- Territorio: puestos (comunidad central) con su responsable ----
ALTER TABLE comunidad ADD COLUMN IF NOT EXISTS es_central BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE comunidad ADD COLUMN IF NOT EXISTS responsable TEXT;

-- ---- Suplementación con micronutrientes y desparasitación (página del cuaderno) ----
CREATE TABLE IF NOT EXISTS suplemento_dosis (
  id SERIAL PRIMARY KEY,
  insumo TEXT NOT NULL CHECK (insumo IN ('VIT_A','MICRO','DESPARASITANTE')),
  grupo TEXT NOT NULL CHECK (grupo IN ('6_11','12_23','24_35')),
  numero INT NOT NULL,
  etiqueta TEXT NOT NULL,
  edad_desde_dias INT NOT NULL,
  edad_hasta_dias INT NOT NULL,           -- último día de edad en que se puede dar
  intervalo_dias INT,                     -- desde la dosis anterior del mismo insumo y grupo
  orden INT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (insumo, grupo, numero)
);
INSERT INTO suplemento_dosis (insumo, grupo, numero, etiqueta, edad_desde_dias, edad_hasta_dias, intervalo_dias, orden) VALUES
 ('VIT_A','6_11',1,'Vitamina A',180,364,NULL,10),
 ('MICRO','6_11',1,'Micronutrientes',180,364,NULL,11),
 ('VIT_A','12_23',1,'Vitamina A 1a',365,729,NULL,20),
 ('VIT_A','12_23',2,'Vitamina A 2a',365,729,180,21),
 ('MICRO','12_23',1,'Micronutrientes 1a',365,729,NULL,22),
 ('MICRO','12_23',2,'Micronutrientes 2a',365,729,180,23),
 ('DESPARASITANTE','12_23',1,'Desparasitante 1a',365,729,NULL,24),
 ('DESPARASITANTE','12_23',2,'Desparasitante 2a',365,729,180,25),
 ('MICRO','24_35',1,'Micronutrientes 1a',730,1094,NULL,30),
 ('MICRO','24_35',2,'Micronutrientes 2a',730,1094,180,31),
 ('DESPARASITANTE','24_35',1,'Desparasitante 1a',730,1094,NULL,32),
 ('DESPARASITANTE','24_35',2,'Desparasitante 2a',730,1094,180,33)
ON CONFLICT (insumo, grupo, numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS suplementacion (
  id SERIAL PRIMARY KEY,
  nino_id INT NOT NULL REFERENCES nino(id),
  suplemento_dosis_id INT NOT NULL REFERENCES suplemento_dosis(id),
  fecha DATE NOT NULL CHECK (fecha <= CURRENT_DATE),
  establecimiento_id INT REFERENCES establecimiento(id),
  jornada_id INT REFERENCES jornada(id),
  anulada BOOLEAN NOT NULL DEFAULT false,
  motivo_anulacion TEXT,
  creado_por INT REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_suplementacion_vigente ON suplementacion(nino_id, suplemento_dosis_id) WHERE NOT anulada;
CREATE INDEX IF NOT EXISTS ix_suplementacion_fecha ON suplementacion(fecha);

-- Puestos y responsables (por nombre: en una base con el territorio de ejemplo no cambia nada)
UPDATE comunidad SET es_central = true, responsable = v.resp FROM (VALUES
  ('Casco urbano', NULL), ('El Camarón','Yoseline Lorenzo'), ('Los Olivos','Sandra Damián'), ('Los Trapichitos','Víctor Agustín'),
  ('Valencia','Fabio Damián'), ('Montaña','Migdalia Hernández'), ('El Chagüitón','Ludvin Portela')
) v(nombre, resp) WHERE comunidad.nombre = v.nombre;
UPDATE comunidad c SET comunidad_padre_id = p.id FROM (VALUES
  ('La Encarnación','Los Olivos'), ('Los Amates','Los Olivos'),
  ('Los Magueyes','Los Trapichitos'), ('San José las Pilas','Los Trapichitos'), ('California','Los Trapichitos'),
  ('Los Ángeles','Los Trapichitos'), ('El Paterno','Los Trapichitos'), ('Palo Blanco','Los Trapichitos'),
  ('San Felipe','Valencia'), ('Songotongo','Valencia'), ('Cruz de Villeda','Valencia'), ('Culima','Valencia'),
  ('Cushapa','Montaña'), ('Granada','Montaña'), ('Lagunilla','Montaña'), ('Potrerío','Montaña'), ('San Antonio','Montaña'), ('El Pelillal','Montaña'),
  ('El Zapote','El Chagüitón'), ('Las Mesas','El Chagüitón'), ('Pansiguis','El Chagüitón'), ('Zanja de Agua','El Chagüitón'),
  ('La Bolsa','Casco urbano'), ('El Calvario','Casco urbano'), ('El Centro','Casco urbano'), ('Izotes','Casco urbano'),
  ('El Llano','Casco urbano'), ('San Sebastián','Casco urbano'), ('Santa Cruz','Casco urbano'), ('Tierra Blanca','Casco urbano')
) v(hija, central) JOIN comunidad p ON p.nombre = v.central WHERE c.nombre = v.hija;
UPDATE comunidad SET responsable = v.resp FROM (VALUES
  ('La Bolsa','Dora Felipe'), ('El Calvario','Eunice Damián'), ('El Centro','Dorca Pérez'), ('Izotes','Dorca Pérez'),
  ('El Llano','Karina Gregorio'), ('San Sebastián','Eunice Damián'), ('Santa Cruz','Dorca Pérez')
) v(nombre, resp) WHERE comunidad.nombre = v.nombre;
