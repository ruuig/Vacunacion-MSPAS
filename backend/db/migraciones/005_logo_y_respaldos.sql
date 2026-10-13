-- Archivos de configuración guardados en la base (hoy: el logo institucional que cambia el administrador).
-- En la base y no en disco: así viaja con los respaldos y no se pierde al reinstalar el servidor.
CREATE TABLE IF NOT EXISTS archivo_config (
  clave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('image/png','image/jpeg','image/webp')),
  datos BYTEA NOT NULL,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por INT REFERENCES usuario(id)
);

-- Respaldos automáticos del servidor: cuántos días se conservan
INSERT INTO parametro (clave, valor, descripcion)
VALUES ('respaldo_retencion_dias', '30', 'Días que se conservan los respaldos automáticos en el servidor')
ON CONFLICT (clave) DO NOTHING;
