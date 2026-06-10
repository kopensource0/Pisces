import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, AnnotationType } from '../types/annotation';
import type { SelectionInfo } from '../hooks/useAnnotations';
import { ContextMenu } from './ContextMenu';
import { PDFPage } from './PDFPage';

interface PDFViewerProps {
  pdfDocument: PDFDocumentProxy | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  allAnnotations: Annotation[];
  textTool: boolean;
  onWheel?: (deltaY: number) => void;
  onPageChange: (page: number) => void;
  onSelectionChange: (page: number, sel: SelectionInfo | null) => void;
  onAddAnnotation: (page: number, type: AnnotationType, color: string, sel: SelectionInfo) => string;
  onRemoveAnnotation: (id: string) => void;
  onUpdateAnnotationComment: (id: string, comment: string) => void;
  onAddTextBox: (page: number, x: number, y: number, text?: string, width?: number, height?: number) => string;
  onUpdateTextBox: (id: string, text: string) => void;
  onUpdateTextBoxFontSize: (id: string, fontSize: number) => void;
  onUpdateTextBoxGeometry: (id: string, geometry: Partial<{ x: number; y: number; width: number; height: number }>) => void;
}

export function PDFViewer({
  pdfDocument, currentPage, totalPages, zoom, allAnnotations, textTool,
  onWheel, onPageChange, onSelectionChange, onAddAnnotation, onRemoveAnnotation,
  onUpdateAnnotationComment,
  onAddTextBox, onUpdateTextBox, onUpdateTextBoxFontSize, onUpdateTextBoxGeometry,
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [contextMenu, setContextMenu] = useState<{ page: number; sel: SelectionInfo; x: number; y: number } | null>(null);
  const selectionRef = useRef<{ page: number; sel: SelectionInfo } | null>(null);
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null);

  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));

  const isProgrammaticScroll = useRef(false);
  const lastScrolledPage = useRef(currentPage);

  // Annotation lookup map
  const annotationsByPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const ann of allAnnotations) {
      const list = map.get(ann.page) || [];
      list.push(ann);
      map.set(ann.page, list);
    }
    return map;
  }, [allAnnotations]);

  // IntersectionObserver for lazy rendering
  useEffect(() => {
    if (!pdfDocument) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        setVisiblePages(prev => {
          const next = new Set(prev);
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const pageNum = Number((entry.target as HTMLElement).dataset.page);
              if (!next.has(pageNum)) {
                next.add(pageNum);
                if (pageNum > 1) next.add(pageNum - 1);
                if (pageNum < totalPages) next.add(pageNum + 1);
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });
      },
      { root: containerRef.current, rootMargin: '150% 0px' }
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pdfDocument, totalPages]);

  // Page tracking via scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pdfDocument) return;

    let rafId: number | null = null;

    const handleScroll = () => {
      if (isProgrammaticScroll.current) return;
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const containerRect = container.getBoundingClientRect();
        const containerMidY = containerRect.top + containerRect.height * 0.3;

        let bestPage = -1;
        let bestDist = Infinity;

        pageRefs.current.forEach((el, pageNum) => {
          const rect = el.getBoundingClientRect();
          if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
            const dist = Math.abs(rect.top - containerMidY);
            if (dist < bestDist) {
              bestDist = dist;
              bestPage = pageNum;
            }
          }
        });

        if (bestPage > 0 && bestPage !== lastScrolledPage.current) {
          lastScrolledPage.current = bestPage;
          onPageChange(bestPage);
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [pdfDocument, onPageChange]);

  const registerPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(pageNum, el);
    } else {
      pageRefs.current.delete(pageNum);
    }
  }, []);

  // Scroll to page (programmatic)
  useEffect(() => {
    if (!containerRef.current) return;
    const pageEl = pageRefs.current.get(currentPage);
    if (!pageEl) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const inView = pageRect.top >= containerRect.top - 10 && pageRect.bottom <= containerRect.bottom + 10;

    if (!inView) {
      isProgrammaticScroll.current = true;
      lastScrolledPage.current = currentPage;
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { isProgrammaticScroll.current = false; }, 500);
    }
  }, [currentPage]);

  // Reset on document change
  useEffect(() => {
    setVisiblePages(new Set([1]));
    lastScrolledPage.current = 1;
    isProgrammaticScroll.current = false;
  }, [pdfDocument]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey && onWheel) {
        e.preventDefault();
        onWheel(e.deltaY);
      }
    },
    [onWheel]
  );

  const handleSelectionChange = useCallback((page: number, sel: SelectionInfo | null) => {
    if (sel) {
      selectionRef.current = { page, sel };
      onSelectionChange(page, sel);
    } else if (!contextMenu) {
      selectionRef.current = null;
      onSelectionChange(page, null);
    }
  }, [onSelectionChange, contextMenu]);

  const handleContextMenu = useCallback((page: number, sel: SelectionInfo, x: number, y: number) => {
    selectionRef.current = { page, sel };
    onSelectionChange(page, sel);
    setContextMenu({ page, sel, x, y });
  }, [onSelectionChange]);

  const handleAnnotationSelect = useCallback((type: AnnotationType, color: string) => {
    const ref = selectionRef.current;
    if (!ref) return;
    onAddAnnotation(ref.page, type, color, ref.sel);
    setContextMenu(null);
    selectionRef.current = null;
  }, [onAddAnnotation]);

  const handleAddComment = useCallback(() => {
    const ref = selectionRef.current;
    if (!ref) return;
    // Auto-highlight with default yellow and open comment popover
    const defaultColor = 'rgba(255, 235, 59, 0.45)';
    const annId = onAddAnnotation(ref.page, 'highlight', defaultColor, ref.sel);
    setPendingCommentId(annId);
    setContextMenu(null);
    selectionRef.current = null;
  }, [onAddAnnotation]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
    selectionRef.current = null;
  }, []);

  const pages = useMemo(() => {
    const arr: number[] = [];
    for (let i = 1; i <= totalPages; i++) arr.push(i);
    return arr;
  }, [totalPages]);

  return (
    <div
      ref={containerRef}
      className="pdf-viewer-container"
      onWheel={handleWheel}
    >
      <div className="pdf-viewer-content">
        {pdfDocument ? (
          pages.map((pageNum) => (
            <div
              key={pageNum}
              ref={(el) => registerPageRef(pageNum, el)}
              data-page={pageNum}
              className="pdf-page-wrapper"
            >
              {visiblePages.has(pageNum) ? (
                <PDFPage
                  pdfDocument={pdfDocument}
                  pageNumber={pageNum}
                  zoom={zoom}
                  annotations={annotationsByPage.get(pageNum) || []}
                  textTool={textTool}
                  pendingCommentId={pendingCommentId}
                  onPendingCommentConsumed={() => setPendingCommentId(null)}
                  onSelectionChange={handleSelectionChange}
                  onContextMenu={handleContextMenu}
                  onRemoveAnnotation={onRemoveAnnotation}
                  onUpdateAnnotationComment={onUpdateAnnotationComment}
                  onAddTextBox={onAddTextBox}
                  onUpdateTextBox={onUpdateTextBox}
                  onUpdateTextBoxFontSize={onUpdateTextBoxFontSize}
                  onUpdateTextBoxGeometry={onUpdateTextBoxGeometry}
                />
              ) : (
                <div className="pdf-page-placeholder" data-page={pageNum} />
              )}
            </div>
          ))
        ) : (
          <div className="pdf-placeholder">
            <div className="placeholder-icon">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h2>Welcome to UReader</h2>
            <p>Open a PDF file to get started</p>
            <p className="placeholder-hint">Use File &gt; Open, Ctrl+O, or drag &amp; drop a PDF file</p>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={handleAnnotationSelect}
          onAddComment={handleAddComment}
          onClose={handleContextMenuClose}
        />
      )}
    </div>
  );
}
