import React, { useState } from 'react';
import { RotateCw, Trash2, Plus, FileText, X } from 'lucide-react';
import type { EditorPage } from '../utils/pdfHelper';

interface ThumbnailSidebarProps {
  pages: EditorPage[];
  activePageId: string | null;
  setActivePageId: (id: string) => void;
  onRotatePage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onAddBlankPage: (afterId: string) => void;
  onReorderPages: (dragIndex: number, hoverIndex: number) => void;
  className?: string;
  onClose?: () => void;
}

export const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({
  pages,
  activePageId,
  setActivePageId,
  onRotatePage,
  onDeletePage,
  onAddBlankPage,
  onReorderPages,
  className,
  onClose,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag preview for modern browsers if needed
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    // Smoothly swap places
    onReorderPages(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const scrollToPage = (pageId: string) => {
    setActivePageId(pageId);
    const element = document.getElementById(`page-container-${pageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (onClose && window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <aside className={`thumbnail-sidebar glass ${className || ''}`}>
      <div className="sidebar-header">
        <FileText size={18} />
        <h3>Pages</h3>
        <span className="page-count-badge">{pages.length}</span>
        {onClose && (
          <button className="sidebar-close-btn mobile-only" onClick={onClose} aria-label="Close Pages Panel">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="thumbnails-list">
        {pages.map((page, index) => {
          const isActive = page.id === activePageId;
          const isDraggingThis = index === draggedIndex;

          return (
            <div
              key={page.id}
              className={`thumbnail-item-wrapper ${isActive ? 'active' : ''} ${isDraggingThis ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              {/* Drag Handle & Page Number */}
              <div className="thumbnail-index">
                <span className="drag-indicator">⋮⋮</span>
                <span>Page {index + 1}</span>
              </div>

              {/* Thumbnail Frame */}
              <div
                className="thumbnail-card"
                onClick={() => scrollToPage(page.id)}
              >
                {page.thumbnailUrl ? (
                  <img
                    src={page.thumbnailUrl}
                    alt={`Thumbnail of page ${index + 1}`}
                    style={{
                      transform: `rotate(${page.rotation}deg)`,
                      transition: 'transform 0.2s ease',
                    }}
                  />
                ) : (
                  <div className="thumbnail-placeholder">
                    <span>Blank Page</span>
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              <div className="thumbnail-actions">
                <button
                  className="action-btn text-tooltip"
                  onClick={() => onRotatePage(page.id)}
                  data-tooltip="Rotate 90° Clockwise"
                  aria-label="Rotate Page"
                >
                  <RotateCw size={13} />
                </button>
                
                <button
                  className="action-btn text-tooltip"
                  onClick={() => onAddBlankPage(page.id)}
                  data-tooltip="Insert Blank Page After"
                  aria-label="Insert Blank Page"
                >
                  <Plus size={13} />
                </button>

                <button
                  className="action-btn delete text-tooltip"
                  onClick={() => onDeletePage(page.id)}
                  disabled={pages.length <= 1}
                  data-tooltip="Delete Page"
                  aria-label="Delete Page"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default ThumbnailSidebar;
