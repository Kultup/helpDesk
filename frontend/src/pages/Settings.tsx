import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Save, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { UserRole } from '../types';


const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Initialize language in i18n from user preferences
    if (user?.preferences?.language) {
      i18n.changeLanguage(user.preferences.language);
    }
  }, [user, i18n]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const updateData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName
      };

      // If password is being changed
      if (formData.newPassword) {
        if (formData.newPassword !== formData.confirmPassword) {
          setMessage({ type: 'error', text: t('settings.passwordsDoNotMatch') });
          return;
        }
        if (formData.newPassword.length < 6) {
          setMessage({ type: 'error', text: t('settings.passwordTooShort') });
          return;
        }
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }

      await apiService.put(`/users/${user?._id}`, updateData);
      setMessage({ type: 'success', text: t('settings.profileUpdatedSuccess') });
      
      // Clear password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.message || t('settings.profileUpdateError')
      });
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: t('settings.profile'), icon: User }
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t('common.back')}</span>
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'profile' && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-medium">{t('settings.profile')}</h3>
              <p className="text-sm text-gray-600">
                {t('settings.profileDescription')}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('users.firstName')} *
                  </label>
                  <Input
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    placeholder={t('users.firstName')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('users.lastName')} *
                  </label>
                  <Input
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder={t('users.lastName')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('common.email')}
                </label>
                <Input
                  value={formData.email}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('settings.emailCannotChange')}
                </p>
              </div>

              <hr />

              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">{t('settings.changePassword')}</h4>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('settings.currentPassword')}
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.currentPassword}
                      onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                      placeholder={t('settings.currentPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('settings.newPassword')}
                  </label>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.newPassword}
                    onChange={(e) => handleInputChange('newPassword', e.target.value)}
                    placeholder={t('settings.newPassword')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('settings.confirmPassword')}
                  </label>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder={t('settings.confirmPassword')}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? t('common.saving') : t('common.save')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
};

export default Settings;