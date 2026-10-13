-- El responsable de un puesto o barrio es un usuario del sistema: así cada quien ve su sector al entrar.
ALTER TABLE comunidad ADD COLUMN IF NOT EXISTS responsable_id INT REFERENCES usuario(id);
CREATE INDEX IF NOT EXISTS ix_comunidad_responsable ON comunidad(responsable_id);

-- Unir por nombre a los responsables ya escritos con su usuario (ignora tildes y mayúsculas)
UPDATE comunidad c SET responsable_id = u.id
FROM usuario u
WHERE c.responsable IS NOT NULL AND c.responsable_id IS NULL
  AND lower(translate(c.responsable, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) = lower(translate(u.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'));
