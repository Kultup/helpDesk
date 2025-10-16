import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { TicketPriority, TicketCategory } from '../types';
import Modal from './UI/Modal';
import Button from './UI/Button';
import Input from './UI/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './UI/Select';
import Card from './UI/Card';
import { Lightbulb, Clock, Tag as TagIcon, Upload, X, File } from 'lucide-react';

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
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: TicketPriority.MEDIUM,
    category: TicketCategory.TECHNICAL,
    city: '',
    assignedTo: ''
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  const handleFiles = (files: File[]) => {
    const validFiles = files.filter(file => {
      // Перевірка типу файлу
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Файл ${file.name} має непідтримуваний тип`);
        return false;
      }
      
      // Перевірка розміру файлу (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`Файл ${file.name} перевищує максимальний розмір 5MB`);
        return false;
      }
      
      return true;
    });

    // Перевірка загальної кількості файлів
    if (attachments.length + validFiles.length > 5) {
      toast.error('Максимальна кількість файлів: 5');
      return;
    }

    setAttachments(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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
      quickTips: t('createTicketModal.templates.technical.quickTips', { returnObjects: true }) as string[]
    },
    {
      id: 'network',
      title: t('createTicketModal.templates.network.title'),
      description: t('createTicketModal.templates.network.description'),
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.HIGH,
      estimatedTime: t('createTicketModal.templates.network.estimatedTime'),
      tags: t('createTicketModal.templates.network.tags', { returnObjects: true }) as string[],
      quickTips: t('createTicketModal.templates.network.quickTips', { returnObjects: true }) as string[]
    },
    {
      id: 'security',
      title: t('createTicketModal.templates.security.title'),
      description: t('createTicketModal.templates.security.description'),
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.HIGH,
      estimatedTime: t('createTicketModal.templates.security.estimatedTime'),
      tags: t('createTicketModal.templates.security.tags', { returnObjects: true }) as string[],
      quickTips: t('createTicketModal.templates.security.quickTips', { returnObjects: true }) as string[]
    },
    {
      id: 'printer',
      title: t('createTicketModal.templates.printer.title'),
      description: t('createTicketModal.templates.printer.description'),
      category: TicketCategory.TECHNICAL,
      priority: TicketPriority.LOW,
      estimatedTime: t('createTicketModal.templates.printer.estimatedTime'),
      tags: t('createTicketModal.templates.printer.tags', { returnObjects: true }) as string[],
      quickTips: t('createTicketModal.templates.printer.quickTips', { returnObjects: true }) as string[]
    },
    {
      id: 'account',
      title: t('createTicketModal.templates.account.title'),
      description: t('createTicketModal.templates.account.description'),
      category: TicketCategory.ACCOUNT,
      priority: TicketPriority.MEDIUM,
      estimatedTime: t('createTicketModal.templates.account.estimatedTime'),
      tags: t('createTicketModal.templates.account.tags', { returnObjects: true }) as string[],
      quickTips: t('createTicketModal.templates.account.quickTips', { returnObjects: true }) as string[]
    },
    {
      id: 'billing',
      title: t('createTicketModal.templates.billing.title'),
      description: t('createTicketModal.templates.billing.description'),
      category: TicketCategory.BILLING,
      priority: TicketPriority.MEDIUM,
      estimatedTime: t('createTicketModal.templates.billing.estimatedTime'),
      tags: t('createTicketModal.templates.billing.tags', { returnObjects: true }) as string[],
      quickTips: t('createTicketModal.templates.billing.quickTips', { returnObjects: true }) as string[]
    },
    {
      id: 'general',
      title: t('createTicketModal.templates.general.title'),
      description: t('createTicketModal.templates.general.description'),
      category: TicketCategory.GENERAL,
      priority: TicketPriority.LOW,
      estimatedTime: t('createTicketModal.templates.general.estimatedTime'),
      tags: t('createTicketModal.templates.general.tags', { returnObjects: true }) as string[],
      quickTips: t('createTicketModal.templates.general.quickTips', { returnObjects: true }) as string[]
    },
    {
      id: 'other',
      title: t('createTicketModal.templates.other.title'),
      description: t('createTicketModal.templates.other.description'),
      category: TicketCategory.GENERAL,
      priority: TicketPriority.MEDIUM,
      estimatedTime: t('createTicketModal.templates.other.estimatedTime'),
      tags: t('createTicketModal.templates.other.tags', { returnObjects: true }) as string[],
      quickTips: t('createTicketModal.templates.other.quickTips', { returnObjects: true }) as string[]
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
      const response = await apiService.getSimpleCities();
      if (response.success && response.data) {
        setCities(response.data);
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
      const response = await apiService.getAdmins();
      if (response.success && response.data) {
        const adminsList = response.data.map((u: any) => ({
          id: u._id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email
        }));
        setAdmins(adminsList);
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

    if (!formData.city) {
      toast.error('Місто є обов\'язковим');
      return;
    }

    setIsSubmitting(true);
    try {
      // Створюємо FormData для відправки файлів
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('priority', formData.priority);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('city', formData.city);
      
      if (formData.assignedTo) {
        formDataToSend.append('assignedTo', formData.assignedTo);
      }

      // Додаємо файли
      attachments.forEach((file) => {
        formDataToSend.append('attachments', file);
      });

      // Відправляємо запит
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formDataToSend
      });

      if (!response.ok) {
        throw new Error('Failed to create ticket');
      }

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
    setAttachments([]);
    onClose();
  };

  const selectedTemplateData = selectedTemplate ? templates.find(t => t.id === selectedTemplate) : null;

  const getPriorityLabel = (value: TicketPriority) => {
    if (value === TicketPriority.LOW) return t('createTicketModal.priorities.low');
    if (value === TicketPriority.MEDIUM) return t('createTicketModal.priorities.medium');
    return t('createTicketModal.priorities.high');
  };

  const getCategoryLabel = (value: TicketCategory) => {
    if (value === TicketCategory.TECHNICAL) return t('createTicketModal.categories.technical');
    if (value === TicketCategory.ACCOUNT) return t('createTicketModal.categories.account');
    if (value === TicketCategory.BILLING) return t('createTicketModal.categories.billing');
    return t('createTicketModal.categories.general');
  };

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
              <span className="block truncate">
                {selectedTemplateData?.title || t('createTicketModal.templatePlaceholder')}
              </span>
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
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground placeholder:text-text-secondary focus:ring-2 focus:ring-primary focus:border-primary"
            rows={4}
            placeholder={t('createTicketModal.descriptionPlaceholder')}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            maxLength={1000}
            required
          />
          <p className="text-xs text-text-secondary mt-1">
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
                <span className="block truncate">{getPriorityLabel(formData.priority)}</span>
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
                <span className="block truncate">{getCategoryLabel(formData.category)}</span>
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
                <span className="block truncate">
                  {loadingCities
                    ? t('createTicketModal.loadingCities')
                    : (cities.find(city => city.id === formData.city)?.name || t('createTicketModal.cityPlaceholder'))}
                </span>
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
                <span className="block truncate">
                  {loadingAdmins
                    ? t('createTicketModal.loadingAdmins')
                    : (
                      (admins.find(admin => admin.id === formData.assignedTo)?.name
                        ? `${admins.find(admin => admin.id === formData.assignedTo)?.name} (${admins.find(admin => admin.id === formData.assignedTo)?.email})`
                        : t('createTicketModal.assignedToPlaceholder'))
                    )}
                </span>
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

         {/* File Upload Section */}
         <div>
           <label className="block text-sm font-medium text-gray-700 mb-2">
             Прикріплені файли
           </label>
           
           {/* Drag and Drop Area */}
           <div
             className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
               isDragOver 
                 ? 'border-blue-500 bg-blue-50' 
                 : 'border-gray-300 hover:border-gray-400'
             }`}
             onDragOver={handleDragOver}
             onDragLeave={handleDragLeave}
             onDrop={handleDrop}
           >
             <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
             <p className="text-sm text-gray-600 mb-2">
               Перетягніть файли сюди або натисніть для вибору
             </p>
             <p className="text-xs text-gray-500 mb-4">
               Підтримувані формати: JPG, PNG, GIF, PDF, DOC, DOCX, TXT (макс. 5MB, до 5 файлів)
             </p>
             <input
               type="file"
               multiple
               accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.txt"
               onChange={handleFileSelect}
               className="hidden"
               id="file-upload"
             />
             <Button
               type="button"
               variant="outline"
               onClick={() => document.getElementById('file-upload')?.click()}
             >
               Вибрати файли
             </Button>
           </div>

           {/* Selected Files List */}
           {attachments.length > 0 && (
             <div className="mt-4 space-y-2">
               <p className="text-sm font-medium text-gray-700">
                 Вибрані файли ({attachments.length}/5):
               </p>
               {attachments.map((file, index) => (
                 <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                   <div className="flex items-center space-x-3">
                     <File className="h-5 w-5 text-gray-500" />
                     <div>
                       <p className="text-sm font-medium text-gray-900">{file.name}</p>
                       <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                     </div>
                   </div>
                   <Button
                     type="button"
                     variant="ghost"
                     size="sm"
                     onClick={() => removeFile(index)}
                     className="text-red-500 hover:text-red-700"
                   >
                     <X className="h-4 w-4" />
                   </Button>
                 </div>
               ))}
             </div>
           )}
         </div>

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