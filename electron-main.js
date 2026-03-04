import { app, BrowserWindow, utilityProcess } from 'electron';
import { fork } from 'child_process';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

// Poll /api/health until the server is ready, then resolve.
// Retries every 500 ms for up to 20 seconds before rejecting.
function waitForServer(port = 3000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 40;

    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else next();
      });
      req.on('error', next);
      req.end();
    };

    const next = () => {
      if (++attempts >= maxAttempts) {
        reject(new Error('Server did not become ready within 20 s'));
      } else {
        setTimeout(check, 500);
      }
    };

    // Small initial pause to let the process start up
    setTimeout(check, 300);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Harmonicon',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'build', 'icon.png'),
  });

  if (app.isPackaged) {
    // Production: use the pre-compiled ESM bundle via Electron's utilityProcess.
    // utilityProcess is the recommended Electron API for Node.js child processes
    // in packaged apps — it correctly resolves paths inside the app bundle.
    const serverPath = path.join(__dirname, 'server.mjs');
    serverProcess = utilityProcess.fork(serverPath, [], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Pass a writable user-data directory so the server can store
        // config.json and uploaded audio files outside the install dir.
        USERDATA_PATH: app.getPath('userData'),
      },
    });
    serverProcess.on('exit', (code) => {
      console.error(`[harmonicon] server process exited with code ${code}`);
    });
  } else {
    // Development: run server.ts directly using tsx.
    const serverPath = path.join(__dirname, 'server.ts');
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, NODE_ENV: 'production' },
      execArgv: ['--import', 'tsx'],
    });
  }

  try {
    await waitForServer();
    mainWindow.loadURL('http://localhost:3000');
  } catch (err) {
    console.error('[harmonicon] server startup failed:', err.message);
    mainWindow.loadURL(
      `data:text/html,<body style="background:%230a0a0a;color:%23fff;font-family:sans-serif;padding:40px">` +
        `<h2>Server failed to start</h2><pre>${err.message}</pre></body>`
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) {
      if (typeof serverProcess.kill === 'function') serverProcess.kill();
    }
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
