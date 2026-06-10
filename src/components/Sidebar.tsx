import { useState, useRef, useEffect } from 'react';
import type { BookmarkNode } from '../hooks/usePDFDocument';
import type { Bookmark } from '../hooks/useBookmarks';

type SidebarTab = 'outline' | 'bookmarks';

interface SidebarProps {
  outline: BookmarkNode[];
  bookmarks: Bookmark[];
  onGoToBookmark: (dest: string | unknown[] | null) => void;
  onGoToPage: (page: number) => void;
  onRemoveBookmark: (page: number) => void;
  onRenameBookmark: (page: number, label: string) => void;
  visible: boolean;
}

function OutlineItem({
  node,
  depth,
  onGoToBookmark,
}: {
  node: BookmarkNode;
  depth: number;
  onGoToBookmark: (dest: string | unknown[] | null) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.items && node.items.length > 0;

  return (
    <div className="bookmark-item">
      <div
        className="bookmark-row"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            className="bookmark-toggle"
            onClick={() => setExpanded(!expanded)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
              }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <span className="bookmark-toggle-spacer" />
        )}
        <button
          className="bookmark-link"
          onClick={() => onGoToBookmark(node.dest)}
          style={{
            fontWeight: node.bold ? 600 : 400,
            fontStyle: node.italic ? 'italic' : 'normal',
          }}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && expanded && (
        <div className="bookmark-children">
          {node.items.map((child, i) => (
            <OutlineItem
              key={`${child.title}-${i}`}
              node={child}
              depth={depth + 1}
              onGoToBookmark={onGoToBookmark}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OutlinePanel({ outline, onGoToBookmark }: { outline: BookmarkNode[]; onGoToBookmark: (dest: string | unknown[] | null) => void }) {
  if (outline.length === 0) {
    return (
      <div className="sidebar-empty">
        <p>No outline available</p>
      </div>
    );
  }
  return (
    <>
      {outline.map((node, i) => (
        <OutlineItem
          key={`${node.title}-${i}`}
          node={node}
          depth={0}
          onGoToBookmark={onGoToBookmark}
        />
      ))}
    </>
  );
}

function BookmarksPanel({ bookmarks, onGoToPage, onRemoveBookmark, onRenameBookmark }: { bookmarks: Bookmark[]; onGoToPage: (page: number) => void; onRemoveBookmark: (page: number) => void; onRenameBookmark: (page: number, label: string) => void }) {
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingPage !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingPage]);

  const startRename = (bm: Bookmark) => {
    setEditingPage(bm.page);
    setEditLabel(bm.label);
  };

  const commitRename = () => {
    if (editingPage !== null && editLabel.trim()) {
      onRenameBookmark(editingPage, editLabel.trim());
    }
    setEditingPage(null);
  };

  if (bookmarks.length === 0) {
    return (
      <div className="sidebar-empty">
        <p>No bookmarks yet</p>
        <p className="sidebar-empty-hint">Press Ctrl+B or click the bookmark icon to add</p>
      </div>
    );
  }
  return (
    <div className="bookmark-list">
      {bookmarks.map((bm) => (
        <div
          key={bm.page}
          className="bookmark-list-item"
          onClick={() => { if (editingPage === null) onGoToPage(bm.page); }}
          onDoubleClick={(e) => { e.stopPropagation(); startRename(bm); }}
        >
          <div className="bookmark-list-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="bookmark-list-info">
            {editingPage === bm.page ? (
              <input
                ref={inputRef}
                className="bookmark-rename-input"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingPage(null);
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="bookmark-list-label" title="Double-click to rename">{bm.label}</span>
            )}
            <span className="bookmark-list-page">Page {bm.page}</span>
          </div>
          <button
            className="bookmark-list-remove"
            onClick={(e) => { e.stopPropagation(); onRemoveBookmark(bm.page); }}
            title="Remove bookmark"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ outline, bookmarks, onGoToBookmark, onGoToPage, onRemoveBookmark, onRenameBookmark, visible }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('outline');

  if (!visible) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'outline' ? 'active' : ''}`}
          onClick={() => setActiveTab('outline')}
        >
          Outline
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookmarks')}
        >
          Bookmarks
          {bookmarks.length > 0 && (
            <span className="sidebar-tab-badge">{bookmarks.length}</span>
          )}
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'outline' && (
          <OutlinePanel outline={outline} onGoToBookmark={onGoToBookmark} />
        )}
        {activeTab === 'bookmarks' && (
          <BookmarksPanel bookmarks={bookmarks} onGoToPage={onGoToPage} onRemoveBookmark={onRemoveBookmark} onRenameBookmark={onRenameBookmark} />
        )}
      </div>
    </div>
  );
}
