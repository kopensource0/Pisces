import { useEffect, useRef, useCallback, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { Annotation, AnnotationRect } from '../types/annotation';
import type { SelectionInfo } from '../hooks/useAnnotations';

interface PDFPageProps {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  annotations: Annotation[];
  textTool: boolean;
  pendingCommentId?: string | null;
  onPendingCommentConsumed?: () => void;
  onSelectionChange: (page: number, sel: SelectionInfo | null) => void;
  onContextMenu: (page: number, sel: SelectionInfo, x: number, y: number) => void;
  onRemoveAnnotation: (id: string) => void;
  onUpdateAnnotationComment: (id: string, comment: string) => void;
  onAddTextBox: (page: number, x: number, y: number, text?: string, width?: number, height?: number) => string;
  onUpdateTextBox: (id: string, text: string) => void;
  onUpdateTextBoxFontSize: (id: string, fontSize: number) => void;
  onUpdateTextBoxGeometry: (id: string, geometry: Partial<{ x: number; y: number; width: number; height: number }>) => void;
}

type ResizeHandle = 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 's' | 'n';

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface MoveState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  startAnnX: number;
  startAnnY: number;
}

interface ResizeState {
  id: string;
  handle: ResizeHandle;
  startMouseX: number;
  startMouseY: number;
  startAnn: { x: number; y: number; width: number; height: number };
}

const MIN_TEXTBOX_W = 0.04; // 4% of page width
const MIN_TEXTBOX_H = 0.015; // 1.5% of page height

export function PDFPage({
  pdfDocument, pageNumber, zoom, annotations, textTool,
  pendingCommentId, onPendingCommentConsumed,
  onSelectionChange, onContextMenu, onRemoveAnnotation, onUpdateAnnotationComment,
  onAddTextBox, onUpdateTextBox, onUpdateTextBoxFontSize, onUpdateTextBoxGeometry,
}: PDFPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textLayerInstanceRef = useRef<TextLayer | null>(null);

  const [editingTextBox, setEditingTextBox] = useState<string | null>(null);
  const [selectedTextBox, setSelectedTextBox] = useState<string | null>(null);
  const editingTextRef = useRef<string>('');
  const hoveredTextBoxRef = useRef<string | null>(null);

  // Comment popover state
  const [commentPopover, setCommentPopover] = useState<{ annId: string; x: number; y: number } | null>(null);
  const commentTextRef = useRef<string>('');

  // Drag-to-create state
  const [drawRect, setDrawRect] = useState<DragState | null>(null);
  const drawRef = useRef<DragState | null>(null);

  // Move state
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const moveRef = useRef<MoveState | null>(null);

  // Resize state
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  // Close comment popover on outside click (using ref to avoid race with open)
  const popoverOpenRef = useRef(false);
  useEffect(() => {
    popoverOpenRef.current = !!commentPopover;
    if (!commentPopover) return;
    const handleClick = () => {
      if (popoverOpenRef.current) setCommentPopover(null);
    };
    setTimeout(() => document.addEventListener('mousedown', handleClick), 100);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [commentPopover]);

  // Open comment popover when pendingCommentId is set from parent
  useEffect(() => {
    if (!pendingCommentId || !containerRef.current) return;
    const ann = annotations.find(a => a.id === pendingCommentId);
    if (!ann || ann.page !== pageNumber) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const annX = ((ann.rects?.[0]?.x ?? ann.x) + (ann.rects?.[0]?.width ?? ann.width) / 2) * containerRect.width;
    const annY = (ann.rects?.[0]?.y ?? ann.y) * containerRect.height;
    setCommentPopover({ annId: ann.id, x: annX, y: annY });
    commentTextRef.current = '';
    onPendingCommentConsumed?.();
  }, [pendingCommentId, annotations, pageNumber, onPendingCommentConsumed]);

  // Render page
  const renderPage = useCallback(async () => {
    if (!canvasRef.current || !textLayerRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
    }
    if (textLayerInstanceRef.current) {
      try { textLayerInstanceRef.current.cancel(); } catch { /* ignore */ }
      textLayerInstanceRef.current = null;
    }

    try {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      const task = page.render({ canvas, canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;

      try {
        const textContent = await page.getTextContent();
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        textLayerInstanceRef.current = textLayer;
        await textLayer.render();
      } catch (textErr: unknown) {
        if (textErr && typeof textErr === 'object' && 'name' in textErr &&
            (textErr as { name: string }).name === 'AbortException') return;
        console.warn('Text layer error:', textErr);
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err &&
          (err as { name: string }).name === 'RenderingCancelledException') return;
      console.error('Render error:', err);
    }
  }, [pdfDocument, pageNumber, zoom]);

  useEffect(() => {
    renderPage();
    return () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
      }
      if (textLayerInstanceRef.current) {
        try { textLayerInstanceRef.current.cancel(); } catch { /* ignore */ }
      }
    };
  }, [renderPage]);

  // Selection handling
  const computeSelection = useCallback((): SelectionInfo | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return null;
    const text = sel.toString().trim();
    if (!text) return null;

    const range = sel.getRangeAt(0);
    const rawRects = range.getClientRects();
    if (rawRects.length === 0) return null;

    const containerRect = containerRef.current.getBoundingClientRect();
    const pageW = containerRect.width;
    const pageH = containerRect.height;

    const pixelRects: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < rawRects.length; i++) {
      const r = rawRects[i];
      if (r.width < 1 || r.height < 1) continue;
      pixelRects.push({
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        w: r.width,
        h: r.height,
      });
    }
    if (pixelRects.length === 0) return null;

    const lines: { x: number; y: number; w: number; h: number }[] = [];
    pixelRects.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const r of pixelRects) {
      const tolerance = r.h * 0.5;
      let merged = false;
      for (const line of lines) {
        if (Math.abs(line.y - r.y) < tolerance || Math.abs((line.y + line.h) - (r.y + r.h)) < tolerance) {
          const newX = Math.min(line.x, r.x);
          const newY = Math.min(line.y, r.y);
          const newRight = Math.max(line.x + line.w, r.x + r.w);
          const newBottom = Math.max(line.y + line.h, r.y + r.h);
          line.x = newX; line.y = newY;
          line.w = newRight - newX; line.h = newBottom - newY;
          merged = true;
          break;
        }
      }
      if (!merged) lines.push({ ...r });
    }

    const hPad = 1;
    const vPad = (l: { h: number }) => l.h * 0.08;
    const annotationRects: AnnotationRect[] = lines.map(l => ({
      x: Math.max(0, (l.x - hPad) / pageW),
      y: Math.max(0, (l.y - vPad(l)) / pageH),
      width: Math.min(1, (l.w + hPad * 2) / pageW),
      height: Math.min(1, (l.h + vPad(l) * 2) / pageH),
    }));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of annotationRects) {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
    }

    return { text, rects: annotationRects, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, []);

  const handleMouseUp = useCallback(() => {
    if (textTool) return;
    // Deselect textbox if clicking on empty area
    if (!moveRef.current && !resizeRef.current) {
      setSelectedTextBox(null);
    }
    setTimeout(() => {
      const sel = computeSelection();
      onSelectionChange(pageNumber, sel);
    }, 10);
  }, [computeSelection, onSelectionChange, pageNumber, textTool]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (textTool) return;
    const sel = computeSelection();
    if (!sel) return;
    e.preventDefault();
    onContextMenu(pageNumber, sel, e.clientX, e.clientY);
  }, [computeSelection, onContextMenu, pageNumber, textTool]);

  // ============ Drag-to-create textbox ============
  const handlePageMouseDown = useCallback((e: React.MouseEvent) => {
    if (!textTool || !containerRef.current) return;
    if ((e.target as HTMLElement).closest('.textbox-annotation')) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const state: DragState = { startX: x, startY: y, currentX: x, currentY: y };
    drawRef.current = state;
    setDrawRect(state);
  }, [textTool]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Drag-to-create
      if (drawRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        drawRef.current.currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        drawRef.current.currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        setDrawRect({ ...drawRef.current });
        return;
      }
      // Move textbox
      if (moveRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dx = (e.clientX - moveRef.current.startMouseX) / rect.width;
        const dy = (e.clientY - moveRef.current.startMouseY) / rect.height;
        const newX = Math.max(0, Math.min(1, moveRef.current.startAnnX + dx));
        const newY = Math.max(0, Math.min(1, moveRef.current.startAnnY + dy));
        onUpdateTextBoxGeometry(moveRef.current.id, { x: newX, y: newY });
        return;
      }
      // Resize textbox
      if (resizeRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dx = (e.clientX - resizeRef.current.startMouseX) / rect.width;
        const dy = (e.clientY - resizeRef.current.startMouseY) / rect.height;
        const { startAnn, handle } = resizeRef.current;
        let { x, y, width, height } = startAnn;

        if (handle.includes('e')) width = Math.max(MIN_TEXTBOX_W, startAnn.width + dx);
        if (handle.includes('w')) {
          const newW = Math.max(MIN_TEXTBOX_W, startAnn.width - dx);
          x = startAnn.x + startAnn.width - newW;
          width = newW;
        }
        if (handle.includes('s')) height = Math.max(MIN_TEXTBOX_H, startAnn.height + dy);
        if (handle.includes('n')) {
          const newH = Math.max(MIN_TEXTBOX_H, startAnn.height - dy);
          y = startAnn.y + startAnn.height - newH;
          height = newH;
        }

        x = Math.max(0, x);
        y = Math.max(0, y);
        if (x + width > 1) width = 1 - x;
        if (y + height > 1) height = 1 - y;

        onUpdateTextBoxGeometry(resizeRef.current.id, { x, y, width, height });
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Finish drag-to-create
      if (drawRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const pageW = rect.width;
        const pageH = rect.height;
        const ds = drawRef.current;
        const x1 = Math.min(ds.startX, ds.currentX) / pageW;
        const y1 = Math.min(ds.startY, ds.currentY) / pageH;
        const x2 = Math.max(ds.startX, ds.currentX) / pageW;
        const y2 = Math.max(ds.startY, ds.currentY) / pageH;
        const w = x2 - x1;
        const h = y2 - y1;

        drawRef.current = null;
        setDrawRect(null);

        if (w > MIN_TEXTBOX_W && h > MIN_TEXTBOX_H) {
          const newId = onAddTextBox(pageNumber, x1, y1, undefined, w, h);
          setEditingTextBox(newId);
          setSelectedTextBox(null);
          editingTextRef.current = '';
        } else {
          // Simple click: create default-sized textbox
          const cx = ds.startX / pageW;
          const cy = ds.startY / pageH;
          const newId = onAddTextBox(pageNumber, cx, cy);
          setEditingTextBox(newId);
          setSelectedTextBox(null);
          editingTextRef.current = '';
        }
        return;
      }
      // Finish move
      if (moveRef.current) {
        moveRef.current = null;
        setMoveState(null);
      }
      // Finish resize
      if (resizeRef.current) {
        resizeRef.current = null;
        setResizeState(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [pageNumber, onAddTextBox, onUpdateTextBoxGeometry]);

  // Commit textbox text
  const commitTextBox = useCallback((id: string, text: string) => {
    setEditingTextBox(null);
    setSelectedTextBox(id);
    onUpdateTextBox(id, text);
    if (!text.trim()) {
      onRemoveAnnotation(id);
      setSelectedTextBox(null);
    }
  }, [onUpdateTextBox, onRemoveAnnotation]);

  // Start moving a textbox
  const startMove = useCallback((e: React.MouseEvent, ann: Annotation) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const state: MoveState = {
      id: ann.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startAnnX: ann.x,
      startAnnY: ann.y,
    };
    moveRef.current = state;
    setMoveState(state);
  }, []);

  // Start resizing a textbox
  const startResize = useCallback((e: React.MouseEvent, ann: Annotation, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    const state: ResizeState = {
      id: ann.id,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startAnn: { x: ann.x, y: ann.y, width: ann.width, height: ann.height },
    };
    resizeRef.current = state;
    setResizeState(state);
  }, []);

  // Ctrl+scroll to change font size on hovered textbox (native listener for preventDefault)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey && hoveredTextBoxRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const annId = hoveredTextBoxRef.current;
        const ann = annotations.find(a => a.id === annId);
        if (!ann) return;
        const current = ann.fontSize ?? 0.018;
        const delta = e.deltaY > 0 ? -0.002 : 0.002;
        onUpdateTextBoxFontSize(annId, current + delta);
      }
    };
    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [annotations, onUpdateTextBoxFontSize]);

  // Separate highlight/underline from textboxes
  const markAnnotations = annotations.filter(a => a.type !== 'textbox');
  const textBoxAnnotations = annotations.filter(a => a.type === 'textbox');

  // Compute draw rect in percentages
  const drawRectStyle = drawRect && containerRef.current ? (() => {
    const w = containerRef.current.offsetWidth;
    const h = containerRef.current.offsetHeight;
    return {
      left: `${Math.min(drawRect.startX, drawRect.currentX) / w * 100}%`,
      top: `${Math.min(drawRect.startY, drawRect.currentY) / h * 100}%`,
      width: `${Math.abs(drawRect.currentX - drawRect.startX) / w * 100}%`,
      height: `${Math.abs(drawRect.currentY - drawRect.startY) / h * 100}%`,
    };
  })() : null;

  const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <div
      ref={containerRef}
      className={`pdf-page-container ${textTool ? 'text-tool-active' : ''}`}
      data-page={pageNumber}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      onMouseDown={handlePageMouseDown}
    >
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textLayerRef} className="textLayer" />

      {/* Highlight/Underline annotations */}
      {markAnnotations.map((ann) => {
        const handleAnnotationClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          if (!containerRef.current) return;
          const containerRect = containerRef.current.getBoundingClientRect();
          // Use the first rect of the annotation for popover position
          const firstRect = ann.rects?.[0] ?? { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
          const annCenterX = (firstRect.x + firstRect.width / 2) * containerRect.width;
          const annTopY = firstRect.y * containerRect.height;
          setCommentPopover({
            annId: ann.id,
            x: annCenterX,
            y: annTopY,
          });
          commentTextRef.current = ann.comment ?? '';
        };
        return (
          <div
            key={ann.id}
            className={`annotation-group annotation-${ann.type}`}
          >
            {(ann.rects && ann.rects.length > 0 ? ann.rects : [{ x: ann.x, y: ann.y, width: ann.width, height: ann.height }]).map((rect, i) => (
              <div
                key={i}
                className={`annotation-mark annotation-mark-${ann.type}`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  backgroundColor: ann.type === 'highlight' ? ann.color : 'transparent',
                  boxShadow: ann.type === 'underline' ? `inset 0 -2.5px 0 0 ${ann.color}` : 'none',
                }}
                onMouseDown={handleAnnotationClick}
                onDoubleClick={(e) => { e.stopPropagation(); onRemoveAnnotation(ann.id); }}
              />
            ))}
            {/* Comment indicator badge */}
            {ann.comment && (
              <div
                className="annotation-comment-badge"
                style={{
                  left: `${((ann.rects?.[0]?.x ?? ann.x) + (ann.rects?.[0]?.width ?? ann.width)) * 100}%`,
                  top: `${(ann.rects?.[0]?.y ?? ann.y) * 100}%`,
                }}
                title={ann.comment}
                onMouseDown={handleAnnotationClick}
              >
                💬
              </div>
            )}
          </div>
        );
      })}

      {/* Text box annotations */}
      {textBoxAnnotations.map((ann) => {
        const isEditing = editingTextBox === ann.id;
        const isSelected = selectedTextBox === ann.id;
        const pageH = containerRef.current?.offsetHeight ?? 800;
        const fontSizePx = ann.fontSize ? Math.round(ann.fontSize * pageH) : 14;
        const isActive = isEditing || isSelected || moveState?.id === ann.id || resizeState?.id === ann.id;
        return (
          <div
            key={ann.id}
            className={`textbox-annotation ${isEditing ? 'editing' : ''} ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
            style={{
              left: `${ann.x * 100}%`,
              top: `${ann.y * 100}%`,
              width: `${ann.width * 100}%`,
              height: `${ann.height * 100}%`,
              fontSize: `${fontSizePx}px`,
            }}
            onClick={(e) => { e.stopPropagation(); setSelectedTextBox(ann.id); }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!isEditing) {
                setEditingTextBox(ann.id);
                setSelectedTextBox(null);
                editingTextRef.current = ann.text;
              }
            }}
            onWheel={(e) => { if (e.ctrlKey) e.stopPropagation(); }}
            onMouseEnter={() => { hoveredTextBoxRef.current = ann.id; }}
            onMouseLeave={() => { if (hoveredTextBoxRef.current === ann.id) hoveredTextBoxRef.current = null; }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (!isEditing && !textTool) {
                startMove(e, ann);
              }
            }}
          >
            {isEditing ? (
              <textarea
                className="textbox-input"
                defaultValue={ann.text}
                autoFocus
                onChange={(e) => { editingTextRef.current = e.target.value; }}
                onBlur={() => commitTextBox(ann.id, editingTextRef.current)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    commitTextBox(ann.id, editingTextRef.current);
                  }
                  // Ctrl+] / Ctrl+[ for font size
                  if (e.ctrlKey && e.key === ']') {
                    e.preventDefault();
                    const current = ann.fontSize ?? 0.018;
                    onUpdateTextBoxFontSize(ann.id, current + 0.002);
                  }
                  if (e.ctrlKey && e.key === '[') {
                    e.preventDefault();
                    const current = ann.fontSize ?? 0.018;
                    onUpdateTextBoxFontSize(ann.id, current - 0.002);
                  }
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ fontSize: `${fontSizePx}px` }}
              />
            ) : (
              <div className="textbox-display">
                {ann.text || <span className="textbox-placeholder">Double-click to edit</span>}
              </div>
            )}

            {/* Font size indicator (always visible when active) */}
            {isActive && (
              <div className="textbox-font-indicator" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  className="textbox-font-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const current = ann.fontSize ?? 0.018;
                    onUpdateTextBoxFontSize(ann.id, current - 0.002);
                  }}
                >{"\u2212"}</button>
                <span className="textbox-font-size-label">{fontSizePx}</span>
                <button
                  className="textbox-font-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const current = ann.fontSize ?? 0.018;
                    onUpdateTextBoxFontSize(ann.id, current + 0.002);
                  }}
                >+</button>
              </div>
            )}

            {/* Resize handles (when selected or editing) */}
            {isActive && RESIZE_HANDLES.map((handle) => (
              <div
                key={handle}
                className={`textbox-resize-handle textbox-resize-${handle}`}
                onMouseDown={(e) => startResize(e, ann, handle)}
              />
            ))}

            {/* Delete button */}
            <button
              className="textbox-delete"
              title="Delete text box"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveAnnotation(ann.id);
                if (selectedTextBox === ann.id) setSelectedTextBox(null);
                if (editingTextBox === ann.id) setEditingTextBox(null);
              }}
            >
              ×
            </button>
          </div>
        );
      })}

      {/* Drag-to-create overlay */}
      {drawRect && drawRectStyle && (
        <div className="textbox-draw-overlay" style={drawRectStyle} />
      )}

      {/* Comment popover */}
      {commentPopover && (() => {
        const ann = annotations.find(a => a.id === commentPopover.annId);
        if (!ann) return null;
        return (
          <div
            className="annotation-comment-popover"
            style={{
              left: `${commentPopover.x}px`,
              top: `${commentPopover.y}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="comment-popover-header">
              <span className="comment-popover-title">Comment</span>
              <button
                className="comment-popover-close"
                onClick={() => setCommentPopover(null)}
                title="Close"
              >×</button>
            </div>
            <div className="comment-popover-text" title={ann.text}>
              "{ann.text.length > 80 ? ann.text.slice(0, 80) + '...' : ann.text}"
            </div>
            <textarea
              className="comment-popover-input"
              placeholder="Add a comment..."
              defaultValue={ann.comment ?? ''}
              onChange={(e) => { commentTextRef.current = e.target.value; }}
              rows={3}
            />
            <div className="comment-popover-actions">
              <button
                className="comment-btn-save"
                onClick={() => {
                  onUpdateAnnotationComment(ann.id, commentTextRef.current);
                  setCommentPopover(null);
                }}
              >Save</button>
              {ann.comment && (
                <button
                  className="comment-btn-delete"
                  onClick={() => {
                    onUpdateAnnotationComment(ann.id, '');
                    setCommentPopover(null);
                  }}
                >Delete</button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
