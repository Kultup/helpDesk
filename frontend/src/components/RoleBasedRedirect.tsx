import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole, isAdminRole } from '../types';

const RoleBasedRedirect: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;

    const currentPath = location.pathname;
    const admin = isAdminRole(user.role as UserRole);

    if (admin) {
      if (currentPath.startsWith('/dashboard') && !currentPath.startsWith('/admin/dashboard')) {
        navigate('/admin/dashboard', { replace: true });
      } else if (currentPath.startsWith('/tickets') && !currentPath.startsWith('/admin/tickets')) {
        navigate('/admin/dashboard', { replace: true });
      }
    } else {
      // Користувач без прав адміна: доступ лише до своїх даних (подати тікет, мої тікети)
      if (currentPath.startsWith('/admin')) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, isAuthenticated, isLoading, location.pathname, navigate]);

  return null;
};

export default RoleBasedRedirect;