import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Home, 
  Ticket, 
  BarChart3, 
  MapPin, 
  Briefcase, 
  Users, 
  X,
  Server,
  Tag,
  FileText,
  UserCheck,
  Calendar
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { cn } from '../../utils';
import Button from '../UI/Button';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

interface NavItem {
  nameKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { nameKey: 'sidebar.dashboard', href: '/dashboard', icon: Home },
  { nameKey: 'sidebar.tickets', href: '/tickets', icon: Ticket },
  { nameKey: 'sidebar.categories', href: '/categories', icon: Tag },
  { nameKey: 'sidebar.templates', href: '/templates', icon: FileText, adminOnly: true },
  { nameKey: 'sidebar.calendar', href: '/calendar', icon: Calendar, adminOnly: true },
  { nameKey: 'sidebar.analytics', href: '/analytics', icon: BarChart3, adminOnly: true },

  { nameKey: 'sidebar.activeDirectory', href: '/active-directory', icon: Server, adminOnly: true },
  { nameKey: 'sidebar.cities', href: '/cities', icon: MapPin, adminOnly: true },
  { nameKey: 'sidebar.positions', href: '/positions', icon: Briefcase, adminOnly: true },
  { nameKey: 'sidebar.users', href: '/users', icon: Users, adminOnly: true },
  { nameKey: 'sidebar.pendingRegistrations', href: '/pending-registrations', icon: UserCheck, adminOnly: true },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isMobile }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';

  const filteredNavItems = navItems.filter(item => 
    !item.adminOnly || isAdmin
  );

  return (
    <>
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-surface shadow-lg transform transition-transform duration-300 ease-in-out flex flex-col',
          isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0',
          !isMobile && 'relative'
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border flex-shrink-0">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <Ticket className="h-5 w-5 text-white" />
            </div>
            <span className="ml-2 text-lg font-bold text-foreground">{t('sidebar.appName')}</span>
          </div>
          
          {isMobile && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Navigation - scrollable area */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          <ul className="space-y-1">
            {filteredNavItems.map((item) => (
              <li key={item.nameKey}>
                <NavLink
                  to={`${basePath}${item.href}`}
                  onClick={isMobile ? onClose : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      isActive
                        ? 'bg-primary-500 text-white'
                        : 'text-foreground hover:bg-gray-100'
                    )
                  }
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  {t(item.nameKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>


      </div>
    </>
  );
};

export default Sidebar;