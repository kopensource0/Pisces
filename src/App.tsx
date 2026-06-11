import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePDFDocument } from './hooks/usePDFDocument';
import { useNotes } from './hooks/useNotes';
import { useLLMConfig } from './hooks/useLLMConfig';
import { useLLMChat } from './hooks/useLLMChat';
import { useAnnotations } from './hooks/useAnnotations';
import { useBookmarks } from './hooks/useBookmarks';
import type { ToolExecutorContext } from './services/toolExecutor';
import { PDFViewer } from './components/PDFViewer';

// Resize limits
const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 500;
const MIN_PANEL = 280;
const MAX_PANEL = 700;
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { SearchPanel } from './components/SearchPanel';
import { NotesPanel } from './components/NotesPanel';
import { ChatPanel } from './components/ChatPanel';
import { LLMSettings } from './components/LLMSettings';
import './App.css';

function App() {
  const {
    pdfDocument,
    currentPage,
    totalPages,
    zoom,
    outline,
    searchResults,
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
  } = usePDFDocument();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [textTool, setTextTool] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [notesWidth, setNotesWidth] = useState(400);
  const [chatWidth, setChatWidth] = useState(360);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Resize handlers
  const startResize = useCallback((
    setter: React.Dispatch<React.SetStateAction<number>>,
    min: number, max: number, direction: 'left' | 'right' = 'left',
  ) => {
    const handleMove = (e: MouseEvent) => {
      setter(prev => {
        const delta = direction === 'left' ? e.movementX : -e.movementX;
        return Math.min(max, Math.max(min, prev + delta));
      });
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, []);

  const startSidebarResize = useCallback(() => startResize(setSidebarWidth, MIN_SIDEBAR, MAX_SIDEBAR, 'left'), [startResize]);
  const startNotesResize = useCallback(() => startResize(setNotesWidth, MIN_PANEL, MAX_PANEL, 'right'), [startResize]);
  const startChatResize = useCallback(() => startResize(setChatWidth, MIN_PANEL, MAX_PANEL, 'right'), [startResize]);

  // Notes
  const notes = useNotes(fileName);

  // Annotations
  const annotations = useAnnotations(fileName);

  // Bookmarks
  const { bookmarks, toggleBookmark, removeBookmark, renameBookmark, isBookmarked } = useBookmarks(fileName);

  // LLM Config
  const llmConfig = useLLMConfig();

  // LLM Chat
  const chat = useLLMChat();

  // Set up tool executor context for LLM chat
  useEffect(() => {
    const ctx: ToolExecutorContext = {
      pdfDocument,
      addAnnotation: annotations.addAnnotation,
      updateAnnotationComment: annotations.updateAnnotationComment,
      addBookmark: (page: number, label?: string) => {
        // Only add if not already bookmarked (toggleBookmark would remove it)
        if (!isBookmarked(page)) {
          toggleBookmark(page, label);
        }
      },
      renameBookmark,
      goToPage,
    };
    chat.setToolContext(ctx);
  }, [pdfDocument, annotations.addAnnotation, annotations.updateAnnotationComment, isBookmarked, toggleBookmark, renameBookmark, goToPage, chat.setToolContext]);

  // Disable text tool when switching away
  const toggleTextTool = useCallback(() => {
    setTextTool(prev => !prev);
  }, []);

  // Toggle bookmark for current page
  const toggleCurrentBookmark = useCallback(() => {
    if (pdfDocument) {
      toggleBookmark(currentPage);
    }
  }, [pdfDocument, currentPage, toggleBookmark]);

  // Close other right panels when opening one
  const toggleNotes = useCallback(() => {
    setNotesOpen(prev => {
      if (!prev) { setSearchOpen(false); setChatOpen(false); }
      return !prev;
    });
  }, []);

  const toggleChat = useCallback(() => {
    setChatOpen(prev => {
      if (!prev) { setSearchOpen(false); setNotesOpen(false); }
      return !prev;
    });
  }, []);

  // Handle file open via Electron dialog (multi-file)
  const handleOpenFile = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const files = await window.electronAPI.openFile();
      if (files.length === 0) return;
      await openDocuments(files);
    } catch (err) {
      console.error('Error opening file:', err);
    }
  }, [openDocuments]);

  // Listen for File > Open menu click
  useEffect(() => {
    if (!window.electronAPI) return;
    const cleanup = window.electronAPI.onMenuOpenFile(() => {
      handleOpenFile();
    });
    return cleanup;
  }, [handleOpenFile]);

  // Listen for file association (single file opened externally)
  useEffect(() => {
    if (!window.electronAPI) return;
    const cleanup = window.electronAPI.onPdfOpened(async (info) => {
      await openDocuments([info]);
    });
    return cleanup;
  }, [openDocuments]);

  // Handle drag and drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const buffer = await file.arrayBuffer();
          await openDocumentFromData(new Uint8Array(buffer), file.name, (file as File & { path?: string }).path || file.name);
        }
      }
    },
    [openDocumentFromData]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        handleOpenFile();
      } else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      } else if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleCurrentBookmark();
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx >= 0 && tabs.length > 1) {
          const nextIdx = e.shiftKey
            ? (idx - 1 + tabs.length) % tabs.length
            : (idx + 1) % tabs.length;
          switchTab(tabs[nextIdx].id);
        }
      } else if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (!e.ctrlKey) prevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (!e.ctrlKey) nextPage();
      } else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom(zoom + 0.1);
      } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        setZoom(zoom - 0.1);
      } else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
      } else if (e.key === 't' && !e.ctrlKey && !e.altKey) {
        setTextTool(prev => !prev);
      } else if (e.key === 'Escape') {
        setTextTool(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenFile, prevPage, nextPage, setZoom, zoom, tabs, activeTabId, switchTab, closeTab, toggleCurrentBookmark]);

  const handleWheel = useCallback(
    (deltaY: number) => {
      const delta = deltaY > 0 ? -0.1 : 0.1;
      setZoom(zoom + delta);
    },
    [zoom, setZoom]
  );

  const handleFitWidth = useCallback(() => {
    if (viewerRef.current) fitWidth(viewerRef.current.clientWidth);
  }, [fitWidth]);

  const handleFitPage = useCallback(() => {
    if (viewerRef.current) fitPage(viewerRef.current.clientWidth, viewerRef.current.clientHeight);
  }, [fitPage]);

  // Textbox creation handler - returns new textbox id
  const handleAddTextBox = useCallback((page: number, x: number, y: number, text?: string, width?: number, height?: number): string => {
    const ann = annotations.addTextBox(page, x, y, 'rgba(255, 245, 157, 1)', text, width, height);
    return ann.id;
  }, [annotations.addTextBox]);

  const hasPdf = !!pdfDocument;
  const hasApiKey = !!llmConfig.activeConfig?.apiKey;
  const pageBookmarked = hasPdf && isBookmarked(currentPage);

  return (
    <div className="app" onDrop={handleDrop} onDragOver={handleDragOver}>
      <Toolbar
        fileName={fileName}
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitchTab={switchTab}
        onCloseTab={closeTab}
        onOpenFile={handleOpenFile}
        onGoToPage={goToPage}
        onNextPage={nextPage}
        onPrevPage={prevPage}
        onSetZoom={setZoom}
        onFitWidth={handleFitWidth}
        onFitPage={handleFitPage}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleSearch={() => { setSearchOpen(prev => !prev); setNotesOpen(false); setChatOpen(false); }}
        onToggleNotes={toggleNotes}
        onToggleChat={toggleChat}
        onToggleTextTool={toggleTextTool}
        onToggleBookmark={toggleCurrentBookmark}
        onOpenSettings={() => setSettingsOpen(true)}
        sidebarOpen={sidebarOpen}
        searchOpen={searchOpen}
        notesOpen={notesOpen}
        chatOpen={chatOpen}
        textTool={textTool}
        isBookmarked={pageBookmarked}
        hasPdf={hasPdf}
      />

      <div className="main-layout">
        {sidebarOpen && (
          <>
            <div className="sidebar-wrapper" style={{ width: sidebarWidth }}>
              <Sidebar
                outline={outline}
                bookmarks={bookmarks}
                onGoToBookmark={goToBookmark}
                onGoToPage={goToPage}
                onRemoveBookmark={removeBookmark}
                onRenameBookmark={renameBookmark}
                visible={sidebarOpen}
              />
            </div>
            <div className="resize-handle" onMouseDown={startSidebarResize} />
          </>
        )}

        <div className="viewer-area" ref={viewerRef}>
          <PDFViewer
            pdfDocument={pdfDocument}
            currentPage={currentPage}
            totalPages={totalPages}
            zoom={zoom}
            allAnnotations={annotations.annotations}
            textTool={textTool}
            onWheel={handleWheel}
            onPageChange={goToPage}
            onSelectionChange={(_page, sel) => annotations.updateSelection(sel)}
            onAddAnnotation={annotations.addAnnotation}
            onRemoveAnnotation={annotations.removeAnnotation}
            onAddTextBox={handleAddTextBox}
            onUpdateTextBox={annotations.updateTextBox}
            onUpdateTextBoxFontSize={annotations.updateTextBoxFontSize}
            onUpdateTextBoxGeometry={annotations.updateTextBoxGeometry}
            onUpdateAnnotationComment={annotations.updateAnnotationComment}
          />
        </div>

        <SearchPanel
          visible={searchOpen}
          searchResults={searchResults}
          isSearching={isSearching}
          onSearch={search}
          onClearSearch={clearSearch}
          onGoToPage={goToPage}
          onClose={() => setSearchOpen(false)}
        />

        {notesOpen && hasPdf && (
          <>
            <div className="resize-handle" onMouseDown={startNotesResize} />
            <div className="notes-panel-wrapper" style={{ width: notesWidth }}>
              <NotesPanel
                visible={true}
                content={notes.content}
                saved={notes.saved}
                onUpdate={notes.updateContent}
                onDelete={notes.deleteNote}
                onClose={() => setNotesOpen(false)}
              />
            </div>
          </>
        )}

        {chatOpen && (
          <>
            <div className="resize-handle" onMouseDown={startChatResize} />
            <div className="chat-panel-wrapper" style={{ width: chatWidth }}>
              <ChatPanel
                visible={true}
                messages={chat.messages}
                isStreaming={chat.isStreaming}
                extracting={chat.extracting}
                activeProvider={llmConfig.activeProvider}
                activeConfig={llmConfig.activeConfig}
                pdfDocument={pdfDocument}
                onSendQuestion={chat.sendQuestion}
                onSummarize={chat.summarizeFullText}
                onClear={chat.clearChat}
                onStop={chat.stopStreaming}
                onClose={() => setChatOpen(false)}
                onOpenSettings={() => setSettingsOpen(true)}
                onProviderChange={llmConfig.setProvider}
                hasApiKey={hasApiKey || llmConfig.activeProvider === 'ollama'}
              />
            </div>
          </>
        )}
      </div>

      <LLMSettings
        visible={settingsOpen}
        activeProvider={llmConfig.activeProvider}
        apiKey={llmConfig.activeConfig?.apiKey || ''}
        model={llmConfig.activeConfig?.model || ''}
        baseUrl={llmConfig.activeConfig?.baseUrl || ''}
        onProviderChange={llmConfig.setProvider}
        onApiKeyChange={llmConfig.setApiKey}
        onModelChange={llmConfig.setModel}
        onBaseUrlChange={llmConfig.setBaseUrl}
        onDelete={llmConfig.deleteConfig}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
