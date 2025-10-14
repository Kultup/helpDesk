import React from 'react';
import { X, User, Mail, Building, MapPin, Shield, Calendar, Clock, UserCheck, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from './UI/Modal';
import Button from './UI/Button';
import { User as UserType, UserRole } from '../types';
import { cn } from '../utils';

interface UserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType | null;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({ isOpen, onClose, user }) => {
  const { t } = useTranslation();
  
  if (!user) return null;

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCityName = (city: any) => {
    if (typeof city === 'string') return city;
    if (city && typeof city === 'object' && city.name) return city.name;
    return t('users.notSpecified');
  };

  const getPositionTitle = (position: any) => {
    if (typeof position === 'string') return position;
    if (position && typeof position === 'object' && position.title) return position.title;
    return t('users.notSpecified');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('users.userDetails')}>
      <div className="space-y-6">
        {/* Основна інформація */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                {user.firstName} {user.lastName}
              </h3>
              <div className="flex items-center space-x-2 mt-1">
                <span
                  className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    user.role === UserRole.ADMIN
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-800'
                  )}
                >
                  {user.role === UserRole.ADMIN ? (
                    <>
                      <Shield className="h-3 w-3 mr-1" />
                      {t('users.administrator')}
                    </>
                  ) : (
                    <>
                      <User className="h-3 w-3 mr-1" />
                      {t('users.user')}
                    </>
                  )}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    user.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  )}
                >
                  {user.isActive ? (
                    <>
                      <UserCheck className="h-3 w-3 mr-1" />
                      {t('users.active')}
                    </>
                  ) : (
                    <>
                      <UserX className="h-3 w-3 mr-1" />
                      {t('users.inactive')}
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Контактна інформація */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <h4 className="text-lg font-medium text-gray-900 border-b pb-2">
              {t('users.contactInformation')}
            </h4>
            
            <div className="flex items-center space-x-3">
              <Mail className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="text-sm text-gray-900">{user.email}</p>
              </div>
            </div>



            {user.telegramId && (
              <div className="flex items-center space-x-3">
                <div className="h-5 w-5 bg-blue-500 rounded text-white flex items-center justify-center text-xs font-bold">
                  T
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Telegram ID</p>
                  <p className="text-sm text-gray-900">{user.telegramId}</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="text-lg font-medium text-gray-900 border-b pb-2">
              {t('users.workInformation')}
            </h4>
            
            <div className="flex items-center space-x-3">
              <Building className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500">{t('users.position')}</p>
                <p className="text-sm text-gray-900">{getPositionTitle(user.position)}</p>
              </div>
            </div>

            {user.department && (
              <div className="flex items-center space-x-3">
                <Building className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('users.department')}</p>
                  <p className="text-sm text-gray-900">{user.department}</p>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-3">
              <MapPin className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500">{t('users.city')}</p>
                <p className="text-sm text-gray-900">{getCityName(user.city)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Системна інформація */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-lg font-medium text-gray-900 mb-4">{t('users.systemInformation')}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500">{t('users.registrationDate')}</p>
                <p className="text-sm text-gray-900">
                  {user.createdAt ? formatDate(user.createdAt) : t('users.notSpecified')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Clock className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500">{t('users.lastUpdate')}</p>
                <p className="text-sm text-gray-900">
                  {user.updatedAt ? formatDate(user.updatedAt) : t('users.notSpecified')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Додаткова інформація про позицію */}
        {typeof user.position === 'object' && user.position && (
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-lg font-medium text-gray-900 mb-4">{t('users.positionDetails')}</h4>
            <div className="space-y-3">
              {user.position.description && (
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('users.description')}</p>
                  <p className="text-sm text-gray-900">{user.position.description}</p>
                </div>
              )}
              
              {user.position.department && (
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('users.department')}</p>
                  <p className="text-sm text-gray-900">{user.position.department}</p>
                </div>
              )}

              {user.position.responsibilities && user.position.responsibilities.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('users.responsibilities')}</p>
                  <ul className="text-sm text-gray-900 list-disc list-inside space-y-1">
                    {user.position.responsibilities.map((responsibility, index) => (
                      <li key={`responsibility-${index}`}>{responsibility}</li>
                    ))}
                  </ul>
                </div>
              )}

              {user.position.requirements && user.position.requirements.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-500">{t('users.requirements')}</p>
                  <ul className="text-sm text-gray-900 list-disc list-inside space-y-1">
                    {user.position.requirements.map((requirement, index) => (
                      <li key={`requirement-${index}`}>{requirement}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Кнопки дій */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            {t('users.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserDetailsModal;