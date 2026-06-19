import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { X, CornerRightDown } from 'lucide-react';
import type { EditorPage, EditorElement, DrawingPoint, TextElement, ShapeElement, DrawingElement, ImageElement } from '../utils/pdfHelper';
import { percentPathToSvgPath } from '../utils/coordinateHelper';

function generateElementId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

interface PageCanvasProps {
  pdfDoc: pdfjs.PDFDocumentProxy;
  page: EditorPage;
  scale: number;
  isActive: boolean;
  activeTool: string;
  elements: EditorElement[];
  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
  addElement: (pageId: string, element: EditorElement) => void;
  updateElement: (pageId: string, elemId: string, updates: Partial<EditorElement>) => void;
  deleteElement: (pageId: string, elemId: string) => void;
  // Configuration options passed from parent
  defaultTextConfig: {
    fontSize: number;
    fontFamily: 'Helvetica' | 'Times' | 'Courier';
    color: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  };
  defaultShapeConfig: {
    shapeType: 'rectangle' | 'circle' | 'line';
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
  };
  brushConfig: {
    color: string;
    thickness: number;
    isHighlighter: boolean;
  };
  activeSignature: string | null;
  setActiveSignature: (sig: string | null) => void;
}

export const PageCanvas: React.FC<PageCanvasProps> = ({
  pdfDoc,
  page,
  scale,
  isActive,
  activeTool,
  elements,
  selectedElementId,
  setSelectedElementId,
  addElement,
  updateElement,
  deleteElement,
  defaultTextConfig,
  defaultShapeConfig,
  brushConfig,
  activeSignature,
  setActiveSignature,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isMouseDown, setIsMouseDown] = useState(false);
  
  // States for interactive mouse tracking
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragStartPercent, setDragStartPercent] = useState({ x: 0, y: 0 });
  const [mouseAction, setMouseAction] = useState<'dragging' | 'resizing' | 'drawing' | 'shaping' | null>(null);
  const [activeResizingId, setActiveResizingId] = useState<string | null>(null);
  
  // Real-time drawing state
  const [tempDrawingPoints, setTempDrawingPoints] = useState<DrawingPoint[]>([]);
  // Real-time shape creation state
  const [tempShapeCoords, setTempShapeCoords] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  
  // Text editing states
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');

  // 1. Render PDF page onto canvas
  useEffect(() => {
    const renderPage = async () => {
      if (!canvasRef.current) return;
      
      try {
        const pdfPage = await pdfDoc.getPage(page.originalIndex + 1);
        const viewport = pdfPage.getViewport({ scale, rotation: page.rotation });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          setDimensions({ width: viewport.width, height: viewport.height });

          const renderContext = {
            canvasContext: context,
            viewport,
            canvas,
          };
          await pdfPage.render(renderContext).promise;
        }
      } catch (error) {
        console.error('Error rendering PDF page:', error);
      }
    };

    renderPage();
  }, [pdfDoc, page.originalIndex, page.rotation, scale]);

  // Handle document clicks to deselect
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Only deselect if not clicking elements related to properties panel
        const propertiesPanel = document.querySelector('.properties-panel');
        const toolbar = document.querySelector('.floating-toolbar');
        const isClickingPanel = propertiesPanel && propertiesPanel.contains(e.target as Node);
        const isClickingToolbar = toolbar && toolbar.contains(e.target as Node);
        
        if (!isClickingPanel && !isClickingToolbar) {
          setSelectedElementId(null);
          setEditingTextId(null);
        }
      }
    };
    
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [setSelectedElementId]);

  // Coordinate conversion helper (Client PX to Canvas Page Percent)
  const getPercentCoords = (clientX: number, clientY: number): DrawingPoint => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  };

  // MOUSE DOWN HANDLER
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isOverlayContainer = target.classList.contains('editor-overlay-layer') || target.tagName.toLowerCase() === 'svg';
    const percent = getPercentCoords(e.clientX, e.clientY);
    
    setSelectedElementId(null);

    // Case 1: Place Signature Stamp
    if (activeTool === 'signature' && activeSignature) {
      const w = 25; // default signature width percent
      const h = 8;  // default signature height percent
      
      const newElem: EditorElement = {
        id: generateElementId('img'),
        type: 'image',
        x: percent.x - w / 2,
        y: percent.y - h / 2,
        width: w,
        height: h,
        dataUrl: activeSignature,
      } as ImageElement;

      addElement(page.id, newElem);
      setSelectedElementId(newElem.id);
      setActiveSignature(null); // Clear stamp after placing
      return;
    }

    // Case 2: Upload Image on click
    if (activeTool === 'image') {
      setDragStartPercent(percent);
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
      return;
    }

    // Case 3: Create Text Box
    if (activeTool === 'text') {
      const newElem: EditorElement = {
        id: generateElementId('txt'),
        type: 'text',
        x: percent.x,
        y: percent.y,
        width: 30, // Initial default w%
        height: 6,  // Initial default h%
        text: 'Type text here...',
        fontSize: defaultTextConfig.fontSize,
        fontFamily: defaultTextConfig.fontFamily,
        color: defaultTextConfig.color,
        bold: defaultTextConfig.bold,
        italic: defaultTextConfig.italic,
        underline: defaultTextConfig.underline,
      } as TextElement;

      addElement(page.id, newElem);
      setSelectedElementId(newElem.id);
      setEditingTextId(newElem.id);
      setEditingTextValue('Type text here...');
      return;
    }

    // Case 4: Freehand Drawing
    if (activeTool === 'draw') {
      setIsMouseDown(true);
      setMouseAction('drawing');
      setTempDrawingPoints([percent]);
      return;
    }

    // Case 5: Shape Drawing (Rectangle / Circle / Line)
    if (activeTool === 'shape') {
      setIsMouseDown(true);
      setMouseAction('shaping');
      setDragStartPercent(percent);
      setTempShapeCoords({ x: percent.x, y: percent.y, w: 0, h: 0 });
      return;
    }

    // Case 6: Whiteout Drawing
    if (activeTool === 'whiteout') {
      setIsMouseDown(true);
      setMouseAction('shaping');
      setDragStartPercent(percent);
      setTempShapeCoords({ x: percent.x, y: percent.y, w: 0, h: 0 });
      return;
    }

    // Default: Clicked blank space in Select tool -> deselect
    if (activeTool === 'select' && isOverlayContainer) {
      setSelectedElementId(null);
      setEditingTextId(null);
    }
  };

  // MOUSE MOVE HANDLER
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDown || !containerRef.current) return;
    const percent = getPercentCoords(e.clientX, e.clientY);

    // Case 1: Draw freehand
    if (mouseAction === 'drawing') {
      setTempDrawingPoints((prev) => [...prev, percent]);
      return;
    }

    // Case 2: Shape / Whiteout rectangle preview
    if (mouseAction === 'shaping') {
      const w = percent.x - dragStartPercent.x;
      const h = percent.y - dragStartPercent.y;
      setTempShapeCoords({
        x: w < 0 ? percent.x : dragStartPercent.x,
        y: h < 0 ? percent.y : dragStartPercent.y,
        w: Math.abs(w),
        h: Math.abs(h),
      });
      return;
    }

    // Case 3: Resize selected element
    if (mouseAction === 'resizing' && activeResizingId) {
      const elem = elements.find((el) => el.id === activeResizingId);
      if (!elem) return;

      const newW = percent.x - elem.x;
      const newH = percent.y - elem.y;

      updateElement(page.id, activeResizingId, {
        width: Math.max(3, newW),
        height: Math.max(2, newH),
      });
      return;
    }

    // Case 4: Drag selected element
    if (mouseAction === 'dragging' && selectedElementId) {
      const elem = elements.find((el) => el.id === selectedElementId);
      if (!elem) return;

      // New center/top-left based on current mouse position and starting drag offset
      const newX = percent.x - dragOffset.x;
      const newY = percent.y - dragOffset.y;

      updateElement(page.id, selectedElementId, {
        x: Math.max(0, Math.min(100 - elem.width, newX)),
        y: Math.max(0, Math.min(100 - elem.height, newY)),
      });
    }
  };

  // MOUSE UP HANDLER
  const handleMouseUp = () => {
    setIsMouseDown(false);

    // Commit Freehand Drawing
    if (mouseAction === 'drawing' && tempDrawingPoints.length > 1) {
      // Find bounding box for the drawing to store relative coords properly
      const xs = tempDrawingPoints.map((p) => p.x);
      const ys = tempDrawingPoints.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const newElem: EditorElement = {
        id: generateElementId('drw'),
        type: 'drawing',
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        points: tempDrawingPoints,
        color: brushConfig.color,
        thickness: brushConfig.thickness,
        isHighlighter: brushConfig.isHighlighter,
      } as DrawingElement;

      addElement(page.id, newElem);
    }

    // Commit Shape Creation
    if (mouseAction === 'shaping' && tempShapeCoords && tempShapeCoords.w > 1 && tempShapeCoords.h > 1) {
      let newElem: EditorElement;

      if (activeTool === 'whiteout') {
        newElem = {
          id: generateElementId('wht'),
          type: 'whiteout',
          x: tempShapeCoords.x,
          y: tempShapeCoords.y,
          width: tempShapeCoords.w,
          height: tempShapeCoords.h,
        };
      } else {
        newElem = {
          id: generateElementId('shp'),
          type: 'shape',
          shapeType: defaultShapeConfig.shapeType,
          x: tempShapeCoords.x,
          y: tempShapeCoords.y,
          width: tempShapeCoords.w,
          height: tempShapeCoords.h,
          fillColor: defaultShapeConfig.fillColor,
          strokeColor: defaultShapeConfig.strokeColor,
          strokeWidth: defaultShapeConfig.strokeWidth,
          opacity: defaultShapeConfig.opacity,
        } as ShapeElement;
      }

      addElement(page.id, newElem);
      setSelectedElementId(newElem.id);
    }

    // Reset mouse action states
    setMouseAction(null);
    setActiveResizingId(null);
    setTempDrawingPoints([]);
    setTempShapeCoords(null);
  };

  // Image Upload handler
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      const newElem: EditorElement = {
        id: generateElementId('img'),
        type: 'image',
        x: dragStartPercent.x,
        y: dragStartPercent.y,
        width: 20, // default width
        height: 15, // default height
        dataUrl,
      } as ImageElement;

      addElement(page.id, newElem);
      setSelectedElementId(newElem.id);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  // Element interaction handlers
  const handleElementMouseDown = (e: React.MouseEvent, elem: EditorElement) => {
    const target = e.target as HTMLElement;
    // Don't drag if user is typing or clicking inside text inputs
    if (target.tagName.toLowerCase() === 'textarea' || target.tagName.toLowerCase() === 'input') {
      return;
    }
    e.stopPropagation();
    if (activeTool !== 'select' && activeTool !== 'text') return;

    setSelectedElementId(elem.id);
    setIsMouseDown(true);
    setMouseAction('dragging');

    // Calculate percent click offset relative to the element top-left
    const percent = getPercentCoords(e.clientX, e.clientY);
    setDragOffset({
      x: percent.x - elem.x,
      y: percent.y - elem.y,
    });
  };

  const handleResizeHandleMouseDown = (e: React.MouseEvent, elemId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsMouseDown(true);
    setMouseAction('resizing');
    setActiveResizingId(elemId);
  };

  const handleTextDoubleClick = (e: React.MouseEvent, elem: TextElement) => {
    e.stopPropagation();
    if (activeTool !== 'select' && activeTool !== 'text') return;
    setEditingTextId(elem.id);
    setEditingTextValue(elem.text);
  };

  const commitTextEdit = (id: string) => {
    if (editingTextValue.trim() === '') {
      deleteElement(page.id, id);
    } else {
      updateElement(page.id, id, { text: editingTextValue } as Partial<TextElement>);
    }
    setEditingTextId(null);
  };

  // TOUCH EVENTS FOR MOBILE DRAWING & EDITING
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    const isOverlayContainer = target.classList.contains('editor-overlay-layer') || target.tagName.toLowerCase() === 'svg';
    
    // Check if user is clicking on a resize handle or an element
    const isInteraction = target.closest('.overlay-element') || target.closest('.element-resize-handle');
    
    if (activeTool !== 'select' || isInteraction) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }

    const percent = getPercentCoords(touch.clientX, touch.clientY);
    setSelectedElementId(null);

    // Case 1: Place Signature Stamp
    if (activeTool === 'signature' && activeSignature) {
      const w = 25; // default signature width percent
      const h = 8;  // default signature height percent
      
      const newElem: EditorElement = {
        id: generateElementId('img'),
        type: 'image',
        x: percent.x - w / 2,
        y: percent.y - h / 2,
        width: w,
        height: h,
        dataUrl: activeSignature,
      } as ImageElement;

      addElement(page.id, newElem);
      setSelectedElementId(newElem.id);
      setActiveSignature(null); // Clear stamp after placing
      return;
    }

    // Case 2: Upload Image on click
    if (activeTool === 'image') {
      setDragStartPercent(percent);
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
      return;
    }

    // Case 3: Create Text Box
    if (activeTool === 'text') {
      const newElem: EditorElement = {
        id: generateElementId('txt'),
        type: 'text',
        x: percent.x,
        y: percent.y,
        width: 30, // Initial default w%
        height: 6,  // Initial default h%
        text: 'Type text here...',
        fontSize: defaultTextConfig.fontSize,
        fontFamily: defaultTextConfig.fontFamily,
        color: defaultTextConfig.color,
        bold: defaultTextConfig.bold,
        italic: defaultTextConfig.italic,
        underline: defaultTextConfig.underline,
      } as TextElement;

      addElement(page.id, newElem);
      setSelectedElementId(newElem.id);
      setEditingTextId(newElem.id);
      setEditingTextValue('Type text here...');
      return;
    }

    // Case 4: Freehand Drawing
    if (activeTool === 'draw') {
      setIsMouseDown(true);
      setMouseAction('drawing');
      setTempDrawingPoints([percent]);
      return;
    }

    // Case 5: Shape Drawing (Rectangle / Circle / Line)
    if (activeTool === 'shape') {
      setIsMouseDown(true);
      setMouseAction('shaping');
      setDragStartPercent(percent);
      setTempShapeCoords({ x: percent.x, y: percent.y, w: 0, h: 0 });
      return;
    }

    // Case 6: Whiteout Drawing
    if (activeTool === 'whiteout') {
      setIsMouseDown(true);
      setMouseAction('shaping');
      setDragStartPercent(percent);
      setTempShapeCoords({ x: percent.x, y: percent.y, w: 0, h: 0 });
      return;
    }

    // Default: Clicked blank space in Select tool -> deselect
    if (activeTool === 'select' && isOverlayContainer) {
      setSelectedElementId(null);
      setEditingTextId(null);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMouseDown || !containerRef.current || e.touches.length === 0) return;
    
    // Prevent default scroll behaviour when drawing / resizing / dragging
    if (mouseAction) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }
    
    const touch = e.touches[0];
    const percent = getPercentCoords(touch.clientX, touch.clientY);

    // Case 1: Draw freehand
    if (mouseAction === 'drawing') {
      setTempDrawingPoints((prev) => [...prev, percent]);
      return;
    }

    // Case 2: Shape / Whiteout rectangle preview
    if (mouseAction === 'shaping') {
      const w = percent.x - dragStartPercent.x;
      const h = percent.y - dragStartPercent.y;
      setTempShapeCoords({
        x: w < 0 ? percent.x : dragStartPercent.x,
        y: h < 0 ? percent.y : dragStartPercent.y,
        w: Math.abs(w),
        h: Math.abs(h),
      });
      return;
    }

    // Case 3: Resize selected element
    if (mouseAction === 'resizing' && activeResizingId) {
      const elem = elements.find((el) => el.id === activeResizingId);
      if (!elem) return;

      const newW = percent.x - elem.x;
      const newH = percent.y - elem.y;

      updateElement(page.id, activeResizingId, {
        width: Math.max(3, newW),
        height: Math.max(2, newH),
      });
      return;
    }

    // Case 4: Drag selected element
    if (mouseAction === 'dragging' && selectedElementId) {
      const elem = elements.find((el) => el.id === selectedElementId);
      if (!elem) return;

      const newX = percent.x - dragOffset.x;
      const newY = percent.y - dragOffset.y;

      updateElement(page.id, selectedElementId, {
        x: Math.max(0, Math.min(100 - elem.width, newX)),
        y: Math.max(0, Math.min(100 - elem.height, newY)),
      });
    }
  };

  const handleElementTouchStart = (e: React.TouchEvent, elem: EditorElement) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'textarea' || target.tagName.toLowerCase() === 'input') {
      return;
    }
    if (activeTool !== 'select' && activeTool !== 'text') return;
    
    e.stopPropagation();

    setSelectedElementId(elem.id);
    setIsMouseDown(true);
    setMouseAction('dragging');

    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const percent = getPercentCoords(touch.clientX, touch.clientY);
      setDragOffset({
        x: percent.x - elem.x,
        y: percent.y - elem.y,
      });
    }
  };

  const handleResizeHandleTouchStart = (e: React.TouchEvent, elemId: string) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    setIsMouseDown(true);
    setMouseAction('resizing');
    setActiveResizingId(elemId);
  };

  return (
    <div
      id={`page-container-${page.id}`}
      ref={containerRef}
      className={`page-canvas-container ${isActive ? 'active-page' : ''}`}
      style={{
        width: dimensions.width ? `${dimensions.width}px` : 'auto',
        height: dimensions.height ? `${dimensions.height}px` : 'auto',
        position: 'relative',
        margin: '24px auto',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor:
          activeTool === 'select'
            ? 'default'
            : activeTool === 'text'
            ? 'text'
            : activeTool === 'signature'
            ? 'crosshair'
            : 'crosshair',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {/* Hidden file input for uploading images */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageFileChange}
        accept="image/png, image/jpeg, image/jpg"
        style={{ display: 'none' }}
      />

      {/* PDF.js Page Canvas */}
      <canvas ref={canvasRef} className="pdf-canvas" />

      {/* RENDER ACTIVE DRAWING ON CLIENT DURING PEN MOVEMENT */}
      {mouseAction === 'drawing' && tempDrawingPoints.length > 0 && (
        <svg
          className="drawing-overlay-svg"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <path
            d={percentPathToSvgPath(tempDrawingPoints, dimensions.width, dimensions.height)}
            fill="none"
            stroke={brushConfig.color}
            strokeWidth={brushConfig.thickness}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={brushConfig.isHighlighter ? 0.45 : 1}
          />
        </svg>
      )}

      {/* RENDER ACTIVE SHAPE OUTLINE DURING DRAG */}
      {mouseAction === 'shaping' && tempShapeCoords && (
        <div
          className="shape-preview-box"
          style={{
            position: 'absolute',
            left: `${tempShapeCoords.x}%`,
            top: `${tempShapeCoords.y}%`,
            width: `${tempShapeCoords.w}%`,
            height: `${tempShapeCoords.h}%`,
            border: activeTool === 'whiteout' ? '1px dashed #ef4444' : `2px solid ${defaultShapeConfig.strokeColor}`,
            backgroundColor:
              activeTool === 'whiteout'
                ? 'rgba(255, 255, 255, 0.8)'
                : defaultShapeConfig.fillColor === 'transparent'
                ? 'transparent'
                : defaultShapeConfig.fillColor,
            opacity: activeTool === 'whiteout' ? 0.9 : defaultShapeConfig.opacity,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}

      {/* DYNAMIC EDITOR ELEMENT OVERLAYS */}
      <div
        className="editor-overlay-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 5,
        }}
      >
        {elements.map((elem) => {
          const isSelected = elem.id === selectedElementId;
          const isEditingText = elem.id === editingTextId;

          return (
            <div
              key={elem.id}
              className={`overlay-element ${isSelected ? 'selected' : ''}`}
              style={{
                position: 'absolute',
                left: `${elem.x}%`,
                top: `${elem.y}%`,
                width: `${elem.width}%`,
                height: `${elem.height}%`,
                userSelect: 'none',
                cursor: activeTool === 'select' ? 'move' : 'inherit',
                zIndex: isSelected ? 20 : 11,
              }}
              onMouseDown={(e) => handleElementMouseDown(e, elem)}
              onTouchStart={(e) => handleElementTouchStart(e, elem)}
            >
              {/* Delete element button */}
              {isSelected && (
                <button
                  className="element-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteElement(page.id, elem.id);
                  }}
                  title="Remove annotation"
                >
                  <X size={12} />
                </button>
              )}

              {/* Resize Handle */}
              {isSelected && elem.type !== 'drawing' && (
                <div
                  className="element-resize-handle"
                  onMouseDown={(e) => handleResizeHandleMouseDown(e, elem.id)}
                  onTouchStart={(e) => handleResizeHandleTouchStart(e, elem.id)}
                  title="Drag to resize"
                >
                  <CornerRightDown size={10} className="resize-handle-icon" />
                </div>
              )}

              {/* ELEMENT CONTENT TYPES */}

              {/* 1. TEXT ELEMENT */}
              {elem.type === 'text' && (
                <div style={{ width: '100%', height: '100%' }}>
                  {isEditingText ? (
                    <textarea
                      value={editingTextValue}
                      onChange={(e) => setEditingTextValue(e.target.value)}
                      onBlur={() => commitTextEdit(elem.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          commitTextEdit(elem.id);
                        }
                      }}
                      autoFocus
                      className="inline-text-editor"
                      style={{
                        fontSize: `${(elem as TextElement).fontSize * (scale)}px`,
                        fontFamily: (elem as TextElement).fontFamily === 'Times' ? "'Times New Roman'" : (elem as TextElement).fontFamily === 'Courier' ? 'Courier' : 'Arial',
                        color: (elem as TextElement).color,
                        fontWeight: (elem as TextElement).bold ? 'bold' : 'normal',
                        fontStyle: (elem as TextElement).italic ? 'italic' : 'normal',
                        textDecoration: (elem as TextElement).underline ? 'underline' : 'none',
                      }}
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => handleTextDoubleClick(e, elem as TextElement)}
                      className="text-render-box"
                      style={{
                        width: '100%',
                        height: '100%',
                        fontSize: `${(elem as TextElement).fontSize * (scale)}px`,
                        fontFamily: (elem as TextElement).fontFamily === 'Times' ? "'Times New Roman'" : (elem as TextElement).fontFamily === 'Courier' ? 'Courier' : 'Arial',
                        color: (elem as TextElement).color,
                        fontWeight: (elem as TextElement).bold ? 'bold' : 'normal',
                        fontStyle: (elem as TextElement).italic ? 'italic' : 'normal',
                        textDecoration: (elem as TextElement).underline ? 'underline' : 'none',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {(elem as TextElement).text}
                    </div>
                  )}
                </div>
              )}

              {/* 2. SHAPE ELEMENT */}
              {elem.type === 'shape' && (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    border: `${(elem as ShapeElement).strokeWidth}px solid ${(elem as ShapeElement).strokeColor}`,
                    borderRadius: (elem as ShapeElement).shapeType === 'circle' ? '50%' : '0px',
                    backgroundColor:
                      (elem as ShapeElement).fillColor === 'transparent'
                        ? 'transparent'
                        : (elem as ShapeElement).fillColor,
                    opacity: (elem as ShapeElement).opacity,
                  }}
                />
              )}

              {/* 3. WHITEOUT ELEMENT */}
              {elem.type === 'whiteout' && (
                <div
                  className="whiteout-block"
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#ffffff',
                    boxShadow: isSelected ? 'inset 0 0 4px rgba(0,0,0,0.2)' : 'none',
                  }}
                />
              )}

              {/* 4. IMAGE ELEMENT */}
              {elem.type === 'image' && (
                <img
                  src={(elem as ImageElement).dataUrl}
                  alt="Embedded stamp"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* 5. DRAWING ELEMENT */}
              {elem.type === 'drawing' && (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    overflow: 'visible',
                  }}
                >
                  {/* Since paths are saved absolute in percentage, we need to map drawing coordinates */}
                  <path
                    d={percentPathToSvgPath(
                      (elem as DrawingElement).points,
                      dimensions.width,
                      dimensions.height
                    )}
                    fill="none"
                    stroke={(elem as DrawingElement).color}
                    strokeWidth={(elem as DrawingElement).thickness}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={(elem as DrawingElement).isHighlighter ? 0.45 : 1}
                    transform={`translate(-${(elem.x / 100) * dimensions.width}, -${(elem.y / 100) * dimensions.height})`}
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PageCanvas;
