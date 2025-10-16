import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

interface PhotoViewerProps {
  filename?: string;
  onClose?: () => void;
}

const PhotoViewer: React.FC<PhotoViewerProps> = ({ filename: propFilename, onClose }) => {
  const { filename: paramFilename } = useParams<{ filename: string }>();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const filename = propFilename || paramFilename;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleDownload = () => {
    if (filename) {
      const link = document.createElement('a');
      link.href = `/api/files/${filename}`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        handleClose();
        break;
      case '+':
      case '=':
        handleZoomIn();
        break;
      case '-':
        handleZoomOut();
        break;
      case 'r':
      case 'R':
        handleRotate();
        break;
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!filename) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="text-white text-center">
          <p className="text-xl mb-4">Файл не знайдено</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Закрити
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
      {/* Панель управління */}
      <div className="absolute top-4 right-4 flex items-center space-x-2 z-10">
        <button
          onClick={handleZoomOut}
          className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
          title="Зменшити (клавіша -)"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
          title="Збільшити (клавіша +)"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={handleRotate}
          className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
          title="Повернути (клавіша R)"
        >
          <RotateCw className="w-5 h-5" />
        </button>
        <button
          onClick={handleDownload}
          className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
          title="Завантажити"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          onClick={handleClose}
          className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
          title="Закрити (Escape)"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Індикатор масштабу */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
        {Math.round(zoom * 100)}%
      </div>

      {/* Зображення */}
      <div className="flex items-center justify-center w-full h-full p-4">
        {!imageLoaded && !imageError && (
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Завантаження...</p>
          </div>
        )}
        
        {imageError && (
          <div className="text-white text-center">
            <p className="text-xl mb-4">Помилка завантаження зображення</p>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Закрити
            </button>
          </div>
        )}

        <img
          src={`/api/files/${filename}`}
          alt="Переглядач фото"
          className="max-w-full max-h-full object-contain cursor-move transition-transform duration-200"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            display: imageLoaded && !imageError ? 'block' : 'none'
          }}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          draggable={false}
        />
      </div>

      {/* Інструкції */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded text-sm">
        Escape - закрити | +/- - масштаб | R - повернути
      </div>
    </div>
  );
};

export default PhotoViewer;