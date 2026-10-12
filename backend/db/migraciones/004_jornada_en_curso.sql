-- Etapas de la jornada: planificada (preparación) → en_curso (se vacuna) → cerrada.
-- Al iniciarla se fijan las vacunas llevadas; mientras está en curso solo se registran dosis e inasistencias.
ALTER TABLE jornada DROP CONSTRAINT IF EXISTS jornada_estado_check;
ALTER TABLE jornada ADD CONSTRAINT jornada_estado_check CHECK (estado IN ('planificada','en_curso','cerrada','cancelada'));
ALTER TABLE jornada ADD COLUMN IF NOT EXISTS iniciada_en TIMESTAMPTZ;
ALTER TABLE jornada ADD COLUMN IF NOT EXISTS iniciada_por INT REFERENCES usuario(id);
