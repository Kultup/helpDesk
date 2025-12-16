import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RichTextEditor, { RichTextEditorRef } from '../components/RichTextEditor';
import { ArrowLeft, Save, Eye, EyeOff, Tag, Plus, X, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Category } from '../types';

interface KBArticleForm {
  title: string;
  content: string;
  category: string;
  subcategory: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  isPublic: boolean;
  attachments?: Array<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    path: string;
    url: string;
    uploadedBy: string;
    uploadedAt: string;
  }>;
}

interface UploadedFile {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

const CreateKnowledgeArticle: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEditMode = !!id;
  const quillRef = useRef<RichTextEditorRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [newTag, setNewTag] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const [formData, setFormData] = useState<KBArticleForm>({
    title: '',
    content: '',
    category: '',
    subcategory: '',
    tags: [],
    status: 'draft',
    isPublic: true,
    attachments: []
  });

  // Налаштування Quill редактора
  const quillModules = {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'font': [] }],
        [{ 'size': [] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'align': [] }],
        ['link', 'image', 'video'],
        ['clean']
      ],
      handlers: {
        image: imageHandler
      }
    }
  };

  const quillFormats = [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike', 'blockquote',
    'list', 'bullet', 'indent',
    'color', 'background',
    'align',
    'link', 'image', 'video'
  ];

  // Обробник вставки зображення
  function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // Перевірка розміру файлу (максимум 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('Розмір файлу не може перевищувати 10MB');
        return;
      }

      // Перевірка типу файлу
      if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
        setError('Дозволені тільки зображення (JPEG, PNG, GIF, WebP)');
        return;
      }

      try {
        setUploadingFiles(true);
        const response = await apiService.uploadKBFiles([file]);
        
        if (response.success && response.data && response.data.length > 0) {
          const uploadedFile = response.data[0];
          
          // Додаємо файл до списку завантажених
          setUploadedFiles(prev => [...prev, uploadedFile]);
          
          // Вставляємо зображення в редактор
          const quill = quillRef.current?.getEditor();
          if (quill) {
            const range = quill.getSelection(true);
            if (range) {
              quill.insertEmbed(range.index, 'image', uploadedFile.url);
              quill.setSelection(range.index + 1);
            }
          }
        } else {
          setError('Помилка завантаження зображення');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Помилка завантаження зображення');
      } finally {
        setUploadingFiles(false);
      }
    };
  }

  useEffect(() => {
    loadCategories();
    if (isEditMode && id) {
      loadArticle(id);
    }
  }, [id, isEditMode]);

  const loadCategories = async () => {
    try {
      const response = await apiService.getCategories(true);
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadArticle = async (articleId: string) => {
    try {
      setInitialLoading(true);
      const response = await apiService.getKBArticle(articleId);
      if (response.success && response.data) {
        const article = response.data as { 
          title?: string; 
          content?: string; 
          category?: { _id?: string }; 
          subcategory?: string; 
          tags?: string[]; 
          status?: string; 
          isPublic?: boolean;
          attachments?: UploadedFile[];
        };
        setFormData({
          title: article.title || '',
          content: article.content || '',
          category: article.category?._id || '',
          subcategory: article.subcategory || '',
          tags: article.tags || [],
          status: (article.status || 'draft') as 'published' | 'draft' | 'archived',
          isPublic: article.isPublic !== undefined ? article.isPublic : true,
          attachments: article.attachments || []
        });
        if (article.attachments) {
          setUploadedFiles(article.attachments);
        }
      }
    } catch (error: any) {
      setError(error.message || 'Помилка завантаження статті');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleGenerateFromTicket = async () => {
    if (!ticketId) {
      setError('Введіть ID тикету');
      return;
    }

    try {
      setLoading(true);
      const response = await apiService.generateKBArticleFromTicket(ticketId);
      if (response.success && response.data) {
        const article = response.data as { title?: string; content?: string; category?: string; tags?: string[] };
        setFormData({
          ...formData,
          title: article.title || formData.title,
          content: article.content || formData.content,
          category: article.category || formData.category,
          tags: (article.tags || formData.tags) as string[]
        });
        setSuccess('Статтю згенеровано з тикету');
        setTicketId(null);
      } else {
        setError(response.message || 'Помилка генерації статті');
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Помилка генерації статті');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploadingFiles(true);
      const filesArray = Array.from(files);
      
      // Перевірка розміру файлів
      const oversizedFiles = filesArray.filter(file => file.size > 10 * 1024 * 1024);
      if (oversizedFiles.length > 0) {
        setError('Деякі файли перевищують максимальний розмір 10MB');
        return;
      }

      const response = await apiService.uploadKBFiles(filesArray);
      
      if (response.success && response.data) {
        setUploadedFiles(prev => [...prev, ...response.data]);
        setSuccess(`Завантажено ${response.data.length} файл(ів)`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.message || 'Помилка завантаження файлів');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка завантаження файлів');
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (filename: string) => {
    setUploadedFiles(prev => prev.filter(file => file.filename !== filename));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const submitData = {
        ...formData,
        attachments: uploadedFiles
      };

      if (isEditMode && id) {
        const response = await apiService.updateKBArticle(id, submitData as unknown as Record<string, unknown>);
        if (response.success) {
          setSuccess('Статтю успішно оновлено');
          setTimeout(() => navigate('/admin/knowledge-base'), 2000);
        } else {
          setError(response.message || 'Помилка оновлення статті');
        }
      } else {
        const response = await apiService.createKBArticle(submitData as unknown as Record<string, unknown>);
        if (response.success) {
          setSuccess('Статтю успішно створено');
          setTimeout(() => navigate('/admin/knowledge-base'), 2000);
        } else {
          setError(response.message || 'Помилка створення статті');
        }
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Помилка збереження статті');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => navigate('/admin/knowledge-base')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад до статей
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? 'Редагувати статтю' : 'Створити статтю KB'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader
            title="Основна інформація"
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Приховати preview
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Показати preview
                  </>
                )}
              </Button>
            }
          />
          <CardContent>
            <div className="space-y-4">
              <Input
                label="Заголовок"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Введіть заголовок статті"
                required
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Контент
                </label>
                {!showPreview ? (
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    <RichTextEditor
                      ref={quillRef}
                      value={formData.content}
                      onChange={(value) => setFormData({ ...formData, content: value })}
                      modules={quillModules}
                      formats={quillFormats}
                      placeholder="Введіть контент статті..."
                      style={{ minHeight: '400px' }}
                      onImageUpload={imageHandler}
                    />
                  </div>
                ) : (
                  <div className="p-4 border border-gray-300 rounded-lg bg-gray-50 min-h-[400px]">
                    <div 
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: formData.content || '<p>Попередній перегляд...</p>' }}
                    />
                  </div>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  Використовуйте панель інструментів для форматування тексту, додавання посилань та зображень
                </p>
              </div>

              {/* Завантажені файли */}
              {uploadedFiles.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Завантажені файли ({uploadedFiles.length})
                  </label>
                  <div className="space-y-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          {file.mimetype.startsWith('image/') ? (
                            <ImageIcon className="w-5 h-5 text-blue-500" />
                          ) : (
                            <Upload className="w-5 h-5 text-gray-500" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.originalName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(file.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveFile(file.filename)}
                          className="ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Кнопка завантаження файлів */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Додати файли (опціонально)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.txt,.zip,.rar"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadingFiles}
                    className="w-full"
                    as="span"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploadingFiles ? 'Завантаження...' : 'Завантажити файли'}
                  </Button>
                </label>
                <p className="mt-2 text-xs text-gray-500">
                  Дозволені формати: зображення (JPEG, PNG, GIF, WebP), PDF, DOC, DOCX, TXT, ZIP, RAR. Максимальний розмір: 10MB на файл.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Категорія
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Виберіть категорію</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Підкатегорія
                  </label>
                  <Input
                    value={formData.subcategory}
                    onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                    placeholder="Введіть підкатегорію (опціонально)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Теги
                </label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Додати тег"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddTag}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Статус
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Чернетка</option>
                    <option value="published">Опубліковано</option>
                    <option value="archived">Архів</option>
                  </select>
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Публічна стаття</span>
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Генерація з тикету */}
        <Card className="mb-6">
          <CardHeader title="Генерація з тикету (AI)" />
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={ticketId || ''}
                  onChange={(e) => setTicketId(e.target.value)}
                  placeholder="Введіть ID вирішеного тикету"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateFromTicket}
                  disabled={loading || !ticketId}
                >
                  Згенерувати
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Введіть ID вирішеного тикету для автоматичної генерації статті KB
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/admin/knowledge-base')}
          >
            Скасувати
          </Button>
          <Button type="submit" disabled={loading || uploadingFiles}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Збереження...' : isEditMode ? 'Оновити' : 'Створити'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateKnowledgeArticle;
