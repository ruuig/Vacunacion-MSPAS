-- El personal de vacunación trabaja en un puesto: ve los niños de ese puesto y sus comunidades (y los de sus jornadas).
-- La enfermera encargada no lo usa: su lugar sale de comunidad.responsable_id.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS puesto_id INT REFERENCES comunidad(id) ON DELETE SET NULL;
