-- Hora y persona que cerró la jornada (el inicio ya se guardaba)
ALTER TABLE jornada ADD COLUMN IF NOT EXISTS cerrada_en TIMESTAMPTZ;
ALTER TABLE jornada ADD COLUMN IF NOT EXISTS cerrada_por INT REFERENCES usuario(id);
