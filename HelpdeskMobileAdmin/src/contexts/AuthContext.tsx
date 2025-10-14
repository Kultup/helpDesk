import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';

// Простий замінник AsyncStorage
const SimpleStorage = {
  async getItem(key: string): Promise<string | null> {
    // В реальному додатку тут буде використовуватися localStorage або інше сховище
    return null;
  },
  async setItem(key: string, value: string): Promise<void> {
    // В реальному додатку тут буде використовуватися localStorage або інше сховище
  },
  async removeItem(key: string): Promise<void> {
    // В реальному додатку тут буде використовуватися localStorage або інше сховище
  }
};
import ApiService from '../services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: any) => Promise<void>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      const token = await SimpleStorage.getItem('authToken');
      const savedUser = await SimpleStorage.getItem('user');
      
      if (token && savedUser) {
        const userData = JSON.parse(savedUser);
        setUser(userData);
      }
    } catch (error) {
      console.error('Помилка перевірки статусу аутентифікації:', error);
      await logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: any) => {
    try {
      setIsLoading(true);
      const response = await ApiService.login(credentials);
      setUser(response.user);
    } catch (error: any) {
      console.error('Помилка входу:', error);
      throw new Error(error.response?.data?.message || 'Помилка входу в систему');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await ApiService.logout();
      setUser(null);
    } catch (error) {
      console.error('Помилка виходу:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    checkAuthStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth має використовуватися всередині AuthProvider');
  }
  return context;
};

export { AuthContext };