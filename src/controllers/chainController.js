const express = require('express');
const router = express.Router();
const bc = require('../services/blockchain');
const { propagarBloque, propagarTransaccion } = require('../services/propagacion');

// ─── GET /chain ───────────────────────────────
// Devuelve la cadena completa de este nodo
router.get('/', async (req, res) => {
  try {
    const chain = await bc.obtenerCadena();
    res.json({
      node_id: process.env.NODE_ID,
      length: chain.length,
      chain,
    });
  } catch (e) {
    console.error('[CHAIN]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /chain/validate ──────────────────────
// Valida la cadena local
router.get('/validate', async (req, res) => {
  try {
    const chain = await bc.obtenerCadena();
    const resultado = bc.validarCadena(chain);
    res.json({ ...resultado, length: chain.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /mine ───────────────────────────────
// Mina un nuevo bloque con las transacciones pendientes
router.post('/mine', async (req, res) => {
  try {
    const pendientes = bc.obtenerTransacciones();

    if (pendientes.length === 0) {
      return res.status(400).json({ error: 'No hay transacciones pendientes para minar.' });
    }

    // Tomar la primera transacción pendiente como datos del bloque
    const tx = pendientes[0];
    const ultimoBloque = await bc.obtenerUltimoBloque();
    const hash_anterior = ultimoBloque ? ultimoBloque.hash_actual : null;

    console.log(`[MINADO] Iniciando PoW (dificultad: ${bc.DIFFICULTY})...`);
    const inicio = Date.now();

    const { nonce, hash } = bc.minar({
      persona_id: tx.persona_id,
      institucion_id: tx.institucion_id,
      titulo_obtenido: tx.titulo_obtenido,
      fecha_fin: tx.fecha_fin,
      hash_anterior,
    });

    const tiempoMs = Date.now() - inicio;
    console.log(`[MINADO] PoW encontrado en ${tiempoMs}ms. Nonce: ${nonce}, Hash: ${hash}`);

    const nuevoBloque = {
      persona_id: tx.persona_id,
      institucion_id: tx.institucion_id,
      programa_id: tx.programa_id || null,
      fecha_inicio: tx.fecha_inicio || null,
      fecha_fin: tx.fecha_fin,
      titulo_obtenido: tx.titulo_obtenido,
      numero_cedula: tx.numero_cedula || null,
      titulo_tesis: tx.titulo_tesis || null,
      menciones: tx.menciones || null,
      hash_actual: hash,
      hash_anterior,
      nonce,
      firmado_por: process.env.NODE_ID,
    };

    const bloqueGuardado = await bc.insertarBloque(nuevoBloque);

    // Limpiar la transacción minada
    bc.limpiarTransacciones();
    // Si había más, volvemos a agregarlas (menos la primera)
    pendientes.slice(1).forEach(t => bc.agregarTransaccion(t));

    // Propagar a la red
    propagarBloque(bloqueGuardado);

    res.status(201).json({
      message: 'Bloque minado exitosamente',
      block: bloqueGuardado,
      pow_ms: tiempoMs,
    });
  } catch (e) {
    console.error('[MINE]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /blocks/receive ─────────────────────
// Recibe un bloque propagado por otro nodo
router.post('/blocks/receive', async (req, res) => {
  const bloque = req.body;

  if (!bloque || !bloque.hash_actual) {
    return res.status(400).json({ error: 'Bloque inválido o incompleto.' });
  }

  try {
    // Verificar que no lo tenemos ya
    const existe = await bc.bloqueExiste(bloque.hash_actual);
    if (existe) {
      return res.status(200).json({ message: 'Bloque ya conocido, ignorando.' });
    }

    // Validar integridad del bloque recibido
    const hashEsperado = bc.calcularHash({
      persona_id: bloque.persona_id,
      institucion_id: bloque.institucion_id,
      titulo_obtenido: bloque.titulo_obtenido,
      fecha_fin: bloque.fecha_fin,
      hash_anterior: bloque.hash_anterior,
      nonce: bloque.nonce,
    });

    if (hashEsperado !== bloque.hash_actual) {
      console.warn(`[RECEIVE] Hash inválido. Esperado: ${hashEsperado}, Recibido: ${bloque.hash_actual}`);
      return res.status(400).json({ error: 'Hash del bloque no coincide.' });
    }

    if (!bc.cumplePoW(bloque.hash_actual)) {
      return res.status(400).json({ error: 'El bloque no cumple el Proof of Work.' });
    }

    // Guardar (sin el id ni creado_en para dejar que Supabase los genere)
    const { id, creado_en, ...datos } = bloque;
    const guardado = await bc.insertarBloque(datos);

    console.log(`[RECEIVE] Bloque aceptado de ${bloque.firmado_por}: ${bloque.hash_actual.substring(0, 16)}...`);
    res.status(201).json({ message: 'Bloque aceptado e integrado.', block: guardado });
  } catch (e) {
    console.error('[RECEIVE]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
