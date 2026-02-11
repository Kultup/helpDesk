import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { Plus, Edit2, Trash2, X, Upload, Image, Video } from 'lucide-react';

interface KBArticle {
  _id: string;
  title: string;
  content?: string;
  tags?: string[];
  category?: string;
  status: string;
  attachments?: Array<{ type: string; filePath: string; url?: string; originalName?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_OPTIONS = ['draft', 'published', 'archived'];

const KnowledgeBase: React.FC = () => {
  const { t } = useTranslation();
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: '',
    tagsStr: '',
    status: 'draft',
    attachments: [] as Array<{
      type: string;
      filePath: string;
      url?: string;
      originalName?: string;
    }>,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadArticles = async (page = 1) => {
    try {
      setIsLoading(true);
      const res = await apiService.getKnowledgeBaseArticles({
        q: searchQ || undefined,
        status: statusFilter === 'all' ? 'all' : statusFilter,
        page,
        limit: 10,
        all: '1',
      });
      setArticles((res.data as KBArticle[]) || []);
      setPagination(res.pagination || { page: 1, limit: 10, total: 0, pages: 0 });
    } catch (e) {
      console.error(e);
      setError(t('knowledgeBase.messages.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArticles(pagination.page);
  }, [statusFilter]);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const handleSearch = () => {
    loadArticles(1);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: '',
      content: '',
      category: '',
      tagsStr: '',
      status: 'draft',
      attachments: [],
    });
    setModalOpen(true);
  };

  const openEdit = (a: KBArticle) => {
    setEditingId(a._id);
    setForm({
      title: a.title,
      content: a.content || '',
      category: a.category || '',
      tagsStr: (a.tags || []).join(', '),
      status: a.status || 'draft',
      attachments: a.attachments || [],
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const res = await apiService.uploadKnowledgeBaseFiles(formData);
      if (res.success && res.data && res.data.length > 0) {
        const newAttachments = res.data
          .filter(f => f.type === 'image' || f.type === 'video')
          .map(f => ({
            type: f.type,
            filePath: f.filePath,
            url: f.url,
            originalName: f.originalName,
          }));
        setForm(prev => ({
          ...prev,
          attachments: [...prev.attachments, ...newAttachments],
        }));
      }
    } catch (err) {
      console.error(err);
      setError(t('knowledgeBase.messages.uploadError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setForm(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError(t('knowledgeBase.messages.titleRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim() || undefined,
        category: form.category.trim() || undefined,
        tags: form.tagsStr
          ? form.tagsStr
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : undefined,
        status: form.status,
        attachments: form.attachments.length ? form.attachments : undefined,
      };
      if (editingId) {
        await apiService.updateKnowledgeBaseArticle(editingId, payload);
        setSuccess(t('knowledgeBase.messages.updateSuccess'));
      } else {
        await apiService.createKnowledgeBaseArticle(payload);
        setSuccess(t('knowledgeBase.messages.createSuccess'));
      }
      closeModal();
      loadArticles(pagination.page);
    } catch (err) {
      console.error(err);
      setError(t('knowledgeBase.messages.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('knowledgeBase.deleteConfirmation'))) return;
    try {
      await apiService.deleteKnowledgeBaseArticle(id);
      setSuccess(t('knowledgeBase.messages.deleteSuccess'));
      setArticles(prev => prev.filter(a => a._id !== id));
    } catch (err) {
      console.error(err);
      setError(t('knowledgeBase.messages.deleteError'));
    }
  };

  const getStatusLabel = (status: string) => {
    const key = `knowledgeBase.status.${status}`;
    return t(key);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm">
          {success}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('knowledgeBase.title')}</h1>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {t('knowledgeBase.addArticle')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <Input
              placeholder={t('knowledgeBase.searchPlaceholder')}
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="max-w-xs"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">{t('knowledgeBase.statusAll')}</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>
                  {getStatusLabel(s)}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={handleSearch}>
              {t('common.search')}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('knowledgeBase.table.title')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('common.category')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('knowledgeBase.table.tags')}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {t('common.status')}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {articles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                        {t('knowledgeBase.noArticles')}
                      </td>
                    </tr>
                  ) : (
                    articles.map(a => (
                      <tr key={a._id}>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{a.title}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{a.category || '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {(a.tags || []).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {getStatusLabel(a.status)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(a)}
                            className="mr-1"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(a._id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => loadArticles(pagination.page - 1)}
              >
                {t('common.previous')}
              </Button>
              <span className="py-1 px-2 text-sm text-gray-600">
                {pagination.page} / {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => loadArticles(pagination.page + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingId ? t('knowledgeBase.editArticle') : t('knowledgeBase.createArticle')}
              </h2>
              <button type="button" onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('knowledgeBase.form.title')} *
                </label>
                <Input
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder={t('knowledgeBase.form.titlePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('knowledgeBase.form.content')}
                </label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                  placeholder={t('knowledgeBase.form.contentPlaceholder')}
                  rows={5}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.category')}
                </label>
                <Input
                  value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  placeholder={t('knowledgeBase.form.categoryPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('knowledgeBase.form.tags')}
                </label>
                <Input
                  value={form.tagsStr}
                  onChange={e => setForm(p => ({ ...p, tagsStr: e.target.value }))}
                  placeholder={t('knowledgeBase.form.tagsPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.status')}
                </label>
                <select
                  value={form.status}
                  onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>
                      {getStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('knowledgeBase.form.media')}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? t('knowledgeBase.uploading') : t('knowledgeBase.addMedia')}
                </Button>
                {form.attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {form.attachments.map((att, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                        {att.type === 'image' ? (
                          <Image className="h-4 w-4" />
                        ) : (
                          <Video className="h-4 w-4" />
                        )}
                        <span>{att.originalName || att.filePath}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          className="text-red-600 hover:underline"
                        >
                          {t('common.delete')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={closeModal}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
