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
    case 'TOGGLE_THEME': {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      return { ...state, theme: newTheme };
    }
    default:
      return state;
  }
};

// Створення контексту
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);



export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Завжди використовуємо світлу тему
  useEffect(() => {
    // Видаляємо клас 'dark' з DOM, якщо він є
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  // Функції для сумісності (не роблять нічого)
  const toggleTheme = () => {
    // Пуста функція - тема завжди світла
  };

  const setTheme = (theme: Theme) => {
    // Пуста функція - тема завжди світла
  };

  // Значення контексту
  const contextValue: ThemeContextType = {
    theme: 'light',
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