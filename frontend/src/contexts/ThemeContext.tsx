import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';

// Типи для теми
export type Theme = 'light' | 'dark' | 'auto';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// Типи для reducer
type ThemeState = {
  theme: Theme;
};

type ThemeAction =
  | { type: 'SET_THEME'; payload: Theme }
  | { type: 'TOGGLE_THEME' };

// Початковий стан
const getInitialTheme = (): Theme => {
  // Спочатку перевіряємо localStorage
  const savedTheme = localStorage.getItem('theme') as Theme;
  if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto')) {
    return savedTheme;
  }
  
  // Якщо немає збереженої теми, повертаємо 'auto'
  return 'auto';
};

const initialState: ThemeState = {
  theme: getInitialTheme(),
};

// Reducer для управління станом теми
const themeReducer = (state: ThemeState, action: ThemeAction): ThemeState => {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'TOGGLE_THEME':
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      return { ...state, theme: newTheme };
    default:
      return state;
  }
};

// Створення контексту
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);



export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(themeReducer, { theme: getInitialTheme() });

  // Зберігаємо тему в localStorage та застосовуємо до DOM
  useEffect(() => {
    localStorage.setItem('theme', state.theme);
    
    // Визначаємо фактичну тему (light або dark)
    let actualTheme: 'light' | 'dark';
    if (state.theme === 'auto') {
      actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      actualTheme = state.theme;
    }
    
    if (actualTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.theme]);

  // Слухач для зміни системної теми
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      // Оновлюємо тему тільки якщо встановлено режим 'auto'
      if (state.theme === 'auto') {
        // Перезастосовуємо тему при зміні системних налаштувань
        const root = document.documentElement;
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [state.theme]);

  // Функція для переключення теми
  const toggleTheme = () => {
    dispatch({ type: 'TOGGLE_THEME' });
  };

  // Функція для встановлення конкретної теми
  const setTheme = (theme: Theme) => {
    dispatch({ type: 'SET_THEME', payload: theme });
  };

  // Значення контексту
  const contextValue: ThemeContextType = {
    theme: state.theme,
    toggleTheme,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Хук для використання контексту
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  
  if (context === undefined) {
    throw new Error('useTheme має використовуватися всередині ThemeProvider');
  }
  
  return context;
};

export default ThemeContext;