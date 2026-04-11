#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, 'launcher-config.json');
const LIVE_FILE = path.join(ROOT, 'LIVE_DEMO_URL.txt');
const http = require('http');
const url = require('url');

function loadConfig() {
  let cfg = {
    port: 3000,
    preferredTunnel: 'ngrok',
    ngrokAuthtoken: '',
    openBrowser: true,
    serverCmd: 'node src/server/index.js',
    waitTimeoutMs: 60_000
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const file = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(file);
      cfg = Object.assign(cfg, parsed);
    }
  } catch (e) {
    console.warn('Warning: failed to load launcher-config.json:', e.message);
  }
  return cfg;
}

function openUrl(url) {
  const plat = process.platform;
  if (!url) return;
  try {
    let child;
    if (plat === 'darwin') child = spawn('open', [url], { detached: true });
    else if (plat === 'win32') child = spawn('cmd', ['/c', 'start', '', url], { detached: true });
    else child = spawn('xdg-open', [url], { detached: true });
    if (child && typeof child.on === 'function') {
      child.on('error', (err) => {
        console.error('Failed to open browser (child error):', err && err.message ? err.message : err);
      });
      try { child.unref(); } catch (e) {}
    }
  } catch (e) {
    console.error('Failed to open browser:', e.message);
  }
}

function waitForLiveUrl(filePath, timeout) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const iv = setInterval(() => {
      if (fs.existsSync(filePath)) {
        try {
          const url = fs.readFileSync(filePath, 'utf8').trim();
          clearInterval(iv);
          resolve(url);
        } catch (e) {
          clearInterval(iv);
          reject(e);
        }
      } else if (Date.now() - start > timeout) {
        clearInterval(iv);
        reject(new Error('Timed out waiting for LIVE_DEMO_URL.txt'));
      }
    }, 300);
  });
}

async function main() {
  const cfg = loadConfig();
  console.log('Launcher config:', { port: cfg.port, preferredTunnel: cfg.preferredTunnel });
  // If dependencies are missing, start a small loader web UI that can trigger `npm install`.
  const nodeModulesPath = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('Dependencies appear missing. Starting installer UI...');
    const loaderPort = process.env.LOADER_PORT || 3333;

    // Simple SSE clients set
    const clients = new Set();

    const loaderHtmlPath = path.join(__dirname, 'loader.html');
    const loaderHtml = fs.existsSync(loaderHtmlPath) ? fs.readFileSync(loaderHtmlPath, 'utf8') : '<html><body>Installer UI missing</body></html>';

    let installInProgress = false;
    let installPromise = null;

    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      if (req.method === 'GET' && parsed.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(loaderHtml);
        return;
      }

      if (req.method === 'GET' && parsed.pathname === '/events') {
        // SSE
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('retry: 10000\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      if (req.method === 'POST' && parsed.pathname === '/install') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (installInProgress) {
          res.end(JSON.stringify({ status: 'already-running' }));
          return;
        }
        installInProgress = true;

        // spawn npm install
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const installer = spawn(npm, ['install'], { cwd: ROOT, env: process.env });

        installer.stdout.on('data', (chunk) => {
          const text = chunk.toString();
          for (const c of clients) {
            try { c.write(`data: ${JSON.stringify({ type: 'log', text })}\n\n`); } catch (e) {}
          }
        });
        installer.stderr.on('data', (chunk) => {
          const text = chunk.toString();
          for (const c of clients) {
            try { c.write(`data: ${JSON.stringify({ type: 'log', text })}\n\n`); } catch (e) {}
          }
        });
        installPromise = new Promise((resolve) => {
          installer.on('close', (code) => {
            const success = code === 0;
            for (const c of clients) {
              try { c.write(`data: ${JSON.stringify({ type: 'done', success })}\n\n`); } catch (e) {}
            }
            resolve(success);
          });
        });
        res.end(JSON.stringify({ status: 'started' }));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(loaderPort, '127.0.0.1', () => {
      const loaderUrl = `http://localhost:${loaderPort}`;
      console.log('Installer UI running at', loaderUrl);
      openUrl(loaderUrl);
    });

    // wait for install to finish (triggered by user via loader UI) before continuing
    if (!installPromise) {
      // Poll for installPromise to be created (user clicked Install)
      let waited = 0;
      while (!installPromise && waited < cfg.waitTimeoutMs) {
        // busy-wait with sleep
        await new Promise((r) => setTimeout(r, 300));
        waited += 300;
      }
    }

    if (installPromise) {
      const ok = await installPromise;
      server.close();
      if (!ok) {
        console.error('Dependency install failed. Exiting.');
        process.exit(1);
      }
      console.log('Dependencies installed. Continuing launch.');
    } else {
      console.error('Install was not triggered within timeout. Exiting.');
      server.close();
      process.exit(1);
    }
  }

  // Prepare env for child server process
  const env = Object.assign({}, process.env);
  env.PORT = String(cfg.port);
  env.TUNNEL = cfg.preferredTunnel;
  if (cfg.ngrokAuthtoken) env.NGROK_AUTHTOKEN = cfg.ngrokAuthtoken;

  // spawn the server using node directly so we inherit local code
  const serverPath = path.join(ROOT, 'src', 'server', 'index.js');
  const nodeArgs = [serverPath];
  const child = spawn(process.execPath, nodeArgs, { cwd: ROOT, env, stdio: 'inherit' });

  function cleanupAndExit(code) {
    try { child.kill(); } catch (e) {}
    process.exit(code || 0);
  }

  process.on('SIGINT', () => cleanupAndExit(0));
  process.on('SIGTERM', () => cleanupAndExit(0));

  // Wait for LIVE_DEMO_URL.txt then open browser
  try {
    const url = await waitForLiveUrl(LIVE_FILE, cfg.waitTimeoutMs);
    console.log('Public URL detected:', url);
    if (cfg.openBrowser) openUrl(url);
    console.log('Server and tunnel running. Close this window to stop.');
  } catch (e) {
    console.error('Launcher error:', e.message);
    console.log('Server might still be running. Check logs.');
  }

  // keep running until child exits
  child.on('exit', (code) => {
    try { if (fs.existsSync(LIVE_FILE)) fs.unlinkSync(LIVE_FILE); } catch (e) {}
    process.exit(code || 0);
  });
}

main();
