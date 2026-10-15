-- Tres roles: administrador, enfermera y personal de vacunación. El pedido de vacunas lo hace la enfermera,
-- así que el rol de solo consulta («encargado») ya no se usa: sus cuentas quedan desactivadas (su historial se conserva).
UPDATE usuario SET activo = false WHERE rol = 'encargado';
