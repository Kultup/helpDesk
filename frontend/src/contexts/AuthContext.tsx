import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { User, AuthContextType, UserRole } from '../types';
import { apiService } from '../services/api';

// Типи для reducer
type AuthState = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_LOADING'; payload: boolean };

// Початковий стан
const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  isLoading: true,
  isAuthenticated: false,
};

// Reducer для управління станом аутентифікації
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN_START':
      return {
        ...state,
        isLoading: true,
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isLoading: false,
        isAuthenticated: true,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
      };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: action.payload !== null,
        isLoading: false,
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    default:
      return state;
  }
};

// Створення контексту
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Провайдер контексту
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Перевірка токену при завантаженні додатку
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          const response = await apiService.getCurrentUser();
          
          if (response.success && response.data) {
            localStorage.setItem('user', JSON.stringify(response.data));
            sessionStorage.setItem('userRole', response.data.role);
            dispatch({ type: 'SET_USER', payload: response.data });
          } else {
            clearAuthData();
          }
        } catch (error: any) {
          // Перевіряємо, чи це помилка 401 (недійсний токен або користувач не знайдений)
          if (error.response?.status === 401) {
            clearAuthData();
          } else if (error.response?.status === 404) {
            clearAuthData();
          } else {
            // При інших помилках також очищаємо дані для безпеки
            clearAuthData();
          }
        }
      } else {
        clearAuthData();
      }
      
      dispatch({ type: 'SET_LOADING', payload: false });
    };
  
    const clearAuthData = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('userRole');
      dispatch({ type: 'SET_USER', payload: null });
    };
  
    initializeAuth();
  }, []);

  // Функція входу
  const login = async (email: string, password: string): Promise<void> => {
    try {
      dispatch({ type: 'LOGIN_START' });
      
      const response = await apiService.login({ email, password });
      
      if (response.success && response.data) {
        const { user, token } = response.data;
        
        // Зберігаємо токен та користувача в localStorage
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Зберігаємо роль користувача в sessionStorage
        sessionStorage.setItem('userRole', user.role);
        
        dispatch({ 
          type: 'LOGIN_SUCCESS', 
          payload: { user, token } 
        });
      } else {
        throw new Error(response.message || 'Помилка входу');
      }
    } catch (error: any) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw new Error(error.response?.data?.message || error.message || 'Помилка входу');
    }
  };

  // Функція виходу
  const logout = async (): Promise<void> => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Помилка виходу:', error);
    } finally {
      // Очищаємо localStorage, sessionStorage та стан
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('userRole');
      sessionStorage.removeItem('lastRoute');
      dispatch({ type: 'LOGOUT' });
    }
  };

  // Значення контексту
  const contextValue: AuthContextType = {
    user: state.user,
    token: state.token,
    login,
    logout,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Хук для використання контексту
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth має використовуватися всередині AuthProvider');
  }
  
  return context;
};

// Компонент для захищених маршрутів
interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: UserRole;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole 
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Перенаправлення на сторінку входу
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    // Перенаправляємо користувача на відповідну сторінку залежно від його ролі
    if (user?.role === UserRole.ADMIN) {
      return <Navigate to="/admin/dashboard" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

export default AuthContext;