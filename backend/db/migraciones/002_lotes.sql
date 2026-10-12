-- Lotes de vacuna en uso: se registran al recibir las vacunas y se eligen al vacunar.
-- Permiten rechazar dosis de lotes vencidos y saber a qué niños se aplicó cada lote.
CREATE TABLE IF NOT EXISTS lote (
  id SERIAL PRIMARY KEY,
  producto_id INT NOT NULL REFERENCES producto(id),
  codigo TEXT NOT NULL CHECK (btrim(codigo) <> ''),
  fecha_vencimiento DATE NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por INT REFERENCES usuario(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (producto_id, codigo)
);

ALTER TABLE aplicacion ADD COLUMN IF NOT EXISTS lote_id INT REFERENCES lote(id);
CREATE INDEX IF NOT EXISTS ix_aplicacion_lote ON aplicacion(lote_id);

INSERT INTO parametro (clave, valor, descripcion)
VALUES ('dias_aviso_vencimiento', '30', 'Días antes del vencimiento en que un lote se marca como «por vencer»')
ON CONFLICT (clave) DO NOTHING;
