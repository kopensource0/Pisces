import { useState, useCallback } from 'react';
import type { TabEntry } from '../hooks/usePDFDocument';

interface ToolbarProps {
  fileName: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  tabs: TabEntry[];
  activeTabId: string;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenFile: () => void;
  onGoToPage: (page: number) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onSetZoom: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onToggleSidebar: () => void;
  onToggleSearch: () => void;
  onToggleNotes: () => void;
  onToggleChat: () => void;
  onToggleTextTool: () => void;
  onToggleBookmark: () => void;
  onOpenSettings: () => void;
  sidebarOpen: boolean;
  searchOpen: boolean;
  notesOpen: boolean;
  chatOpen: boolean;
  textTool: boolean;
  isBookmarked: boolean;
  hasPdf: boolean;
}

export function Toolbar({
  currentPage,
  totalPages,
  zoom,
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onOpenFile,
  onGoToPage,
  onNextPage,
  onPrevPage,
  onSetZoom,
  onFitWidth,
  onFitPage,
  onToggleSidebar,
  onToggleSearch,
  onToggleNotes,
  onToggleChat,
  onToggleTextTool,
  onToggleBookmark,
  onOpenSettings,
  sidebarOpen,
  searchOpen,
  notesOpen,
  chatOpen,
  textTool,
  isBookmarked,
  hasPdf,
}: ToolbarProps) {
  const [pageInput, setPageInput] = useState('');

  const handlePageSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const page = parseInt(pageInput, 10);
      if (!isNaN(page)) {
        onGoToPage(page);
      }
      setPageInput('');
    },
    [pageInput, onGoToPage]
  );

  const zoomPercent = Math.round(zoom * 100);
  const hasTabs = tabs.length > 0;

  return (
    <div className="toolbar-wrapper">
      <div className="toolbar">
        <div className="toolbar-title">Pisces</div>
        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={onOpenFile} title="Open PDF (Ctrl+O)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>Open</span>
          </button>
          <button
            className={`toolbar-btn ${sidebarOpen ? 'active' : ''}`}
            onClick={onToggleSidebar}
            title="Toggle Sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={onPrevPage} disabled={currentPage <= 1} title="Previous Page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <form onSubmit={handlePageSubmit} className="page-input-form">
            <input
              type="text"
              className="page-input"
              value={pageInput || currentPage.toString()}
              onChange={(e) => setPageInput(e.target.value)}
              onFocus={() => setPageInput('')}
              onBlur={() => setPageInput('')}
              title="Go to page"
            />
            <span className="page-total">/ {totalPages}</span>
          </form>

          <button
            className="toolbar-btn"
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            title="Next Page"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={() => onSetZoom(zoom - 0.1)} title="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          <span className="zoom-display">{zoomPercent}%</span>

          <button className="toolbar-btn" onClick={() => onSetZoom(zoom + 0.1)} title="Zoom In">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          <button className="toolbar-btn" onClick={onFitWidth} title="Fit Width">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>

          <button className="toolbar-btn" onClick={onFitPage} title="Fit Page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>

        <div className="toolbar-separator" />

        {/* Annotation tools */}
        <div className="toolbar-group">
          <button
            className={`toolbar-btn ${textTool ? 'active' : ''}`}
            onClick={onToggleTextTool}
            disabled={!hasPdf}
            title="Text Tool (T)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9.5" y1="20" x2="14.5" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>

          <button
            className={`toolbar-btn bookmark-btn ${isBookmarked ? 'active' : ''}`}
            onClick={onToggleBookmark}
            disabled={!hasPdf}
            title="Bookmark Page (Ctrl+B)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group">
          <button
            className={`toolbar-btn ${searchOpen ? 'active' : ''}`}
            onClick={onToggleSearch}
            title="Search (Ctrl+F)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          <button
            className={`toolbar-btn ${notesOpen ? 'active' : ''}`}
            onClick={onToggleNotes}
            disabled={!hasPdf}
            title="Notes"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </button>

          <button
            className={`toolbar-btn ${chatOpen ? 'active' : ''}`}
            onClick={onToggleChat}
            title="AI Chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            className="toolbar-btn"
            onClick={onOpenSettings}
            title="LLM Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      {hasTabs && (
        <div className="tab-bar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => onSwitchTab(tab.id)}
              title={tab.filePath}
            >
              <span className="tab-name">{tab.fileName}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="Close tab"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
