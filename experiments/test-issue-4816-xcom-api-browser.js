'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const XLSX = require('../js/xlsx0.18.5.full.min.js');
const {createXcomDemoServer} = require('../scripts/xcom-demo-server');

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitJson(url, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) { lastError = error; }
    await wait(50);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function makeWorkbook(file, target) {
  const sheet = XLSX.utils.json_to_sheet(file.rows, {header: file.columns});
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, file.sheet);
  fs.writeFileSync(target, XLSX.write(workbook, {type: 'buffer', bookType: 'xlsx'}));
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
  }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(message.params.exceptionDetails.text || 'Runtime exception');
      }
    };
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
  }
  call(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve, reject});
      this.socket.send(JSON.stringify({id, method, params: params || {}}));
    });
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || expression);
    return result.result.value;
  }
  close() { if (this.socket) this.socket.close(); }
}

async function waitForExpression(cdp, expression, label) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (await cdp.evaluate(expression)) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

(async function run() {
  const edge = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].find(candidate => fs.existsSync(candidate));
  assert(edge, 'Edge or Chrome is installed');

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xcom-browser-test-'));
  const storageRoot = path.join(temporary, 'runs');
  const profile = path.join(temporary, 'browser-profile');
  const rfpFile = path.join(temporary, 'rfp.xlsx');
  const skuFile = path.join(temporary, 'sku.xlsx');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo', 'xcom', 'demo-data.json'), 'utf8'));
  makeWorkbook(data.files.rfp, rfpFile);
  makeWorkbook(data.files.sku, skuFile);

  const server = createXcomDemoServer({storageRoot});
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const appPort = server.address().port;
  const debugPort = await freePort();
  const browser = spawn(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
  ], {stdio: 'ignore', windowsHide: true});
  let cdp;

  try {
    await waitJson(`http://127.0.0.1:${debugPort}/json/version`, 160);
    const page = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${appPort}/#mass`)}`,
      {method: 'PUT'}
    ).then(response => response.json());
    cdp = new Cdp(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');

    await waitForExpression(cdp, "document.querySelector('#execution-badge') && document.querySelector('#execution-badge').textContent.includes('Серверная')", 'API mode');
    const documentNode = await cdp.call('DOM.getDocument', {depth: -1});
    const rfpNode = await cdp.call('DOM.querySelector', {nodeId: documentNode.root.nodeId, selector: '#run-rfp-input'});
    const skuNode = await cdp.call('DOM.querySelector', {nodeId: documentNode.root.nodeId, selector: '#run-sku-input'});
    await cdp.call('DOM.setFileInputFiles', {nodeId: rfpNode.nodeId, files: [rfpFile]});
    await cdp.evaluate("document.querySelector('#run-rfp-input').dispatchEvent(new Event('change',{bubbles:true}))");
    await cdp.call('DOM.setFileInputFiles', {nodeId: skuNode.nodeId, files: [skuFile]});
    await cdp.evaluate("document.querySelector('#run-sku-input').dispatchEvent(new Event('change',{bubbles:true}))");
    assert.strictEqual(await cdp.evaluate("document.querySelector('#start-match').disabled"), false, 'start is enabled after two files');

    await cdp.evaluate("document.querySelector('#start-match').click()");
    await waitForExpression(cdp, "document.querySelector('#run-status-pill').textContent.includes('завершено')", 'server matching');
    assert.strictEqual(await cdp.evaluate("document.querySelector('#total-stat').textContent"), '5', 'UI shows server total');
    assert.strictEqual(await cdp.evaluate("document.querySelector('#review-stat').textContent"), '1', 'UI shows review queue');
    assert.strictEqual(await cdp.evaluate("document.querySelectorAll('#result-body tr').length"), 5, 'UI renders API result page');

    await cdp.evaluate("document.querySelector('#mass-next [data-go=review]').click()");
    await waitForExpression(cdp, "document.querySelector('#review').classList.contains('is-active') && document.querySelector('[data-candidate]')", 'review page');
    await cdp.evaluate("document.querySelector('[data-candidate]').click(); document.querySelector('#accept-candidate').click()");
    await waitForExpression(cdp, "document.querySelector('#review-queue-pill').textContent.includes('завершена')", 'saved API decision');
    assert.strictEqual(await cdp.evaluate("document.querySelector('#download-export').disabled"), false, 'export unlocks after API decision');
    assert.strictEqual(cdp.exceptions.length, 0, `browser has no runtime exceptions: ${cdp.exceptions.join('; ')}`);

    console.log('OK: test-issue-4816-xcom-api-browser');
  } finally {
    if (cdp) {
      try { await cdp.call('Browser.close'); } catch (_) {}
      cdp.close();
    }
    if (browser.exitCode == null) {
      await Promise.race([
        new Promise(resolve => browser.once('exit', resolve)),
        wait(1000).then(() => { if (browser.exitCode == null) browser.kill(); })
      ]);
    }
    await new Promise(resolve => server.close(resolve));
    try {
      fs.rmSync(temporary, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    } catch (error) {
      // Edge/Windows иногда оставляет Crashpad с открытым profile lock уже после
      // Browser.close. Это не результат теста; системный TEMP будет очищен ОС.
      if (error.code !== 'EPERM') throw error;
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
