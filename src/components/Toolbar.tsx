import React from 'react';
import {
  MousePointer,
  Type,
  Edit2,
  Square,
  Image as ImageIcon,
  PenTool,
  Eraser,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Sparkles,
} from 'lucide-react';

export type ToolType = 'select' | 'text' | 'draw' | 'shape' | 'image' | 'signature' | 'whiteout';

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  setZoom: (zoom: number) => void;
  openSignatureModal: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  setActiveTool,
  undo,
  redo,
  canUndo,
  canRedo,
  zoom,
  setZoom,
  openSignatureModal,
}) => {
  const tools = [
    { id: 'select', name: 'Select / Move', icon: <MousePointer size={18} /> },
    { id: 'text', name: 'Add Text', icon: <Type size={18} /> },
    { id: 'draw', name: 'Freehand Draw', icon: <Edit2 size={18} /> },
    { id: 'shape', name: 'Shapes', icon: <Square size={18} /> },
    { id: 'image', name: 'Insert Image', icon: <ImageIcon size={18} /> },
    { id: 'signature', name: 'Signature', icon: <PenTool size={18} /> },
    { id: 'whiteout', name: 'Whiteout / Erase', icon: <Eraser size={18} /> },
  ] as const;

  const handleToolClick = (toolId: ToolType) => {
    if (toolId === 'signature') {
      openSignatureModal();
    } else {
      setActiveTool(toolId);
    }
  };

  const handleZoomIn = () => {
    setZoom(Math.min(zoom + 0.1, 2.0));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(zoom - 0.1, 0.5));
  };

  return (
    <div className="floating-toolbar-wrapper">
      <div className="floating-toolbar glass">
        {/* Undo / Redo Section */}
        <div className="toolbar-section">
          <button
            className="toolbar-btn text-tooltip"
            onClick={undo}
            disabled={!canUndo}
            data-tooltip="Undo (Ctrl+Z)"
          >
            <Undo2 size={18} />
          </button>
          <button
            className="toolbar-btn text-tooltip"
            onClick={redo}
            disabled={!canRedo}
            data-tooltip="Redo (Ctrl+Y)"
          >
            <Redo2 size={18} />
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Tools Section */}
        <div className="toolbar-section flex-row">
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={`toolbar-btn text-tooltip ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => handleToolClick(tool.id)}
              data-tooltip={tool.name}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        {/* Zoom Controls */}
        <div className="toolbar-section">
          <button
            className="toolbar-btn text-tooltip"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            data-tooltip="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <span className="zoom-text">{(zoom * 100).toFixed(0)}%</span>
          <button
            className="toolbar-btn text-tooltip"
            onClick={handleZoomIn}
            disabled={zoom >= 2.0}
            data-tooltip="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
        </div>
      </div>
      
      {/* Mini Active Tool Indicator */}
      <div className="active-tool-banner glass-dark">
        <Sparkles size={12} className="sparkle-icon" />
        <span>Mode: <strong>{activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}</strong></span>
      </div>
    </div>
  );
};

export default Toolbar;
