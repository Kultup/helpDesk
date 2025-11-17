import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { uk } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface RegistrationDropdownProps {
  registrations: User[];
  isLoading: boolean;
  onClose: () => void;
}

const RegistrationDropdown: React.FC<RegistrationDropdownProps> = ({
  registrations,
  isLoading,
  onClose
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  const handleViewAll = () => {
    // Перенаправлення на сторінку запитів на реєстрацію
    navigate('/admin/pending-registrations');
    onClose();
  };

  if (isLoading) {
    return (
      <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
        <div className="p-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">{t('registrationRequests.loading')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          {t('registrationRequests.title')}
        </h3>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {registrations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {t('registrationRequests.noRequests')}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {registrations.map((registration) => (
              <div
                key={registration._id}
                className="p-4 hover:bg-gray-50 transition-colors duration-150"
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium text-sm">
                        {registration.firstName?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {registration.firstName} {registration.lastName}
                      </p>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        {t('registrationRequests.status.pending')}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 truncate">
                      {registration.email}
                    </p>
                    
                    {registration.department && (
                      <p className="text-xs text-gray-500 truncate">
                        {registration.department}
                      </p>
                    )}
                    
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(registration.createdAt), {
                        addSuffix: true,
                        locale: uk
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {registrations.length > 0 && (
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleViewAll}
            className="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            {t('registrationRequests.viewAll')}
          </button>
        </div>
      )}
    </div>
  );
};

export default RegistrationDropdown;