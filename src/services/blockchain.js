const crypto = require('crypto');
const supabase = require('../config/supabase');

const DIFFICULTY = parseInt(process.env.DIFFICULTY) || 3;
const PROOF_PREFIX = '0'.repeat(DIFFICULTY);

// ─────────────────────────────────────────────
//  Hash helpers
// ─────────────────────────────────────────────

/**
 * Genera el SHA256 de un bloque (grado académico).
 * Orden exacto documentado en el PDF del proyecto.
 */
function calcularHash({ persona_id, institucion_id, titulo_obtenido, fecha_fin, hash_anterior, nonce }) {
  const data = `${persona_id}${institucion_id}${titulo_obtenido}${fecha_fin}${hash_anterior}${nonce}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verifica si un hash cumple la dificultad de PoW.
 */
function cumplePoW(hash) {
  return hash.startsWith(PROOF_PREFIX);
}

// ─────────────────────────────────────────────
//  Proof of Work
// ─────────────────────────────────────────────

/**
 * Busca el nonce que produce un hash válido para el bloque dado.
 * @returns {{ nonce, hash }}
 */
function minar(bloqueDatos) {
  let nonce = 0;
  let hash;
  do {
    nonce++;
    hash = calcularHash({ ...bloqueDatos, nonce });
  } while (!cumplePoW(hash));
  return { nonce, hash };
}

// ─────────────────────────────────────────────
//  Validación de cadena
// ─────────────────────────────────────────────

/**
 * Valida la integridad de una cadena de bloques.
 * Recibe array de grados ordenados por creado_en ASC.
 */
function validarCadena(cadena) {
  for (let i = 0; i < cadena.length; i++) {
    const bloque = cadena[i];

    // Recalcular hash y comparar
    const hashEsperado = calcularHash({
      persona_id: bloque.persona_id,
      institucion_id: bloque.institucion_id,
      titulo_obtenido: bloque.titulo_obtenido,
      fecha_fin: bloque.fecha_fin,
      hash_anterior: bloque.hash_anterior,
      nonce: bloque.nonce,
    });

    if (hashEsperado !== bloque.hash_actual) {
      return { valida: false, error: `Hash inválido en bloque ${i} (id: ${bloque.id})` };
    }

    if (!cumplePoW(bloque.hash_actual)) {
      return { valida: false, error: `PoW inválido en bloque ${i}` };
    }

    // Verificar encadenamiento (excepto génesis)
    if (i > 0 && bloque.hash_anterior !== cadena[i - 1].hash_actual) {
      return { valida: false, error: `Encadenamiento roto en bloque ${i}` };
    }
  }
  return { valida: true };
}

// ─────────────────────────────────────────────
//  Operaciones con Supabase
// ─────────────────────────────────────────────

async function obtenerCadena() {
  const { data, error } = await supabase
    .from('grados')
    .select('*')
    .order('creado_en', { ascending: true });

  if (error) throw new Error(`Error al obtener cadena: ${error.message}`);
  return data || [];
}

async function obtenerUltimoBloque() {
  const { data, error } = await supabase
    .from('grados')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Error al obtener último bloque: ${error.message}`);
  return data?.[0] || null;
}

async function insertarBloque(bloque) {
  const { data, error } = await supabase
    .from('grados')
    .insert([bloque])
    .select()
    .single();

  if (error) throw new Error(`Error al insertar bloque: ${error.message}`);
  return data;
}

async function bloqueExiste(hash_actual) {
  const { data } = await supabase
    .from('grados')
    .select('id')
    .eq('hash_actual', hash_actual)
    .limit(1);
  return data && data.length > 0;
}

// Transacciones pendientes (en memoria, podrías moverlas a Supabase también)
let transaccionesPendientes = [];

function agregarTransaccion(tx) {
  transaccionesPendientes.push(tx);
}

function obtenerTransacciones() {
  return [...transaccionesPendientes];
}

function limpiarTransacciones() {
  transaccionesPendientes = [];
}

// ─────────────────────────────────────────────
//  Algoritmo de consenso (cadena más larga válida)
// ─────────────────────────────────────────────

async function resolverConflicto(nodos) {
  const cadenaLocal = await obtenerCadena();
  let mejorCadena = cadenaLocal;
  let reemplazada = false;

  for (const nodo of nodos) {
    try {
      const axios = require('axios');
      const { data } = await axios.get(`${nodo}/chain`, { timeout: 5000 });
      const cadenaRemota = data.chain;

      if (
        cadenaRemota.length > mejorCadena.length &&
        validarCadena(cadenaRemota).valida
      ) {
        mejorCadena = cadenaRemota;
        reemplazada = true;
      }
    } catch (e) {
      console.warn(`[CONSENSO] No se pudo contactar nodo ${nodo}: ${e.message}`);
    }
  }

  if (reemplazada) {
    // Insertar los bloques que no tenemos localmente
    for (const bloque of mejorCadena) {
      const existe = await bloqueExiste(bloque.hash_actual);
      if (!existe) {
        const { id, creado_en, ...resto } = bloque; // evitar conflictos de PK
        await insertarBloque(resto).catch(e =>
          console.error(`[CONSENSO] No se pudo insertar bloque ${bloque.id}: ${e.message}`)
        );
      }
    }
  }

  return { reemplazada, longitud: mejorCadena.length };
}

module.exports = {
  calcularHash,
  cumplePoW,
  minar,
  validarCadena,
  obtenerCadena,
  obtenerUltimoBloque,
  insertarBloque,
  bloqueExiste,
  agregarTransaccion,
  obtenerTransacciones,
  limpiarTransacciones,
  resolverConflicto,
  DIFFICULTY,
};
