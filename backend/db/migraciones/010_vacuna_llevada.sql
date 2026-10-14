-- Se llevan las vacunas cabales (ni una más) y se marca cada una al guardarla en el termo
ALTER TABLE jornada_biologico ADD COLUMN IF NOT EXISTS llevada BOOLEAN NOT NULL DEFAULT false;
UPDATE jornada_biologico jb SET dosis_llevadas = jb.dosis_estimadas
  FROM jornada j WHERE j.id = jb.jornada_id AND j.estado = 'planificada' AND jb.dosis_estimadas > 0;
