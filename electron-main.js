import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

function createWindow() {
  // In production (packaged app), use the pre-compiled server.cjs bundle.
  // In development, use tsx to run server.ts directly.
  const serverPath = app.isPackaged
    ? path.join(__dirname, 'server.cjs')
    : path.join(__dirname, 'server.ts');

  const forkOptions = app.isPackaged
    ? {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          USERDATA_PATH: app.getPath('userData'),
        },
      }
    : {
        env: { ...process.env, NODE_ENV: 'production' },
        execArgv: ['--import', 'tsx'],
      };

  serverProcess = fork(serverPath, [], forkOptions);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Harmonicon',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'build', 'icon.png')
  });

  // Wait a bit for the server to start
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) serverProcess.kill();
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
