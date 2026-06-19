import React from 'react';
import { Settings, Bold, Italic, Underline, Sliders, Palette, X } from 'lucide-react';
import type { EditorElement, TextElement, ShapeElement } from '../utils/pdfHelper';

interface PropertiesPanelProps {
  selectedElement: EditorElement | null;
  updateElement: (elemId: string, updates: Partial<EditorElement>) => void;
  // Default properties when creating new items
  defaultTextConfig: {
    fontSize: number;
    fontFamily: 'Helvetica' | 'Times' | 'Courier';
    color: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  };
  setDefaultTextConfig: React.Dispatch<React.SetStateAction<{
    fontSize: number;
    fontFamily: 'Helvetica' | 'Times' | 'Courier';
    color: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }>>;
  defaultShapeConfig: {
    shapeType: 'rectangle' | 'circle' | 'line';
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
  };
  setDefaultShapeConfig: React.Dispatch<React.SetStateAction<{
    shapeType: 'rectangle' | 'circle' | 'line';
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
  }>>;
  brushConfig: {
    color: string;
    thickness: number;
    isHighlighter: boolean;
  };
  setBrushConfig: React.Dispatch<React.SetStateAction<{
    color: string;
    thickness: number;
    isHighlighter: boolean;
  }>>;
  className?: string;
  onClose?: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedElement,
  updateElement,
  defaultTextConfig,
  setDefaultTextConfig,
  defaultShapeConfig,
  setDefaultShapeConfig,
  brushConfig,
  setBrushConfig,
  className,
  onClose,
}) => {
  const textColors = ['#000000', '#1e293b', '#b91c1c', '#1d4ed8', '#047857', '#eab308', '#d946ef', '#ffffff'];
  const shapeColors = ['#000000', '#1e293b', '#b91c1c', '#1d4ed8', '#047857', '#eab308', '#d946ef', 'transparent'];

  const handleTextChange = <K extends keyof typeof defaultTextConfig>(key: K, value: typeof defaultTextConfig[K]) => {
    if (selectedElement && selectedElement.type === 'text') {
      updateElement(selectedElement.id, { [key]: value });
    } else {
      setDefaultTextConfig((prev) => ({ ...prev, [key]: value }));
    }
  };

  const handleShapeChange = <K extends keyof typeof defaultShapeConfig>(key: K, value: typeof defaultShapeConfig[K]) => {
    if (selectedElement && selectedElement.type === 'shape') {
      updateElement(selectedElement.id, { [key]: value });
    } else {
      setDefaultShapeConfig((prev) => ({ ...prev, [key]: value }));
    }
  };

  const handleBrushChange = <K extends keyof typeof brushConfig>(key: K, value: typeof brushConfig[K]) => {
    setBrushConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Render text properties
  const renderTextProperties = (elem?: TextElement) => {
    const config = elem || defaultTextConfig;

    return (
      <div className="property-group">
        <h4>Text Settings</h4>
        
        {/* Font Family */}
        <div className="property-item">
          <label>Font Family</label>
          <select
            value={config.fontFamily}
            onChange={(e) => handleTextChange('fontFamily', e.target.value as 'Helvetica' | 'Times' | 'Courier')}
            className="property-select"
          >
            <option value="Helvetica">Helvetica (Standard)</option>
            <option value="Times">Times New Roman</option>
            <option value="Courier">Courier Monospace</option>
          </select>
        </div>

        {/* Font Size */}
        <div className="property-item">
          <label>Font Size ({config.fontSize}px)</label>
          <input
            type="range"
            min="8"
            max="72"
            value={config.fontSize}
            onChange={(e) => handleTextChange('fontSize', parseInt(e.target.value))}
            className="property-slider"
          />
        </div>

        {/* Font Styles */}
        <div className="property-item">
          <label>Text Style</label>
          <div className="style-button-group">
            <button
              className={`style-btn ${config.bold ? 'active' : ''}`}
              onClick={() => handleTextChange('bold', !config.bold)}
              title="Bold"
            >
              <Bold size={16} />
            </button>
            <button
              className={`style-btn ${config.italic ? 'active' : ''}`}
              onClick={() => handleTextChange('italic', !config.italic)}
              title="Italic"
            >
              <Italic size={16} />
            </button>
            <button
              className={`style-btn ${config.underline ? 'active' : ''}`}
              onClick={() => handleTextChange('underline', !config.underline)}
              title="Underline"
            >
              <Underline size={16} />
            </button>
          </div>
        </div>

        {/* Text Color */}
        <div className="property-item">
          <label>Color</label>
          <div className="color-grid">
            {textColors.map((color) => (
              <button
                key={color}
                className={`color-swatch ${config.color === color ? 'active' : ''}`}
                style={{ backgroundColor: color === 'transparent' ? '#ffffff' : color }}
                onClick={() => handleTextChange('color', color)}
                title={color}
              >
                {color === 'transparent' && <span className="no-color-slash" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Render shape properties
  const renderShapeProperties = (elem?: ShapeElement) => {
    const isEditing = !!elem;
    const config = elem || defaultShapeConfig;

    return (
      <div className="property-group">
        <h4>Shape Settings</h4>

        {/* Shape Selection (if creating new) */}
        {!isEditing && (
          <div className="property-item">
            <label>Shape Type</label>
            <select
              value={config.shapeType}
              onChange={(e) => handleShapeChange('shapeType', e.target.value as 'rectangle' | 'circle' | 'line')}
              className="property-select"
            >
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="line">Line</option>
            </select>
          </div>
        )}

        {/* Stroke / Outline Width */}
        <div className="property-item">
          <label>Border Width ({config.strokeWidth}px)</label>
          <input
            type="range"
            min="1"
            max="12"
            value={config.strokeWidth}
            onChange={(e) => handleShapeChange('strokeWidth', parseInt(e.target.value))}
            className="property-slider"
          />
        </div>

        {/* Shape Opacity */}
        <div className="property-item">
          <label>Opacity ({(config.opacity * 100).toFixed(0)}%)</label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={config.opacity}
            onChange={(e) => handleShapeChange('opacity', parseFloat(e.target.value))}
            className="property-slider"
          />
        </div>

        {/* Stroke / Outline Color */}
        <div className="property-item">
          <label>Border Color</label>
          <div className="color-grid">
            {textColors.map((color) => (
              <button
                key={color}
                className={`color-swatch ${config.strokeColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => handleShapeChange('strokeColor', color)}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* Fill Color */}
        <div className="property-item">
          <label>Fill Color</label>
          <div className="color-grid">
            {shapeColors.map((color) => (
              <button
                key={color}
                className={`color-swatch ${config.fillColor === color ? 'active' : ''}`}
                style={{
                  backgroundColor: color === 'transparent' ? 'white' : color,
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onClick={() => handleShapeChange('fillColor', color)}
                title={color}
              >
                {color === 'transparent' && <span className="no-color-slash" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Render brush properties (always default since pen strokes are committed after drawing)
  const renderBrushProperties = () => {
    return (
      <div className="property-group">
        <h4>Pen & Highlighter</h4>

        {/* Thickness */}
        <div className="property-item">
          <label>Brush Size ({brushConfig.thickness}px)</label>
          <input
            type="range"
            min="1"
            max="20"
            value={brushConfig.thickness}
            onChange={(e) => handleBrushChange('thickness', parseInt(e.target.value))}
            className="property-slider"
          />
        </div>

        {/* Highlighter Toggle */}
        <div className="property-item">
          <label>Brush Mode</label>
          <div className="mode-toggle-group">
            <button
              className={`mode-btn ${!brushConfig.isHighlighter ? 'active' : ''}`}
              onClick={() => handleBrushChange('isHighlighter', false)}
            >
              Solid Pen
            </button>
            <button
              className={`mode-btn ${brushConfig.isHighlighter ? 'active' : ''}`}
              onClick={() => handleBrushChange('isHighlighter', true)}
            >
              Highlighter
            </button>
          </div>
        </div>

        {/* Colors */}
        <div className="property-item">
          <label>Color</label>
          <div className="color-grid">
            {textColors.map((color) => (
              <button
                key={color}
                className={`color-swatch ${brushConfig.color === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => handleBrushChange('color', color)}
                title={color}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className={`properties-panel glass ${className || ''}`}>
      <div className="panel-header">
        <Settings size={18} />
        <h3>Properties</h3>
        {onClose && (
          <button className="sidebar-close-btn mobile-only" onClick={onClose} aria-label="Close Properties Panel">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="panel-body">
        {selectedElement ? (
          <div className="selected-element-badge">
            <span>Editing Selected: <strong>{selectedElement.type}</strong></span>
          </div>
        ) : (
          <div className="no-selection-badge">
            <span>Configuring Tools</span>
          </div>
        )}

        {/* Display options contextually */}
        {selectedElement?.type === 'text' && renderTextProperties(selectedElement as TextElement)}
        {selectedElement?.type === 'shape' && renderShapeProperties(selectedElement as ShapeElement)}
        {selectedElement?.type === 'drawing' && (
          <div className="placeholder-info-box">
            <Sliders size={20} />
            <p>Freehand drawings cannot be styled retroactively. Configure brush settings before drawing.</p>
          </div>
        )}
        {selectedElement?.type === 'whiteout' && (
          <div className="placeholder-info-box">
            <Palette size={20} />
            <p>Whiteout rectangle hides content beneath it. Resize and drag it to adjust coverage.</p>
          </div>
        )}

        {/* If no element is selected, show configuration menus based on what might be used */}
        {!selectedElement && (
          <>
            {renderTextProperties()}
            <hr className="property-separator" />
            {renderShapeProperties()}
            <hr className="property-separator" />
            {renderBrushProperties()}
          </>
        )}
      </div>
    </aside>
  );
};

export default PropertiesPanel;
