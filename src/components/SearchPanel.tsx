import { useState, useCallback, useRef, useEffect } from 'react';
import type { SearchResult } from '../hooks/usePDFDocument';

interface SearchPanelProps {
  visible: boolean;
  searchResults: SearchResult[];
  isSearching: boolean;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onGoToPage: (page: number) => void;
  onClose: () => void;
}

export function SearchPanel({
  visible,
  searchResults,
  isSearching,
  onSearch,
  onClearSearch,
  onGoToPage,
  onClose,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        onSearch(query.trim());
      }
    },
    [query, onSearch]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    onClearSearch();
  }, [onClearSearch]);

  if (!visible) return null;

  return (
    <div className="search-panel">
      <div className="search-header">
        <form onSubmit={handleSubmit} className="search-form">
          <div className="search-input-wrapper">
            <svg
              className="search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in document..."
            />
            {query && (
              <button type="button" className="search-clear-btn" onClick={handleClear}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <button type="submit" className="search-btn">
            Search
          </button>
        </form>
        <button className="search-close-btn" onClick={onClose} title="Close search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="search-results">
        {isSearching ? (
          <div className="search-loading">
            <div className="spinner" />
            <span>Searching...</span>
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <div className="search-results-count">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
            </div>
            <div className="search-results-list">
              {searchResults.map((result, i) => (
                <button
                  key={`${result.page}-${result.matchIndex}-${i}`}
                  className="search-result-item"
                  onClick={() => onGoToPage(result.page)}
                >
                  <span className="result-page">Page {result.page}</span>
                  <span className="result-text">...{result.text}...</span>
                </button>
              ))}
            </div>
          </>
        ) : query && !isSearching ? (
          <div className="search-no-results">No results found</div>
        ) : null}
      </div>
    </div>
  );
}
