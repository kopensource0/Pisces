import { useEffect, useRef, useState } from 'react';

interface CommentPopoverProps {
  anchorX: number;
  anchorY: number;
  initialComment: string;
  onSave: (comment: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function CommentPopover({
  anchorX,
  anchorY,
  initialComment,
  onSave,
  onDelete,
  onClose,
}: CommentPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [comment, setComment] = useState(initialComment);

  // Focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        handleSave();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment]);

  const handleSave = () => {
    onSave(comment.trim());
  };

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw - 10) {
      popoverRef.current.style.left = `${anchorX - rect.width}px`;
    }
    if (rect.bottom > vh - 10) {
      popoverRef.current.style.top = `${anchorY - rect.height - 10}px`;
    }
  }, [anchorX, anchorY]);

  return (
    <div
      ref={popoverRef}
      className="comment-popover"
      style={{ left: anchorX, top: anchorY }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="comment-popover-header">
        <span className="comment-popover-title">Comment</span>
        <div className="comment-popover-actions">
          {onDelete && (
            <button
              className="comment-btn comment-btn-delete"
              title="Delete annotation"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          )}
          <button
            className="comment-btn comment-btn-close"
            title="Close"
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
          >
            ×
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        className="comment-textarea"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div className="comment-popover-footer">
        <span className="comment-hint">Ctrl+Enter to save</span>
        <button
          className="comment-save-btn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
