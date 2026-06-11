import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SelectionInfo } from '../hooks/useAnnotations';

/**
 * Search for text on a specific page and return SelectionInfo with coordinates.
 * Coordinates are in 0-1 range (percentage of page dimensions).
 */
export async function findTextOnPage(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
  searchText: string
): Promise<SelectionInfo | null> {
  if (pageNumber < 1 || pageNumber > pdfDocument.numPages) return null;

  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();

  // Filter to text items only (those with 'str' property)
  type PdfTextItem = { str: string; transform: number[]; width: number; height: number };
  const items: PdfTextItem[] = [];
  for (const item of textContent.items) {
    if ('str' in item && 'width' in item) {
      items.push(item as unknown as PdfTextItem);
    }
  }

  // Build full text with character-to-item mapping
  const fullText = items.map(i => i.str).join(' ');
  const lowerFull = fullText.toLowerCase();
  const lowerSearch = searchText.trim().toLowerCase();

  const idx = lowerFull.indexOf(lowerSearch);
  if (idx === -1) return null;

  // Find which text items are covered by this match
  let charPos = 0;
  const matchedItems: { item: PdfTextItem; startOffset: number; endOffset: number }[] = [];

  for (const item of items) {
    const itemStart = charPos;
    const itemEnd = charPos + item.str.length;
    charPos += item.str.length + 1; // +1 for space

    if (itemEnd > idx && itemStart < idx + lowerSearch.length) {
      matchedItems.push({
        item,
        startOffset: Math.max(0, idx - itemStart),
        endOffset: Math.min(item.str.length, idx + lowerSearch.length - itemStart),
      });
    }
  }

  if (matchedItems.length === 0) return null;

  // Convert PDF coordinates to viewport (screen) coordinates
  const vpRects: { x: number; y: number; w: number; h: number }[] = [];

  for (const { item, startOffset, endOffset } of matchedItems) {
    const totalChars = item.str.length || 1;
    const fractionStart = startOffset / totalChars;
    const fractionEnd = endOffset / totalChars;

    // PDF coordinates: transform[4]=tx, transform[5]=ty (bottom-left of text)
    const tx = item.transform[4];
    const ty = item.transform[5];
    const itemWidth = item.width;
    const itemHeight = item.height;

    // Get the selected portion in PDF coordinates
    const x1 = tx + itemWidth * fractionStart;
    const x2 = tx + itemWidth * fractionEnd;
    const y1 = ty;
    const y2 = ty + itemHeight;

    // Convert PDF coords to viewport coords (viewport handles the Y-flip)
    const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1);
    const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2);

    const left = Math.min(vx1, vx2);
    const top = Math.min(vy1, vy2);
    const right = Math.max(vx1, vx2);
    const bottom = Math.max(vy1, vy2);

    if (right - left > 0.5 && bottom - top > 0.5) {
      vpRects.push({ x: left, y: top, w: right - left, h: bottom - top });
    }
  }

  if (vpRects.length === 0) return null;

  // Merge rects on same line (similar to computeSelection logic)
  vpRects.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: typeof vpRects = [];
  for (const r of vpRects) {
    const tolerance = r.h * 0.5;
    let merged = false;
    for (const line of lines) {
      if (Math.abs(line.y - r.y) < tolerance) {
        const newX = Math.min(line.x, r.x);
        const newY = Math.min(line.y, r.y);
        const newRight = Math.max(line.x + line.w, r.x + r.w);
        const newBottom = Math.max(line.y + line.h, r.y + r.h);
        line.x = newX; line.y = newY;
        line.w = newRight - newX; line.h = newBottom - newY;
        merged = true;
        break;
      }
    }
    if (!merged) lines.push({ ...r });
  }

  const pageW = viewport.width;
  const pageH = viewport.height;
  const hPad = 1;
  const vPad = (l: { h: number }) => l.h * 0.08;

  const annotationRects = lines.map(l => ({
    x: Math.max(0, (l.x - hPad) / pageW),
    y: Math.max(0, (l.y - vPad(l)) / pageH),
    width: Math.min(1, (l.w + hPad * 2) / pageW),
    height: Math.min(1, (l.h + vPad(l) * 2) / pageH),
  }));

  // Compute overall bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of annotationRects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  const matchedText = fullText.substring(idx, idx + lowerSearch.length);

  return {
    text: matchedText,
    rects: annotationRects,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Search for text across all pages. Returns the first match found.
 */
export async function findTextInDocument(
  pdfDocument: PDFDocumentProxy,
  searchText: string,
  startPage: number = 1
): Promise<{ page: number; selection: SelectionInfo } | null> {
  for (let p = startPage; p <= pdfDocument.numPages; p++) {
    const result = await findTextOnPage(pdfDocument, p, searchText);
    if (result) return { page: p, selection: result };
  }
  // Wrap around from beginning
  for (let p = 1; p < startPage; p++) {
    const result = await findTextOnPage(pdfDocument, p, searchText);
    if (result) return { page: p, selection: result };
  }
  return null;
}

/**
 * Get a text outline of the document for the LLM (page numbers + key phrases).
 */
export async function getDocumentOutline(
  pdfDocument: PDFDocumentProxy,
  maxTokens: number = 4000
): Promise<string> {
  const pages: string[] = [];
  let totalChars = 0;
  const maxChars = maxTokens * 3;

  for (let i = 1; i <= pdfDocument.numPages && totalChars < maxChars; i++) {
    const page = await pdfDocument.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter(item => 'str' in item)
      .map(item => (item as { str: string }).str)
      .join(' ');

    // Extract first ~200 chars as preview
    const preview = text.length > 300 ? text.substring(0, 300) + '...' : text;
    pages.push(`Page ${i}: ${preview}`);
    totalChars += preview.length;
  }

  return `Document has ${pdfDocument.numPages} pages.\n\n` + pages.join('\n\n');
}
