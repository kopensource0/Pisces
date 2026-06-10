import { useState, useEffect, useCallback, useRef } from 'react';

export interface Bookmark {
  page: number;
  label: string;
  createdAt: number;
}

export function useBookmarks(fileName: string | null) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const bookmarksRef = useRef<Bookmark[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bookmarksRef.current = bookmarks;
  }, [bookmarks]);

  // Load bookmarks when PDF changes
  useEffect(() => {
    if (!fileName) {
      setBookmarks([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await window.electronAPI.readBookmarks(fileName);
        if (!cancelled && Array.isArray(data)) {
          setBookmarks(data as Bookmark[]);
        }
      } catch {
        // Ignore
      }
    })();

    return () => { cancelled = true; };
  }, [fileName]);

  const scheduleSave = useCallback(() => {
    if (!fileName || !window.electronAPI) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      window.electronAPI.saveBookmarks(fileName, bookmarksRef.current);
    }, 300);
  }, [fileName]);

  const toggleBookmark = useCallback((page: number, label?: string) => {
    setBookmarks(prev => {
      const exists = prev.find(b => b.page === page);
      if (exists) {
        const next = prev.filter(b => b.page !== page);
        bookmarksRef.current = next;
        setTimeout(scheduleSave, 50);
        return next;
      } else {
        const newBookmark: Bookmark = {
          page,
          label: label || `Page ${page}`,
          createdAt: Date.now(),
        };
        const next = [...prev, newBookmark].sort((a, b) => a.page - b.page);
        bookmarksRef.current = next;
        setTimeout(scheduleSave, 50);
        return next;
      }
    });
  }, [scheduleSave]);

  const removeBookmark = useCallback((page: number) => {
    setBookmarks(prev => {
      const next = prev.filter(b => b.page !== page);
      bookmarksRef.current = next;
      setTimeout(scheduleSave, 50);
      return next;
    });
  }, [scheduleSave]);

  const renameBookmark = useCallback((page: number, newLabel: string) => {
    if (!newLabel.trim()) return;
    setBookmarks(prev => {
      const next = prev.map(b => b.page === page ? { ...b, label: newLabel.trim() } : b);
      bookmarksRef.current = next;
      setTimeout(scheduleSave, 50);
      return next;
    });
  }, [scheduleSave]);

  const isBookmarked = useCallback((page: number): boolean => {
    return bookmarks.some(b => b.page === page);
  }, [bookmarks]);

  return {
    bookmarks,
    toggleBookmark,
    removeBookmark,
    renameBookmark,
    isBookmarked,
  };
}
