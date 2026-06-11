import { PDFDocument, PDFPage as LibPDFPage, PDFName, PDFArray, PDFNumber, PDFDict, PDFString, PDFHexString, rgb, AnnotationFlags } from 'pdf-lib';
import * as fs from 'fs';

interface AnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UAnnotation {
  id: string;
  page: number;
  type: 'highlight' | 'underline' | 'textbox';
  color: string;
  text: string;
  rects: AnnotationRect[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  comment?: string;
  createdAt: number;
}

interface UBookmark {
  page: number;
  label: string;
  createdAt: number;
}

/**
 * Parse rgba string to { r, g, b } in 0-1 range
 */
function parseColor(color: string): { r: number; g: number; b: number } {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1]) / 255,
      g: parseInt(match[2]) / 255,
      b: parseInt(match[3]) / 255,
    };
  }
  return { r: 1, g: 0.92, b: 0.23 }; // default yellow
}

/**
 * Convert UReader coordinates (0-1, origin top-left) to PDF coordinates (points, origin bottom-left).
 */
function toPdfRect(
  rect: AnnotationRect,
  pageHeight: number
): { x1: number; y1: number; x2: number; y2: number } {
  const { width: pageWidth } = { width: 0 }; // we'll use actual page dimensions
  return {
    x1: rect.x,
    y1: 1 - rect.y - rect.height, // flip Y
    x2: rect.x + rect.width,
    y2: 1 - rect.y,
  };
}

/**
 * Embed annotations and bookmarks into a PDF file.
 * Reads the original PDF, adds annotations, and writes back.
 */
export async function embedAnnotations(
  pdfFilePath: string,
  annotations: UAnnotation[],
  bookmarks?: UBookmark[]
): Promise<boolean> {
  try {
    // Read the original PDF
    const pdfBytes = fs.readFileSync(pdfFilePath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    // Remove existing UReader annotations (by our custom marker) to avoid duplicates
    for (const page of pages) {
      removeUReaderAnnotations(page);
    }

    // Add highlight/underline annotations
    for (const ann of annotations) {
      if (ann.type === 'textbox') {
        addFreeTextAnnotation(pdfDoc, pages, ann);
      } else {
        addMarkupAnnotation(pdfDoc, pages, ann);
      }
    }

    // Add bookmarks as outline entries
    if (bookmarks && bookmarks.length > 0) {
      addBookmarksToOutline(pdfDoc, pages, bookmarks);
    }

    // Save the modified PDF
    const modifiedBytes = await pdfDoc.save();
    fs.writeFileSync(pdfFilePath, modifiedBytes);

    return true;
  } catch (err) {
    console.error('[PDF Annotator] Failed to embed annotations:', err);
    return false;
  }
}

function addMarkupAnnotation(
  pdfDoc: PDFDocument,
  pages: LibPDFPage[],
  ann: UAnnotation
) {
  const pageIndex = ann.page - 1;
  if (pageIndex < 0 || pageIndex >= pages.length) return;

  const page = pages[pageIndex];
  const { width: pageW, height: pageH } = page.getSize();
  const color = parseColor(ann.color);
  const subtype = ann.type === 'highlight' ? 'Highlight' : 'Underline';

  const rects = ann.rects && ann.rects.length > 0
    ? ann.rects
    : [{ x: ann.x, y: ann.y, width: ann.width, height: ann.height }];

  // Build QuadPoints array (4 points per rect: top-left, top-right, bottom-left, bottom-right)
  const quadPoints: number[] = [];
  for (const rect of rects) {
    const x1 = rect.x * pageW;
    const x2 = (rect.x + rect.width) * pageW;
    const y1 = (1 - rect.y) * pageH; // top in PDF coords
    const y2 = (1 - rect.y - rect.height) * pageH; // bottom in PDF coords

    // QuadPoints order: top-left, top-right, bottom-left, bottom-right
    quadPoints.push(x1, y1, x2, y1, x1, y2, x2, y2);
  }

  // Bounding box of all rects
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rect of rects) {
    const x1 = rect.x * pageW;
    const x2 = (rect.x + rect.width) * pageW;
    const y1 = (1 - rect.y) * pageH;
    const y2 = (1 - rect.y - rect.height) * pageH;
    minX = Math.min(minX, x1);
    maxX = Math.max(maxX, x2);
    minY = Math.min(minY, y2);
    maxY = Math.max(maxY, y1);
  }

  // Create the annotation dictionary
  const context = pdfDoc.context;
  const annotDict = context.obj({
    Type: 'Annot',
    Subtype: subtype,
    Rect: [minX, minY, maxX, maxY],
    C: [color.r, color.g, color.b],
    CA: ann.type === 'highlight' ? 0.45 : 0.9, // opacity
    F: AnnotationFlags.Print,
    QuadPoints: quadPoints,
    Contents: PDFHexString.fromText(ann.comment || ''),
    T: PDFHexString.fromText('UReader'),
    CreationDate: PDFString.of(`D:${new Date(ann.createdAt).toISOString().replace(/[-:]/g, '').split('.')[0]}`),
  });

  // Mark as UReader annotation for future cleanup
  annotDict.set(PDFName.of('NM'), PDFString.of(`ureader-${ann.id}`));

  const annotRef = context.register(annotDict);
  page.node.addAnnot(annotRef);
}

function addFreeTextAnnotation(
  pdfDoc: PDFDocument,
  pages: LibPDFPage[],
  ann: UAnnotation
) {
  const pageIndex = ann.page - 1;
  if (pageIndex < 0 || pageIndex >= pages.length) return;

  const page = pages[pageIndex];
  const { width: pageW, height: pageH } = page.getSize();
  const color = parseColor(ann.color);

  const x1 = ann.x * pageW;
  const y1 = (1 - ann.y - ann.height) * pageH;
  const x2 = (ann.x + ann.width) * pageW;
  const y2 = (1 - ann.y) * pageH;

  const fontSizePt = (ann.fontSize || 0.018) * pageH;

  const context = pdfDoc.context;
  const annotDict = context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: [x1, y1, x2, y2],
    C: [color.r, color.g, color.b],
    F: AnnotationFlags.Print,
    Contents: PDFHexString.fromText(ann.text || ''),
    T: PDFHexString.fromText('UReader'),
    DA: PDFString.of(`/Helv ${Math.round(fontSizePt)} Tf 0 0 0 rg`),
    NM: PDFString.of(`ureader-${ann.id}`),
  });

  const annotRef = context.register(annotDict);
  page.node.addAnnot(annotRef);
}

/**
 * Remove previously embedded UReader annotations (identified by NM field starting with 'ureader-').
 */
function removeUReaderAnnotations(page: LibPDFPage) {
  const node = page.node;
  const context = node.context;
  const annots = node.lookup(PDFName.of('Annots'));

  if (annots instanceof PDFArray) {
    const toRemove: number[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const annot = ref instanceof PDFDict ? ref : context.lookup(ref);
      if (annot instanceof PDFDict) {
        const nm = annot.lookup(PDFName.of('NM'));
        if (nm instanceof PDFString || nm instanceof PDFHexString) {
          const nmStr = nm.decodeText();
          if (nmStr.startsWith('ureader-')) {
            toRemove.push(i);
          }
        }
      }
    }
    // Remove in reverse order to preserve indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      annots.remove(toRemove[i]);
    }
  }
}

/**
 * Add bookmarks to the PDF outline (Table of Contents).
 */
function addBookmarksToOutline(
  pdfDoc: PDFDocument,
  pages: LibPDFPage[],
  bookmarks: UBookmark[]
) {
  if (bookmarks.length === 0) return;

  const context = pdfDoc.context;
  const root = pdfDoc.catalog;

  // Create outline dictionary
  const outlineRef = context.nextRef();
  const firstRef = context.nextRef();

  // Build outline items
  const itemRefs: { ref: any; next?: any; prev?: any; parent: any }[] = [];

  for (let i = 0; i < bookmarks.length; i++) {
    const itemRef = context.nextRef();
    itemRefs.push({
      ref: itemRef,
      parent: outlineRef,
      prev: i > 0 ? itemRefs[i - 1].ref : undefined,
      next: undefined,
    });
    if (i > 0) {
      itemRefs[i - 1].next = itemRef;
    }
  }

  // Create outline items
  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    const pageIndex = bm.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const pageRef = page.ref;

    const item: Record<string, any> = {
      Title: PDFHexString.fromText(bm.label || `Page ${bm.page}`),
      Parent: outlineRef,
      Dest: [pageRef, PDFName.of('Fit')],
    };
    if (itemRefs[i].prev) item.Prev = itemRefs[i].prev;
    if (itemRefs[i].next) item.Next = itemRefs[i].next;

    context.assign(itemRefs[i].ref, context.obj(item));
  }

  // Create first outline dict
  const firstItem = itemRefs[0];
  if (firstItem) {
    context.assign(firstRef, context.obj({})); // placeholder, already set above

    const outline: Record<string, any> = {
      Type: 'Outlines',
      First: itemRefs[0].ref,
      Last: itemRefs[itemRefs.length - 1].ref,
      Count: bookmarks.length,
    };
    context.assign(outlineRef, context.obj(outline));

    // Set outline on catalog
    root.set(PDFName.of('Outlines'), outlineRef);
  }
}
