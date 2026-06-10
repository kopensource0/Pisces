import { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types/llm';
import type { LLMProvider, LLMProviderConfig } from '../types/llm';
import { streamChat, extractPDFText } from '../services/llmApi';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useLLMChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string): ChatMessage => {
    const msg: ChatMessage = { id: genId(), role, content, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  const sendQuestion = useCallback(async (
    question: string,
    provider: LLMProvider,
    config: LLMProviderConfig,
    pdfDoc: unknown
  ) => {
    if (isStreaming) return;

    addMessage('user', question);
    setIsStreaming(true);

    const assistantMsg: ChatMessage = { id: genId(), role: 'assistant', content: '', timestamp: Date.now() };
    setMessages(prev => [...prev, assistantMsg]);

    // Build context if PDF is loaded
    let context = '';
    if (pdfDoc && typeof pdfDoc === 'object' && 'numPages' in pdfDoc) {
      setExtracting(true);
      try {
        context = await extractPDFText(pdfDoc as Parameters<typeof extractPDFText>[0], 6000);
      } catch (err) {
        console.error('Text extraction error:', err);
      }
      setExtracting(false);
    }

    const systemPrompt = context
      ? `You are an AI reading assistant. Below is the extracted text from a PDF document. Use this context to answer the user's questions accurately and helpfully.\n\nPDF Content:\n${context}`
      : `You are a helpful AI assistant for UReader, a PDF reading application.`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    let fullResponse = '';
    await streamChat(provider, config, apiMessages, {
      onToken: (token) => {
        fullResponse += token;
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullResponse } : m));
      },
      onDone: () => {
        setIsStreaming(false);
        abortRef.current = null;
      },
      onError: (error) => {
        setMessages(prev => prev.map(m => m.id === assistantMsg.id
          ? { ...m, content: `Error: ${error}` }
          : m
        ));
        setIsStreaming(false);
        abortRef.current = null;
      },
    }, controller.signal);
  }, [messages, isStreaming, addMessage]);

  const summarizeFullText = useCallback(async (
    provider: LLMProvider,
    config: LLMProviderConfig,
    pdfDoc: unknown
  ) => {
    if (isStreaming || !pdfDoc) return;

    setExtracting(true);
    let context: string;
    try {
      context = await extractPDFText(pdfDoc as Parameters<typeof extractPDFText>[0], 8000);
    } catch {
      setExtracting(false);
      return;
    }
    setExtracting(false);

    if (!context.trim()) {
      addMessage('assistant', 'Could not extract text from the PDF.');
      return;
    }

    addMessage('user', 'Please summarize the full text of this document.');
    setIsStreaming(true);

    const assistantMsg: ChatMessage = { id: genId(), role: 'assistant', content: '', timestamp: Date.now() };
    setMessages(prev => [...prev, assistantMsg]);

    const apiMessages = [
      { role: 'system', content: 'You are a document analysis assistant. Summarize the following document text comprehensively.' },
      { role: 'user', content: `Please provide a detailed summary of the following document:\n\n${context}` },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    let fullResponse = '';
    await streamChat(provider, config, apiMessages, {
      onToken: (token) => {
        fullResponse += token;
        setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullResponse } : m));
      },
      onDone: () => {
        setIsStreaming(false);
        abortRef.current = null;
      },
      onError: (error) => {
        setMessages(prev => prev.map(m => m.id === assistantMsg.id
          ? { ...m, content: `Error: ${error}` }
          : m
        ));
        setIsStreaming(false);
        abortRef.current = null;
      },
    }, controller.signal);
  }, [isStreaming, addMessage]);

  const clearChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    extracting,
    sendQuestion,
    summarizeFullText,
    clearChat,
    stopStreaming,
  };
}
