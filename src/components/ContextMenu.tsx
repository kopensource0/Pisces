import { useEffect, useRef } from 'react';
import type { AnnotationType } from '../types/annotation';
import { ANNOTATION_COLORS, UNDERLINE_COLORS } from '../types/annotation';

interface ContextMenuProps {
  x: number;
  y: number;
  onSelect: (type: AnnotationType, color: string) => void;
  onAddComment: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, onSelect, onAddComment, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer to avoid immediate close
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="annotation-context-menu"
      style={{ left: x, top: y }}
    >
      <div className="context-menu-section">
        <button className="context-menu-comment-btn" onClick={onAddComment}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Add Comment</span>
        </button>
      </div>
      <div className="context-menu-divider" />
      <div className="context-menu-section">
        <div className="context-menu-label">Highlight</div>
        <div className="context-menu-colors">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c.name}
              className="color-btn"
              style={{ backgroundColor: c.value }}
              title={c.name}
              onClick={() => onSelect('highlight', c.value)}
            />
          ))}
        </div>
      </div>
      <div className="context-menu-section">
        <div className="context-menu-label">Underline</div>
        <div className="context-menu-colors">
          {UNDERLINE_COLORS.map((c) => (
            <button
              key={c.name}
              className="color-btn underline-btn"
              style={{ backgroundColor: c.value }}
              title={c.name}
              onClick={() => onSelect('underline', c.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
