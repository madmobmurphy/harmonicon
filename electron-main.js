import { app, BrowserWindow, ipcMain, protocol, net, dialog } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let storagePath = '';
let CONFIG_FILE = '';

// Register Protocols for local file access
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
]);

function setupStorage() {
  const userDataPath = app.getPath('userData');
  CONFIG_FILE = path.join(userDataPath, "config.json");
  storagePath = path.join(userDataPath, "uploads");

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      if (config.storagePath) storagePath = config.storagePath;
    } catch (e) {
      console.error('[Main] Failed to read config:', e);
    }
  }

  if (!fs.existsSync(storagePath)) {
    try {
      fs.mkdirSync(storagePath, { recursive: true });
    } catch (e) {
      console.error('[Main] Failed to create storage directory:', e);
    }
  }
  
  console.log('[Main] Storage initialized at:', storagePath);
}

async function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Harmonicon',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'build', 'icon.png')
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  setupRPC();
}

// Discord RPC Setup — loaded dynamically so a failure never blocks the app window
const DISCORD_APP_ID = "1479049659245789196";
let rpcClient = null;

async function setupRPC() {
  try {
    const { default: RPC } = await import('discord-rpc');
    rpcClient = new RPC.Client({ transport: 'ipc' });
    rpcClient.on('ready', () => {
      rpcClient.setActivity({
        details: "Idle in Harmonicon",
        largeImageKey: "harmonicon_icon",
        largeImageText: "Harmonicon Audio App",
        instance: false,
      });
    });
    rpcClient.login({ clientId: DISCORD_APP_ID }).catch(() => {});
  } catch (e) {
    // Discord not running or module unavailable — safe to ignore
    console.warn('[RPC] Discord Rich Presence unavailable:', e.message);
  }
}

app.whenReady().then(() => {
  setupStorage();

  const isDev = process.env.NODE_ENV === 'development';

  // Handle 'app://' protocol for the UI
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let pathname = url.pathname;
      if (pathname === '/') pathname = '/index.html';
      
      const filePath = isDev 
        ? path.join(__dirname, pathname)
        : path.join(__dirname, 'dist', pathname);
      
      const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(isDev ? __dirname : path.join(__dirname, 'dist'), 'index.html');

      return net.fetch(pathToFileURL(finalPath).toString());
    } catch (e) {
      console.error('[Main] App protocol error:', e);
      return new Response('Error', { status: 500 });
    }
  });

  // Handle 'media://' protocol for audio files
  protocol.handle('media', async (request) => {
    try {
      const urlStr = request.url;
      console.log(`[Main] Media request: ${urlStr}`);

      // Robust path extraction
      // 1. Remove scheme and any leading slashes
      // If standard: true, media:/path becomes media://path/ or similar
      // We want to strip everything up to the start of the actual path
      let pathPart = urlStr.replace(/^media:[\/]+/, '');
      
      // 2. Decode URI components
      pathPart = decodeURIComponent(pathPart);
      
      // 3. Strip any leading slashes to prevent path.join from treating it as absolute on Linux
      pathPart = pathPart.replace(/^\/+/, '');
      
      let filePath = path.join(storagePath, pathPart);
      
      if (!fs.existsSync(filePath)) {
        console.log(`[Main] File not found at direct path: ${filePath}. Trying case-insensitive fallback...`);
        // Case-insensitive fallback
        const parts = pathPart.split(/[/\\]/);
        let currentPath = storagePath;
        let found = true;

        for (const part of parts) {
          if (!part) continue;
          if (!fs.existsSync(currentPath)) {
            found = false;
            break;
          }
          try {
            const items = fs.readdirSync(currentPath);
            const match = items.find(item => item.toLowerCase() === part.toLowerCase());
            if (match) {
              currentPath = path.join(currentPath, match);
            } else {
              found = false;
              break;
            }
          } catch (e) {
            found = false;
            break;
          }
        }
        
        if (found && fs.existsSync(currentPath)) {
          console.log(`[Main] Case-insensitive match found: ${currentPath}`);
          filePath = currentPath;
        }
      }

      if (!fs.existsSync(filePath)) {
        console.error(`[Main] 404 - File not found: ${filePath}`);
        return new Response('Not Found', { status: 404 });
      }

      // Explicit MIME types for better compatibility
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/opus',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.aac': 'audio/aac'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      // Use net.fetch to handle the file stream and range requests
      const response = await net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers
      });
      
      // Clone the response to modify headers if needed
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Content-Type', contentType);
      newHeaders.set('Access-Control-Allow-Origin', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (e) {
      console.error('[Main] Protocol Error:', e);
      return new Response('Error', { status: 500 });
    }
  });

  createWindow();
});

// IPC Handlers
ipcMain.handle('get-config', () => ({ storagePath }));

ipcMain.handle('select-directory', async () => {
  console.log('[Main] select-directory called');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  console.log('[Main] Directory selected:', result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle('set-config', (event, newPath) => {
  if (newPath) {
    try {
      storagePath = newPath;
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ storagePath }));
      console.log('[Main] Storage path updated to:', storagePath);
      return { success: true, storagePath };
    } catch (e) {
      console.error('[Main] Failed to update storage path:', e);
      return { error: e.message };
    }
  }
  return { error: 'Path required' };
});

ipcMain.handle('scan-library', async () => {
  try {
    const results = [];
    const scan = (dir, relativePath = '') => {
      try {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir);
        for (const item of items) {
          try {
            const fullPath = path.join(dir, item);
            const relPath = path.join(relativePath, item);
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
              results.push({ type: 'folder', name: item, path: relPath });
              scan(fullPath, relPath);
            } else if (stats.isFile()) {
              const isAudio = /\.(mp3|wav|ogg|m4a|flac|opus)$/i.test(item);
              if (isAudio) {
                results.push({ 
                  type: 'file', 
                  name: item, 
                  path: relPath, 
                  size: stats.size,
                  createdAt: stats.birthtimeMs
                });
              }
            }
          } catch (itemErr) {
            console.error(`[Main] Error scanning item ${item}:`, itemErr);
          }
        }
      } catch (dirErr) {
        console.error(`[Main] Error scanning directory ${dir}:`, dirErr);
      }
    };
    
    console.log('[Main] Scanning library at:', storagePath);
    if (fs.existsSync(storagePath)) {
      scan(storagePath);
    } else {
      console.warn('[Main] Storage path does not exist:', storagePath);
    }
    console.log(`[Main] Scan complete. Found ${results.length} items.`);
    return { success: true, items: results };
  } catch (e) {
    console.error('[Main] Scan error:', e);
    return { error: e.message };
  }
});

ipcMain.handle('upload-file', async (event, { name, data, relativeFolder = '' }) => {
  try {
    console.log(`[Main] Uploading file: ${name} to folder: ${relativeFolder}`);
    const targetDir = path.join(storagePath, relativeFolder);
    if (!fs.existsSync(targetDir)) {
      console.log(`[Main] Creating target directory: ${targetDir}`);
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const fileName = `${Date.now()}-${name.replace(/[^a-z0-9.]/gi, '_')}`;
    const filePath = path.join(targetDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(data));
    
    const finalRelPath = path.join(relativeFolder, fileName);
    console.log('[Main] File uploaded successfully to:', filePath);
    return { 
      success: true, 
      filename: fileName,
      originalname: name,
      path: `media:///${finalRelPath.replace(/\\/g, '/')}`
    };
  } catch (err) {
    console.error('[Main] Upload error:', err);
    return { error: err.message };
  }
});

ipcMain.handle('delete-physical-item', async (event, { relativePath, isFolder }) => {
  try {
    const fullPath = path.join(storagePath, relativePath);
    if (fs.existsSync(fullPath)) {
      if (isFolder) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      return { success: true };
    }
    return { error: 'File not found' };
  } catch (e) {
    console.error('[Main] Delete error:', e);
    return { error: e.message };
  }
});

ipcMain.handle('export-settings', async (event, { localStorageData, dbData }) => {
  try {
    const { default: AdmZip } = await import('adm-zip');

    const result = await dialog.showSaveDialog({
      title: 'Export Harmonicon Backup',
      defaultPath: `harmonicon-backup-${new Date().toISOString().slice(0, 10)}.harmonicon`,
      filters: [{ name: 'Harmonicon Backup', extensions: ['harmonicon'] }]
    });
    if (result.canceled) return { canceled: true };

    const zip = new AdmZip();

    // --- Manifest: localStorage snapshot + full DB dump ---
    const manifest = {
      version: '2.0.1',
      exportDate: new Date().toISOString(),
      localStorage: localStorageData,
      db: dbData
    };
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

    // --- All physical files from storagePath ---
    let fileCount = 0;
    const addDir = (dir, relBase = '') => {
      if (!fs.existsSync(dir)) return;
      for (const item of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, item);
        const relPath = relBase ? `${relBase}/${item}` : item;
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            addDir(fullPath, relPath);
          } else {
            zip.addFile(`files/${relPath}`, fs.readFileSync(fullPath));
            fileCount++;
          }
        } catch (e) {
          console.warn(`[Export] Skipping ${fullPath}:`, e.message);
        }
      }
    };
    addDir(storagePath);

    zip.writeZip(result.filePath);
    console.log(`[Export] Done — ${fileCount} files → ${result.filePath}`);
    return { success: true, filePath: result.filePath, fileCount };
  } catch (e) {
    console.error('[Export] Error:', e);
    return { error: e.message };
  }
});

ipcMain.handle('import-settings', async () => {
  try {
    const { default: AdmZip } = await import('adm-zip');

    const result = await dialog.showOpenDialog({
      title: 'Import Harmonicon Backup',
      filters: [{ name: 'Harmonicon Backup', extensions: ['harmonicon'] }],
      properties: ['openFile']
    });
    if (result.canceled) return { canceled: true };

    const zip = new AdmZip(result.filePaths[0]);

    // --- Read manifest ---
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) return { error: 'Invalid backup file: manifest.json missing.' };
    const manifest = JSON.parse(zip.readAsText(manifestEntry, 'utf-8'));

    // --- Restore physical files to current storagePath ---
    let fileCount = 0;
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith('files/') || entry.isDirectory) continue;
      const relPath = entry.entryName.slice('files/'.length).replace(/\//g, path.sep);
      const targetPath = path.join(storagePath, relPath);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetPath, entry.getData());
      fileCount++;
    }

    console.log(`[Import] Restored ${fileCount} files to ${storagePath}`);
    return { success: true, manifest, fileCount };
  } catch (e) {
    console.error('[Import] Error:', e);
    return { error: e.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
