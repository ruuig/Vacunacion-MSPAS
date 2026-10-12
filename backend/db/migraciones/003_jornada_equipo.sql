-- Equipo de la jornada: además del responsable, otras personas que salen a vacunar.
-- Solo el equipo (y la enfermera, que planifica) ve la jornada y registra en ella.
CREATE TABLE IF NOT EXISTS jornada_equipo (
  jornada_id INT NOT NULL REFERENCES jornada(id) ON DELETE CASCADE,
  usuario_id INT NOT NULL REFERENCES usuario(id),
  PRIMARY KEY (jornada_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS ix_jornada_equipo_usuario ON jornada_equipo(usuario_id);

-- Las jornadas existentes quedan con su responsable como equipo
INSERT INTO jornada_equipo (jornada_id, usuario_id)
SELECT id, responsable_id FROM jornada WHERE responsable_id IS NOT NULL
ON CONFLICT DO NOTHING;
