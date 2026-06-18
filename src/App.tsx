import React, { useState, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Download, 
  Sparkles, 
  Moon, 
  Sun, 
  FileEdit,
  Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import * as pdfjs from 'pdfjs-dist';

// Components
// Components
import Toolbar from './components/Toolbar';
import type { ToolType } from './components/Toolbar';
import ThumbnailSidebar from './components/ThumbnailSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import PageCanvas from './components/PageCanvas';
import SignatureModal from './components/SignatureModal';
import Toast from './components/Toast';
import type { ToastMessage } from './components/Toast';

// Hooks & Utils
import { useHistory } from './hooks/useHistory';
import { 
  loadPdfPages, 
  generateThumbnail, 
  compilePdf, 
} from './utils/pdfHelper';
import type { 
  EditorPage, 
  EditorElement 
} from './utils/pdfHelper';

export const App: React.FC = () => {
  // File Upload State
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('document.pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Editor Workspace States
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [zoom, setZoom] = useState<number>(1.0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [activeSignature, setActiveSignature] = useState<string | null>(null);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Overlays state managed by Undo/Redo history hook
  const {
    state: elementsState,
    set: setElementsState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistory<Record<string, EditorElement[]>>({});

  // Tool Configurations
  const [defaultTextConfig, setDefaultTextConfig] = useState({
    fontSize: 16,
    fontFamily: 'Helvetica' as const,
    color: '#000000',
    bold: false,
    italic: false,
    underline: false,
  });

  const [defaultShapeConfig, setDefaultShapeConfig] = useState({
    shapeType: 'rectangle' as const,
    fillColor: 'transparent',
    strokeColor: '#000000',
    strokeWidth: 2,
    opacity: 1.0,
  });

  const [brushConfig, setBrushConfig] = useState({
    color: '#000000',
    thickness: 4,
    isHighlighter: false,
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    setToasts((prev) => [...prev, { id: `toast-${Date.now()}-${Math.random()}`, text, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Tool Selection Helper
  const handleSelectTool = (tool: ToolType) => {
    setActiveTool(tool);
    setSelectedElementId(null); // Clear selected element on tool change

    if (tool === 'text') {
      addToast('Click anywhere on the page to write text. Double-click to edit, drag to move.', 'info');
    } else if (tool === 'draw') {
      addToast('Click and drag on the page to draw freehand.', 'info');
    } else if (tool === 'whiteout') {
      addToast('Click and drag to redact/erase content with whiteout.', 'info');
    } else if (tool === 'shape') {
      addToast('Click and drag to draw a shape. Styles can be edited on the right.', 'info');
    } else if (tool === 'image') {
      addToast('Click anywhere on the page to upload and stamp an image.', 'info');
    }
  };

  // Theme Toggle
  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  // Keyboard Shortcuts (Undo/Redo/Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Do not trigger shortcuts when user is typing in forms/text areas
      if (
        target.tagName.toLowerCase() === 'input' ||
        target.tagName.toLowerCase() === 'textarea' ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        addToast('Undo action', 'info');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        addToast('Redo action', 'info');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId && activePageId) {
          e.preventDefault();
          handleDeleteElement(activePageId, selectedElementId);
          addToast('Annotation deleted', 'info');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedElementId, activePageId]);

  // Load and Parse PDF
  const processPdfFile = async (file: File) => {
    setIsUploading(true);
    setFileName(file.name);
    addToast(`Loading ${file.name}...`, 'info');
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Clone the buffer because PDF.js detaches the ArrayBuffer it loads during worker transfer
      const arrayBufferCopy = arrayBuffer.slice(0);
      const { pdfDoc, pages: loadedPages } = await loadPdfPages(arrayBufferCopy);
      setPdfBytes(arrayBuffer);
      setPdfDocProxy(pdfDoc);
      
      // Set active page
      if (loadedPages.length > 0) {
        setActivePageId(loadedPages[0].id);
      }

      // Initialize blank overlays for each page
      const initialOverlays: Record<string, EditorElement[]> = {};
      loadedPages.forEach((p) => {
        initialOverlays[p.id] = [];
      });
      resetHistory(initialOverlays);
      setPages(loadedPages);
      addToast('PDF loaded successfully!', 'success');

      // Generate thumbnails asynchronously
      for (let i = 0; i < loadedPages.length; i++) {
        const thumbUrl = await generateThumbnail(pdfDoc, i, loadedPages[i].rotation);
        setPages((prevPages) =>
          prevPages.map((p, idx) => (idx === i ? { ...p, thumbnailUrl: thumbUrl } : p))
        );
      }
    } catch (err) {
      console.error(err);
      addToast('Failed to load PDF file. Is it corrupted?', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      processPdfFile(file);
    } else {
      addToast('Please upload a valid PDF file.', 'error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processPdfFile(file);
    }
  };

  // Page Operations
  const handleRotatePage = async (pageId: string) => {
    if (!pdfDocProxy) return;
    
    // Update rotation in states
    let updatedPage: EditorPage | null = null;
    setPages((prevPages) => {
      const index = prevPages.findIndex((p) => p.id === pageId);
      if (index === -1) return prevPages;
      const pagesCopy = [...prevPages];
      const nextRotation = (pagesCopy[index].rotation + 90) % 360;
      pagesCopy[index] = {
        ...pagesCopy[index],
        rotation: nextRotation,
      };
      updatedPage = pagesCopy[index];
      return pagesCopy;
    });

    addToast('Rotating page...', 'info');

    // Regenerate thumbnail asynchronously
    setTimeout(async () => {
      if (updatedPage && pdfDocProxy) {
        const thumbUrl = await generateThumbnail(
          pdfDocProxy,
          updatedPage.originalIndex,
          updatedPage.rotation
        );
        setPages((prevPages) =>
          prevPages.map((p) => (p.id === pageId ? { ...p, thumbnailUrl: thumbUrl } : p))
        );
      }
    }, 100);
  };

  const handleDeletePage = (pageId: string) => {
    if (pages.length <= 1) return;

    const pageIndex = pages.findIndex((p) => p.id === pageId);
    const updatedPages = pages.filter((p) => p.id !== pageId);
    setPages(updatedPages);

    // Update active page
    if (activePageId === pageId) {
      const nextActiveIndex = Math.min(pageIndex, updatedPages.length - 1);
      setActivePageId(updatedPages[nextActiveIndex].id);
    }

    addToast('Page deleted', 'info');
  };

  const handleAddBlankPage = (afterPageId: string) => {
    const pageIndex = pages.findIndex((p) => p.id === afterPageId);
    if (pageIndex === -1) return;

    // Create a standard A4 page (595.28 x 841.89 points)
    const newPage: EditorPage = {
      id: `blank-${Date.now()}-${Math.random()}`,
      originalIndex: -1, // Indicates a blank page
      rotation: 0,
      width: 595,
      height: 842,
    };

    const updatedPages = [...pages];
    updatedPages.splice(pageIndex + 1, 0, newPage);
    setPages(updatedPages);

    // Initialize state overlays for new page
    setElementsState((prev) => ({
      ...prev,
      [newPage.id]: [],
    }));

    setActivePageId(newPage.id);
    addToast('Blank page inserted', 'success');
  };

  const handleReorderPages = (dragIndex: number, hoverIndex: number) => {
    const dragPage = pages[dragIndex];
    const updatedPages = [...pages];
    updatedPages.splice(dragIndex, 1);
    updatedPages.splice(hoverIndex, 0, dragPage);
    setPages(updatedPages);
  };

  // Overlay operations
  const handleAddElement = (pageId: string, element: EditorElement) => {
    setElementsState((prev) => {
      const pageElements = prev[pageId] ? [...prev[pageId]] : [];
      return {
        ...prev,
        [pageId]: [...pageElements, element],
      };
    });
  };

  const handleUpdateElement = (pageId: string, elemId: string, updates: Partial<EditorElement>) => {
    setElementsState((prev) => {
      const pageElements = prev[pageId] || [];
      const updatedElements = pageElements.map((el) => {
        if (el.id === elemId) {
          return { ...el, ...updates } as EditorElement;
        }
        return el;
      });
      return {
        ...prev,
        [pageId]: updatedElements,
      };
    }, true); // overwrite: true to avoid adding intermediate resizing/dragging steps to undo stack
  };

  const handleDeleteElement = (pageId: string, elemId: string) => {
    setElementsState((prev) => {
      const pageElements = prev[pageId] || [];
      return {
        ...prev,
        [pageId]: pageElements.filter((el) => el.id !== elemId),
      };
    });
    setSelectedElementId(null);
  };

  // Compile and Download PDF
  const handleDownloadPdf = async () => {
    if (!pdfBytes) return;
    setIsExporting(true);
    addToast('Compiling document...', 'info');

    try {
      const compiledBytes = await compilePdf(pdfBytes, pages, elementsState);
      
      // Download blob
      const blob = new Blob([compiledBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Delight: Confetti trigger!
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#8b5cf6', '#10b981', '#ffffff'],
      });

      addToast('Download completed successfully!', 'success');
    } catch (err) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      addToast(`Failed to compile PDF: ${errMsg}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveSignature = (dataUrl: string) => {
    setActiveSignature(dataUrl);
    setActiveTool('signature');
    addToast('Signature created! Click on any page to place it.', 'success');
  };

  return (
    <div className="app-container">
      {/* Top Header Navigation */}
      <header className="app-header glass">
        <div className="header-logo">
          <div className="logo-sparkle">
            <Sparkles size={16} />
          </div>
          <h1>ProPDF Editor</h1>
          <span className="logo-badge">v1.0</span>
        </div>

        {pdfBytes && (
          <div className="header-file-name-container">
            <FileEdit size={16} className="file-edit-icon" />
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="file-name-input"
              placeholder="Name your file..."
              title="Click to rename document"
            />
          </div>
        )}

        <div className="header-actions">
          <button 
            className="theme-toggle-btn text-tooltip" 
            onClick={toggleTheme}
            data-tooltip={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {pdfBytes && (
            <button
              className="download-btn btn-primary"
              onClick={handleDownloadPdf}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Clock size={16} className="spinner" /> Compiling...
                </>
              ) : (
                <>
                  <Download size={16} /> Export PDF
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Frame */}
      {pdfBytes ? (
        <div className="workspace-layout">
          {/* Left Thumbnail Organizer */}
          <ThumbnailSidebar
            pages={pages}
            activePageId={activePageId}
            setActivePageId={setActivePageId}
            onRotatePage={handleRotatePage}
            onDeletePage={handleDeletePage}
            onAddBlankPage={handleAddBlankPage}
            onReorderPages={handleReorderPages}
          />

          {/* Core Interactive Drawing Viewport */}
          <main className="editor-viewport" onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}>
            <div className="editor-scroller">
              {pages.map((page) => (
                <PageCanvas
                  key={page.id}
                  pdfDoc={pdfDocProxy!}
                  page={page}
                  scale={zoom}
                  isActive={page.id === activePageId}
                  activeTool={activeTool}
                  elements={elementsState[page.id] || []}
                  selectedElementId={selectedElementId}
                  setSelectedElementId={setSelectedElementId}
                  addElement={handleAddElement}
                  updateElement={handleUpdateElement}
                  deleteElement={handleDeleteElement}
                  defaultTextConfig={defaultTextConfig}
                  defaultShapeConfig={defaultShapeConfig}
                  brushConfig={brushConfig}
                  activeSignature={activeSignature}
                  setActiveSignature={setActiveSignature}
                />
              ))}
            </div>
            
            {/* Overlay float toolbar */}
            <Toolbar
              activeTool={activeTool}
              setActiveTool={handleSelectTool}
              undo={undo}
              redo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              zoom={zoom}
              setZoom={setZoom}
              openSignatureModal={() => setIsSignatureModalOpen(true)}
            />
          </main>

          {/* Right Properties Customizer */}
          <PropertiesPanel
            selectedElement={
              activePageId && selectedElementId
                ? elementsState[activePageId]?.find((el) => el.id === selectedElementId) || null
                : null
            }
            updateElement={(id, updates) => activePageId && handleUpdateElement(activePageId, id, updates)}
            defaultTextConfig={defaultTextConfig}
            setDefaultTextConfig={setDefaultTextConfig}
            defaultShapeConfig={defaultShapeConfig}
            setDefaultShapeConfig={setDefaultShapeConfig}
            brushConfig={brushConfig}
            setBrushConfig={setBrushConfig}
          />
        </div>
      ) : (
        /* Empty Upload Screen */
        <div 
          className="upload-screen"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <div className="upload-container glass-card">
            <div className="upload-icon-wrapper">
              <Upload size={40} className="glow-icon" />
            </div>
            <h2>Create & Edit PDFs Online</h2>
            <p className="upload-subtitle">Drag and drop your PDF here, or browse local files to begin editing.</p>
            
            <label className="browse-files-btn btn-primary cursor-pointer">
              Choose PDF File
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>

            <div className="features-grid">
              <div className="feature-item">
                <span className="feature-dot magenta" />
                <div>
                  <h4>Whiteout & Erase</h4>
                  <p>Cover confidential information instantly.</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-dot violet" />
                <div>
                  <h4>Edit Text</h4>
                  <p>Add annotations, comments, and typed text layers.</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-dot emerald" />
                <div>
                  <h4>Sign Documents</h4>
                  <p>Draw or type digital signatures to stamp pages.</p>
                </div>
              </div>
              <div className="feature-item">
                <span className="feature-dot indigo" />
                <div>
                  <h4>Organize Pages</h4>
                  <p>Rotate, delete, insert, or reorder pages dynamically.</p>
                </div>
              </div>
            </div>

            <div className="upload-privacy-footer">
              <Sparkles size={12} />
              <span>100% Secure & Client-Side. Your documents never leave your browser.</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal Signature Stamp Maker */}
      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={handleSaveSignature}
      />

      {/* Custom Global Toast Container */}
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* Global Processing/Loading Overlay */}
      {isUploading && (
        <div className="modal-overlay">
          <div className="modal-content glass" style={{ padding: '32px', textAlign: 'center', maxWidth: '300px' }}>
            <Clock size={40} className="spinner" style={{ color: 'var(--accent-primary)', marginBottom: '16px' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '8px' }}>Processing PDF</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Rendering pages & generating thumbnails...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
