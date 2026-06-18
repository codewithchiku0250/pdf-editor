import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, StandardFonts, PDFPage } from 'pdf-lib';
import { percentToPdfCoords } from './coordinateHelper';

// Configure PDFJS Worker using unpkg matching the installed npm version of pdfjs-dist.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface EditorPage {
  id: string;
  originalIndex: number; // -1 if newly added blank page
  rotation: number;      // 0, 90, 180, 270
  width: number;         // visual points
  height: number;        // visual points
  thumbnailUrl?: string; // generated thumbnail data URL
}

export interface DrawingPoint {
  x: number; // percent
  y: number; // percent
}

export interface BaseElement {
  id: string;
  type: 'text' | 'shape' | 'image' | 'drawing' | 'whiteout';
  x: number;      // percent
  y: number;      // percent
  width: number;  // percent
  height: number; // percent
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: 'Helvetica' | 'Times' | 'Courier';
  color: string; // hex
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: 'rectangle' | 'circle' | 'line';
  fillColor: string; // hex or 'transparent'
  strokeColor: string; // hex
  strokeWidth: number;
  opacity: number;
}

export interface DrawingElement extends BaseElement {
  type: 'drawing';
  points: DrawingPoint[];
  color: string; // hex
  thickness: number;
  isHighlighter: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  dataUrl: string; // Base64 PNG/JPEG
}

export interface WhiteoutElement extends BaseElement {
  type: 'whiteout';
}

export type EditorElement = TextElement | ShapeElement | DrawingElement | ImageElement | WhiteoutElement;

// Helper to convert hex color (#ffffff) to pdf-lib rgb object
function hexToRgb(hex: string) {
  if (hex === 'transparent') return null;
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result
    ? rgb(
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
      )
    : rgb(0, 0, 0);
}

// Helper to decode Base64 data URL to Uint8Array bytes
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64String = dataUrl.split(',')[1] || dataUrl;
  const binaryString = atob(base64String);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Load PDF metadata and create Page representations
 */
export async function loadPdfPages(fileData: ArrayBuffer): Promise<{ pdfDoc: pdfjs.PDFDocumentProxy; pages: EditorPage[] }> {
  const loadingTask = pdfjs.getDocument({ data: fileData });
  const pdfDoc = await loadingTask.promise;
  const pages: EditorPage[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Check rotation
    const rotation = page.rotate || 0;
    
    pages.push({
      id: `page-${i}-${Date.now()}`,
      originalIndex: i - 1,
      rotation: rotation,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return { pdfDoc, pages };
}

/**
 * Render PDF page to HTML5 Canvas
 */
export async function renderPageToCanvas(
  pdfDoc: pdfjs.PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.0,
  rotation: number = 0
): Promise<void> {
  // pdfjs pages are 1-indexed
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale, rotation });
  
  const context = canvas.getContext('2d');
  if (!context) return;

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };

  await page.render(renderContext).promise;
}

/**
 * Generate thumbnail image for a PDF page
 */
export async function generateThumbnail(
  pdfDoc: pdfjs.PDFDocumentProxy,
  pageIndex: number,
  rotation: number = 0
): Promise<string> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  // Target width around 120px
  const baseViewport = page.getViewport({ scale: 1.0, rotation });
  const scale = 120 / baseViewport.width;
  const viewport = page.getViewport({ scale, rotation });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return '';

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
    canvas,
  }).promise;

  return canvas.toDataURL('image/png');
}

/**
 * Compile original PDF and edits into a new PDF using pdf-lib
 */
export async function compilePdf(
  originalPdfBytes: ArrayBuffer,
  pagesState: EditorPage[],
  elementsState: Record<string, EditorElement[]> // key is page.id
): Promise<Uint8Array> {
  // Use a copy of originalPdfBytes to be absolutely safe against buffer detachment
  const originalPdfDoc = await PDFDocument.load(originalPdfBytes.slice(0));
  const compiledPdfDoc = await PDFDocument.create();

  // Load standard fonts
  const fonts = {
    Helvetica: {
      regular: await compiledPdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await compiledPdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await compiledPdfDoc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await compiledPdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    },
    Times: {
      regular: await compiledPdfDoc.embedFont(StandardFonts.TimesRoman),
      bold: await compiledPdfDoc.embedFont(StandardFonts.TimesRomanBold),
      italic: await compiledPdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await compiledPdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
    },
    Courier: {
      regular: await compiledPdfDoc.embedFont(StandardFonts.Courier),
      bold: await compiledPdfDoc.embedFont(StandardFonts.CourierBold),
      italic: await compiledPdfDoc.embedFont(StandardFonts.CourierOblique),
      boldItalic: await compiledPdfDoc.embedFont(StandardFonts.CourierBoldOblique),
    },
  };

  for (const pageState of pagesState) {
    let pdfPage: PDFPage;

    if (pageState.originalIndex === -1) {
      // Create new blank page
      pdfPage = compiledPdfDoc.addPage([pageState.width, pageState.height]);
    } else {
      // Copy page from original document
      const [copiedPage] = await compiledPdfDoc.copyPages(originalPdfDoc, [pageState.originalIndex]);
      pdfPage = compiledPdfDoc.addPage(copiedPage);
    }

    // Set rotation
    pdfPage.setRotation(degrees(pageState.rotation));

    // Get size of the page (takes rotation into account visually)
    const { width: pageW, height: pageH } = pdfPage.getSize();

    // Get overlays for this page
    const overlays = elementsState[pageState.id] || [];

    for (const elem of overlays) {
      const coords = percentToPdfCoords(elem, pageW, pageH);

      switch (elem.type) {
        case 'whiteout': {
          pdfPage.drawRectangle({
            x: coords.x,
            y: coords.y,
            width: coords.width,
            height: coords.height,
            color: rgb(1, 1, 1), // Pure white
            opacity: 1.0,
          });
          break;
        }

        case 'text': {
          const textElem = elem as TextElement;
          const family = textElem.fontFamily === 'Helvetica' || textElem.fontFamily === 'Times' || textElem.fontFamily === 'Courier'
            ? textElem.fontFamily
            : 'Helvetica';
          
          let selectedFont = fonts[family].regular;
          if (textElem.bold && textElem.italic) {
            selectedFont = fonts[family].boldItalic;
          } else if (textElem.bold) {
            selectedFont = fonts[family].bold;
          } else if (textElem.italic) {
            selectedFont = fonts[family].italic;
          }

          const textColor = hexToRgb(textElem.color) || rgb(0, 0, 0);

          // Draw the text
          pdfPage.drawText(textElem.text, {
            x: coords.x,
            // Adjust y slightly since drawing starts from baseline
            y: coords.y + coords.height - textElem.fontSize * 0.85,
            size: textElem.fontSize,
            font: selectedFont,
            color: textColor,
          });

          // Draw underline if enabled
          if (textElem.underline) {
            const textWidth = selectedFont.widthOfTextAtSize(textElem.text, textElem.fontSize);
            pdfPage.drawLine({
              start: { x: coords.x, y: coords.y + coords.height - textElem.fontSize * 0.95 },
              end: { x: coords.x + textWidth, y: coords.y + coords.height - textElem.fontSize * 0.95 },
              thickness: textElem.fontSize / 15,
              color: textColor,
            });
          }
          break;
        }

        case 'shape': {
          const shapeElem = elem as ShapeElement;
          const fill = hexToRgb(shapeElem.fillColor);
          const stroke = hexToRgb(shapeElem.strokeColor) || rgb(0, 0, 0);

          if (shapeElem.shapeType === 'rectangle') {
            pdfPage.drawRectangle({
              x: coords.x,
              y: coords.y,
              width: coords.width,
              height: coords.height,
              color: fill || undefined,
              borderColor: stroke,
              borderWidth: shapeElem.strokeWidth,
              opacity: shapeElem.opacity,
            });
          } else if (shapeElem.shapeType === 'circle') {
            // Find center and radius
            const radius = Math.min(coords.width, coords.height) / 2;
            const centerX = coords.x + coords.width / 2;
            const centerY = coords.y + coords.height / 2;

            pdfPage.drawCircle({
              x: centerX,
              y: centerY,
              size: radius,
              color: fill || undefined,
              borderColor: stroke,
              borderWidth: shapeElem.strokeWidth,
              opacity: shapeElem.opacity,
            });
          } else if (shapeElem.shapeType === 'line') {
            pdfPage.drawLine({
              start: { x: coords.x, y: coords.y + coords.height },
              end: { x: coords.x + coords.width, y: coords.y },
              color: stroke,
              thickness: shapeElem.strokeWidth,
              opacity: shapeElem.opacity,
            });
          }
          break;
        }

        case 'drawing': {
          const drawingElem = elem as DrawingElement;
          const strokeColor = hexToRgb(drawingElem.color) || rgb(0, 0, 0);
          const points = drawingElem.points;

          if (points.length < 2) break;

          // Draw line segments connecting points
          for (let k = 0; k < points.length - 1; k++) {
            const p1 = points[k];
            const p2 = points[k + 1];

            // Convert percents to page coordinates
            const x1 = (p1.x / 100) * pageW;
            const y1 = (1 - (p1.y / 100)) * pageH;
            const x2 = (p2.x / 100) * pageW;
            const y2 = (1 - (p2.y / 100)) * pageH;

            pdfPage.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              color: strokeColor,
              thickness: drawingElem.thickness,
              opacity: drawingElem.isHighlighter ? 0.4 : 1.0,
            });
          }
          break;
        }

        case 'image': {
          const imgElem = elem as ImageElement;
          
          let imageEmbed;
          try {
            const imageBytes = dataUrlToBytes(imgElem.dataUrl);

            if (imgElem.dataUrl.includes('image/png')) {
              imageEmbed = await compiledPdfDoc.embedPng(imageBytes);
            } else if (imgElem.dataUrl.includes('image/jpeg') || imgElem.dataUrl.includes('image/jpg')) {
              imageEmbed = await compiledPdfDoc.embedJpg(imageBytes);
            } else {
              // Default fallback: try png
              imageEmbed = await compiledPdfDoc.embedPng(imageBytes);
            }

            pdfPage.drawImage(imageEmbed, {
              x: coords.x,
              y: coords.y,
              width: coords.width,
              height: coords.height,
            });
          } catch (e) {
            console.error('Error embedding image in PDF:', e);
          }
          break;
        }
      }
    }
  }

  return await compiledPdfDoc.save();
}
