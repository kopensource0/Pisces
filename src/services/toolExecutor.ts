import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AnnotationType } from '../types/annotation';
import type { SelectionInfo } from '../hooks/useAnnotations';
import { findTextOnPage, findTextInDocument } from './pdfTextSearch';

// ===== Tool Call Schema =====
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  message: string;
  page?: number;
}

// ===== Tool Definitions (for system prompt) =====
export const TOOL_DEFINITIONS = `
## Available PDF Tools

You can directly modify the PDF using these tools. When the user asks you to highlight, annotate, comment, bookmark, or navigate — ALWAYS use the corresponding tool. Do NOT just describe what to do; actually DO it.

### How to call a tool

Write a fenced JSON code block with the language tag "tool":

\`\`\`tool
{"name": "tool_name", "arguments": {"key": "value"}}
\`\`\`

You can call multiple tools in one response by writing multiple \`\`\`tool blocks.
After calling a tool, briefly explain what you did.

### Tool Reference

**highlight_text** — Highlight text in the PDF
- "text" (string, REQUIRED): The exact text to highlight (copy from the PDF content below)
- "page" (number): Page number. Omit to search all pages.
- "color" (string): "yellow" (default), "green", "blue", "pink", "orange"
- "comment" (string): Optional comment to attach

**underline_text** — Underline text
- "text" (string, REQUIRED): The exact text to underline
- "page" (number): Page number. Omit to search all pages.
- "color" (string): "red" (default), "blue", "green", "black"
- "comment" (string): Optional comment

**add_comment** — Add a comment to text (auto-highlights in yellow)
- "text" (string, REQUIRED): The text to comment on
- "comment" (string, REQUIRED): Your comment
- "page" (number): Page number

**add_bookmark** — Bookmark a page
- "page" (number, REQUIRED): Page number
- "name" (string): Bookmark label (default: "Page N")

**go_to_page** — Navigate the viewer to a page
- "page" (number, REQUIRED): Target page number

### Important
- ALWAYS quote the EXACT text from the PDF content for text-based tools.
- Use the PDF content in this prompt to find the exact words.
- If the user says "highlight section 4", find the actual text of section 4 in the PDF and highlight it.
`;

// ===== Color Maps =====
const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.45)',
  green: 'rgba(76, 217, 100, 0.4)',
  blue: 'rgba(66, 133, 244, 0.4)',
  pink: 'rgba(255, 105, 160, 0.4)',
  orange: 'rgba(255, 152, 0, 0.45)',
};

const UNDERLINE_COLORS: Record<string, string> = {
  red: 'rgba(255, 60, 60, 0.9)',
  blue: 'rgba(60, 100, 255, 0.9)',
  green: 'rgba(40, 180, 40, 0.9)',
  black: 'rgba(0, 0, 0, 0.9)',
};

// ===== Tool Executor =====
export interface ToolExecutorContext {
  pdfDocument: PDFDocumentProxy | null;
  addAnnotation: (page: number, type: AnnotationType, color: string, sel: SelectionInfo) => string;
  updateAnnotationComment: (id: string, comment: string) => void;
  addBookmark: (page: number, label?: string) => void;
  renameBookmark: (page: number, name: string) => void;
  goToPage: (page: number) => void;
}

export async function executeToolCall(
  toolCall: ToolCall,
  ctx: ToolExecutorContext
): Promise<ToolResult> {
  const { name, arguments: args } = toolCall;
  console.log('[ToolExecutor] Executing:', name, args);

  try {
    switch (name) {
      case 'highlight_text':
        return await handleTextAnnotation(args, 'highlight', ctx);
      case 'underline_text':
        return await handleTextAnnotation(args, 'underline', ctx);
      case 'add_comment': {
        const text = args.text as string;
        const comment = args.comment as string;
        if (!text || !comment) {
          return { success: false, message: 'Both "text" and "comment" are required.' };
        }
        const result = await findTextLocation(args, ctx);
        if (!result) {
          return { success: false, message: `Could not find text "${text}" in the document.` };
        }
        const { page, selection } = result;
        const annId = ctx.addAnnotation(page, 'highlight', HIGHLIGHT_COLORS.yellow, selection);
        ctx.updateAnnotationComment(annId, comment);
        return {
          success: true,
          message: `Added comment "${comment}" on "${selection.text}" (page ${page}).`,
          page,
        };
      }
      case 'add_bookmark': {
        const page = args.page as number;
        if (!page) {
          return { success: false, message: '"page" is required.' };
        }
        ctx.addBookmark(page, args.name as string | undefined);
        if (args.name) {
          ctx.renameBookmark(page, args.name as string);
        }
        return {
          success: true,
          message: `Bookmarked page ${page}${args.name ? ` as "${args.name}"` : ''}.`,
          page,
        };
      }
      case 'go_to_page': {
        const page = args.page as number;
        if (!page) {
          return { success: false, message: '"page" is required.' };
        }
        ctx.goToPage(page);
        return { success: true, message: `Navigated to page ${page}.`, page };
      }
      default:
        return { success: false, message: `Unknown tool: "${name}"` };
    }
  } catch (err) {
    console.error('[ToolExecutor] Error:', err);
    return { success: false, message: `Error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function handleTextAnnotation(
  args: Record<string, unknown>,
  type: 'highlight' | 'underline',
  ctx: ToolExecutorContext
): Promise<ToolResult> {
  const text = args.text as string;
  if (!text) {
    return { success: false, message: '"text" is required.' };
  }

  const colorName = (args.color as string) || (type === 'highlight' ? 'yellow' : 'red');
  const colorMap = type === 'highlight' ? HIGHLIGHT_COLORS : UNDERLINE_COLORS;
  const color = colorMap[colorName] || colorMap[Object.keys(colorMap)[0]];

  const result = await findTextLocation(args, ctx);
  if (!result) {
    return { success: false, message: `Could not find text "${text}" in the document.` };
  }

  const { page, selection } = result;
  const annId = ctx.addAnnotation(page, type, color, selection);

  if (args.comment) {
    ctx.updateAnnotationComment(annId, args.comment as string);
  }

  return {
    success: true,
    message: `${type === 'highlight' ? 'Highlighted' : 'Underlined'} "${selection.text}" on page ${page}${args.comment ? ` with comment: "${args.comment}"` : ''}.`,
    page,
  };
}

async function findTextLocation(
  args: Record<string, unknown>,
  ctx: ToolExecutorContext
): Promise<{ page: number; selection: SelectionInfo } | null> {
  if (!ctx.pdfDocument) return null;
  const text = args.text as string;

  if (args.page) {
    const page = args.page as number;
    const selection = await findTextOnPage(ctx.pdfDocument, page, text);
    if (selection) return { page, selection };
    return null;
  }

  return findTextInDocument(ctx.pdfDocument, text);
}

// ===== Tool Call Parser =====

/**
 * Parse tool calls from LLM response.
 * Supports multiple formats for maximum compatibility:
 * 1. ```tool\n{json}\n```  (primary)
 * 2. ```json\n{json}\n``` where json has "name" field (fallback)
 * 3. <TOOL_CALL>{json}</TOOL_CALL> (legacy)
 */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const seen = new Set<string>();

  const addCall = (parsed: { name?: string; arguments?: Record<string, unknown> }) => {
    if (parsed.name && typeof parsed.name === 'string') {
      const key = JSON.stringify({ name: parsed.name, args: parsed.arguments });
      if (!seen.has(key)) {
        seen.add(key);
        calls.push({ name: parsed.name, arguments: parsed.arguments || {} });
      }
    }
  };

  // Format 1: ```tool\n{json}\n```
  const toolBlockRegex = /```tool\s*\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = toolBlockRegex.exec(text)) !== null) {
    try {
      addCall(JSON.parse(match[1].trim()));
    } catch { /* skip */ }
  }

  // Format 2: ```json\n{json with name field}\n```
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)```/g;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name && VALID_TOOL_NAMES.has(parsed.name)) {
        addCall(parsed);
      }
    } catch { /* skip */ }
  }

  // Format 3: <TOOL_CALL>{json}</TOOL_CALL>
  const xmlRegex = /<TOOL_CALL>\s*(\{[\s\S]*?\})\s*<\/TOOL_CALL>/g;
  while ((match = xmlRegex.exec(text)) !== null) {
    try {
      addCall(JSON.parse(match[1].trim()));
    } catch { /* skip */ }
  }

  console.log('[ToolParser] Found', calls.length, 'tool calls');
  return calls;
}

const VALID_TOOL_NAMES = new Set([
  'highlight_text', 'underline_text', 'add_comment', 'add_bookmark', 'go_to_page',
]);

/**
 * Remove tool call blocks from text for display.
 */
export function stripToolCalls(text: string): string {
  return text
    .replace(/```tool\s*\n?[\s\S]*?```\s*/g, '')
    .replace(/<TOOL_CALL>\s*\{[\s\S]*?\}\s*<\/TOOL_CALL>\s*/g, '')
    // Don't strip ```json blocks that happen to have tool calls (too aggressive)
    .trim();
}
