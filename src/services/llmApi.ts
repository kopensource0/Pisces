import type { LLMProvider, LLMProviderConfig } from '../types/llm';
import { PROVIDER_DEFAULTS } from '../types/llm';

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

// Estimate token count (rough: 1 token ≈ 4 chars in English, ~2 chars in Chinese)
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 4);
}

function truncateText(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const charsPerToken = 3;
  const maxChars = maxTokens * charsPerToken;
  return text.substring(0, maxChars) + '\n\n[... text truncated to fit context window ...]';
}

export async function streamChat(
  provider: LLMProvider,
  config: LLMProviderConfig,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const baseUrl = config.baseUrl || PROVIDER_DEFAULTS[provider].baseUrl;
  const apiKey = config.apiKey;
  const model = config.model;

  try {
    if (provider === 'google') {
      await streamGoogle(baseUrl, apiKey, model, messages, callbacks, signal);
    } else if (provider === 'anthropic') {
      await streamAnthropic(baseUrl, apiKey, model, messages, callbacks, signal);
    } else {
      // OpenAI-compatible: openai, deepseek, ollama, custom
      await streamOpenAICompatible(baseUrl, apiKey, model, messages, callbacks, signal, provider === 'ollama');
    }
  } catch (err) {
    if (signal?.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onError(msg);
  }
}

// ===== OpenAI-compatible API =====
async function streamOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal: AbortSignal | undefined,
  isOllama: boolean
) {
  const url = `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && !isOllama) headers['Authorization'] = `Bearer ${apiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text();
    callbacks.onError(`API error ${resp.status}: ${body}`);
    return;
  }

  await parseSSEStream(resp, callbacks, (data: string) => {
    if (data === '[DONE]') return null;
    try {
      const json = JSON.parse(data);
      return json.choices?.[0]?.delta?.content || '';
    } catch {
      return '';
    }
  });

  callbacks.onDone();
}

// ===== Anthropic Messages API =====
async function streamAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal: AbortSignal | undefined
) {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    stream: true,
    messages: chatMsgs,
  };
  if (systemMsg) body.system = systemMsg.content;

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const bodyText = await resp.text();
    callbacks.onError(`Anthropic API error ${resp.status}: ${bodyText}`);
    return;
  }

  await parseSSEStream(resp, callbacks, (data: string) => {
    try {
      const json = JSON.parse(data);
      if (json.type === 'content_block_delta') {
        return json.delta?.text || '';
      }
      return '';
    } catch {
      return '';
    }
  });

  callbacks.onDone();
}

// ===== Google Gemini API =====
async function streamGoogle(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal: AbortSignal | undefined
) {
  const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find(m => m.role === 'system');

  const body: Record<string, unknown> = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const bodyText = await resp.text();
    callbacks.onError(`Google API error ${resp.status}: ${bodyText}`);
    return;
  }

  await parseSSEStream(resp, callbacks, (data: string) => {
    try {
      const json = JSON.parse(data);
      return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {
      return '';
    }
  });

  callbacks.onDone();
}

// ===== SSE stream parser =====
async function parseSSEStream(
  resp: Response,
  callbacks: StreamCallbacks,
  extractToken: (data: string) => string | null
): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) {
    callbacks.onError('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        const token = extractToken(data);
        if (token) callbacks.onToken(token);
        if (data === '[DONE]') return;
      }
    }
  }
}

// ===== Helper: extract PDF text for LLM context =====
export async function extractPDFText(
  doc: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str: string }> }> }> },
  maxTokens: number = 8000
): Promise<string> {
  const pages: string[] = [];
  let totalTokens = 0;

  for (let i = 1; i <= doc.numPages && totalTokens < maxTokens; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    const pageTokens = estimateTokens(text);

    if (totalTokens + pageTokens > maxTokens) {
      pages.push(truncateText(text, maxTokens - totalTokens));
      break;
    }

    pages.push(text);
    totalTokens += pageTokens;
  }

  return pages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n');
}
