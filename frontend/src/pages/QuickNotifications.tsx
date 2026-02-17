import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';
import Button from '../components/UI/Button';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Send,
  Save,
  FileText,
  Info,
  AlertCircle,
  CheckCircle,
  X,
  Trash2,
  Paperclip,
  Pin,
} from 'lucide-react';
import { NotificationTemplate } from '../types';

const QuickNotifications: React.FC = () => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'warning' | 'error' | 'success'>('warning');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [pin, setPin] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Create template state
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState<
    'ticket' | 'user' | 'system' | 'security' | 'maintenance'
  >('system');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  // Delete template state
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeEmoji = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
  } as const;

  const typeIcons = {
    info: Info,
    warning: AlertTriangle,
    error: XCircle,
    success: CheckCircle2,
  } as const;

  const typeColors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  } as const;

  const handleSend = async () => {
    if (!message.trim()) {
      setError(t('quickNotifications.messageRequired'));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiService.sendTelegramNotification({
        message,
        type,
        attachment: attachment || undefined,
        pin,
      });
      if (res.success) {
        // Сповіщення відправлено в групу
        setResult({ sent: 1, failed: 0, total: 1 });
        // Clear message and attachment after successful send
        setMessage('');
        setAttachment(null);
        setPin(false);
      } else {
        setError(res.message || t('quickNotifications.errorSending'));
      }
    } catch (e: any) {
      setError(e.message || t('quickNotifications.errorSending'));
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const res = await apiService.getNotificationTemplates({ type: 'telegram' });
      setTemplates(res.data || []);
    } catch (e) {
      console.error('Error loading notification templates', e);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleApplyTemplate = () => {
    const tpl = templates.find(t => t._id === selectedTemplateId);
    if (tpl) {
      setMessage(tpl.content || '');
      setTemplateMessage(null);
      setSelectedTemplateId('');
    }
  };

  const handleSaveTemplate = async () => {
    try {
      setSavingTemplate(true);
      setError(null);
      const contentToSave = (templateMessage ?? message).trim();
      if (!templateName.trim() || !contentToSave) {
        setError(t('quickNotifications.templateValidationError'));
        setSavingTemplate(false);
        return;
      }

      const res = await apiService.createNotificationTemplate({
        name: templateName.trim(),
        type: 'telegram',
        category: templateCategory,
        content: contentToSave,
      });

      if (res.success) {
        setTemplateName('');
        setTemplateMessage(null);
        setShowTemplateForm(false);
        await loadTemplates();
        setResult(null);
      } else {
        setError(res.message || t('quickNotifications.templateSaveError'));
      }
    } catch (e: any) {
      setError(e.message || t('quickNotifications.templateSaveError'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplateId) return;

    try {
      setIsDeleting(true);
      const res = await apiService.deleteNotificationTemplate(deletingTemplateId);

      if (res.success) {
        // Якщо видаляємо обраний шаблон, очищуємо вибір
        if (selectedTemplateId === deletingTemplateId) {
          setSelectedTemplateId('');
        }
        await loadTemplates();
        setResult(null);
      } else {
        setError(res.message || t('quickNotifications.templates.deleteError'));
      }
    } catch (e: any) {
      setError(e.message || t('quickNotifications.templates.deleteError'));
    } finally {
      setIsDeleting(false);
      setDeletingTemplateId(null);
      setShowDeleteConfirm(false);
    }
  };

  const confirmDeleteTemplate = (templateId: string) => {
    setDeletingTemplateId(templateId);
    setShowDeleteConfirm(true);
  };

  const cancelDeleteTemplate = () => {
    setDeletingTemplateId(null);
    setShowDeleteConfirm(false);
  };

  const getCharacterCount = () => {
    return message.length;
  };

  const getCharacterCountColor = () => {
    const count = getCharacterCount();
    if (count > 4000) return 'text-red-600';
    if (count > 3000) return 'text-yellow-600';
    return 'text-gray-500';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-blue-600" />
            {t('quickNotifications.title')}
          </h1>
          <p className="text-muted-foreground mt-2">{t('quickNotifications.quickMessageTitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Templates Section */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-foreground">
                {t('quickNotifications.selectTemplate')}
              </h2>
            </div>

            <div className="flex gap-3">
              <select
                className="flex-1 rounded-lg border border-border bg-background text-foreground p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                value={selectedTemplateId}
                onChange={e => {
                  const templateId = e.target.value;
                  setSelectedTemplateId(templateId);
                  if (templateId) {
                    const tpl = templates.find(t => t._id === templateId);
                    if (tpl) {
                      setMessage(tpl.content || '');
                    }
                  }
                }}
              >
                <option value="">
                  {templatesLoading
                    ? t('quickNotifications.loadingTemplates')
                    : t('quickNotifications.selectTemplatePlaceholder')}
                </option>
                {templates.length === 0 && !templatesLoading ? (
                  <option value="" disabled>
                    {t('quickNotifications.noTemplates')}
                  </option>
                ) : (
                  templates.map(tpl => (
                    <option key={tpl._id} value={tpl._id}>
                      {tpl.name} ({tpl.category})
                    </option>
                  ))
                )}
              </select>
              <Button
                variant="outline"
                onClick={handleApplyTemplate}
                disabled={!selectedTemplateId || templatesLoading}
                className="px-6"
              >
                {t('quickNotifications.applyTemplate')}
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedTemplateId && confirmDeleteTemplate(selectedTemplateId)}
                disabled={!selectedTemplateId || templatesLoading}
                className="px-4 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Message Form */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
            <div className="space-y-6">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">
                  {t('quickNotifications.typeLabel')}
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(typeIcons).map(([typeKey, Icon]) => (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => setType(typeKey as any)}
                      className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                        type === typeKey
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-border bg-background hover:border-gray-300'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {t(`quickNotifications.types.${typeKey}`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Input */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('quickNotifications.messageLabel')}
                  </label>
                  <span className={`text-xs ${getCharacterCountColor()}`}>
                    {getCharacterCount()}/4096 {t('quickNotifications.charactersCount')}
                  </span>
                </div>
                <textarea
                  className="w-full rounded-lg border border-border bg-background text-foreground p-4 min-h-[160px] focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  placeholder={t('quickNotifications.messagePlaceholderInput')}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  maxLength={4096}
                />
                {!message.trim() && (
                  <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {t('quickNotifications.messageRequired')}
                  </p>
                )}
              </div>

              {/* Attachment and Pin Options */}
              <div className="flex flex-wrap items-center gap-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-gray-500" />
                    Прикріпити файл
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      id="attachment-upload"
                      className="hidden"
                      onChange={e => setAttachment(e.target.files ? e.target.files[0] : null)}
                    />
                    <label
                      htmlFor="attachment-upload"
                      className="cursor-pointer px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      {attachment ? 'Змінити файл' : 'Обрати файл'}
                    </label>
                    {attachment && (
                      <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md border border-blue-100">
                        <span className="truncate max-w-[150px] font-medium">
                          {attachment.name}
                        </span>
                        <button
                          onClick={() => setAttachment(null)}
                          className="text-red-500 hover:text-red-700 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center h-5">
                    <input
                      id="pin-notification"
                      type="checkbox"
                      checked={pin}
                      onChange={e => setPin(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label
                      htmlFor="pin-notification"
                      className="font-medium text-gray-700 flex items-center gap-2 cursor-pointer"
                    >
                      <Pin
                        className={`h-4 w-4 ${pin ? 'text-blue-600 fill-blue-600' : 'text-gray-400'}`}
                      />
                      Закріпити повідомлення
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-4">
                <Button
                  onClick={handleSend}
                  disabled={loading || !message.trim()}
                  className="px-8 py-3 text-base font-semibold"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Надсилання...
                    </>
                  ) : (
                    <>
                      {' '}
                      <Send className="h-4 w-4 mr-2" /> {t('quickNotifications.sendMessage')}{' '}
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setShowTemplateForm(!showTemplateForm)}
                  className="px-6 py-3"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {t('quickNotifications.saveAsTemplate')}
                </Button>
              </div>

              {/* Error Display */}
              {error && (
                <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  <XCircle className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="ml-auto text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Save Template Form */}
          {showTemplateForm && (
            <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Save className="h-5 w-5 text-green-600" />
                Створити новий шаблон
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t('quickNotifications.templateName')}
                  </label>
                  <input
                    className="w-full rounded-lg border border-border bg-background text-foreground p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder={t('quickNotifications.templateNamePlaceholderInput')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {t('quickNotifications.category')}
                  </label>
                  <select
                    className="w-full rounded-lg border border-border bg-background text-foreground p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={templateCategory}
                    onChange={e => setTemplateCategory(e.target.value as any)}
                  >
                    <option value="system">Системні</option>
                    <option value="maintenance">Технічні роботи</option>
                    <option value="user">Користувачі</option>
                    <option value="ticket">Тікети</option>
                    <option value="security">Безпека</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Текст шаблону
                </label>
                <textarea
                  className="w-full rounded-lg border border-border bg-background text-foreground p-3 min-h-[100px] focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t('quickNotifications.templateContentPlaceholderInput')}
                  value={templateMessage ?? message}
                  onChange={e => setTemplateMessage(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveTemplate}
                  disabled={
                    savingTemplate || !(templateMessage ?? message).trim() || !templateName.trim()
                  }
                >
                  {savingTemplate
                    ? t('quickNotifications.savingTemplate')
                    : t('quickNotifications.saveAsTemplate')}
                </Button>
                <Button variant="outline" onClick={() => setShowTemplateForm(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Preview and Results */}
        <div className="space-y-6">
          {/* Preview */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-foreground">
                {t('quickNotifications.previewTitle')}
              </h3>
            </div>

            <div className={`rounded-lg border-2 p-4 ${typeColors[type]}`}>
              <div className="flex items-center gap-2 mb-2">
                {React.createElement(typeIcons[type], { className: 'h-5 w-5' })}
                <span className="font-semibold">{t('quickNotifications.helpdeskMessage')}</span>
              </div>
              <div className="whitespace-pre-line text-sm">
                {message || t('quickNotifications.previewPlaceholder')}
              </div>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>{t('quickNotifications.telegramInfo')}</p>
              <p>{t('quickNotifications.emojiInfo')}</p>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Результат надсилання
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-green-800 font-medium">Успішно надіслано</span>
                  <span className="text-green-600 font-bold text-lg">{result.sent}</span>
                </div>

                {result.failed > 0 && (
                  <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                    <span className="text-red-800 font-medium">Помилки</span>
                    <span className="text-red-600 font-bold text-lg">{result.failed}</span>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                  <span className="text-gray-800 font-medium">Загалом користувачів</span>
                  <span className="text-gray-600 font-bold text-lg">{result.total}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                {t('quickNotifications.deleteConfirmTitle')}
              </h3>
            </div>
            <p className="text-gray-600 mb-6">{t('quickNotifications.deleteConfirmMessage')}</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={cancelDeleteTemplate} disabled={isDeleting}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleDeleteTemplate}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? t('quickNotifications.deleting') : t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickNotifications;
