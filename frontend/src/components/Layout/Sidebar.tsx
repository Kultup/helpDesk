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
  AlertTriangle,
  FileSearch,
  Settings,
  Bot,
  Activity,
  Monitor,
  Sparkles,
  MessageCircle,
  Brain,
  Image,
  Download,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminRole } from '../../types';
import { cn } from '../../utils';
import Button from '../UI/Button';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
    ],
  },
  {
    titleKey: 'sidebar.groups.analytics',
    adminOnly: true,
    items: [{ nameKey: 'sidebar.analytics', href: '/analytics', icon: BarChart3, adminOnly: true }],
  },
  {
    titleKey: 'sidebar.groups.ai',
    adminOnly: true,
    items: [
      { nameKey: 'sidebar.aiSettings', href: '/settings/ai', icon: Sparkles, adminOnly: true },
      {
        nameKey: 'sidebar.knowledgeBase',
        href: '/knowledge-base',
        icon: FileText,
        adminOnly: true,
      },
      { nameKey: 'sidebar.aiKnowledge', href: '/ai-knowledge', icon: Brain, adminOnly: true },
      {
        nameKey: 'sidebar.conversations',
        href: '/conversations',
        icon: MessageCircle,
        adminOnly: true,
      },
      {
        nameKey: 'sidebar.telegramSettings',
        href: '/settings/telegram',
        icon: Bot,
        adminOnly: true,
      },
      { nameKey: 'sidebar.ratingMedia', href: '/settings/bot', icon: Image, adminOnly: true },
    ],
  },
  {
    titleKey: 'sidebar.groups.reference',
    adminOnly: true,
    items: [
      { nameKey: 'sidebar.cities', href: '/cities', icon: MapPin, adminOnly: true },
      { nameKey: 'sidebar.positions', href: '/positions', icon: Briefcase, adminOnly: true },
      { nameKey: 'sidebar.institutions', href: '/institutions', icon: Building2, adminOnly: true },
      { nameKey: 'sidebar.equipment', href: '/equipment', icon: Monitor, adminOnly: true },
    ],
  },
  {
    titleKey: 'sidebar.groups.system',
    adminOnly: true,
    items: [
      {
        nameKey: 'sidebar.activeDirectory',
        href: '/active-directory',
        icon: Server,
        adminOnly: true,
      },
      {
        nameKey: 'sidebar.activeDirectorySettings',
        href: '/settings/active-directory',
        icon: Settings,
        adminOnly: true,
      },
      {
        nameKey: 'sidebar.zabbixSettings',
        href: '/settings/zabbix',
        icon: Activity,
        adminOnly: true,
      },
      { nameKey: 'sidebar.logs', href: '/logs', icon: FileSearch, adminOnly: true },
    ],
  },
  {
    titleKey: 'sidebar.groups.users',
    adminOnly: true,
    items: [
      { nameKey: 'sidebar.users', href: '/users', icon: Users, adminOnly: true },
      {
        nameKey: 'sidebar.quickNotifications',
        href: '/quick-notifications',
        icon: AlertTriangle,
        adminOnly: true,
      },
      { nameKey: 'Software Requests', href: '/software-requests', icon: Download, adminOnly: true },
      {
        nameKey: 'sidebar.directMessages',
        href: '/direct-messages',
        icon: MessageSquare,
        adminOnly: true,
      },
    ],
  },
];

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  isMobile,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role ? isAdminRole(user.role) : false;
  const basePath = isAdmin ? '/admin' : '';

  const filteredNavGroups = navGroups
    .filter(group => !group.adminOnly || isAdmin)
    .map(group => ({
      ...group,
      items: group.items.filter(item => !item.adminOnly || isAdmin),
    }));

  const collapsed = !isMobile && isCollapsed;

  return (
    <>
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-surface shadow-lg transform transition-all duration-300 ease-in-out flex flex-col',
          collapsed ? 'w-16' : 'w-64',
          isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0',
          !isMobile && 'relative'
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-16 px-3 border-b border-border flex-shrink-0">
          {!collapsed && (
            <div className="flex items-center min-w-0">
              <div className="h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Ticket className="h-5 w-5 text-white" />
              </div>
              <span className="ml-2 text-lg font-bold text-foreground truncate">
                {t('sidebar.appName')}
              </span>
            </div>
          )}

          {collapsed && (
            <div className="mx-auto h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <Ticket className="h-5 w-5 text-white" />
            </div>
          )}

          {isMobile && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Navigation - scrollable area */}
        <nav className="flex-1 overflow-y-auto py-3 overflow-x-hidden">
          <div className={cn('space-y-1', collapsed ? 'px-1.5' : 'px-2')}>
            {filteredNavGroups.map((group, groupIndex) => (
              <div key={group.titleKey}>
                {/* Group label */}
                {!collapsed && (
                  <div className="px-3 pt-4 pb-1">
                    <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      {t(group.titleKey)}
                    </h3>
                  </div>
                )}
                {collapsed && groupIndex > 0 && <div className="my-2 border-t border-border" />}

                {/* Group items */}
                <ul className="space-y-0.5">
                  {group.items.map(item => (
                    <li key={item.nameKey}>
                      <NavLink
                        to={`${basePath}${item.href}`}
                        onClick={isMobile ? onClose : undefined}
                        title={collapsed ? t(item.nameKey) : undefined}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center text-sm font-medium rounded-lg transition-colors duration-150 group relative',
                            collapsed ? 'justify-center w-full h-10' : 'px-3 py-2',
                            isActive
                              ? 'bg-primary-50 text-primary-700 border-l-[3px] border-primary-500'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-[3px] border-transparent'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <item.icon
                              className={cn(
                                'h-5 w-5 flex-shrink-0 transition-colors',
                                isActive
                                  ? 'text-primary-600'
                                  : 'text-gray-500 group-hover:text-gray-700',
                                !collapsed && 'mr-3'
                              )}
                            />
                            {!collapsed && <span className="truncate">{t(item.nameKey)}</span>}
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Collapse toggle — desktop only */}
        {!isMobile && (
          <div className="border-t border-border p-2 flex-shrink-0">
            <button
              onClick={onToggleCollapse}
              title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
              className={cn(
                'flex items-center text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors w-full py-2',
                collapsed ? 'justify-center' : 'px-3 gap-2'
              )}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  <span>{t('sidebar.collapse')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Sidebar;
