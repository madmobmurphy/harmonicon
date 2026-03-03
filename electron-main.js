import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

function createWindow() {
  // Start the Express server
  // In production, we point to the compiled server.js
  const serverPath = path.join(__dirname, 'server.ts');
  
  // Use tsx to run the typescript server in dev/electron mode
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, NODE_ENV: 'production' },
    execArgv: ['--import', 'tsx']
  });

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
