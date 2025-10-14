import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { TicketPriority, TicketCategory } from '../types';
import Modal from './UI/Modal';
import Button from './UI/Button';
import Input from './UI/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './UI/Select';
import Card from './UI/Card';
import { Lightbulb, Clock, Tag as TagIcon } from 'lucide-react';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TicketTemplate {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  estimatedTime: string;
  tags: string[];
  quickTips?: string[];
}

const CreateTicketModal: React.FC<CreateTicketModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cities, setCities] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: TicketPriority.MEDIUM,
    category: TicketCategory.TECHNICAL,
    city: '',
    assignedTo: ''
  });

  // Templates with translations
  const templates: TicketTemplate[] = [
    {
      id: 'technical',
      title: t('createTicketModal.templates.technical.title'),
      description: t('createTicketModal.templates.technical.description'),
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.MEDIUM,
      estimatedTime: t('createTicketModal.templates.technical.estimatedTime'),
      tags: t('createTicketModal.templates.technical.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Check if the computer is properly connected to power',
        'Try restarting the computer',
        'Check if all cables are securely connected',
        'Note any error messages that appear'
      ]
    },
    {
      id: 'network',
      title: t('createTicketModal.templates.network.title'),
      description: t('createTicketModal.templates.network.description'),
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.HIGH,
      estimatedTime: t('createTicketModal.templates.network.estimatedTime'),
      tags: t('createTicketModal.templates.network.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Check if the network cable is connected',
        'Try restarting the router/modem',
        'Check if other devices have internet access',
        'Try connecting to a different network'
      ]
    },
    {
      id: 'security',
      title: t('createTicketModal.templates.security.title'),
      description: t('createTicketModal.templates.security.description'),
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.HIGH,
      estimatedTime: t('createTicketModal.templates.security.estimatedTime'),
      tags: t('createTicketModal.templates.security.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Do not open suspicious files or links',
        'Run a full antivirus scan',
        'Change passwords if you suspect a breach',
        'Disconnect from the internet if necessary'
      ]
    },
    {
      id: 'printer',
      title: t('createTicketModal.templates.printer.title'),
      description: t('createTicketModal.templates.printer.description'),
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.LOW,
      estimatedTime: t('createTicketModal.templates.printer.estimatedTime'),
      tags: t('createTicketModal.templates.printer.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Check if the printer is turned on and connected',
        'Check paper and ink/toner levels',
        'Try printing a test page',
        'Clear any paper jams'
      ]
    },
    {
      id: 'account',
      title: t('createTicketModal.templates.account.title'),
      description: t('createTicketModal.templates.account.description'),
      category: TicketCategory.ACCOUNT,
      priority: TicketPriority.MEDIUM,
      estimatedTime: t('createTicketModal.templates.account.estimatedTime'),
      tags: t('createTicketModal.templates.account.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Try resetting your password',
        'Check if Caps Lock is on',
        'Clear browser cache and cookies',
        'Try using a different browser'
      ]
    },
    {
      id: 'billing',
      title: t('createTicketModal.templates.billing.title'),
      description: t('createTicketModal.templates.billing.description'),
      category: TicketCategory.BILLING,
      priority: TicketPriority.MEDIUM,
      estimatedTime: t('createTicketModal.templates.billing.estimatedTime'),
      tags: t('createTicketModal.templates.billing.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Have your account number ready',
        'Check your payment method details',
        'Review recent transactions',
        'Contact your bank if needed'
      ]
    },
    {
      id: 'general',
      title: t('createTicketModal.templates.general.title'),
      description: t('createTicketModal.templates.general.description'),
      category: TicketCategory.GENERAL,
      priority: TicketPriority.LOW,
      estimatedTime: t('createTicketModal.templates.general.estimatedTime'),
      tags: t('createTicketModal.templates.general.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Be as specific as possible in your question',
        'Include relevant details',
        'Check the FAQ first',
        'Provide screenshots if helpful'
      ]
    },
    {
      id: 'other',
      title: t('createTicketModal.templates.other.title'),
      description: t('createTicketModal.templates.other.description'),
      category: TicketCategory.GENERAL,
      priority: TicketPriority.MEDIUM,
      estimatedTime: t('createTicketModal.templates.other.estimatedTime'),
      tags: t('createTicketModal.templates.other.tags', { returnObjects: true }) as string[],
      quickTips: [
        'Describe the problem clearly',
        'Include steps to reproduce',
        'Mention what you expected to happen',
        'Add any error messages'
      ]
    }
  ];

  // Load cities on component mount
  useEffect(() => {
    loadCities();
    loadAdmins();
  }, []);

  const loadCities = async () => {
    setLoadingCities(true);
    try {
      const response = await fetch('/api/cities');
      if (response.ok) {
        const data = await response.json();
        setCities(data);
      } else {
        toast.error(t('createTicketModal.errors.loadCitiesError'));
      }
    } catch (error) {
      console.error('Error loading cities:', error);
      toast.error(t('createTicketModal.errors.loadDataError'));
    } finally {
      setLoadingCities(false);
    }
  };

  const loadAdmins = async () => {
    setLoadingAdmins(true);
    try {
      const response = await fetch('/api/admins');
      if (response.ok) {
        const data = await response.json();
        setAdmins(data);
      } else {
        toast.error(t('createTicketModal.errors.loadAdminsError'));
      }
    } catch (error) {
      console.error('Error loading admins:', error);
      toast.error(t('createTicketModal.errors.loadDataError'));
    } finally {
      setLoadingAdmins(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setFormData(prev => ({
        ...prev,
        title: template.title,
        description: template.description,
        category: template.category,
        priority: template.priority,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Валідація
    if (!formData.title.trim()) {
      toast.error(t('createTicketModal.errors.titleRequired'));
      return;
    }
    
    if (!formData.description.trim()) {
      toast.error(t('createTicketModal.errors.descriptionRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      // Підготовка даних для API
      const ticketData = {
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        category: formData.category,
        cityId: formData.city,
        assignedTo: formData.assignedTo || undefined
      };

      await apiService.createTicket(ticketData);
      handleClose();
      toast.success(t('createTicketModal.success.created'));
      onSuccess(); // Викликаємо callback для оновлення списку
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error(t('createTicketModal.errors.createError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      priority: TicketPriority.MEDIUM,
      category: TicketCategory.TECHNICAL,
      city: '',
      assignedTo: ''
    });
    setSelectedTemplate(null);
    onClose();
  };

  const selectedTemplateData = selectedTemplate ? templates.find(t => t.id === selectedTemplate) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('createTicketModal.title')}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Template Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('createTicketModal.templateLabel')}
          </label>
          <Select value={selectedTemplate || ''} onValueChange={handleTemplateSelect}>
            <SelectTrigger>
              <SelectValue placeholder={t('createTicketModal.templatePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {templates.map(template => (
                <SelectItem key={template.id} value={template.id}>
                  <div>
                    <div className="font-medium">{template.title}</div>
                    <div className="text-xs text-gray-500">{template.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            {t('createTicketModal.templateHint')}
          </p>
        </div>

        {/* Quick Tips */}
        {selectedTemplateData && selectedTemplateData.quickTips && (
          <Card className="bg-green-50 border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-green-600" />
              <h4 className="font-medium text-green-800">{t('createTicketModal.quickTipsTitle')}</h4>
            </div>
            <ul className="list-disc list-inside space-y-1">
              {selectedTemplateData.quickTips.map((tip, index) => (
                <li key={index} className="text-sm text-green-700">{tip}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Title */}
        <div>
          <Input
            label={t('createTicketModal.titleLabel')}
            placeholder={t('createTicketModal.titlePlaceholder')}
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            maxLength={100}
            fullWidth
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            {formData.title.length}/100 {t('createTicketModal.titleCounter')}
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('createTicketModal.descriptionLabel')} *
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={4}
            placeholder={t('createTicketModal.descriptionPlaceholder')}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            maxLength={1000}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            {formData.description.length}/1000 {t('createTicketModal.titleCounter')}
          </p>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createTicketModal.priorityLabel')}
            </label>
            <Select value={formData.priority} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as TicketPriority }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TicketPriority.LOW}>{t('createTicketModal.priorities.low')}</SelectItem>
                <SelectItem value={TicketPriority.MEDIUM}>{t('createTicketModal.priorities.medium')}</SelectItem>
                <SelectItem value={TicketPriority.HIGH}>{t('createTicketModal.priorities.high')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {t('createTicketModal.priorityHint')}
            </p>
          </div>
          
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createTicketModal.categoryLabel')}
            </label>
            <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as TicketCategory }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TicketCategory.TECHNICAL}>{t('createTicketModal.categories.technical')}</SelectItem>
                <SelectItem value={TicketCategory.ACCOUNT}>{t('createTicketModal.categories.account')}</SelectItem>
                <SelectItem value={TicketCategory.BILLING}>{t('createTicketModal.categories.billing')}</SelectItem>
                <SelectItem value={TicketCategory.GENERAL}>{t('createTicketModal.categories.general')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {t('createTicketModal.categoryHint')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createTicketModal.cityLabel')} *
            </label>
            <Select value={formData.city} onValueChange={(value) => setFormData(prev => ({ ...prev, city: value }))}>
              <SelectTrigger>
                <SelectValue placeholder={loadingCities ? t('createTicketModal.loadingCities') : t('createTicketModal.cityPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {cities.map(city => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createTicketModal.assignedToLabel')}
            </label>
            <Select value={formData.assignedTo || ''} onValueChange={(value) => setFormData(prev => ({ ...prev, assignedTo: value }))}>
              <SelectTrigger>
                <SelectValue placeholder={loadingAdmins ? t('createTicketModal.loadingAdmins') : t('createTicketModal.assignedToPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('createTicketModal.assignedToPlaceholder')}</SelectItem>
                {admins.map(admin => (
                  <SelectItem key={admin.id} value={admin.id}>
                    {admin.name} ({admin.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Template Tags */}
        {selectedTemplateData && selectedTemplateData.tags && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TagIcon className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">Tags:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedTemplateData.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
         <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
           <Button variant="outline" onClick={handleClose}>
             {t('createTicketModal.buttons.cancel')}
           </Button>
           <Button 
             type="submit" 
             isLoading={isSubmitting}
             disabled={isSubmitting}
           >
             {isSubmitting ? t('createTicketModal.buttons.creating') : t('createTicketModal.buttons.create')}
           </Button>
         </div>
      </form>
    </Modal>
  );
};

export default CreateTicketModal;