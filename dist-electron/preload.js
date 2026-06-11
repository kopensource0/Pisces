"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    openFile: () => electron_1.ipcRenderer.invoke('dialog:openFile'),
    readFileAsBase64: (filePath) => electron_1.ipcRenderer.invoke('pdf:readFile', filePath),
    // Menu events
    onMenuOpenFile: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('menu:openFile', handler);
        return () => { electron_1.ipcRenderer.removeListener('menu:openFile', handler); };
    },
    onPdfOpened: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on('pdf:opened', handler);
        return () => { electron_1.ipcRenderer.removeListener('pdf:opened', handler); };
    },
    // Notes
    readNote: (pdfName) => electron_1.ipcRenderer.invoke('notes:read', pdfName),
    saveNote: (pdfName, content) => electron_1.ipcRenderer.invoke('notes:save', pdfName, content),
    listNotes: () => electron_1.ipcRenderer.invoke('notes:list'),
    deleteNote: (pdfName) => electron_1.ipcRenderer.invoke('notes:delete', pdfName),
    // LLM Config
    loadLLMConfig: () => electron_1.ipcRenderer.invoke('llm:loadConfig'),
    saveLLMConfig: (config) => electron_1.ipcRenderer.invoke('llm:saveConfig', config),
    deleteLLMConfig: () => electron_1.ipcRenderer.invoke('llm:deleteConfig'),
    // Annotations
    readAnnotations: (pdfName) => electron_1.ipcRenderer.invoke('annotations:read', pdfName),
    saveAnnotations: (pdfName, annotations) => electron_1.ipcRenderer.invoke('annotations:save', pdfName, annotations),
    // Bookmarks
    readBookmarks: (pdfName) => electron_1.ipcRenderer.invoke('bookmarks:read', pdfName),
    saveBookmarks: (pdfName, bookmarks) => electron_1.ipcRenderer.invoke('bookmarks:save', pdfName, bookmarks),
    // PDF embedding — write annotations/bookmarks directly into the PDF file
    embedAnnotations: (pdfFilePath, annotations, bookmarks) => electron_1.ipcRenderer.invoke('pdf:embedAnnotations', pdfFilePath, annotations, bookmarks),
});
