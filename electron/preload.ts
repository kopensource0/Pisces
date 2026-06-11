import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile') as Promise<{ path: string; name: string }[]>,
  readFileAsBase64: (filePath: string) => ipcRenderer.invoke('pdf:readFile', filePath) as Promise<string | null>,

  // Menu events
  onMenuOpenFile: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:openFile', handler);
    return () => { ipcRenderer.removeListener('menu:openFile', handler); };
  },
  onPdfOpened: (callback: (data: { path: string; name: string }) => void) => {
    const handler = (_event: unknown, data: { path: string; name: string }) => callback(data);
    ipcRenderer.on('pdf:opened', handler);
    return () => { ipcRenderer.removeListener('pdf:opened', handler); };
  },

  // Notes
  readNote: (pdfName: string) => ipcRenderer.invoke('notes:read', pdfName) as Promise<string>,
  saveNote: (pdfName: string, content: string) => ipcRenderer.invoke('notes:save', pdfName, content) as Promise<boolean>,
  listNotes: () => ipcRenderer.invoke('notes:list') as Promise<string[]>,
  deleteNote: (pdfName: string) => ipcRenderer.invoke('notes:delete', pdfName) as Promise<boolean>,

  // LLM Config
  loadLLMConfig: () => ipcRenderer.invoke('llm:loadConfig') as Promise<Record<string, unknown> | null>,
  saveLLMConfig: (config: unknown) => ipcRenderer.invoke('llm:saveConfig', config) as Promise<boolean>,
  deleteLLMConfig: () => ipcRenderer.invoke('llm:deleteConfig') as Promise<boolean>,

  // Annotations
  readAnnotations: (pdfName: string) => ipcRenderer.invoke('annotations:read', pdfName) as Promise<unknown[]>,
  saveAnnotations: (pdfName: string, annotations: unknown[]) => ipcRenderer.invoke('annotations:save', pdfName, annotations) as Promise<boolean>,

  // Bookmarks
  readBookmarks: (pdfName: string) => ipcRenderer.invoke('bookmarks:read', pdfName) as Promise<unknown[]>,
  saveBookmarks: (pdfName: string, bookmarks: unknown[]) => ipcRenderer.invoke('bookmarks:save', pdfName, bookmarks) as Promise<boolean>,

  // PDF embedding — write annotations/bookmarks directly into the PDF file
  embedAnnotations: (pdfFilePath: string, annotations: unknown[], bookmarks: unknown[]) =>
    ipcRenderer.invoke('pdf:embedAnnotations', pdfFilePath, annotations, bookmarks) as Promise<boolean>,
});
