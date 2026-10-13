-- Encargada: consulta todo (control del mes, pedidos, tablero, informes) sin registrar ni modificar nada
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_rol_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_rol_check CHECK (rol IN ('administrador','enfermera','vacunador','encargado'));
