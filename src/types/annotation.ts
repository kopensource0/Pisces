export type AnnotationType = 'highlight' | 'underline' | 'textbox';

export interface AnnotationColor {
  name: string;
  value: string; // rgba
}

export const ANNOTATION_COLORS: AnnotationColor[] = [
  { name: 'Yellow', value: 'rgba(255, 235, 59, 0.45)' },
  { name: 'Green', value: 'rgba(76, 217, 100, 0.4)' },
  { name: 'Blue', value: 'rgba(66, 133, 244, 0.4)' },
  { name: 'Pink', value: 'rgba(255, 105, 160, 0.4)' },
  { name: 'Orange', value: 'rgba(255, 152, 0, 0.45)' },
];

export const UNDERLINE_COLORS: AnnotationColor[] = [
  { name: 'Red', value: 'rgba(255, 60, 60, 0.9)' },
  { name: 'Blue', value: 'rgba(60, 100, 255, 0.9)' },
  { name: 'Green', value: 'rgba(40, 180, 40, 0.9)' },
  { name: 'Black', value: 'rgba(0, 0, 0, 0.9)' },
];

export const TEXTBOX_COLORS: AnnotationColor[] = [
  { name: 'Yellow', value: 'rgba(255, 245, 157, 1)' },
  { name: 'Green', value: 'rgba(200, 230, 201, 1)' },
  { name: 'Blue', value: 'rgba(187, 222, 251, 1)' },
  { name: 'Pink', value: 'rgba(248, 187, 208, 1)' },
  { name: 'White', value: 'rgba(255, 255, 255, 0.95)' },
];

/** A rectangle relative to the page (0-1 range) */
export interface AnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Annotation {
  id: string;
  page: number;
  type: AnnotationType;
  color: string;
  text: string;
  /** Per-line rectangles for precise rendering (Okular-style highlights) */
  rects: AnnotationRect[];
  /** Overall bounding box / textbox position (0-1 range) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text box font size (relative, 0-1 range) */
  fontSize?: number;
  /** Optional comment attached to this annotation */
  comment?: string;
  createdAt: number;
}
