// Coordinate conversions for PDF editing
// HTML coordinates: (0,0) is top-left, y goes down
// PDF coordinates: (0,0) is bottom-left, y goes up
// We save elements as percentages (0 to 100) relative to page dimensions.

export interface RectCoords {
  x: number;      // percentage (0-100)
  y: number;      // percentage (0-100)
  width: number;  // percentage (0-100)
  height: number; // percentage (0-100)
}

export interface PDFPoint {
  x: number;      // points
  y: number;      // points
}

export interface PDFRect {
  x: number;      // points
  y: number;      // points
  width: number;  // points
  height: number; // points
}

/**
 * Converts screen/element percentages to PDF page coordinate points
 */
export function percentToPdfCoords(
  coords: RectCoords,
  pdfPageWidth: number,
  pdfPageHeight: number
): PDFRect {
  // Convert percent to fractional value
  const px = coords.x / 100;
  const py = coords.y / 100;
  const pw = coords.width / 100;
  const ph = coords.height / 100;

  // Visual width and height after rotation
  // pdf-lib's page.getSize() returns the visually rotated width and height.
  // Standard coordinate mapping (accounting for top-left visual to bottom-left PDF coordinate system):
  let x = px * pdfPageWidth;
  let y = (1 - (py + ph)) * pdfPageHeight;
  let width = pw * pdfPageWidth;
  let height = ph * pdfPageHeight;

  // Note: Depending on how the PDF rotation is set in the document metadata,
  // pdf-lib handles coordinates relative to the visual page size. 
  // However, if the page has internal rotation, the coordinate system may be rotated.
  // We'll write the pdfHelper to handle this correctly during drawing.

  return { x, y, width, height };
}

/**
 * Scale mouse drag coordinates to percentage coordinates
 */
export function absoluteToPercentCoords(
  absX: number,
  absY: number,
  absWidth: number,
  absHeight: number,
  containerWidth: number,
  containerHeight: number
): RectCoords {
  return {
    x: (absX / containerWidth) * 100,
    y: (absY / containerHeight) * 100,
    width: (absWidth / containerWidth) * 100,
    height: (absHeight / containerHeight) * 100,
  };
}

/**
 * Converts SVG paths from percentage points to standard SVG paths
 */
export function percentPathToSvgPath(
  points: { x: number; y: number }[],
  containerWidth: number,
  containerHeight: number
): string {
  if (points.length === 0) return '';
  return points
    .map((p, idx) => {
      const x = (p.x / 100) * containerWidth;
      const y = (p.y / 100) * containerHeight;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
