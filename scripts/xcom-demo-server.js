const http = require('http');
const fs = require('fs');
const path = require('path');
const XLSX = require('../js/xlsx0.18.5.full.min.js');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.XCOM_DEMO_PORT || 8765);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};

function send(res, status, body, type) {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname === '/') {
    res.writeHead(302, {'Location':'/demo/xcom/'});
    return res.end();
  }
  const fileMatch = url.pathname.match(/^\/demo\/files\/(rfp|sku)\.xlsx$/);
  if (fileMatch) {
    const dataPath = path.join(root, 'demo', 'xcom', 'demo-data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const file = data.files[fileMatch[1]];
    const sheet = XLSX.utils.json_to_sheet(file.rows, {header:file.columns});
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, file.sheet);
    const body = XLSX.write(workbook, {type:'buffer', bookType:'xlsx'});
    res.writeHead(200, {
      'Content-Type': mime['.xlsx'],
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename),
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    return res.end(body);
  }
  if (url.pathname === '/demo/api/matching_export') {
    const dataPath = path.join(root, 'demo', 'xcom', 'demo-data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return send(res, 200, JSON.stringify({generatedAt:new Date().toISOString(), demo:true, rows:data.results}, null, 2), mime['.json']);
  }
  const requested = url.pathname === '/demo/xcom/' ? '/demo/xcom/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(root, `.${requested}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    res.writeHead(200, {'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store'});
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`XCOM demo: http://127.0.0.1:${port}/`));
