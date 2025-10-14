import React from 'react';
import { useTranslation } from 'react-i18next';
import ActiveDirectory from '../components/ActiveDirectory/ActiveDirectory';

const ActiveDirectoryPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('activeDirectory.title')}</h1>
            <p className="text-gray-600 mt-1">
              {t('activeDirectory.description')}
            </p>
          </div>
        </div>
        
        <ActiveDirectory />
      </div>
    </div>
  );
};

export default ActiveDirectoryPage;