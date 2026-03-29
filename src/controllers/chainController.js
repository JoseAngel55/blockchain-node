const express = require('express');
const router  = express.Router();
const bc      = require('../services/blockchain');
const { propagarBloque } = require('../services/propagacion');

// GET /chain
router.get('/', async (req, res) => {
  try {
    const chain = await bc.obtenerCadena();
    res.json({ node_id: process.env.NODE_ID, length: chain.length, chain, cadena: chain });
  } catch (e) {
    console.error('[CHAIN]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /chain/validate
router.get('/validate', async (req, res) => {
  try {
    const chain = await bc.obtenerCadena();
    const resultado = bc.validarCadena(chain);
    res.json({ ...resultado, length: chain.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Normalizador universal de bloque
//
//  Acepta cualquier combinación de snake_case y camelCase que puedan
//  mandar los distintos nodos (Express propio, Express compañero, Laravel).
//  Siempre devuelve un objeto con los campos en snake_case que espera Supabase.
// ─────────────────────────────────────────────────────────────────────────────
function normalizarBloque(raw) {
  // Detectar si es el formato del compañero Express (bloque con data.transacciones)
  const esFormatoExpressCompanero = !!(
    raw.hashActual && raw.data && Array.isArray(raw.data.transacciones)
  );

  let tx = {};
  if (esFormatoExpressCompanero) {
    tx = raw.data?.transacciones?.[0] || {};
  } else {
    // El bloque mismo contiene los campos del grado (Laravel, nuestro nodo, etc.)
    tx = raw;
  }

  return {
    // Campos del grado — soportar snake_case y camelCase
    persona_id:      tx.persona_id      || tx.personaId      || null,
    institucion_id:  tx.institucion_id  || tx.institucionId  || null,
    programa_id:     tx.programa_id     || tx.programaId     || null,
    fecha_inicio:    tx.fecha_inicio    || tx.fechaInicio    || null,
    fecha_fin:       tx.fecha_fin       || tx.fechaFin       || null,
    titulo_obtenido: tx.titulo_obtenido || tx.tituloObtenido || null,
    numero_cedula:   tx.numero_cedula   || tx.numeroCedula   || null,
    titulo_tesis:    tx.titulo_tesis    || tx.tituloTesis    || null,
    menciones:       tx.menciones       || null,
    // Campos blockchain — soportar snake_case y camelCase
    hash_actual:     raw.hash_actual    || raw.hashActual    || null,
    hash_anterior:   raw.hash_anterior  || raw.hashAnterior  || raw.previousHash || null,
    nonce:           raw.nonce          || null,
    firmado_por:     raw.firmado_por    || raw.data?.minadoPor || raw.minadoPor || 'nodo-desconocido',
  };
}

// ─── POST /mine ───────────────────────────────────────────────────────────────
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
    console.log(`[MINADO] PoW en ${tiempoMs}ms. Nonce: ${nonce}, Hash: ${hash}`);

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

    res.status(201).json({ message: 'Bloque minado exitosamente', block: bloqueGuardado, pow_ms: tiempoMs });
  } catch (e) {
    console.error('[MINE]', e);
    res.status(500).json({ error: e.message });
  }
}

router.post('/mine', handleMine);

// ─── POST receive ─────────────────────────────────────────────────────────────
async function handleReceive(req, res) {
  const raw = req.body;

  if (!raw) {
    return res.status(400).json({ error: 'Body vacío.' });
  }

  // Normalizar a snake_case limpio para Supabase
  const bloque = normalizarBloque(raw);

  if (!bloque.hash_actual) {
    return res.status(400).json({ error: 'Bloque inválido: falta hash_actual.' });
  }

  console.log(`[RECEIVE] Bloque recibido. hash_actual: ${bloque.hash_actual.substring(0, 16)}... firmado_por: ${bloque.firmado_por}`);

  try {
    // Verificar duplicado
    const existe = await bc.bloqueExiste(bloque.hash_actual);
    if (existe) {
      return res.status(200).json({ message: 'Bloque ya conocido, ignorando.' });
    }

    // Verificar PoW
    if (!bc.cumplePoW(bloque.hash_actual)) {
      return res.status(400).json({ error: 'El bloque no cumple el Proof of Work.' });
    }

    // Validar hash (solo advertencia si no coincide — puede usar fórmula diferente)
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
        console.warn(`[RECEIVE] Hash distinto a nuestra fórmula — aceptando por PoW válido.`);
      }
    }

    // Guardar en Supabase (solo campos que existen en la tabla)
    const guardado = await bc.insertarBloque({
      persona_id:      bloque.persona_id,
      institucion_id:  bloque.institucion_id,
      programa_id:     bloque.programa_id,
      fecha_inicio:    bloque.fecha_inicio,
      fecha_fin:       bloque.fecha_fin,
      titulo_obtenido: bloque.titulo_obtenido,
      numero_cedula:   bloque.numero_cedula,
      titulo_tesis:    bloque.titulo_tesis,
      menciones:       bloque.menciones,
      hash_actual:     bloque.hash_actual,
      hash_anterior:   bloque.hash_anterior,
      nonce:           bloque.nonce,
      firmado_por:     bloque.firmado_por,
    });

    // Limpiar transacciones pendientes ya minadas por el compañero
    if (bloque.persona_id && bloque.titulo_obtenido) {
      const pendientes = bc.obtenerTransacciones();
      const restantes = pendientes.filter(tx =>
        !(tx.persona_id      === bloque.persona_id      &&
          tx.institucion_id  === bloque.institucion_id  &&
          tx.titulo_obtenido === bloque.titulo_obtenido &&
          tx.fecha_fin       === bloque.fecha_fin)
      );
      if (restantes.length < pendientes.length) {
        bc.limpiarTransacciones();
        restantes.forEach(t => bc.agregarTransaccion(t));
        console.log(`[RECEIVE] TX ya minada eliminada de pendientes. Quedan: ${restantes.length}`);
      }
    }

    console.log(`[RECEIVE] ✓ Bloque guardado de ${bloque.firmado_por}: ${bloque.hash_actual.substring(0, 16)}...`);
    res.status(201).json({ message: 'Bloque aceptado e integrado.', block: guardado });

  } catch (e) {
    console.error('[RECEIVE]', e);
    res.status(500).json({ error: e.message });
  }
}

router.post('/blocks/receive', handleReceive);
router.post('/receive',        handleReceive);

module.exports               = router;
module.exports.handleMine    = handleMine;
module.exports.handleReceive = handleReceive;
