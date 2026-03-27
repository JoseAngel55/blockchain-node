// Registro en memoria de los nodos conocidos en la red
const nodos = new Set();

/**
 * Registra uno o varios nodos en la red local.
 * @param {string|string[]} urls - URL(s) del nodo (ej: "http://localhost:8001")
 */
function registrarNodos(urls) {
  const lista = Array.isArray(urls) ? urls : [urls];
  const agregados = [];

  for (const url of lista) {
    // Normalizar: quitar slash final
    const normalizado = url.replace(/\/$/, '');
    if (normalizado && !nodos.has(normalizado)) {
      nodos.add(normalizado);
      agregados.push(normalizado);
    }
  }

  console.log(`[NODOS] Registrados: ${agregados.join(', ') || 'ninguno nuevo'}`);
  return agregados;
}

function obtenerNodos() {
  return Array.from(nodos);
}

function eliminarNodo(url) {
  return nodos.delete(url.replace(/\/$/, ''));
}

// Cargar nodos desde .env al arrancar
function cargarNodosIniciales() {
  const conocidos = process.env.KNOWN_NODES || '';
  if (conocidos.trim()) {
    const lista = conocidos.split(',').map(n => n.trim()).filter(Boolean);
    registrarNodos(lista);
    console.log(`[NODOS] Cargados desde .env: ${lista.join(', ')}`);
  }
}

module.exports = {
  registrarNodos,
  obtenerNodos,
  eliminarNodo,
  cargarNodosIniciales,
};
