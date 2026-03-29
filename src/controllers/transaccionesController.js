const express = require('express');
const router = express.Router();
const bc = require('../services/blockchain');
const { propagarTransaccion } = require('../services/propagacion');

// ─── POST /transactions ───────────────────────
router.post('/', async (req, res) => {
  const body = req.body;

  // Normalizar campos: soportar camelCase del compañero y snake_case propio
  const tx = {
    persona_id:      body.persona_id      || body.personaId      || null,
    institucion_id:  body.institucion_id  || body.institucionId  || null,
    programa_id:     body.programa_id     || body.programaId     || null,
    titulo_obtenido: body.titulo_obtenido || body.tituloObtenido || null,
    fecha_fin:       body.fecha_fin       || body.fechaFin       || null,
    fecha_inicio:    body.fecha_inicio    || body.fechaInicio    || null,
    numero_cedula:   body.numero_cedula   || body.numeroCedula   || null,
    titulo_tesis:    body.titulo_tesis    || body.tituloTesis    || null,
    menciones:       body.menciones       || null,
  };

  const requeridos = ['persona_id', 'institucion_id', 'titulo_obtenido', 'fecha_fin'];
  const faltantes = requeridos.filter(c => !tx[c]);
  if (faltantes.length > 0) {
    return res.status(400).json({ error: `Campos requeridos faltantes: ${faltantes.join(', ')}` });
  }

  // ── Deduplicar: evitar agregar la misma TX dos veces ──────────────────────
  // Ocurre cuando tú propagas al compañero y él te la reenvía sin x-propagated
  const pendientes = bc.obtenerTransacciones();
  const yaExiste = pendientes.some(p =>
    p.persona_id      === tx.persona_id      &&
    p.institucion_id  === tx.institucion_id  &&
    p.titulo_obtenido === tx.titulo_obtenido &&
    p.fecha_fin       === tx.fecha_fin
  );

  if (yaExiste) {
    console.log(`[TX] Duplicado ignorado. Pendientes: ${pendientes.length}`);
    return res.status(200).json({
      message: 'Transacción ya existe (duplicado ignorado)',
      pending_count: pendientes.length,
    });
  }

  bc.agregarTransaccion(tx);
  console.log(`[TX] Nueva transacción recibida. Pendientes: ${bc.obtenerTransacciones().length}`);

  // Propagar solo si viene del cliente, no de otro nodo
  const yaPropagada = req.headers['x-propagated'] === 'true'
                   || req.headers['X-Propagated']  === 'true';
  if (!yaPropagada) {
    propagarTransaccion(tx);
  }

  res.status(201).json({
    message: 'Transacción aceptada',
    transaction: tx,
    pending_count: bc.obtenerTransacciones().length,
  });
});

// ─── GET /transactions ────────────────────────
router.get('/', (req, res) => {
  res.json({
    pending: bc.obtenerTransacciones(),
    count:   bc.obtenerTransacciones().length,
  });
});

module.exports = router;
