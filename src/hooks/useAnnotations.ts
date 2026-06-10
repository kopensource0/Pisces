import { useState, useEffect, useCallback, useRef } from 'react';
import type { Annotation, AnnotationType, AnnotationRect } from '../types/annotation';

export interface SelectionInfo {
  text: string;
  /** Per-line rectangles for precise Okular-style rendering */
  rects: AnnotationRect[];
  /** Overall bounding box */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useAnnotations(fileName: string | null) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);

  // Keep ref in sync
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Load annotations when PDF changes
  useEffect(() => {
    if (!fileName) {
      setAnnotations([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await window.electronAPI.readAnnotations(fileName);
        if (!cancelled && Array.isArray(data)) {
          setAnnotations(data as Annotation[]);
        }
      } catch {
        // Ignore
      }
    })();

    return () => { cancelled = true; };
  }, [fileName]);

  // Auto-save with debounce
  const scheduleSave = useCallback(() => {
    if (!fileName || !window.electronAPI) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      window.electronAPI.saveAnnotations(fileName, annotationsRef.current);
    }, 300);
  }, [fileName]);

  // Add highlight/underline annotation — returns the new annotation ID
  const addAnnotation = useCallback((
    page: number,
    type: AnnotationType,
    color: string,
    sel: SelectionInfo
  ): string => {
    const newAnnotation: Annotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      page,
      type,
      color,
      text: sel.text,
      rects: sel.rects,
      x: sel.x,
      y: sel.y,
      width: sel.width,
      height: sel.height,
      createdAt: Date.now(),
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    setTimeout(scheduleSave, 50);
    return newAnnotation.id;
  }, [scheduleSave]);

  // Add text box annotation
  const addTextBox = useCallback((
    page: number,
    x: number,
    y: number,
    color: string,
    initialText: string = '',
    width?: number,
    height?: number,
  ): Annotation => {
    const newTextBox: Annotation = {
      id: `tb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      page,
      type: 'textbox',
      color,
      text: initialText,
      rects: [],
      x,
      y,
      width: width ?? 0.25,
      height: height ?? 0.05,
      fontSize: 0.018, // ~18px on 1000px page
      createdAt: Date.now(),
    };
    setAnnotations(prev => [...prev, newTextBox]);
    setTimeout(scheduleSave, 50);
    return newTextBox;
  }, [scheduleSave]);

  // Update text box content
  const updateTextBox = useCallback((id: string, text: string) => {
    setAnnotations(prev => prev.map(a =>
      a.id === id ? { ...a, text } : a
    ));
    setTimeout(scheduleSave, 50);
  }, [scheduleSave]);

  // Update text box font size
  const updateTextBoxFontSize = useCallback((id: string, fontSize: number) => {
    setAnnotations(prev => prev.map(a =>
      a.id === id ? { ...a, fontSize: Math.max(0.005, Math.min(0.1, fontSize)) } : a
    ));
    setTimeout(scheduleSave, 50);
  }, [scheduleSave]);

  // Update text box position/size (for resize/move)
  const updateTextBoxGeometry = useCallback((id: string, geometry: Partial<Pick<Annotation, 'x' | 'y' | 'width' | 'height'>>) => {
    setAnnotations(prev => prev.map(a =>
      a.id === id ? { ...a, ...geometry } : a
    ));
    setTimeout(scheduleSave, 50);
  }, [scheduleSave]);

  // Update annotation comment
  const updateAnnotationComment = useCallback((id: string, comment: string) => {
    setAnnotations(prev => prev.map(a =>
      a.id === id ? { ...a, comment: comment || undefined } : a
    ));
    setTimeout(scheduleSave, 50);
  }, [scheduleSave]);

  // Remove annotation
  const removeAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    setTimeout(scheduleSave, 50);
  }, [scheduleSave]);

  // Get annotations for a specific page
  const getPageAnnotations = useCallback((page: number): Annotation[] => {
    return annotations.filter(a => a.page === page);
  }, [annotations]);

  // Update selection from DOM
  const updateSelection = useCallback((sel: SelectionInfo | null) => {
    setSelection(sel);
  }, []);

  return {
    annotations,
    selection,
    addAnnotation,
    addTextBox,
    updateTextBox,
    updateTextBoxFontSize,
    updateTextBoxGeometry,
    updateAnnotationComment,
    removeAnnotation,
    getPageAnnotations,
    updateSelection,
  };
}
