import React, { useState, useEffect } from 'react';
import { X, User, Mail, Lock, MapPin, Briefcase, Shield, AlertCircle, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from './UI/Button';
import Input from './UI/Input';
import LoadingSpinner from './UI/LoadingSpinner';
import { User as UserType, UserRole, City, Position } from '../types';
import { cn } from '../utils';

interface UserFormProps {
  user?: UserType | null;
  cities: City[];
  positions: Position[];
  isOpen: boolean;
  onClose: () => void;
  onCancel: () => void;
  onSubmit: (userData: UserFormData) => Promise<void>;
  isLoading?: boolean;
}

export interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  login: string;
  password?: string;
  role: UserRole;
  position: string;
  department: string;
  city: string;
  telegramId?: string;
  isActive: boolean;
}

interface ValidationErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  login?: string;
  password?: string;
  position?: string;
  department?: string;
  city?: string;
  telegramId?: string;
}

const UserForm: React.FC<UserFormProps> = ({
  user,
  cities,
  positions,
  isOpen,
  onClose,
  onCancel,
  onSubmit,
  isLoading = false
}) => {
  const { t } = useTranslation();
  
  const [formData, setFormData] = useState<UserFormData>({
    firstName: '',
    lastName: '',
    email: '',
    login: '',
    password: '',
    role: UserRole.USER,
    position: '',
    department: '',
    city: '',
    telegramId: '',
    isActive: true
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);

  // Функції валідації
  const validateEmail = (email: string): string | undefined => {
    if (!email) return t('users.emailRequired');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return t('users.invalidEmailFormat');
    return undefined;
  };

  const validatePassword = (password?: string): string | undefined => {
    if (!user && !password) return t('users.passwordRequired');
    if (password && password.length < 6) return t('users.passwordMinLength');
    
    // Перевірка на наявність великої літери, малої літери та цифри
    if (password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return 'Пароль повинен містити принаймні одну велику літеру, одну малу літеру та одну цифру';
    }
    
    return undefined;
  };

  const validateRequired = (value: string, fieldName: string): string | undefined => {
    if (!value.trim()) return t('users.fieldRequired', { field: fieldName });
    return undefined;
  };

  const validateTelegramId = (telegramId: string): string | undefined => {
    if (telegramId && !/^@?[a-zA-Z0-9_]{5,32}$/.test(telegramId)) {
      return t('users.invalidTelegramFormat');
    }
    return undefined;
  };

  useEffect(() => {
    if (user) {
      console.log('UserForm: Loading user data for editing:', JSON.stringify(user, null, 2));
      const formDataToSet = {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        login: user.login || '',
        role: user.role || UserRole.USER,
        position: typeof user.position === 'object' ? user.position?._id || '' : user.position || '',
        department: user.department || '',
        city: typeof user.city === 'string' ? user.city : user.city?._id || '',
        telegramId: user.telegramUsername ? `@${user.telegramUsername}` : (user.telegramId || ''),
        isActive: user.isActive !== undefined ? user.isActive : true
      };
      console.log('UserForm: Setting form data:', JSON.stringify(formDataToSet, null, 2));
      console.log('UserForm: Form fields check:', {
        hasFirstName: !!formDataToSet.firstName,
        hasLastName: !!formDataToSet.lastName,
        hasEmail: !!formDataToSet.email,
        hasLogin: !!formDataToSet.login,
        hasDepartment: !!formDataToSet.department,
        hasCity: !!formDataToSet.city,
        hasPosition: !!formDataToSet.position,
        hasTelegramId: !!formDataToSet.telegramId
      });
      setFormData(formDataToSet);
    } else {
      console.log('UserForm: Creating new user');
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        login: '',
        password: '',
        role: UserRole.USER,
        position: '',
        department: '',
        city: '',
        telegramId: '',
        isActive: true
      });
    }
    setErrors({});
    setTouched({});
  }, [user, isOpen]);

  const validateForm = (): ValidationErrors => {
    const newErrors: ValidationErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = t('users.firstNameRequired');
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = t('users.lastNameRequired');
    }

    if (!formData.email.trim()) {
      newErrors.email = t('users.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('users.invalidEmailFormat');
    }

    if (!formData.login.trim()) {
      newErrors.login = t('users.loginRequired') || 'Логін обов\'язковий';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.login.trim())) {
      newErrors.login = t('users.invalidLoginFormat') || 'Логін може містити тільки літери, цифри та підкреслення';
    } else if (formData.login.trim().length < 3 || formData.login.trim().length > 50) {
      newErrors.login = t('users.loginLength') || 'Логін повинен містити від 3 до 50 символів';
    }

    if (!user && !formData.password) {
      newErrors.password = t('users.passwordRequiredForNew');
    } else if (formData.password && formData.password.length < 6) {
      newErrors.password = t('users.passwordMinLength');
    }

    if (!formData.position) {
      newErrors.position = t('users.positionRequired');
    }

    if (!formData.department.trim()) {
      newErrors.department = t('users.departmentRequired');
    } else if (formData.department.trim().length < 2 || formData.department.trim().length > 100) {
      newErrors.department = 'Відділ повинен містити від 2 до 100 символів';
    }

    if (!formData.city) {
      newErrors.city = t('users.cityRequired');
    }

    return newErrors;
  };

  const handleInputChange = (field: keyof UserFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Позначаємо поле як торкнуте
    setTouched(prev => ({
      ...prev,
      [field]: true
    }));
    
    // Валідуємо поле в реальному часі
    let fieldError: string | undefined;
    switch (field) {
      case 'email':
        fieldError = validateEmail(value);
        break;
      case 'login':
        if (!value.trim()) {
          fieldError = t('users.loginRequired') || 'Логін обов\'язковий';
        } else if (!/^[a-zA-Z0-9_]+$/.test(value.trim())) {
          fieldError = t('users.invalidLoginFormat') || 'Логін може містити тільки літери, цифри та підкреслення';
        } else if (value.trim().length < 3 || value.trim().length > 50) {
          fieldError = t('users.loginLength') || 'Логін повинен містити від 3 до 50 символів';
        }
        break;
      case 'password':
        fieldError = validatePassword(value);
        break;
      case 'firstName':
        fieldError = validateRequired(value, 'Ім\'я');
        break;
      case 'lastName':
        fieldError = validateRequired(value, 'Прізвище');
        break;
      case 'position':
        fieldError = validateRequired(value, 'Посада');
        break;
      case 'department': {
        const trimmed = value.trim();
        if (!trimmed) {
          fieldError = t('users.departmentRequired');
        } else if (trimmed.length < 2 || trimmed.length > 100) {
          fieldError = 'Відділ повинен містити від 2 до 100 символів';
        }
        break;
      }
      case 'city':
        fieldError = validateRequired(value, t('users.city'));
        break;
      case 'telegramId':
        fieldError = validateTelegramId(value);
        break;
    }
    
    setErrors(prev => ({
      ...prev,
      [field]: fieldError
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Позначаємо всі поля як торкнуті
    const allFields = ['firstName', 'lastName', 'email', 'password', 'position', 'city', 'telegramId'];
    setTouched(allFields.reduce((acc, field) => ({ ...acc, [field]: true }), {}));
    
    // Валідуємо форму
    const formErrors = validateForm();
    setErrors(formErrors);
    
    // Якщо є помилки, не відправляємо форму
    if (Object.keys(formErrors).length > 0) {
      return;
    }

    try {
      const submitData = { ...formData };
      if (user && !submitData.password) {
        delete submitData.password;
      }
      await onSubmit(submitData);
      onCancel();
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'white', minHeight: '400px' }}>
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {user ? t('users.editUser') : t('users.addUser')}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Debug info */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-4 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-40">
              <strong>Debug Info:</strong>
              <pre className="mt-2 text-xs">{JSON.stringify({ user, formData, isOpen }, null, 2)}</pre>
              <div className="mt-2">
                <strong>Fields visibility check:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>firstName: {formData.firstName ? '✓' : '✗'}</li>
                  <li>lastName: {formData.lastName ? '✓' : '✗'}</li>
                  <li>email: {formData.email ? '✓' : '✗'}</li>
                  <li>login: {formData.login ? '✓' : '✗'}</li>
                  <li>department: {formData.department ? '✓' : '✗'}</li>
                  <li>city: {formData.city ? '✓' : '✗'}</li>
                  <li>position: {formData.position ? '✓' : '✗'}</li>
                  <li>telegramId: {formData.telegramId ? '✓' : '✗'}</li>
                </ul>
              </div>
            </div>
          )}
          
          {/* Основна інформація */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ display: 'grid', visibility: 'visible' }}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                {t('users.firstName')} *
              </label>
              <Input
                type="text"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder={t('users.enterFirstName')}
                className={cn(errors.firstName && 'border-red-500')}
              />
              {errors.firstName && (
                <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="h-4 w-4 inline mr-1" />
                {t('users.lastName')} *
              </label>
              <Input
                type="text"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder={t('users.enterLastName')}
                className={cn(errors.lastName && 'border-red-500')}
              />
              {errors.lastName && (
                <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="h-4 w-4 inline mr-1" />
              {t('users.email')} *
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder={t('users.enterEmail')}
              className={cn(errors.email && 'border-red-500')}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          {/* Login */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="h-4 w-4 inline mr-1" />
              {t('users.login') || 'Логін'} *
            </label>
            <Input
              type="text"
              value={formData.login}
              onChange={(e) => handleInputChange('login', e.target.value)}
              placeholder={t('users.enterLogin') || 'Введіть логін'}
              className={cn(errors.login && 'border-red-500')}
            />
            {errors.login && (
              <p className="mt-1 text-sm text-red-600">{errors.login}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {t('users.loginFormat') || 'Логін може містити тільки літери, цифри та підкреслення (3-50 символів)'}
            </p>
          </div>

          {/* Пароль */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Lock className="h-4 w-4 inline mr-1" />
              {t('users.password')} {!user && '*'}
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={formData.password || ''}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder={user ? t('users.leaveEmptyToKeepCurrent') : t('users.enterPassword')}
                className={cn(errors.password && 'border-red-500')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? t('users.hide') : t('users.show')}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          {/* Роль та посада */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Shield className="h-4 w-4 inline mr-1" />
                {t('users.role')} *
              </label>
              <select
                value={formData.role}
                onChange={(e) => handleInputChange('role', e.target.value as UserRole)}
                className="w-full px-3 py-2 border border-border rounded-md bg-surface text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value={UserRole.USER}>{t('users.user')}</option>
                <option value={UserRole.ADMIN}>{t('users.administrator')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Briefcase className="h-4 w-4 inline mr-1" />
                {t('users.position')} *
              </label>
              <select
                value={formData.position}
                onChange={(e) => handleInputChange('position', e.target.value)}
                className={cn(
                  "w-full px-3 py-2 border border-border rounded-md bg-surface text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                  errors.position && 'border-error'
                )}
              >
                <option value="">{t('users.selectPosition')}</option>
                {positions.map((position) => (
                  <option key={position._id} value={position._id}>
                    {position.title}
                  </option>
                ))}
              </select>
              {errors.position && (
                <p className="mt-1 text-sm text-red-600">{errors.position}</p>
              )}
            </div>
          </div>

          {/* Відділ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Briefcase className="h-4 w-4 inline mr-1" />
              {t('users.department')} *
            </label>
            <Input
              type="text"
              value={formData.department}
              onChange={(e) => handleInputChange('department', e.target.value)}
              placeholder={t('users.enterDepartmentName')}
              className={cn(errors.department && 'border-red-500')}
            />
            {errors.department && (
              <p className="mt-1 text-sm text-red-600">{errors.department}</p>
            )}
          </div>

          {/* Місто */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MapPin className="h-4 w-4 inline mr-1" />
              {t('users.city')} *
            </label>
            <select
              value={formData.city}
              onChange={(e) => handleInputChange('city', e.target.value)}
              className={cn(
                "w-full px-3 py-2 border border-border rounded-md bg-surface text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                errors.city && 'border-error'
              )}
            >
              <option value="">{t('users.selectCity')}</option>
              {cities.map((city) => (
                <option key={city._id} value={city._id}>
                  {city.name}
                </option>
              ))}
            </select>
            {errors.city && (
              <p className="mt-1 text-sm text-error">{errors.city}</p>
            )}
          </div>

          {/* Telegram ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MessageSquare className="h-4 w-4 inline mr-1" />
              {t('users.telegramId')} ({t('users.optional')})
            </label>
            <Input
              type="text"
              value={formData.telegramId || ''}
              onChange={(e) => handleInputChange('telegramId', e.target.value)}
              placeholder={t('users.telegramPlaceholder')}
              className={cn(errors.telegramId && 'border-error')}
            />
            {errors.telegramId && (
              <p className="mt-1 text-sm text-error">{errors.telegramId}</p>
            )}
            <p className="mt-1 text-xs text-text-secondary">
              {t('users.telegramFormat')}
            </p>
          </div>

          {/* Кнопки */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              {t('users.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="min-w-[120px]"
            >
              {isLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                user ? t('users.save') : t('users.create')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserForm;