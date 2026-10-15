-- Roles según cómo funciona el distrito:
--  · Dirección (rol administrador): la doctora, coordinadora del distrito; ve todo y configura.
--  · Enfermera encargada de puesto (rol enfermera): ve su puesto y sus aldeas, programa y cierra sus jornadas.
--  · Personal de vacunación (rol vacunador): solo las jornadas a las que lo asignan.

-- Quien es responsable de un puesto o barrio pasa a ser enfermera encargada
UPDATE usuario SET rol = 'enfermera'
WHERE rol = 'vacunador' AND id IN (SELECT responsable_id FROM comunidad WHERE responsable_id IS NOT NULL AND activo);

-- La enfermera del centro de salud queda a cargo del casco urbano (y de los barrios sin responsable propio)
UPDATE comunidad SET responsable_id = (SELECT id FROM usuario WHERE usuario = 'enfermera' AND activo)
WHERE tipo = 'casco_urbano' AND responsable_id IS NULL AND EXISTS (SELECT 1 FROM usuario WHERE usuario = 'enfermera' AND activo);

-- Pedido de cada puesto (la Dirección lo junta en el pedido del municipio)
CREATE TABLE IF NOT EXISTS pedido_puesto (
  pedido_id INT NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  puesto_id INT NOT NULL REFERENCES comunidad(id),
  producto_id INT NOT NULL REFERENCES producto(id),
  cantidad INT NOT NULL CHECK (cantidad >= 0),
  PRIMARY KEY (pedido_id, puesto_id, producto_id)
);
