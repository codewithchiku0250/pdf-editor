import React, { useRef, useState, useEffect } from 'react';
import { X, Palette, Trash2, Edit3, Type } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({ isOpen, onClose, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTab, setActiveTab] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState<'dancing' | 'vibes' | 'alex' | 'reenie'>('dancing');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [isDrawing, setIsDrawing] = useState(false);

  // Re-load Google Fonts for signature styles
  useEffect(() => {
    if (isOpen) {
      const link = document.createElement('link');
      link.href = 'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Dancing+Script:wght@700&family=Great+Vibes&family=Reenie+Beanie&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => {
        document.head.removeChild(link);
      };
    }
  }, [isOpen]);

  // Handle canvas drawing operations
  useEffect(() => {
    if (activeTab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
      }
    }
  }, [activeTab, strokeColor, isOpen]);

  if (!isOpen) return null;

  const getCanvasContext = () => {
    if (!canvasRef.current) return null;
    return canvasRef.current.getContext('2d');
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Check if touch event
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = getCanvasContext();
    if (!ctx) return;
    
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = getCanvasContext();
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Check if canvas is empty before saving
      const isEmpty = !canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data.some(channel => channel !== 0);
      if (isEmpty) return; // Don't save empty canvas

      onSave(canvas.toDataURL('image/png'));
      onClose();
    } else {
      if (!typedName.trim()) return;

      // Create a temporary canvas to render the typed text to PNG
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = strokeColor;
        
        let fontName = "'Dancing Script', cursive";
        let size = '60px';
        if (selectedFont === 'vibes') {
          fontName = "'Great Vibes', cursive";
          size = '68px';
        } else if (selectedFont === 'alex') {
          fontName = "'Alex Brush', cursive";
          size = '72px';
        } else if (selectedFont === 'reenie') {
          fontName = "'Reenie Beanie', cursive";
          size = '80px';
        }

        ctx.font = `${size} ${fontName}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw text in the middle of canvas
        ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
        
        onSave(canvas.toDataURL('image/png'));
        onClose();
      }
    }
  };

  const getFontFamily = (fontType: typeof selectedFont) => {
    switch (fontType) {
      case 'dancing':
        return "'Dancing Script', cursive";
      case 'vibes':
        return "'Great Vibes', cursive";
      case 'alex':
        return "'Alex Brush', cursive";
      case 'reenie':
        return "'Reenie Beanie', cursive";
    }
  };

  const colors = ['#000000', '#0f172a', '#1e3a8a', '#b91c1c', '#047857'];

  return (
    <div className="modal-overlay">
      <div className="modal-content glass signature-modal">
        <div className="modal-header">
          <h2>Create Signature</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === 'draw' ? 'active' : ''}`}
            onClick={() => setActiveTab('draw')}
          >
            <Edit3 size={16} /> Draw
          </button>
          <button
            className={`tab-btn ${activeTab === 'type' ? 'active' : ''}`}
            onClick={() => setActiveTab('type')}
          >
            <Type size={16} /> Type
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'draw' ? (
            <div className="signature-draw-area">
              <canvas
                ref={canvasRef}
                width={500}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="signature-canvas"
              />
              <button className="clear-canvas-btn" onClick={clearCanvas}>
                <Trash2 size={14} /> Clear
              </button>
            </div>
          ) : (
            <div className="signature-type-area">
              <input
                type="text"
                placeholder="Type your name..."
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                maxLength={25}
                className="signature-type-input"
              />
              <div className="signature-font-options">
                {(['dancing', 'vibes', 'alex', 'reenie'] as const).map((font) => (
                  <button
                    key={font}
                    className={`font-preview-btn ${selectedFont === font ? 'active' : ''}`}
                    style={{ fontFamily: getFontFamily(font), color: strokeColor }}
                    onClick={() => setSelectedFont(font)}
                  >
                    {typedName || 'Signature'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="signature-color-picker">
            <div className="color-label">
              <Palette size={16} /> Color:
            </div>
            <div className="color-options">
              {colors.map((c) => (
                <button
                  key={c}
                  className={`color-dot ${strokeColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setStrokeColor(c)}
                  aria-label={`Select signature color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={activeTab === 'draw' ? false : !typedName.trim()}
          >
            Create Stamp
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignatureModal;
