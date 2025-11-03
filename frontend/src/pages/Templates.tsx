import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Monitor,
  Wifi,
  Shield,
  Printer,
  Mail,
  Database,
  Settings,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Edit,
  Eye,
  Search
} from 'lucide-react';
import Card, { CardContent, CardHeader, CardTitle } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Badge from '../components/UI/Badge';
import Input from '../components/UI/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/UI/Select';
import ConfirmationModal from '../components/UI/ConfirmationModal';

import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Category } from '../types';

interface TicketTemplate {
  _id: string;
  title: string;
  description: string;
  category: {
    _id: string;
    name: string;
    color: string;
  };
  priority: 'low' | 'medium' | 'high';
  estimatedResolutionTime: number;
  tags: string[];
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;
  instructions: string;

  isActive: boolean;
  usageCount: number;
  author: {
    _id: string;
    email: string;
    position: string;
  };
  createdAt: string;
  updatedAt: string;
}



const Templates: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Модальні вікна
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    template: TicketTemplate | null;
  }>({ isOpen: false, template: null });
  


  const isAdmin = user?.role === 'admin';

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        search: searchTerm || undefined,
        category: selectedCategory || undefined,
        sortBy,
        page: currentPage,
        limit: 12
      };

      const response = await apiService.getTicketTemplates(params);
      setTemplates(response.data || []);
      setTotalPages(response.pagination?.pages || 1);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory, sortBy, currentPage]);

  useEffect(() => {
    loadTemplates();
    loadCategories();
  }, [searchTerm, selectedCategory, sortBy, currentPage, loadTemplates]);

  const loadCategories = async () => {
    try {
      const response = await apiService.getCategories(true); // Завантажуємо всі категорії, включно з неактивними
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([]);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteModal.template) return;

    try {
      await apiService.deleteTicketTemplate(deleteModal.template._id);
      setTemplates(prev => prev.filter(t => t._id !== deleteModal.template!._id));
      setDeleteModal({ isOpen: false, template: null });
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleUseTemplate = (template: TicketTemplate) => {
    const targetRoute = isAdmin ? '/admin/tickets/create' : '/tickets/create';
    navigate(targetRoute, { 
      state: { 
        template: {
          title: template.title,
          description: template.description,
          priority: template.priority,
          category: template.category._id,
          templateId: template._id
        }
      }
    });
  };



  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-800';
      case 'low': return 'text-green-600 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/20 dark:border-green-800';
      default: return 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <AlertTriangle className="w-4 h-4" />;
      case 'medium': return <Clock className="w-4 h-4" />;
      case 'low': return <CheckCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getPriorityLabel = (priority: string) => {
    return t(`templates.priority.${priority}`, { defaultValue: t('templates.priority.medium') });
  };

  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    // Check for various translations of category types
    const technical = ['технічн', 'апарат', 'technical', 'techniczne', 'urządzenie'];
    const network = ['мереж', 'інтернет', 'network', 'sieć', 'internet'];
    const security = ['безпек', 'віру', 'security', 'bezpieczeństwo', 'wirus'];
    const printer = ['принтер', 'друк', 'printer', 'drukarka', 'print'];
    const email = ['пошт', 'email', 'mail', 'poczta'];
    const database = ['база', 'дані', 'database', 'baza', 'dane', 'danych'];
    
    if (technical.some(term => name.includes(term))) return <Monitor className="w-5 h-5" />;
    if (network.some(term => name.includes(term))) return <Wifi className="w-5 h-5" />;
    if (security.some(term => name.includes(term))) return <Shield className="w-5 h-5" />;
    if (printer.some(term => name.includes(term))) return <Printer className="w-5 h-5" />;
    if (email.some(term => name.includes(term))) return <Mail className="w-5 h-5" />;
    if (database.some(term => name.includes(term))) return <Database className="w-5 h-5" />;
    return <Settings className="w-5 h-5" />;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">{t('templates.title')}</h1>
            <p className="text-text-secondary">
              {t('templates.subtitle')}
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => navigate('/templates/new')}
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>{t('templates.newTemplate')}</span>
            </Button>
          )}
        </div>

        {/* Фільтри */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary w-4 h-4" />
              <Input
                type="text"
                placeholder={t('templates.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-4">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('templates.allCategories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('templates.allCategories')}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category._id} value={category._id}>
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span>{category.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t('templates.sortBy.newest')}</SelectItem>
                <SelectItem value="popular">{t('templates.sortBy.popular')}</SelectItem>
                <SelectItem value="alphabetical">{t('templates.sortBy.alphabetical')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Список шаблонів */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">{t('templates.noTemplatesFound')}</h3>
            <p className="text-text-secondary mb-4">
              {searchTerm || selectedCategory 
                ? t('templates.noTemplatesDescription')
                : t('templates.noTemplatesAvailable')
              }
            </p>
            {isAdmin && (
              <Button onClick={() => navigate('/templates/new')}>
                {t('templates.createFirstTemplate')}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {templates.map((template) => (
                <div 
                  key={template._id} 
                  className="p-6 hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Основна інформація */}
                    <div className="flex items-start space-x-4 flex-1 min-w-0">
                      <div 
                        className="p-3 rounded-lg flex-shrink-0"
                        style={{ 
                          backgroundColor: `${template.category.color}20`,
                          color: template.category.color 
                        }}
                      >
                        {getCategoryIcon(template.category.name)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-foreground leading-tight">
                            {template.title}
                          </h3>
                        </div>
                        
                        <p className="text-sm text-text-secondary mb-3 line-clamp-2">
                          {template.description}
                        </p>
                        
                        <div className="flex items-center flex-wrap gap-2 mb-3">
                          <Badge 
                            variant="secondary" 
                            size="sm"
                            style={{ 
                              backgroundColor: `${template.category.color}20`,
                              color: template.category.color 
                            }}
                          >
                            {template.category.name}
                          </Badge>
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${getPriorityColor(template.priority)}`}>
                            {getPriorityIcon(template.priority)}
                            <span>{getPriorityLabel(template.priority)}</span>
                          </div>
                          {template.tags.length > 0 && (
                            <>
                              {template.tags.slice(0, 3).map((tag, index) => (
                                <Badge key={`${template._id}-tag-${index}`} variant="secondary" size="sm">
                                  {tag}
                                </Badge>
                              ))}
                              {template.tags.length > 3 && (
                                <Badge variant="secondary" size="sm">
                                  +{template.tags.length - 3}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-text-secondary">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-4 h-4" />
                            <span>~{template.estimatedResolutionTime} {t('templates.estimatedTime')}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Eye className="w-4 h-4" />
                            <span>{template.usageCount} {t('templates.usageCount')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Дії */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        onClick={() => handleUseTemplate(template)}
                        size="sm"
                      >
                        {t('templates.useTemplate')}
                      </Button>
                      
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/templates/${template._id}/edit`)}
                            className="p-2"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteModal({ isOpen: true, template })}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Пагінація */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-8">
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              {t('templates.pagination.previous')}
            </Button>
            
            {[...Array(totalPages)].map((_, i) => (
              <Button
                key={i + 1}
                variant={currentPage === i + 1 ? "primary" : "outline"}
                onClick={() => setCurrentPage(i + 1)}
                className="w-10"
              >
                {i + 1}
              </Button>
            ))}
            
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              {t('templates.pagination.next')}
            </Button>
          </div>
        </div>
      )}

      {/* Модальне вікно підтвердження видалення */}
      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onCancel={() => setDeleteModal({ isOpen: false, template: null })}
        onConfirm={handleDeleteTemplate}
        title={t('templates.deleteModal.title')}
        message={t('templates.deleteModal.message', { title: deleteModal.template?.title })}
        confirmText={t('templates.deleteModal.confirm')}
        cancelText={t('templates.deleteModal.cancel')}
        type="danger"
      />


    </div>
  );
};

export default Templates;