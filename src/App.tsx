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
import Toolbar from './components/Toolbar';
import type { ToolType } from './components/Toolbar';
import ThumbnailSidebar from './components/ThumbnailSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import PageCanvas from './components/PageCanvas';
import SignatureModal from './components/SignatureModal';
import SubscriptionModal from './components/SubscriptionModal';
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
  // User Authentication & Subscription States
  const [user, setUser] = useState<{ name: string; email: string; avatar: string } | null>(null);
  const [subscription, setSubscription] = useState<{ active: boolean; planName: string; expiresAt: number } | null>(null);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  // Google Mock Sign-in States
  const [showMockGooglePopup, setShowMockGooglePopup] = useState(false);
  const [googleNameInput, setGoogleNameInput] = useState('');
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

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
    
    const savedUser = localStorage.getItem('propdf_user');
    const savedSubscription = localStorage.getItem('propdf_subscription');
    
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    
    if (savedSubscription) {
      const parsedSub = JSON.parse(savedSubscription);
      // Check if subscription has expired
      if (parsedSub.expiresAt > Date.now()) {
        setSubscription(parsedSub);
      } else {
        localStorage.removeItem('propdf_subscription');
      }
    }
  }, []);

  const handleLogin = (name: string, email: string) => {
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&bold=true`;
    const newUser = { name, email, avatar };
    setUser(newUser);
    localStorage.setItem('propdf_user', JSON.stringify(newUser));
    addToast(`Signed in as ${name}! Welcome to ProPDF Editor.`, 'success');
  };

  const handleLogout = () => {
    setUser(null);
    setSubscription(null);
    setShowProfileMenu(false);
    localStorage.removeItem('propdf_user');
    localStorage.removeItem('propdf_subscription');
    addToast('Signed out successfully.', 'info');
  };

  const handleSubscriptionSuccess = (planName: string, days: number, price: number) => {
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    const newSubscription = { active: true, planName, expiresAt };
    setSubscription(newSubscription);
    localStorage.setItem('propdf_subscription', JSON.stringify(newSubscription));
    setIsSubscriptionModalOpen(false);
    
    addToast(`Payment of ₹${price} verified! Plan active for ${days} days.`, 'success');
    
    // Perform download immediately
    setTimeout(() => {
      performDownload();
    }, 100);
  };

  const handleMockGoogleSignInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleNameInput.trim() || !googleEmailInput.trim()) return;

    setIsSigningIn(true);
    setTimeout(() => {
      handleLogin(googleNameInput, googleEmailInput);
      setIsSigningIn(false);
      setShowMockGooglePopup(false);
      setGoogleEmailInput('');
      setGoogleNameInput('');
    }, 1200);
  };

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

  // Perform compilation and file download
  const performDownload = async () => {
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

  // Guarded download action checking subscription active state
  const handleDownloadPdf = () => {
    if (!subscription || !subscription.active || subscription.expiresAt <= Date.now()) {
      setIsSubscriptionModalOpen(true);
      addToast('Premium subscription required to export files.', 'error');
      return;
    }
    performDownload();
  };

  const handleSaveSignature = (dataUrl: string) => {
    setActiveSignature(dataUrl);
    setActiveTool('signature');
    addToast('Signature created! Click on any page to place it.', 'success');
  };

  if (!user) {
    return (
      <div className="app-container signin-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'radial-gradient(circle at top right, var(--bg-header-glow), var(--bg-workspace))' }}>
        <div className="signin-lock-screen glass-card" style={{ padding: '48px', maxWidth: '420px', width: '90%', textAlign: 'center', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)' }}>
          <div className="signin-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
            <div className="logo-sparkle large" style={{ background: 'var(--accent-gradient-primary)', padding: '14px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: '#fff', boxShadow: 'var(--accent-shadow-primary)' }}>
              <Sparkles size={28} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color: 'var(--text-primary)' }}>ProPDF Editor</h2>
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: '12px', color: 'var(--text-primary)' }}>Unlock Premium Editing</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '32px' }}>
            Please sign in with your Google account to access drawing tools, page reorganization, signatures, and instant exports.
          </p>
          
          <button 
            className="google-signin-btn" 
            onClick={() => setShowMockGooglePopup(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 24px',
              background: '#ffffff',
              border: '1px solid #dadce0',
              borderRadius: '8px',
              color: '#3c4043',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background-color 0.2s, box-shadow 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" style={{ display: 'block' }}>
              <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.69 5.69 0 0 1 8.3 12.825a5.69 5.69 0 0 1 5.69-5.69c2.47 0 4.547 1.577 5.297 3.774l3.968-3.078C21.186 4.14 17.514 2 13.99 2 7.92 2 3 6.92 3 13s4.92 11 10.99 11c6.03 0 10.744-4.32 10.744-10.715 0-.685-.06-1.342-.172-1.999H12.24z"/>
            </svg>
            <span>Sign in with Google</span>
          </button>

          <div className="signin-features-mini" style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '32px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span>✓ Secure Client-Side</span>
            <span>✓ Instant PDF Save</span>
          </div>
        </div>

        {/* Mock Google Login Popup Modal */}
        {showMockGooglePopup && (
          <div className="modal-overlay" style={{ zIndex: 1000 }}>
            <div className="modal-content glass mock-google-auth-popup animate-scale-up" style={{ padding: '32px', maxWidth: '360px', borderRadius: '12px', textAlign: 'center' }}>
              <div className="google-popup-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                <svg viewBox="0 0 24 24" width="32" height="32" style={{ marginBottom: '12px' }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '500', margin: '0 0 4px 0' }}>Sign in</h2>
                <p style={{ fontSize: '0.85rem', color: '#5f6368', margin: 0 }}>to continue to ProPDF Editor</p>
              </div>
              
              <form onSubmit={handleMockGoogleSignInSubmit} className="google-popup-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={googleNameInput}
                  onChange={(e) => setGoogleNameInput(e.target.value)}
                  className="google-input"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.9rem', outline: 'none' }}
                />
                <input
                  type="email"
                  required
                  placeholder="Email Address"
                  value={googleEmailInput}
                  onChange={(e) => setGoogleEmailInput(e.target.value)}
                  className="google-input"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', fontSize: '0.9rem', outline: 'none' }}
                />
                
                <div className="google-popup-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <button 
                    type="button" 
                    className="google-btn-flat"
                    onClick={() => setShowMockGooglePopup(false)}
                    style={{ padding: '8px 16px', background: 'none', border: 'none', color: '#1a73e8', fontWeight: '500', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="google-btn-primary"
                    disabled={isSigningIn}
                    style={{ padding: '8px 20px', background: '#1a73e8', border: 'none', borderRadius: '4px', color: '#fff', fontWeight: '500', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    {isSigningIn ? (
                      <Clock size={14} className="spinner" />
                    ) : 'Next'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

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

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            className="theme-toggle-btn text-tooltip" 
            onClick={toggleTheme}
            data-tooltip={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Google Profile Badge dropdown */}
          {user && (
            <div className="header-profile-menu-container" style={{ position: 'relative' }}>
              <button 
                className="header-profile-btn"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', color: 'var(--text-primary)' }}
              >
                <img src={user.avatar} alt={user.name} className="profile-avatar-img" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                <span className="profile-name-span" style={{ fontSize: '0.85rem', fontWeight: '500' }}>{user.name.split(' ')[0]}</span>
              </button>
              
              {showProfileMenu && (
                <div className="profile-dropdown-menu glass animate-scale-up" style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', width: '220px', padding: '16px', borderRadius: '12px', zIndex: 100, boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)' }}>
                  <div className="profile-dropdown-header" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{user.name}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{user.email}</span>
                  </div>
                  <hr className="dropdown-divider" style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />
                  <div className="profile-dropdown-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                    <div className="subscription-status-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Subscription:</span>
                      {subscription && subscription.active ? (
                        <span className="sub-badge active" style={{ background: 'var(--accent-gradient-primary)', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: '600' }}>Pro Active</span>
                      ) : (
                        <span className="sub-badge trial" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem' }}>Free Trial</span>
                      )}
                    </div>
                    {subscription && subscription.active && (
                      <div className="expiry-display-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Expires:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{new Date(subscription.expiresAt).toLocaleDateString()}</strong>
                      </div>
                    )}
                  </div>
                  <hr className="dropdown-divider" style={{ border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />
                  <button className="dropdown-item logout-btn-item" onClick={handleLogout} style={{ width: '100%', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '6px', color: '#ef4444', fontWeight: '600', cursor: 'pointer', textAlign: 'center', fontSize: '0.8rem' }}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}

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

      {/* Modal Subscription Gate */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        onSuccess={handleSubscriptionSuccess}
        user={user}
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
