import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save,
  X,
  Bold,
  Italic,
  Heading,
  List as ListIcon,
  ListOrdered,
  Link as LinkIcon,
  Image,
} from 'lucide-react';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { cn } from '../utils';
import api from '../services/api';

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, title, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
  >
    {icon}
  </button>
);

const DocumentEditor: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(!!slug);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (slug) {
      fetchDocument(slug);
    }
  }, [slug]);

  const fetchDocument = async (slug: string) => {
    setLoading(true);
    try {
      const response = await api.get(`/documents/${slug}`);
      const data = response as { success: boolean; data: { title: string; content: string } };

      if (data.success) {
        setTitle(data.data.title);
        setContent(data.data.content);
      } else {
        toast.error('Не вдалося завантажити документ');
        navigate('/documents');
      }
    } catch (error) {
      console.error('Error fetching document:', error);
      toast.error('Помилка при завантаженні');
      navigate('/documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Заголовок і зміст обов'язкові");
      return;
    }

    setSaving(true);
    try {
      const url = slug ? `/documents/${slug}` : '/documents';
      const method = slug ? 'put' : 'post';

      const response = await api[method](url, { title, content });
      const data = response as { success: boolean; data?: { slug?: string }; message?: string };

      if (data.success) {
        toast.success(slug ? 'Документ оновлено' : 'Документ створено');
        if (!slug && data.data?.slug) {
          navigate(`/documents/${data.data.slug}/edit`);
        }
      } else {
        toast.error((data as { message?: string }).message || 'Не вдалося зберегти документ');
      }
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Помилка при збереженні');
    } finally {
      setSaving(false);
    }
  };

  const insertText = (before: string, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText =
      content.substring(0, start) + before + selectedText + after + content.substring(end);

    setContent(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleBold = () => insertText('**', '**');
  const handleItalic = () => insertText('*', '*');
  const handleHeading1 = () => insertText('# ');
  const handleHeading2 = () => insertText('## ');
  const handleHeading3 = () => insertText('### ');
  const handleBulletList = () => insertText('- ');
  const handleNumberedList = () => insertText('1. ');
  const handleLink = () => insertText('[', '](url)');
  const handleImage = () => insertText('![', '](url)');

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <span className="text-lg font-bold text-primary-600">{slug ? '✏️' : '📄'}</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {slug ? 'Редагування документа' : 'Новий документ'}
            </h1>
            <p className="text-sm text-gray-500">
              {slug ? 'Зміни внесені зміни' : 'Створіть новий документ'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/documents')}
            variant="secondary"
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Скасувати
          </Button>
          <Button
            onClick={handleSave}
            variant="primary"
            className="flex items-center gap-2"
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Збереження...' : 'Зберегти'}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <Card className="border-none shadow-premium overflow-hidden">
        <CardContent className="p-0">
          {/* Title Input */}
          <div className="border-b p-4">
            <Input
              type="text"
              placeholder="Назва документа"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-xl font-bold border-none focus:ring-0 px-0"
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 p-2 bg-gray-50 border-b">
            <ToolbarButton
              icon={<Heading className="h-4 w-4" />}
              title="Заголовок 1"
              onClick={handleHeading1}
            />
            <ToolbarButton
              icon={<span className="text-sm font-bold">H2</span>}
              title="Заголовок 2"
              onClick={handleHeading2}
            />
            <ToolbarButton
              icon={<span className="text-sm font-bold">H3</span>}
              title="Заголовок 3"
              onClick={handleHeading3}
            />
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <ToolbarButton
              icon={<Bold className="h-4 w-4" />}
              title="Жирний"
              onClick={handleBold}
            />
            <ToolbarButton
              icon={<Italic className="h-4 w-4" />}
              title="Курсив"
              onClick={handleItalic}
            />
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <ToolbarButton
              icon={<ListIcon className="h-4 w-4" />}
              title="Список"
              onClick={handleBulletList}
            />
            <ToolbarButton
              icon={<ListOrdered className="h-4 w-4" />}
              title="Нумерований"
              onClick={handleNumberedList}
            />
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <ToolbarButton
              icon={<LinkIcon className="h-4 w-4" />}
              title="Посилання"
              onClick={handleLink}
            />
            <ToolbarButton
              icon={<Image className="h-4 w-4" />}
              title="Зображення"
              onClick={handleImage}
            />
          </div>

          {/* Content Textarea */}
          <div className="p-4">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Введіть текст у форматі Markdown..."
              className="w-full h-[500px] font-mono text-sm p-4 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </CardContent>
      </Card>

      {/* Markdown Hints */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p className="font-semibold mb-2">Підказки Markdown:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-xs">
          <code># Заголовок</code>
          <code>**жирний**</code>
          <code>*курсив*</code>
          <code>- список</code>
        </div>
      </div>
    </div>
  );
};

export default DocumentEditor;
