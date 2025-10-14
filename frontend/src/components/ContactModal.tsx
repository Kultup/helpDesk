import React from 'react';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Скопійовано в буфер обміну!');
    });
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-xl font-bold"
        >
          ×
        </button>
        
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          Зв'яжіться з адміністратором
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email адреса:
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-blue-600 font-medium">admin@helpdesk.com</span>
              <button
                onClick={() => copyToClipboard('admin@helpdesk.com')}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
              >
                Копіювати
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тема листа:
            </label>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600 text-sm">Запит на створення облікового запису</span>
              <button
                onClick={() => copyToClipboard('Запит на створення облікового запису')}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
              >
                Копіювати
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Шаблон повідомлення:
            </label>
            <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 relative">
              <p>Доброго дня!</p>
              <p>Прошу створити обліковий запис для доступу до системи Help Desk.</p>
              <p className="mt-2">
                <strong>Мої дані:</strong><br/>
                ПІБ: [Ваше ім'я]<br/>
                Посада: [Ваша посада]<br/>
                Місто: [Ваше місто]<br/>
                Email: [Ваш email]
              </p>
              <p className="mt-2">Дякую!</p>
              <button
                onClick={() => copyToClipboard('Доброго дня!\n\nПрошу створити обліковий запис для доступу до системи Help Desk.\n\nМої дані:\nПІБ: [Ваше ім\'я]\nПосада: [Ваша посада]\nМісто: [Ваше місто]\nEmail: [Ваш email]\n\nДякую!')}
                className="absolute top-2 right-2 text-xs bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded"
              >
                Копіювати все
              </button>
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-3">
              Скопіюйте дані вище та відправте листа через ваш поштовий клієнт
            </p>
            <button
              onClick={onClose}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
            >
              Зрозуміло
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactModal;