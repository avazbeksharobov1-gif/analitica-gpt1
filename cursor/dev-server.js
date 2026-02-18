const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5501;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

http
  .createServer((req, res) => {
    const rawPath = (req.url || '/').split('?')[0];
    const safePath = decodeURIComponent(rawPath).replace(/^\/+/, '');
    let filePath = path.join(ROOT, safePath || 'index.html');

    if (!filePath.startsWith(ROOT)) {
      send(res, 403, 'Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        send(res, 404, 'Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      send(res, 200, data, MIME[ext] || 'application/octet-stream');
    });
  })
  .listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Cursor project running: http://localhost:${PORT}/dashboard.html`);
  });
