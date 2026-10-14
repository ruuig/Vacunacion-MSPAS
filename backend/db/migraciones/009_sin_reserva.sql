-- El servicio lleva y pide exactamente las dosis que se van a usar: sin reserva
UPDATE parametro SET valor = '0' WHERE clave = 'porcentaje_reserva_jornada';
