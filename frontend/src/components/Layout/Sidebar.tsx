import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Home, 
  Ticket, 
  BarChart3, 
  MapPin, 
  Briefcase, 
  Building2,
  Users, 
  X,
  Server,
  FileText,
  UserCheck,
  AlertTriangle,
  FileSearch,
  Clock,
  Settings,
  Bot,
  Activity
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

interface NavGroup {
  titleKey: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const navGroups: NavGroup[] = [
  {
    titleKey: 'sidebar.groups.main',
    items: [
      { nameKey: 'sidebar.dashboard', href: '/dashboard', icon: Home },
      { nameKey: 'sidebar.tickets', href: '/tickets', icon: Ticket },
    ]
  },
  {
    titleKey: 'sidebar.groups.analytics',
    adminOnly: true,
    items: [
      { nameKey: 'sidebar.analytics', href: '/analytics', icon: BarChart3, adminOnly: true },
    ]
  },
  {
    titleKey: 'sidebar.groups.system',
    adminOnly: true,
    items: [
      { nameKey: 'sidebar.activeDirectory', href: '/active-directory', icon: Server, adminOnly: true },
      { nameKey: 'sidebar.telegramSettings', href: '/settings/telegram', icon: Bot, adminOnly: true },
      { nameKey: 'sidebar.activeDirectorySettings', href: '/settings/active-directory', icon: Settings, adminOnly: true },
      { nameKey: 'sidebar.zabbixSettings', href: '/settings/zabbix', icon: Activity, adminOnly: true },
      { nameKey: 'sidebar.logs', href: '/logs', icon: FileSearch, adminOnly: true },
      { nameKey: 'sidebar.cities', href: '/cities', icon: MapPin, adminOnly: true },
      { nameKey: 'sidebar.positions', href: '/positions', icon: Briefcase, adminOnly: true },
      { nameKey: 'sidebar.institutions', href: '/institutions', icon: Building2, adminOnly: true },
    ]
  },
  {
    titleKey: 'sidebar.groups.users',
    adminOnly: true,
    items: [
      { nameKey: 'sidebar.users', href: '/users', icon: Users, adminOnly: true },
      { nameKey: 'sidebar.pendingRegistrations', href: '/pending-registrations', icon: UserCheck, adminOnly: true },
      { nameKey: 'sidebar.quickNotifications', href: '/quick-notifications', icon: AlertTriangle, adminOnly: true },
    ]
  }
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, isMobile }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';

  const filteredNavGroups = navGroups.filter(group => 
    !group.adminOnly || isAdmin
  ).map(group => ({
    ...group,
    items: group.items.filter(item => !item.adminOnly || isAdmin)
  }));

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
          <div className="space-y-6">
            {filteredNavGroups.map((group, groupIndex) => (
              <div key={group.titleKey}>
                {/* Group title */}
                <div className="px-3 mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t(group.titleKey)}
                  </h3>
                </div>
                
                {/* Group items */}
                <ul className="space-y-1">
                  {group.items.map((item) => (
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
                
                {/* Divider between groups (except for the last group) */}
                {groupIndex < filteredNavGroups.length - 1 && (
                  <div className="mt-4 border-t border-gray-200"></div>
                )}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
