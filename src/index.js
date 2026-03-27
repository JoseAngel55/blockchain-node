require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const loggerMiddleware = require('./middleware/logger');
const chainController = require('./controllers/chainController');
const transaccionesController = require('./controllers/transaccionesController');
const nodosController = require('./controllers/nodosController');
const { cargarNodosIniciales, obtenerNodos } = require('./services/nodos');
const { obtenerCadena, obtenerTransacciones } = require('./services/blockchain');

const app = express();
const PORT = parseInt(process.env.PORT) || 8003;

// ─── Middleware ───────────────────────────────
app.use(cors());
app.use(express.json());
app.use(loggerMiddleware);

// ─── Swagger UI ───────────────────────────────
const swaggerDocument = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: `Nodo ${process.env.NODE_ID || 'Express'} - Docs`,
}));

// ─── Rutas ────────────────────────────────────
app.use('/chain', chainController);
app.use('/transactions', transaccionesController);
app.use('/nodes', nodosController);

// POST /mine (atajo directo, también está en chainController)
app.post('/mine', (req, res) => {
  req.url = '/mine';
  chainController(req, res);
});

// ─── GET /status ──────────────────────────────
app.get('/status', async (req, res) => {
  try {
    const chain = await obtenerCadena();
    res.json({
      node_id: process.env.NODE_ID,
      port: PORT,
      difficulty: parseInt(process.env.DIFFICULTY) || 3,
      chain_length: chain.length,
      pending_transactions: obtenerTransacciones().length,
      known_nodes: obtenerNodos().length,
      nodes: obtenerNodos(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Frontend de diagnóstico ──────────────────
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nodo Blockchain — ${process.env.NODE_ID}</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0e1a;
      --surface: #111827;
      --border: #1f2d40;
      --accent: #00d4ff;
      --green: #00ff88;
      --yellow: #ffd700;
      --red: #ff4466;
      --text: #e2e8f0;
      --muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: 'Space Grotesk', sans-serif; min-height: 100vh; }
    header { border-bottom: 1px solid var(--border); padding: 1.5rem 2rem; display: flex; align-items: center; gap: 1rem; }
    .badge { background: var(--accent); color: #000; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.75rem; border-radius: 100px; }
    h1 { font-size: 1.25rem; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; padding: 2rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
    .card-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.5rem; }
    .card-value { font-family: 'JetBrains Mono', monospace; font-size: 2rem; font-weight: 700; color: var(--accent); }
    .section { padding: 0 2rem 2rem; }
    h2 { font-size: 1rem; color: var(--muted); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn { background: var(--accent); color: #000; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.8; }
    .btn.danger { background: var(--red); color: #fff; }
    .btn.success { background: var(--green); }
    pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; overflow-x: auto; max-height: 300px; overflow-y: auto; white-space: pre-wrap; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
    .links { padding: 0 2rem 2rem; display: flex; gap: 1rem; }
    a.link-btn { background: transparent; border: 1px solid var(--border); color: var(--accent); padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.85rem; text-decoration: none; transition: border-color 0.2s; }
    a.link-btn:hover { border-color: var(--accent); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); display: inline-block; margin-right: 6px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  </style>
</head>
<body>
  <header>
    <div class="badge">NODO ACTIVO</div>
    <h1><span class="dot"></span>${process.env.NODE_ID || 'nodo-express'} — :${PORT}</h1>
  </header>

  <div class="grid" id="stats">
    <div class="card"><div class="card-label">Bloques en cadena</div><div class="card-value" id="chain-len">—</div></div>
    <div class="card"><div class="card-label">Tx pendientes</div><div class="card-value" id="tx-count">—</div></div>
    <div class="card"><div class="card-label">Nodos conocidos</div><div class="card-value" id="nodes-count">—</div></div>
    <div class="card"><div class="card-label">Dificultad PoW</div><div class="card-value" id="difficulty">—</div></div>
  </div>

  <div class="links">
    <a href="/docs" class="link-btn" target="_blank">📄 Swagger Docs</a>
    <a href="/chain" class="link-btn" target="_blank">🔗 Ver cadena</a>
    <a href="/nodes" class="link-btn" target="_blank">🌐 Ver nodos</a>
  </div>

  <div class="section">
    <h2>Acciones rápidas</h2>
    <div class="actions">
      <button class="btn" onclick="mine()">⛏️ Minar bloque</button>
      <button class="btn" onclick="resolve()">🔄 Resolver conflictos</button>
      <button class="btn" onclick="validate()">✅ Validar cadena</button>
      <button class="btn" onclick="refresh()">🔁 Actualizar estado</button>
    </div>
    <pre id="output">// Los resultados aparecerán aquí</pre>
  </div>

  <script>
    async function refresh() {
      const r = await fetch('/status');
      const d = await r.json();
      document.getElementById('chain-len').textContent = d.chain_length;
      document.getElementById('tx-count').textContent = d.pending_transactions;
      document.getElementById('nodes-count').textContent = d.known_nodes;
      document.getElementById('difficulty').textContent = d.difficulty;
    }
    async function mine() {
      const r = await fetch('/mine', { method: 'POST' });
      const d = await r.json();
      document.getElementById('output').textContent = JSON.stringify(d, null, 2);
      refresh();
    }
    async function resolve() {
      const r = await fetch('/nodes/resolve');
      const d = await r.json();
      document.getElementById('output').textContent = JSON.stringify(d, null, 2);
      refresh();
    }
    async function validate() {
      const r = await fetch('/chain/validate');
      const d = await r.json();
      document.getElementById('output').textContent = JSON.stringify(d, null, 2);
    }
    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>
  `);
});

// ─── Arranque ─────────────────────────────────
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log(`  🔗 Nodo blockchain arriba`);
  console.log(`  ID:      ${process.env.NODE_ID}`);
  console.log(`  Puerto:  ${PORT}`);
  console.log(`  Docs:    http://localhost:${PORT}/docs`);
  console.log(`  UI:      http://localhost:${PORT}/`);
  console.log('═══════════════════════════════════════════');
  cargarNodosIniciales();
});

module.exports = app;
