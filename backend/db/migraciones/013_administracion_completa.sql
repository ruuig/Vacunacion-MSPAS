-- El administrador configura todo sin tocar código: datos del centro, cargos, establecimientos y pedidos guardados

-- Datos del centro de salud (encabezados, documentos impresos, inicio de sesión)
INSERT INTO parametro (clave, valor, descripcion) VALUES
 ('centro_nombre', 'Centro de Salud San Luis Jilotepeque', 'Nombre del centro de salud'),
 ('centro_municipio', 'San Luis Jilotepeque', 'Municipio'),
 ('centro_departamento', 'Jalapa', 'Departamento'),
 ('centro_area_salud', 'Área de Salud de Jalapa', 'Área de salud a la que pertenece'),
 ('centro_distrito', 'Distrito San Luis Jilotepeque', 'Distrito de salud')
ON CONFLICT (clave) DO NOTHING;

-- Cargos: lista que el administrador mantiene (el rol decide los permisos; el cargo es el nombre del puesto de trabajo)
CREATE TABLE IF NOT EXISTS cargo (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO cargo (nombre) VALUES
 ('Enfermera profesional'), ('Auxiliar de enfermería'), ('Técnico en salud rural'), ('Vacunador'),
 ('Estadígrafo'), ('Encargada de insumos'), ('Administrador del sistema')
ON CONFLICT (nombre) DO NOTHING;
INSERT INTO cargo (nombre) SELECT DISTINCT trim(cargo) FROM usuario WHERE trim(cargo) <> '' ON CONFLICT (nombre) DO NOTHING;

-- Establecimientos: se pueden agregar y desactivar
ALTER TABLE establecimiento ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

-- Pedido de vacunas guardado al imprimirlo: permite comparar lo pedido con lo aplicado
CREATE TABLE IF NOT EXISTS pedido (
  id SERIAL PRIMARY KEY,
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  incluye_atrasados BOOLEAN NOT NULL DEFAULT false,
  creado_por INT REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, mes)
);
CREATE TABLE IF NOT EXISTS pedido_detalle (
  pedido_id INT NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  producto_id INT NOT NULL REFERENCES producto(id),
  cantidad INT NOT NULL CHECK (cantidad >= 0),
  PRIMARY KEY (pedido_id, producto_id)
);
