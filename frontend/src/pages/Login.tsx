import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Mail, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRouteHistory } from '../hooks';
import { UserRole } from '../types';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import ContactModal from '../components/ContactModal';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const { clearLastRoute } = useRouteHistory();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // Redirect if already logged in - враховуємо роль користувача
  if (user) {
    if (user.role === UserRole.ADMIN) {
      return <Navigate to="/admin/dashboard" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(formData.email, formData.password);
      // Очищаємо збережений маршрут після успішного входу
      clearLastRoute();
    } catch (err: any) {
      setError(err.message || t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="block text-center pb-8">
            <div className="h-20 w-20 bg-primary-500 rounded-full flex items-center justify-center shadow-lg mx-auto mb-6">
              <LogIn className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Help Desk</h1>
            <p className="text-gray-600 mt-2">{t('auth.loginTitle')}</p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleChange}
                leftIcon={<Mail className="w-4 h-4" />}
                required
                disabled={loading}
              />

              <Input
                type="password"
                name="password"
                placeholder={t('auth.password')}
                value={formData.password}
                onChange={handleChange}
                leftIcon={<Lock className="w-4 h-4" />}
                required
                disabled={loading}
              />

              <Button
                type="submit"
                className="w-full"
                isLoading={loading}
                disabled={loading}
              >
                {t('auth.login')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button 
                onClick={() => setIsContactModalOpen(true)}
                className="text-blue-600 hover:text-blue-800 text-sm underline bg-transparent border-none cursor-pointer"
              >
                {t('auth.contactAdmin')}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <ContactModal 
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
      />
    </div>
  );
};

export default Login;