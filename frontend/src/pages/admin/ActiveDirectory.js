import React from 'react';
import ActiveDirectory from '../components/ActiveDirectory/ActiveDirectory';

const ActiveDirectoryPage = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Active Directory</h1>
            <p className="text-gray-600 mt-1">
              Управління користувачами та комп'ютерами Active Directory
            </p>
          </div>
        </div>
        
        <ActiveDirectory />
      </div>
    </div>
  );
};

export default ActiveDirectoryPage;