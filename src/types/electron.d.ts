export interface ElectronAPI {
  // File operations
  openFile: () => Promise<{ path: string; name: string }[]>;
  readFileAsBase64: (filePath: string) => Promise<string | null>;

  // Menu events
  onMenuOpenFile: (callback: () => void) => () => void;
  onPdfOpened: (callback: (data: { path: string; name: string }) => void) => () => void;

  // Notes
  readNote: (pdfName: string) => Promise<string>;
  saveNote: (pdfName: string, content: string) => Promise<boolean>;
  listNotes: () => Promise<string[]>;
  deleteNote: (pdfName: string) => Promise<boolean>;

  // LLM Config
  loadLLMConfig: () => Promise<Record<string, unknown> | null>;
  saveLLMConfig: (config: unknown) => Promise<boolean>;
  deleteLLMConfig: () => Promise<boolean>;

  // Annotations
  readAnnotations: (pdfName: string) => Promise<unknown[]>;
  saveAnnotations: (pdfName: string, annotations: unknown[]) => Promise<boolean>;

  // Bookmarks
  readBookmarks: (pdfName: string) => Promise<unknown[]>;
  saveBookmarks: (pdfName: string, bookmarks: unknown[]) => Promise<boolean>;

  // PDF embedding
  embedAnnotations: (pdfFilePath: string, annotations: unknown[], bookmarks: unknown[]) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
