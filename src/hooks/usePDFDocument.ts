import { useState, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface BookmarkNode {
  title: string;
  dest: string | unknown[] | null;
  bold: boolean;
  italic: boolean;
  items: BookmarkNode[];
}

export interface SearchResult {
  page: number;
  text: string;
  matchIndex: number;
}

export interface TabEntry {
  id: string;
  filePath: string;
  fileName: string;
}

interface TabState {
  pdfDocument: PDFDocumentProxy | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  outline: BookmarkNode[];
  searchResults: SearchResult[];
}

export interface UsePDFDocumentReturn {
  // Active document state
  pdfDocument: PDFDocumentProxy | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  outline: BookmarkNode[];
  searchResults: SearchResult[];
  fileName: string;
  isSearching: boolean;

  // Tab management
  tabs: TabEntry[];
  activeTabId: string;

  // Actions
  openDocuments: (files: { path: string; name: string }[]) => Promise<void>;
  openDocumentFromData: (data: Uint8Array, name: string, filePath: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setZoom: (zoom: number) => void;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  goToBookmark: (dest: string | unknown[] | null) => Promise<void>;
  fitWidth: (containerWidth: number) => Promise<void>;
  fitPage: (containerWidth: number, containerHeight: number) => Promise<void>;
}

const DEFAULT_TAB_STATE: TabState = {
  pdfDocument: null,
  currentPage: 1,
  totalPages: 0,
  zoom: 1.0,
  outline: [],
  searchResults: [],
};

let tabCounter = 0;
function newTabId(): string {
  return `tab-${++tabCounter}-${Date.now()}`;
}

export function usePDFDocument(): UsePDFDocumentReturn {
  // Per-tab state storage
  const tabStatesRef = useRef<Map<string, TabState>>(new Map());
  const docRefs = useRef<Map<string, PDFDocumentProxy>>(new Map());

  const [tabs, setTabs] = useState<TabEntry[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);

  // Active tab's state (rendered)
  const [activeState, setActiveState] = useState<TabState>(DEFAULT_TAB_STATE);

  // Get a snapshot of active state
  const getActiveState = useCallback((): TabState => {
    return { ...activeState };
  }, [activeState]);

  // Save current active state back to tab map
  const saveActiveState = useCallback((tabId: string) => {
    if (!tabId) return;
    const state = getActiveState();
    tabStatesRef.current.set(tabId, state);
  }, [getActiveState]);

  // Load a PDF document from data
  const loadPdf = useCallback(async (data: Uint8Array | ArrayBuffer | unknown): Promise<PDFDocumentProxy> => {
    let pdfData: Uint8Array;
    if (data instanceof Uint8Array) {
      pdfData = data;
    } else if (data instanceof ArrayBuffer) {
      pdfData = new Uint8Array(data);
    } else if (data && typeof data === 'object' && 'buffer' in data) {
      pdfData = new Uint8Array((data as { buffer: ArrayBuffer }).buffer);
    } else {
      throw new Error('Invalid PDF data type');
    }

    const loadingTask = pdfjsLib.getDocument({ data: pdfData } as Parameters<typeof pdfjsLib.getDocument>[0]);
    const doc = await loadingTask.promise;
    return doc;
  }, []);

  // Parse outline from PDF
  const parseOutline = useCallback(async (doc: PDFDocumentProxy): Promise<BookmarkNode[]> => {
    try {
      const outlineData = await doc.getOutline();
      if (!outlineData) return [];
      const mapOutline = (items: Array<{ title: string; dest: string | unknown[] | null; bold: boolean; italic: boolean; items: unknown[] }>): BookmarkNode[] => {
        return items.map(item => ({
          title: item.title,
          dest: item.dest,
          bold: item.bold,
          italic: item.italic,
          items: item.items ? mapOutline(item.items as typeof items) : [],
        }));
      };
      return mapOutline(outlineData as Parameters<typeof mapOutline>[0]);
    } catch {
      return [];
    }
  }, []);

  // Open multiple documents (from file dialog)
  const openDocuments = useCallback(async (files: { path: string; name: string }[]) => {
    for (const file of files) {
      // Check if already open
      const existing = tabs.find(t => t.filePath === file.path);
      if (existing) {
        // Switch to existing tab instead of reopening
        // (we need to handle this outside since we need current state)
        continue;
      }

      try {
        if (!window.electronAPI) continue;
        const base64 = await window.electronAPI.readFileAsBase64(file.path);
        if (!base64) continue;

        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const doc = await loadPdf(bytes);
        const outline = await parseOutline(doc);
        const id = newTabId();

        docRefs.current.set(id, doc);
        tabStatesRef.current.set(id, {
          pdfDocument: doc,
          currentPage: 1,
          totalPages: doc.numPages,
          zoom: 1.0,
          outline,
          searchResults: [],
        });

        setTabs(prev => [...prev, { id, filePath: file.path, fileName: file.name }]);
        // Switch to newly opened tab
        setActiveTabId(prev => {
          if (prev) saveActiveState(prev);
          return id;
        });
      } catch (err) {
        console.error('Failed to open PDF:', file.name, err);
      }
    }
    // Apply the last opened tab's state
    // This is handled by the effect below
  }, [tabs, loadPdf, parseOutline, saveActiveState]);

  // Open a document from raw data (e.g., drag and drop)
  const openDocumentFromData = useCallback(async (data: Uint8Array, name: string, filePath: string) => {
    try {
      const doc = await loadPdf(data);
      const outline = await parseOutline(doc);
      const id = newTabId();

      docRefs.current.set(id, doc);
      tabStatesRef.current.set(id, {
        pdfDocument: doc,
        currentPage: 1,
        totalPages: doc.numPages,
        zoom: 1.0,
        outline,
        searchResults: [],
      });

      setTabs(prev => [...prev, { id, filePath, fileName: name }]);
      setActiveTabId(prev => {
        if (prev) saveActiveState(prev);
        return id;
      });
    } catch (err) {
      console.error('Failed to open PDF document:', err);
    }
  }, [loadPdf, parseOutline, saveActiveState]);

  // When activeTabId changes, apply its state
  // We use a ref to track if we need to apply
  const lastAppliedRef = useRef<string>('');
  if (activeTabId && activeTabId !== lastAppliedRef.current) {
    lastAppliedRef.current = activeTabId;
    // We can't call setState during render directly; use a trick
    // Actually, we schedule the apply in a microtask
    const state = tabStatesRef.current.get(activeTabId);
    if (state) {
      // Direct assignment is fine for immediate render update
      queueMicrotask(() => setActiveState({ ...state }));
    }
  }

  // Close a tab
  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const newTabs = prev.filter(t => t.id !== tabId);

      // Clean up document
      const doc = docRefs.current.get(tabId);
      if (doc) {
        doc.loadingTask.destroy().catch(() => {});
        docRefs.current.delete(tabId);
      }
      tabStatesRef.current.delete(tabId);

      if (tabId === activeTabId) {
        // Switch to neighbor tab
        const newActive = newTabs[Math.min(idx, newTabs.length - 1)];
        if (newActive) {
          lastAppliedRef.current = ''; // force re-apply
          setActiveTabId(newActive.id);
        } else {
          setActiveTabId('');
          setActiveState(DEFAULT_TAB_STATE);
          lastAppliedRef.current = '';
        }
      }

      return newTabs;
    });
  }, [activeTabId]);

  // Switch tab
  const switchTab = useCallback((tabId: string) => {
    if (tabId === activeTabId) return;
    saveActiveState(activeTabId);
    lastAppliedRef.current = ''; // force re-apply
    setActiveTabId(tabId);
  }, [activeTabId, saveActiveState]);

  // Active document ref
  const activeDocRef = activeState.pdfDocument;

  // Update active state helper
  const updateActive = useCallback((partial: Partial<TabState>) => {
    setActiveState(prev => {
      const next = { ...prev, ...partial };
      // Also update the ref map
      if (activeTabId) {
        tabStatesRef.current.set(activeTabId, next);
      }
      return next;
    });
  }, [activeTabId]);

  const goToPage = useCallback((page: number) => {
    const max = activeDocRef?.numPages || 1;
    updateActive({ currentPage: Math.max(1, Math.min(page, max)) });
  }, [activeDocRef, updateActive]);

  const nextPage = useCallback(() => {
    setActiveState(prev => {
      const max = activeDocRef?.numPages || prev.currentPage;
      const next = { ...prev, currentPage: Math.min(prev.currentPage + 1, max) };
      if (activeTabId) tabStatesRef.current.set(activeTabId, next);
      return next;
    });
  }, [activeDocRef, activeTabId]);

  const prevPage = useCallback(() => {
    setActiveState(prev => {
      const next = { ...prev, currentPage: Math.max(prev.currentPage - 1, 1) };
      if (activeTabId) tabStatesRef.current.set(activeTabId, next);
      return next;
    });
  }, [activeTabId]);

  const setZoom = useCallback((newZoom: number) => {
    const clamped = Math.max(0.25, Math.min(5.0, newZoom));
    updateActive({ zoom: clamped });
  }, [updateActive]);

  const goToBookmark = useCallback(async (dest: string | unknown[] | null) => {
    if (!activeDocRef || !dest) return;
    try {
      let destination: unknown[] | null = null;
      if (typeof dest === 'string') {
        destination = await activeDocRef.getDestination(dest);
      } else {
        destination = dest;
      }
      if (destination && Array.isArray(destination)) {
        const ref = destination[0];
        const pageIndex = await activeDocRef.getPageIndex(ref as { num: number; gen: number });
        updateActive({ currentPage: pageIndex + 1 });
      }
    } catch (err) {
      console.error('Failed to navigate to bookmark:', err);
    }
  }, [activeDocRef, updateActive]);

  const search = useCallback(async (query: string) => {
    if (!activeDocRef || !query.trim()) {
      updateActive({ searchResults: [] });
      return;
    }

    setIsSearching(true);
    const results: SearchResult[] = [];
    const doc = activeDocRef;
    const lowerQuery = query.toLowerCase();

    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const items = textContent.items as Array<{ str: string }>;
        const pageText = items.map(item => item.str).join(' ');
        const lowerText = pageText.toLowerCase();

        let idx = lowerText.indexOf(lowerQuery);
        let matchCount = 0;
        while (idx !== -1 && matchCount < 10) {
          const start = Math.max(0, idx - 30);
          const end = Math.min(pageText.length, idx + query.length + 30);
          results.push({
            page: i,
            text: pageText.substring(start, end),
            matchIndex: matchCount,
          });
          idx = lowerText.indexOf(lowerQuery, idx + 1);
          matchCount++;
        }
      } catch (err) {
        console.error(`Error searching page ${i}:`, err);
      }
    }

    updateActive({ searchResults: results });
    setIsSearching(false);
  }, [activeDocRef, updateActive]);

  const clearSearch = useCallback(() => {
    updateActive({ searchResults: [] });
  }, [updateActive]);

  const fitWidth = useCallback(async (containerWidth: number) => {
    if (!activeDocRef) return;
    try {
      const page = await activeDocRef.getPage(activeState.currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const newZoom = (containerWidth - 40) / viewport.width;
      setZoom(newZoom);
    } catch (err) {
      console.error('Fit width error:', err);
    }
  }, [activeDocRef, activeState.currentPage, setZoom]);

  const fitPage = useCallback(async (containerWidth: number, containerHeight: number) => {
    if (!activeDocRef) return;
    try {
      const page = await activeDocRef.getPage(activeState.currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const zoomW = (containerWidth - 40) / viewport.width;
      const zoomH = (containerHeight - 40) / viewport.height;
      setZoom(Math.min(zoomW, zoomH));
    } catch (err) {
      console.error('Fit page error:', err);
    }
  }, [activeDocRef, activeState.currentPage, setZoom]);

  // Find active file name
  const activeTab = tabs.find(t => t.id === activeTabId);
  const fileName = activeTab?.fileName || '';

  return {
    pdfDocument: activeState.pdfDocument,
    currentPage: activeState.currentPage,
    totalPages: activeState.totalPages,
    zoom: activeState.zoom,
    outline: activeState.outline,
    searchResults: activeState.searchResults,
    fileName,
    isSearching,
    tabs,
    activeTabId,
    openDocuments,
    openDocumentFromData,
    closeTab,
    switchTab,
    goToPage,
    nextPage,
    prevPage,
    setZoom,
    search,
    clearSearch,
    goToBookmark,
    fitWidth,
    fitPage,
  };
}
