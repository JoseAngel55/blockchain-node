const axios = require('axios');
const { obtenerNodos } = require('./nodos');

const TIMEOUT = 5000;

/**
 * Propaga una transacción a todos los nodos conocidos.
 */
async function propagarTransaccion(transaccion) {
  const nodos = obtenerNodos();
  const resultados = await Promise.allSettled(
    nodos.map(nodo =>
      axios.post(`${nodo}/transactions`, transaccion, { timeout: TIMEOUT })
        .then(() => ({ nodo, ok: true }))
        .catch(e => ({ nodo, ok: false, error: e.message }))
    )
  );

  const resumen = resultados.map(r => r.value || r.reason);
  console.log(`[PROPAGACIÓN TX] ${JSON.stringify(resumen)}`);
  return resumen;
}

/**
 * Propaga un bloque minado a todos los nodos conocidos.
 */
async function propagarBloque(bloque) {
  const nodos = obtenerNodos();
  const resultados = await Promise.allSettled(
    nodos.map(nodo =>
      axios.post(`${nodo}/block`, bloque, { timeout: TIMEOUT })
        .then(() => ({ nodo, ok: true }))
        .catch(e => ({ nodo, ok: false, error: e.message }))
    )
  );

  const resumen = resultados.map(r => r.value || r.reason);
  console.log(`[PROPAGACIÓN BLOQUE] ${JSON.stringify(resumen)}`);
  return resumen;
}

/**
 * Anuncia este nodo a todos los nodos conocidos para que nos registren.
 */
async function anunciarNodo(miUrl) {
  const nodos = obtenerNodos();
  await Promise.allSettled(
    nodos.map(nodo =>
      axios.post(`${nodo}/nodes/register`, { nodes: [miUrl] }, { timeout: TIMEOUT })
        .catch(e => console.warn(`[ANUNCIO] No se pudo notificar a ${nodo}: ${e.message}`))
    )
  );
}

module.exports = { propagarTransaccion, propagarBloque, anunciarNodo };
