"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const pdfAnnotator_1 = require("./pdfAnnotator");
let mainWindow = null;
// Helper to get app data directories
function getNotesDir() {
    const dir = path.join(electron_1.app.getPath('userData'), 'notes');
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function getConfigPath() {
    return path.join(electron_1.app.getPath('userData'), 'llm-config.json');
}
function getAnnotationsDir() {
    const dir = path.join(electron_1.app.getPath('userData'), 'annotations');
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff\u3000-\u303f\uff00-\uffef.]/g, '_').replace(/\.pdf$/i, '');
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
    // Build application menu
    const template = [
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
    const menu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(null); // Hide native menu — toolbar handles all actions
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// ===== IPC: File Dialog =====
electron_1.ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow)
        return [];
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
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
electron_1.ipcMain.handle('pdf:readFile', async (_event, filePath) => {
    try {
        const buffer = fs.readFileSync(filePath);
        return buffer.toString('base64');
    }
    catch (err) {
        console.error('Failed to read file:', err);
        return null;
    }
});
// ===== IPC: Notes =====
electron_1.ipcMain.handle('notes:read', async (_event, pdfName) => {
    try {
        const filePath = path.join(getNotesDir(), `${sanitizeFileName(pdfName)}.md`);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8');
        }
        return '';
    }
    catch (err) {
        console.error('Failed to read note:', err);
        return '';
    }
});
electron_1.ipcMain.handle('notes:save', async (_event, pdfName, content) => {
    try {
        const filePath = path.join(getNotesDir(), `${sanitizeFileName(pdfName)}.md`);
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    }
    catch (err) {
        console.error('Failed to save note:', err);
        return false;
    }
});
electron_1.ipcMain.handle('notes:list', async () => {
    try {
        const dir = getNotesDir();
        return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    }
    catch {
        return [];
    }
});
electron_1.ipcMain.handle('notes:delete', async (_event, pdfName) => {
    try {
        const filePath = path.join(getNotesDir(), `${sanitizeFileName(pdfName)}.md`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return true;
    }
    catch (err) {
        console.error('Failed to delete note:', err);
        return false;
    }
});
// ===== IPC: LLM Config =====
electron_1.ipcMain.handle('llm:loadConfig', async () => {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(data);
        }
        return null;
    }
    catch (err) {
        console.error('Failed to load LLM config:', err);
        return null;
    }
});
electron_1.ipcMain.handle('llm:saveConfig', async (_event, config) => {
    try {
        const configPath = getConfigPath();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        return true;
    }
    catch (err) {
        console.error('Failed to save LLM config:', err);
        return false;
    }
});
electron_1.ipcMain.handle('llm:deleteConfig', async () => {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
        return true;
    }
    catch (err) {
        console.error('Failed to delete LLM config:', err);
        return false;
    }
});
// ===== IPC: Annotations =====
electron_1.ipcMain.handle('annotations:read', async (_event, pdfName) => {
    try {
        const filePath = path.join(getAnnotationsDir(), `${sanitizeFileName(pdfName)}.json`);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        return [];
    }
    catch (err) {
        console.error('Failed to read annotations:', err);
        return [];
    }
});
electron_1.ipcMain.handle('annotations:save', async (_event, pdfName, annotations) => {
    try {
        const filePath = path.join(getAnnotationsDir(), `${sanitizeFileName(pdfName)}.json`);
        fs.writeFileSync(filePath, JSON.stringify(annotations, null, 2), 'utf-8');
        return true;
    }
    catch (err) {
        console.error('Failed to save annotations:', err);
        return false;
    }
});
// ===== IPC: Bookmarks =====
function getBookmarksDir() {
    const dir = path.join(electron_1.app.getPath('userData'), 'bookmarks');
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
}
electron_1.ipcMain.handle('bookmarks:read', async (_event, pdfName) => {
    try {
        const filePath = path.join(getBookmarksDir(), `${sanitizeFileName(pdfName)}.json`);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        return [];
    }
    catch {
        return [];
    }
});
electron_1.ipcMain.handle('bookmarks:save', async (_event, pdfName, bookmarks) => {
    try {
        const filePath = path.join(getBookmarksDir(), `${sanitizeFileName(pdfName)}.json`);
        fs.writeFileSync(filePath, JSON.stringify(bookmarks, null, 2), 'utf-8');
        return true;
    }
    catch (err) {
        console.error('Failed to save bookmarks:', err);
        return false;
    }
});
// ===== IPC: Embed annotations into PDF =====
electron_1.ipcMain.handle('pdf:embedAnnotations', async (_event, pdfFilePath, annotations, bookmarks) => {
    try {
        if (!fs.existsSync(pdfFilePath)) {
            console.error('[Embed] PDF file not found:', pdfFilePath);
            return false;
        }
        // Create a backup before modifying
        const backupPath = pdfFilePath + '.bak';
        fs.copyFileSync(pdfFilePath, backupPath);
        const success = await (0, pdfAnnotator_1.embedAnnotations)(pdfFilePath, annotations, bookmarks);
        if (success) {
            // Remove backup on success
            try {
                fs.unlinkSync(backupPath);
            }
            catch { /* ignore */ }
        }
        else {
            // Restore from backup on failure
            fs.copyFileSync(backupPath, pdfFilePath);
            try {
                fs.unlinkSync(backupPath);
            }
            catch { /* ignore */ }
        }
        return success;
    }
    catch (err) {
        console.error('[Embed] Failed:', err);
        return false;
    }
});
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// Handle file open from command line (file association)
electron_1.app.on('open-file', async (_event, filePath) => {
    if (!mainWindow)
        return;
    mainWindow.webContents.send('pdf:opened', {
        path: filePath,
        name: path.basename(filePath),
    });
});
