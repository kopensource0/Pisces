import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types/llm';
import type { LLMProvider, LLMProviderConfig } from '../types/llm';
import { PROVIDER_DEFAULTS } from '../types/llm';

interface ChatPanelProps {
  visible: boolean;
  messages: ChatMessage[];
  isStreaming: boolean;
  extracting: boolean;
  activeProvider: LLMProvider;
  activeConfig: LLMProviderConfig | undefined;
  pdfDocument: unknown;
  onSendQuestion: (q: string, provider: LLMProvider, config: LLMProviderConfig, doc: unknown) => void;
  onSummarize: (provider: LLMProvider, config: LLMProviderConfig, doc: unknown) => void;
  onClear: () => void;
  onStop: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
  onProviderChange: (p: LLMProvider) => void;
  hasApiKey: boolean;
}

export function ChatPanel({
  visible,
  messages,
  isStreaming,
  extracting,
  activeProvider,
  activeConfig,
  pdfDocument,
  onSendQuestion,
  onSummarize,
  onClear,
  onStop,
  onClose,
  onOpenSettings,
  onProviderChange,
  hasApiKey,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!visible) return null;

  const handleSend = () => {
    const q = input.trim();
    if (!q || !activeConfig?.apiKey || isStreaming) return;
    onSendQuestion(q, activeProvider, activeConfig, pdfDocument);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const providers = Object.keys(PROVIDER_DEFAULTS) as LLMProvider[];

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span>AI Chat</span>
        </div>
        <div className="chat-header-actions">
          <select
            className="chat-provider-select"
            value={activeProvider}
            onChange={e => onProviderChange(e.target.value as LLMProvider)}
          >
            {providers.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <button className="chat-action-btn" onClick={onOpenSettings} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button className="chat-action-btn" onClick={onClear} title="Clear chat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button className="chat-action-btn" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>Ask questions about the PDF</p>
            {pdfDocument != null && (
              <button
                className="chat-summarize-btn"
                onClick={() => activeConfig && onSummarize(activeProvider, activeConfig, pdfDocument)}
                disabled={!hasApiKey || extracting || isStreaming}
              >
                {extracting ? 'Extracting text...' : 'Summarize Full Text'}
              </button>
            )}
            {!hasApiKey && (
              <p className="chat-hint">Configure your API key in Settings first</p>
            )}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-message-header">{msg.role === 'user' ? 'You' : 'AI'}</div>
            <div className="chat-message-body">
              {msg.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {extracting && isStreaming === false && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-header">AI</div>
            <div className="chat-message-body">
              <div className="chat-loading">Extracting PDF text...</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {isStreaming ? (
          <button className="chat-stop-btn" onClick={onStop}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop
          </button>
        ) : (
          <div className="chat-input-wrapper">
            <textarea
              className="chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasApiKey ? 'Ask a question... (Enter to send)' : 'Set API key in Settings first'}
              disabled={!hasApiKey}
              rows={2}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || !hasApiKey}
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
