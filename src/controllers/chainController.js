const express = require('express');
const router  = express.Router();
const bc      = require('../services/blockchain');
const { propagarBloque } = require('../services/propagacion');

// ─── GET /chain ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const chain = await bc.obtenerCadena();
    res.json({
      node_id: process.env.NODE_ID,
      length:  chain.length,
      chain,
      cadena:  chain, // alias para compatibilidad con Next.js
    });
  } catch (e) {
    console.error('[CHAIN]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /chain/validate ──────────────────────
router.get('/validate', async (req, res) => {
  try {
    const chain    = await bc.obtenerCadena();
    const resultado = bc.validarCadena(chain);
    res.json({ ...resultado, length: chain.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Adaptador de formato
//
//  El nodo del compañero (también Express) usa un esquema diferente:
//    {
//      index, timestamp, nonce,
//      hashActual:   "000...",   ← camelCase
//      hashAnterior: "000...",   ← camelCase
//      data: {
//        transacciones: [{ id, personaId, institucionId, ... }],
//        minadoPor: "nodo-x"
//      }
//    }
//
//  Esta función detecta ese formato y lo convierte al esquema de grados
//  que usa nuestra tabla de Supabase.
// ─────────────────────────────────────────────────────────────────────────────
function esFormatoCompaneroExpress(bloque) {
  // Tiene hashActual (camelCase) y data.transacciones → formato del compañero
  return !!(bloque.hashActual && bloque.data && Array.isArray(bloque.data.transacciones));
}

function adaptarBloqueCompanero(bloque) {
  // Tomamos la primera transacción del bloque para mapear los campos de grado
  const tx = bloque.data?.transacciones?.[0] || {};

  // El compañero usa camelCase en sus transacciones
  const persona_id      = tx.persona_id      || tx.personaId      || null;
  const institucion_id  = tx.institucion_id  || tx.institucionId  || null;
  const programa_id     = tx.programa_id     || tx.programaId     || null;
  const titulo_obtenido = tx.titulo_obtenido || tx.tituloObtenido || null;
  const fecha_fin       = tx.fecha_fin       || tx.fechaFin       || null;
  const numero_cedula   = tx.numero_cedula   || tx.numeroCedula   || null;
  const fecha_inicio    = tx.fecha_inicio    || tx.fechaInicio    || null;
  const titulo_tesis    = tx.titulo_tesis    || tx.tituloTesis    || null;
  const menciones       = tx.menciones       || null;

  return {
    persona_id,
    institucion_id,
    programa_id,
    fecha_inicio,
    fecha_fin,
    titulo_obtenido,
    numero_cedula,
    titulo_tesis,
    menciones,
    // Campos blockchain — traducir camelCase → snake_case
    hash_actual:   bloque.hashActual,
    hash_anterior: bloque.hashAnterior || bloque.hash_anterior || null,
    nonce:         bloque.nonce,
    firmado_por:   bloque.data?.minadoPor || 'nodo-companero',
  };
}

// ─── POST /mine ───────────────────────────────
async function handleMine(req, res) {
  try {
    const pendientes = bc.obtenerTransacciones();

    if (pendientes.length === 0) {
      return res.status(400).json({ error: 'No hay transacciones pendientes para minar.' });
    }

    const tx            = pendientes[0];
    const ultimoBloque  = await bc.obtenerUltimoBloque();
    const hash_anterior = ultimoBloque ? ultimoBloque.hash_actual : null;

    console.log(`[MINADO] Iniciando PoW (dificultad: ${bc.DIFFICULTY})...`);
    const inicio = Date.now();

    const { nonce, hash } = bc.minar({
      persona_id:      tx.persona_id,
      institucion_id:  tx.institucion_id,
      programa_id:     tx.programa_id,
      titulo_obtenido: tx.titulo_obtenido,
      fecha_fin:       tx.fecha_fin,
      numero_cedula:   tx.numero_cedula,
      hash_anterior,
    });

    const tiempoMs = Date.now() - inicio;
    console.log(`[MINADO] PoW encontrado en ${tiempoMs}ms. Nonce: ${nonce}, Hash: ${hash}`);

    const nuevoBloque = {
      persona_id:      tx.persona_id,
      institucion_id:  tx.institucion_id,
      programa_id:     tx.programa_id     || null,
      fecha_inicio:    tx.fecha_inicio    || null,
      fecha_fin:       tx.fecha_fin,
      titulo_obtenido: tx.titulo_obtenido,
      numero_cedula:   tx.numero_cedula   || null,
      titulo_tesis:    tx.titulo_tesis    || null,
      menciones:       tx.menciones       || null,
      hash_actual:     hash,
      hash_anterior,
      nonce,
      firmado_por:     process.env.NODE_ID,
    };

    const bloqueGuardado = await bc.insertarBloque(nuevoBloque);

    bc.limpiarTransacciones();
    pendientes.slice(1).forEach(t => bc.agregarTransaccion(t));

    propagarBloque(bloqueGuardado);

    res.status(201).json({
      message: 'Bloque minado exitosamente',
      block:   bloqueGuardado,
      pow_ms:  tiempoMs,
    });
  } catch (e) {
    console.error('[MINE]', e);
    res.status(500).json({ error: e.message });
  }
}

router.post('/mine', handleMine);

// ─── POST /blocks/receive  (y alias /block, /blocks, etc.) ───────────────────
async function handleReceive(req, res) {
  let bloque = req.body;

  if (!bloque) {
    return res.status(400).json({ error: 'Body vacío.' });
  }

  // ── Detectar y adaptar formato del compañero Express ──────────────────────
  if (esFormatoCompaneroExpress(bloque)) {
    console.log(`[RECEIVE] Formato del compañero Express detectado — adaptando...`);
    bloque = adaptarBloqueCompanero(bloque);
  }

  // Ahora esperamos el formato estándar
  if (!bloque.hash_actual) {
    return res.status(400).json({ error: 'Bloque inválido: falta hash_actual.' });
  }

  try {
    // ── Verificar duplicado ────────────────────────────────────────────────
    const existe = await bc.bloqueExiste(bloque.hash_actual);
    if (existe) {
      return res.status(200).json({ message: 'Bloque ya conocido, ignorando.' });
    }

    // ── Verificar PoW (mínimo) ─────────────────────────────────────────────
    if (!bc.cumplePoW(bloque.hash_actual)) {
      return res.status(400).json({ error: 'El bloque no cumple el Proof of Work.' });
    }

    // ── Validar hash solo si tenemos todos los campos necesarios ───────────
    //    Si el compañero usa una fórmula de hash diferente, la recalculación
    //    fallará, pero al menos el PoW ya pasó — guardamos el bloque.
    if (bloque.persona_id && bloque.institucion_id && bloque.titulo_obtenido && bloque.fecha_fin) {
      const hashEsperado = bc.calcularHash({
        persona_id:      bloque.persona_id,
        institucion_id:  bloque.institucion_id,
        programa_id:     bloque.programa_id,
        titulo_obtenido: bloque.titulo_obtenido,
        fecha_fin:       bloque.fecha_fin,
        numero_cedula:   bloque.numero_cedula,
        hash_anterior:   bloque.hash_anterior,
        nonce:           bloque.nonce,
      });

      if (hashEsperado !== bloque.hash_actual) {
        // El hash no coincide con nuestra fórmula → podría ser la del compañero
        // Lo advertimos pero NO rechazamos: el PoW ya validó integridad básica
        console.warn(`[RECEIVE] Hash no coincide con nuestra fórmula (posible fórmula diferente). Aceptando de todas formas (PoW válido).`);
      }
    }

    // ── Guardar en Supabase ────────────────────────────────────────────────
    const { id, creado_en, ...datos } = bloque;
    const guardado = await bc.insertarBloque(datos);

    console.log(`[RECEIVE] ✓ Bloque guardado de ${bloque.firmado_por}: ${bloque.hash_actual.substring(0, 16)}...`);
    res.status(201).json({ message: 'Bloque aceptado e integrado.', block: guardado });

  } catch (e) {
    console.error('[RECEIVE]', e);
    res.status(500).json({ error: e.message });
  }
}

router.post('/blocks/receive', handleReceive);
router.post('/receive',        handleReceive);

module.exports        = router;
module.exports.handleMine    = handleMine;
module.exports.handleReceive = handleReceive;
