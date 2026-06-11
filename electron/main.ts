import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { embedAnnotations } from './pdfAnnotator';

let mainWindow: BrowserWindow | null = null;

// Helper to get app data directories
function getNotesDir(): string {
  const dir = path.join(app.getPath('userData'), 'notes');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'llm-config.json');
}

function getAnnotationsDir(): string {
  const dir = path.join(app.getPath('userData'), 'annotations');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff\u3000-\u303f\uff00-\uffef.]/g, '_').replace(/\.pdf$/i, '');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Pisces',
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#2d2d2d',
      symbolColor: '#cccccc',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Build application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:openFile');
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(null); // Hide native menu — toolbar handles all actions

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===== IPC: File Dialog =====
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths.map(fp => ({ path: fp, name: path.basename(fp) }));
  }
  return [];
});

ipcMain.handle('pdf:readFile', async (_event, filePath: string) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString('base64');
  } catch (err) {
    console.error('Failed to read file:', err);
    return null;
  }
});

// ===== IPC: Notes =====
ipcMain.handle('notes:read', async (_event, pdfName: string) => {
  try {
    const filePath = path.join(getNotesDir(), `${sanitizeFileName(pdfName)}.md`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return '';
  } catch (err) {
    console.error('Failed to read note:', err);
    return '';
  }
});

ipcMain.handle('notes:save', async (_event, pdfName: string, content: string) => {
  try {
    const filePath = path.join(getNotesDir(), `${sanitizeFileName(pdfName)}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save note:', err);
    return false;
  }
});

ipcMain.handle('notes:list', async () => {
  try {
    const dir = getNotesDir();
    return fs.readdirSync(dir).filter((f: string) => f.endsWith('.md'));
  } catch {
    return [];
  }
});

ipcMain.handle('notes:delete', async (_event, pdfName: string) => {
  try {
    const filePath = path.join(getNotesDir(), `${sanitizeFileName(pdfName)}.md`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (err) {
    console.error('Failed to delete note:', err);
    return false;
  }
});

// ===== IPC: LLM Config =====
ipcMain.handle('llm:loadConfig', async () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    console.error('Failed to load LLM config:', err);
    return null;
  }
});

ipcMain.handle('llm:saveConfig', async (_event, config: unknown) => {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save LLM config:', err);
    return false;
  }
});

ipcMain.handle('llm:deleteConfig', async () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    return true;
  } catch (err) {
    console.error('Failed to delete LLM config:', err);
    return false;
  }
});

// ===== IPC: Annotations =====
ipcMain.handle('annotations:read', async (_event, pdfName: string) => {
  try {
    const filePath = path.join(getAnnotationsDir(), `${sanitizeFileName(pdfName)}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return [];
  } catch (err) {
    console.error('Failed to read annotations:', err);
    return [];
  }
});

ipcMain.handle('annotations:save', async (_event, pdfName: string, annotations: unknown[]) => {
  try {
    const filePath = path.join(getAnnotationsDir(), `${sanitizeFileName(pdfName)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(annotations, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save annotations:', err);
    return false;
  }
});

// ===== IPC: Bookmarks =====
function getBookmarksDir(): string {
  const dir = path.join(app.getPath('userData'), 'bookmarks');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('bookmarks:read', async (_event, pdfName: string) => {
  try {
    const filePath = path.join(getBookmarksDir(), `${sanitizeFileName(pdfName)}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return [];
  } catch { return []; }
});

ipcMain.handle('bookmarks:save', async (_event, pdfName: string, bookmarks: unknown[]) => {
  try {
    const filePath = path.join(getBookmarksDir(), `${sanitizeFileName(pdfName)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(bookmarks, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save bookmarks:', err);
    return false;
  }
});

// ===== IPC: Embed annotations into PDF =====
ipcMain.handle('pdf:embedAnnotations', async (_event, pdfFilePath: string, annotations: unknown[], bookmarks: unknown[]) => {
  try {
    if (!fs.existsSync(pdfFilePath)) {
      console.error('[Embed] PDF file not found:', pdfFilePath);
      return false;
    }
    // Create a backup before modifying
    const backupPath = pdfFilePath + '.bak';
    fs.copyFileSync(pdfFilePath, backupPath);

    const success = await embedAnnotations(
      pdfFilePath,
      annotations as any[],
      bookmarks as any[] | undefined
    );

    if (success) {
      // Remove backup on success
      try { fs.unlinkSync(backupPath); } catch { /* ignore */ }
    } else {
      // Restore from backup on failure
      fs.copyFileSync(backupPath, pdfFilePath);
      try { fs.unlinkSync(backupPath); } catch { /* ignore */ }
    }

    return success;
  } catch (err) {
    console.error('[Embed] Failed:', err);
    return false;
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file open from command line (file association)
app.on('open-file', async (_event, filePath) => {
  if (!mainWindow) return;
  mainWindow.webContents.send('pdf:opened', {
    path: filePath,
    name: path.basename(filePath),
  });
});

