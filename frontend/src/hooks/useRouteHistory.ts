import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const LAST_ROUTE_KEY = 'lastRoute';

export const useRouteHistory = () => {
  const location = useLocation();

  // Зберігаємо поточний маршрут при кожній зміні
  useEffect(() => {
    // Не зберігаємо маршрут логіну
    if (location.pathname !== '/login') {
      sessionStorage.setItem(LAST_ROUTE_KEY, location.pathname);
    }
  }, [location.pathname]);

  // Функція для отримання останнього збереженого маршруту
  const getLastRoute = (): string => {
    const lastRoute = sessionStorage.getItem(LAST_ROUTE_KEY);
    // Повертаємо збережений маршрут або dashboard за замовчуванням
    return lastRoute && lastRoute !== '/login' ? lastRoute : '/dashboard';
  };

  // Функція для очищення збереженого маршруту
  const clearLastRoute = (): void => {
    sessionStorage.removeItem(LAST_ROUTE_KEY);
  };

  return {
    getLastRoute,
    clearLastRoute,
    currentRoute: location.pathname
  };
};