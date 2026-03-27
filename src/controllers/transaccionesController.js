const express = require('express');
const router = express.Router();
const bc = require('../services/blockchain');
const { propagarTransaccion } = require('../services/propagacion');

// ─── POST /transactions ───────────────────────
// Recibe una nueva transacción, la guarda y la propaga
router.post('/', async (req, res) => {
  const tx = req.body;
  const requeridos = ['persona_id', 'institucion_id', 'titulo_obtenido', 'fecha_fin'];

  const faltantes = requeridos.filter(c => !tx[c]);
  if (faltantes.length > 0) {
    return res.status(400).json({ error: `Campos requeridos faltantes: ${faltantes.join(', ')}` });
  }

  // Guardar en memoria local
  bc.agregarTransaccion(tx);
  console.log(`[TX] Nueva transacción recibida. Pendientes: ${bc.obtenerTransacciones().length}`);

  // Propagar solo si la transacción no viene ya de otro nodo
  // (usamos header x-propagated para evitar loops)
  const yaPropagada = req.headers['x-propagated'] === 'true';
  if (!yaPropagada) {
    propagarTransaccion(tx); // no await para no bloquear la respuesta
  }

  res.status(201).json({
    message: 'Transacción aceptada',
    transaction: tx,
    pending_count: bc.obtenerTransacciones().length,
  });
});

// ─── GET /transactions ────────────────────────
// Devuelve las transacciones pendientes
router.get('/', (req, res) => {
  res.json({
    pending: bc.obtenerTransacciones(),
    count: bc.obtenerTransacciones().length,
  });
});

module.exports = router;
