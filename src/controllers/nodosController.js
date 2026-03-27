const express = require('express');
const router = express.Router();
const { registrarNodos, obtenerNodos } = require('../services/nodos');
const { resolverConflicto } = require('../services/blockchain');

// ─── POST /nodes/register ─────────────────────
// Registra uno o varios nodos en la red local
router.post('/register', (req, res) => {
  const { nodes } = req.body;

  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array "nodes" con URLs.' });
  }

  const agregados = registrarNodos(nodes);
  res.status(201).json({
    message: `${agregados.length} nodo(s) registrado(s)`,
    added: agregados,
    total_nodes: obtenerNodos(),
  });
});

// ─── GET /nodes ───────────────────────────────
// Lista los nodos conocidos
router.get('/', (req, res) => {
  res.json({
    node_id: process.env.NODE_ID,
    nodes: obtenerNodos(),
    count: obtenerNodos().length,
  });
});

// ─── GET /nodes/resolve ───────────────────────
// Algoritmo de consenso: adopta la cadena válida más larga
router.get('/resolve', async (req, res) => {
  const nodos = obtenerNodos();

  if (nodos.length === 0) {
    return res.status(200).json({
      message: 'Sin nodos registrados. No hay conflicto que resolver.',
      replaced: false,
    });
  }

  try {
    console.log(`[CONSENSO] Resolviendo con ${nodos.length} nodo(s)...`);
    const { reemplazada, longitud } = await resolverConflicto(nodos);

    res.json({
      message: reemplazada
        ? 'Cadena reemplazada por una más larga y válida'
        : 'La cadena local ya es la más larga',
      replaced: reemplazada,
      chain_length: longitud,
    });
  } catch (e) {
    console.error('[RESOLVE]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
