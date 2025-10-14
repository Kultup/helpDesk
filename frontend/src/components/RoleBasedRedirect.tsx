import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

const RoleBasedRedirect: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Чекаємо поки завантаження завершиться
    if (isLoading) {
      console.log('RoleBasedRedirect: Ще завантажується...');
      return;
    }

    // Якщо користувач не аутентифікований, не робимо нічого
    if (!isAuthenticated || !user) {
      console.log('RoleBasedRedirect: Користувач не аутентифікований');
      return;
    }

    const currentPath = location.pathname;
    console.log('RoleBasedRedirect: Поточний шлях:', currentPath, 'Роль користувача:', user.role);
    
    // Якщо користувач адміністратор
    if (user.role === UserRole.ADMIN) {
      console.log('RoleBasedRedirect: Користувач - адміністратор');
      
      // Якщо адміністратор на користувацькій сторінці, перенаправляємо на адмінську
      if (currentPath.startsWith('/dashboard') && !currentPath.startsWith('/admin/dashboard')) {
        console.log('RoleBasedRedirect: Перенаправляємо адміністратора з /dashboard на /admin/dashboard');
        navigate('/admin/dashboard', { replace: true });
      }
      // Якщо адміністратор на користувацьких маршрутах (tickets), перенаправляємо на адмінську панель
      else if (currentPath.startsWith('/tickets')) {
        console.log('RoleBasedRedirect: Перенаправляємо адміністратора з користувацьких маршрутів на /admin/dashboard');
        navigate('/admin/dashboard', { replace: true });
      }
    } 
    // Якщо користувач звичайний
    else if (user.role === UserRole.USER) {
      console.log('RoleBasedRedirect: Користувач - звичайний');
      
      // Якщо користувач на адмінській сторінці, перенаправляємо на користувацьку
      if (currentPath.startsWith('/admin')) {
        console.log('RoleBasedRedirect: Перенаправляємо користувача з /admin на /dashboard');
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, isAuthenticated, isLoading, location.pathname, navigate]);

  return null; // Цей компонент не рендерить нічого
};

export default RoleBasedRedirect;