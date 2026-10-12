const router = require('express').Router();
const { transaccion, registrarBitacora } = require('../db');
const { permitir } = require('../middleware/auth');
const esq = require('../servicios/esquema');

// RF-10 anular dosis con motivo (solo enfermera). Nunca se borra.
router.post('/:id/anular', permitir('enfermera'), async (req, res) => {
  const { motivo } = req.body || {};
  if (!motivo) return res.status(400).json({ error: 'Indique el motivo de anulación.' });
  const a = await transaccion(async (c) => {
    const { rows: [antes] } = await c.query('SELECT * FROM aplicacion WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!antes || antes.anulada) return null;
    const { rows: [a] } = await c.query(
      'UPDATE aplicacion SET anulada = true, motivo_anulacion = $2 WHERE id = $1 RETURNING *', [antes.id, motivo]);
    await c.query('UPDATE aplicacion_dosis SET anulada = true WHERE aplicacion_id = $1', [a.id]);
    await registrarBitacora(c, req, 'anular', 'aplicacion', a.id, antes, a);
    const { rows: [n] } = await c.query('SELECT * FROM nino WHERE id = $1', [a.nino_id]);
    await esq.sincronizarAlertas(c, n);
    return a;
  });
  a ? res.json(a) : res.status(404).json({ error: 'Aplicación no encontrada o ya anulada.' });
});

module.exports = router;
