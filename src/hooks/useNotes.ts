import { useState, useCallback, useEffect, useRef } from 'react';

export function useNotes(pdfFileName: string) {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPdfRef = useRef(pdfFileName);

  // Load note when PDF changes
  useEffect(() => {
    if (!pdfFileName || !window.electronAPI) return;

    // Clear previous note
    setContent('');
    setSaved(true);

    let cancelled = false;
    window.electronAPI.readNote(pdfFileName).then((text) => {
      if (!cancelled) {
        setContent(text);
        setSaved(true);
      }
    });

    prevPdfRef.current = pdfFileName;
    return () => { cancelled = true; };
  }, [pdfFileName]);

  // Update content and auto-save with debounce
  const updateContent = useCallback((newContent: string) => {
    setContent(newContent);
    setSaved(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (!pdfFileName || !window.electronAPI) return;
      const ok = await window.electronAPI.saveNote(pdfFileName, newContent);
      if (ok) setSaved(true);
    }, 500);
  }, [pdfFileName]);

  const deleteNote = useCallback(async () => {
    if (!pdfFileName || !window.electronAPI) return;
    await window.electronAPI.deleteNote(pdfFileName);
    setContent('');
    setSaved(true);
  }, [pdfFileName]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { content, updateContent, saved, deleteNote };
}
