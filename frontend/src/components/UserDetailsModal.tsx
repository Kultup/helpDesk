import React from 'react';
import { User, Mail, Building, MapPin, Shield, Calendar, Clock, UserCheck, UserX, Smartphone, Hash, Cpu, Globe, Monitor } from 'lucide-react';
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

  const formatDate = (date: string | Date): string => {
    return new Date(date).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCityName = (city: string | { name: string } | undefined): string => {
    if (typeof city === 'string') return city;
    if (city && typeof city === 'object' && city.name) return city.name;
    return t('users.notSpecified');
  };

  const getPositionTitle = (position: string | { title: string } | undefined): string => {
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

            {/* Telegram інформація - завжди показуємо секцію */}
            <div className="flex items-center space-x-3">
              <div className="h-5 w-5 bg-blue-500 rounded text-white flex items-center justify-center text-xs font-bold">
                T
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">Telegram</p>
                {(user.telegramId || user.telegramUsername) ? (
                  <div className="space-y-1 mt-1">
                    {/* Визначаємо, чи telegramUsername є числовим ID */}
                    {(() => {
                      const isUsernameNumeric = user.telegramUsername && /^\d+$/.test(user.telegramUsername);
                      const actualTelegramId = user.telegramId || (isUsernameNumeric ? user.telegramUsername : null);
                      const actualTelegramUsername = user.telegramUsername && !isUsernameNumeric ? user.telegramUsername : null;
                      
                      return (
                        <>
                          {actualTelegramId && (
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">ID:</span> {actualTelegramId}
                            </p>
                          )}
                          {actualTelegramUsername && (
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">Username:</span> @{actualTelegramUsername}
                            </p>
                          )}
                          {!actualTelegramId && !actualTelegramUsername && (
                            <p className="text-xs text-yellow-600 mt-1">
                              ⚠️ Для відправки сповіщень потрібен числовий Telegram ID. Додайте Telegram ID в налаштуваннях користувача.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">
                    Не налаштовано. Додайте Telegram ID або username в налаштуваннях користувача.
                  </p>
                )}
              </div>
            </div>
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

        {/* Доступ до ПК (фото збережене з Telegram) */}
        {(user as { computerAccessPhoto?: string; computerAccessUpdatedAt?: string }).computerAccessPhoto && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Monitor className="h-5 w-5 text-gray-600" />
              {t('users.computerAccess')}
            </h4>
            <p className="text-sm text-gray-600 mb-2">
              {t('users.computerAccessDescription')}
            </p>
            {(user as { computerAccessAnalysis?: string }).computerAccessAnalysis && (
              <p className="text-sm text-gray-800 mb-2 font-medium">
                📋 {t('users.computerAccessAnalysis')}: {(user as { computerAccessAnalysis: string }).computerAccessAnalysis}
              </p>
            )}
            {(user as { computerAccessUpdatedAt?: string }).computerAccessUpdatedAt && (
              <p className="text-xs text-gray-500 mb-3">
                {t('users.lastUpdate')}: {formatDate((user as { computerAccessUpdatedAt: string }).computerAccessUpdatedAt)}
              </p>
            )}
            <a
              href={`${window.location.origin}/uploads/${(user as { computerAccessPhoto: string }).computerAccessPhoto}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg overflow-hidden border border-gray-200 max-w-xs"
            >
              <img
                src={`${window.location.origin}/uploads/${(user as { computerAccessPhoto: string }).computerAccessPhoto}`}
                alt={t('users.computerAccess')}
                className="max-h-64 w-auto object-contain"
              />
            </a>
          </div>
        )}

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

        {/* Мобільні пристрої */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-lg font-medium text-gray-900 mb-4">{t('users.mobileDevices')}</h4>
          {!user.devices || user.devices.length === 0 ? (
            <p className="text-sm text-gray-500">{t('users.noDevices')}</p>
          ) : (
            <div className="space-y-3">
              {user.devices.map((device, idx) => (
                <div key={device.deviceId || idx} className="bg-white rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {device.label || [device.manufacturer, device.model].filter(Boolean).join(' ') || device.platform}
                        </p>
                        <div className="flex items-center text-xs text-gray-500 gap-1">
                          <Hash className="h-3 w-3" />
                          <span>{t('users.deviceId')}: {device.deviceId || '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div className="flex items-center gap-3">
                      <Cpu className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">{t('users.platform')}</p>
                        <p className="text-sm text-gray-900">{device.platform || '—'}{device.osVersion ? ` • ${t('users.osVersion')}: ${device.osVersion}` : ''}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Hash className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">{t('users.appVersion')}</p>
                        <p className="text-sm text-gray-900">{device.appVersion || '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">{t('users.firstLogin')}</p>
                        <p className="text-sm text-gray-900">{device.firstLoginAt ? formatDate(device.firstLoginAt) : '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">{t('users.ipAddress')}</p>
                        <p className="text-sm text-gray-900">{device.lastIp || '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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