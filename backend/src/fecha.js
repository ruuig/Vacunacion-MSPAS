// Fecha de hoy en Guatemala ('YYYY-MM-DD'). No se usa toISOString(): da la fecha en hora universal y,
// de 6 p. m. a medianoche, ya sería el día siguiente (la base de datos valida con la fecha local y rechazaría el registro).
const ZONA = 'America/Guatemala';
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA });

module.exports = { hoy, ZONA };
