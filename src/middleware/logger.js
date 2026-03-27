const morgan = require('morgan');

// Formato personalizado con colores para consola
morgan.token('body', (req) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const body = JSON.stringify(req.body);
    return body.length > 200 ? body.substring(0, 200) + '...' : body;
  }
  return '';
});

const formato = ':method :url :status :response-time ms :body';

module.exports = morgan(formato, {
  stream: {
    write: (msg) => console.log(`[HTTP] ${msg.trim()}`),
  },
});
