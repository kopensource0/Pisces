import { useState, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types/llm';
import type { LLMProvider, LLMProviderConfig } from '../types/llm';
import { streamChat, extractPDFText } from '../services/llmApi';
import { parseToolCalls, stripToolCalls, executeToolCall, TOOL_DEFINITIONS } from '../services/toolExecutor';
import type { ToolExecutorContext, ToolCall } from '../services/toolExecutor';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useLLMChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [toolResults, setToolResults] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const toolCtxRef = useRef<ToolExecutorContext | null>(null);

  const setToolContext = useCallback((ctx: ToolExecutorContext | null) => {
    toolCtxRef.current = ctx;
  }, []);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string): ChatMessage => {
    const msg: ChatMessage = { id: genId(), role, content, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  // Execute tool calls found in the response
  const runToolCalls = useCallback(async (toolCalls: ToolCall[]) => {
    const ctx = toolCtxRef.current;
    if (!ctx || toolCalls.length === 0) return [];

    const results: string[] = [];
    for (const call of toolCalls) {
      const result = await executeToolCall(call, ctx);
      const icon = result.success ? '✅' : '❌';
      results.push(`${icon} **${call.name}**: ${result.message}`);

      // Navigate to the page if applicable
      if (result.page && ctx.goToPage) {
        ctx.goToPage(result.page);
      }
    }
    return results;
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
    setToolResults([]);

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
      ? `You are an AI reading assistant for Pisces, a PDF reading application. You can answer questions about the document AND use tools to highlight, annotate, bookmark, and navigate the PDF.\n\n${TOOL_DEFINITIONS}\n\nPDF Content:\n${context}`
      : `You are a helpful AI assistant for Pisces, a PDF reading application.\n\n${TOOL_DEFINITIONS}`;

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
      onDone: async () => {
        try {
          // Parse and execute tool calls from the response
          console.log('[Chat] Streaming done, parsing tool calls...');
          const toolCalls = parseToolCalls(fullResponse);
          console.log('[Chat] Found', toolCalls.length, 'tool calls');

          if (toolCalls.length > 0) {
            const results = await runToolCalls(toolCalls);
            setToolResults(results);

            // Clean the response for display (remove TOOL_CALL blocks)
            const cleanResponse = stripToolCalls(fullResponse);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, content: cleanResponse || 'Done! I\'ve applied the changes to your PDF.' } : m
            ));

            // Add tool results as a follow-up message
            if (results.length > 0) {
              const resultMsg: ChatMessage = {
                id: genId(),
                role: 'assistant',
                content: '🔧 **Tool Results:**\n' + results.join('\n'),
                timestamp: Date.now(),
              };
              setMessages(prev => [...prev, resultMsg]);
            }
          }
        } catch (err) {
          console.error('[Chat] Tool execution error:', err);
          const errMsg: ChatMessage = {
            id: genId(),
            role: 'assistant',
            content: `⚠️ Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, errMsg]);
        }

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
  }, [messages, isStreaming, addMessage, runToolCalls]);

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
    setToolResults([]);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    extracting,
    toolResults,
    sendQuestion,
    summarizeFullText,
    clearChat,
    stopStreaming,
    setToolContext,
  };
}
