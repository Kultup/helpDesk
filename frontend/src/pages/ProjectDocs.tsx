import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import Card, { CardContent } from '../components/UI/Card';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import Button from '../components/UI/Button';
import {
  FileText,
  List,
  Edit2,
  Save,
  X,
  Eye,
  Bold,
  Italic,
  Heading,
  List as ListIcon,
  ListOrdered,
  Link,
  Image,
  Share2,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../utils';
import toast from 'react-hot-toast';

interface TocItem {
  title: string;
  id: string;
}

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

const ProjectDocs: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeId, setActiveId] = useState<string>('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [secureLink, setSecureLink] = useState<string>('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Load documentation
  useEffect(() => {
    fetch('/docs/TS.md')
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setOriginalContent(text);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load docs:', err);
        setContent('# Error\nFailed to load documentation.');
        setLoading(false);
      });
  }, []);

  // Generate TOC from markdown headers
  const toc: TocItem[] = content
    .split('\n')
    .filter(line => line.startsWith('## '))
    .map(line => {
      const title = line.replace('## ', '');
      const id = title.toLowerCase().replace(/[^\wа-яієґ-]+/g, '-');
      return { title, id };
    });

  // Save to backend - save to file on server
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/files/project-docs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, filename: 'TS.md' }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      setOriginalContent(content);
      setIsEditing(false);
      toast.success('ТЗ успішно збережено!');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Помилка при збереженні ТЗ');
    } finally {
      setSaving(false);
    }
  };

  // Cancel editing
  const handleCancel = () => {
    setContent(originalContent);
    setIsEditing(false);
  };

  // Handle textarea scroll sync (optional)
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  // Insert text at cursor position
  const insertText = (before: string, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText =
      content.substring(0, start) + before + selectedText + after + content.substring(end);

    setContent(newText);

    // Set cursor position after update
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  // Toolbar actions
  const handleBold = () => insertText('**', '**');
  const handleItalic = () => insertText('*', '*');
  const handleHeading1 = () => insertText('# ');
  const handleHeading2 = () => insertText('## ');
  const handleHeading3 = () => insertText('### ');
  const handleBulletList = () => insertText('- ');
  const handleNumberedList = () => insertText('1. ');
  const handleLink = () => insertText('[', '](url)');
  const handleImage = () => insertText('![', '](url)');

  // Generate secure link
  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const response = await fetch('/api/files/project-docs/secure-link', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        const fullUrl = `${window.location.origin}/docs/secure/${data.token}`;
        setSecureLink(fullUrl);
        setShowShareModal(true);
        toast.success('Посилання створено!');
      } else {
        toast.error('Не вдалося створити посилання');
      }
    } catch (error) {
      console.error('Error generating link:', error);
      toast.error('Помилка при створенні посилання');
    } finally {
      setGeneratingLink(false);
    }
  };

  // Copy link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(secureLink);
    setLinkCopied(true);
    toast.success('Посилання скопійовано!');
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Sidebar TOC - Desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-24 self-start">
        <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-primary-600 font-semibold">
            <List className="h-4 w-4" />
            <span>Зміст</span>
          </div>
          <nav className="space-y-1">
            {toc.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActiveId(item.id)}
                className={cn(
                  'block px-3 py-2 text-sm rounded-lg transition-colors border-l-2',
                  activeId === item.id
                    ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium'
                    : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {item.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Header with Edit Button */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Проєктне ТЗ</h1>
              <p className="text-sm text-gray-500">Технічна документація системи Help Desk</p>
            </div>
          </div>

          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button
                  onClick={handleGenerateLink}
                  className="flex items-center gap-2"
                  variant="secondary"
                  disabled={generatingLink}
                >
                  <Share2 className="h-4 w-4" />
                  Поділитися
                </Button>
                <Button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2"
                  variant="primary"
                >
                  <Edit2 className="h-4 w-4" />
                  Редагувати
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleCancel}
                  className="flex items-center gap-2"
                  variant="secondary"
                  disabled={saving}
                >
                  <X className="h-4 w-4" />
                  Скасувати
                </Button>
                <Button
                  onClick={handleSave}
                  className="flex items-center gap-2"
                  variant="primary"
                  disabled={saving}
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Збереження...' : 'Зберегти'}
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="border-none shadow-premium overflow-hidden bg-white">
          <CardContent className="p-8 lg:p-12 max-w-none">
            {isEditing ? (
              <div className="flex flex-col gap-4">
                {/* Toolbar */}
                <div className="flex items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded-lg">
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
                    title="Маркований список"
                    onClick={handleBulletList}
                  />
                  <ToolbarButton
                    icon={<ListOrdered className="h-4 w-4" />}
                    title="Нумерований список"
                    onClick={handleNumberedList}
                  />
                  <div className="w-px h-6 bg-gray-300 mx-1" />
                  <ToolbarButton
                    icon={<Link className="h-4 w-4" />}
                    title="Посилання"
                    onClick={handleLink}
                  />
                  <ToolbarButton
                    icon={<Image className="h-4 w-4" />}
                    title="Зображення"
                    onClick={handleImage}
                  />
                </div>

                <div className="flex items-center justify-between pb-4 border-b">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Eye className="h-4 w-4" />
                    <span>Режим редагування Markdown</span>
                  </div>
                  <span className="text-xs text-gray-500">{content.length} символів</span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={handleTextareaChange}
                  className="w-full h-[600px] font-mono text-sm p-4 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Введіть текст у форматі Markdown..."
                />
              </div>
            ) : (
              <ReactMarkdown
                rehypePlugins={[rehypeRaw]}
                components={{
                  h2: ({ children, ...props }) => {
                    const id = children
                      ?.toString()
                      .toLowerCase()
                      .replace(/[^\wа-яієґ-]+/g, '-');
                    return (
                      <h2
                        id={id}
                        {...props}
                        className="text-2xl font-bold text-gray-900 mt-10 mb-4 pb-2 border-b border-gray-100"
                      >
                        {children}
                      </h2>
                    );
                  },
                  h3: ({ children, ...props }) => (
                    <h3 {...props} className="text-xl font-semibold text-gray-800 mt-8 mb-3">
                      {children}
                    </h3>
                  ),
                  p: ({ ...props }) => (
                    <p className="text-gray-600 leading-relaxed mb-4" {...props} />
                  ),
                  ul: ({ ...props }) => (
                    <ul className="list-disc pl-6 space-y-2 mb-6 text-gray-600" {...props} />
                  ),
                  li: ({ ...props }) => <li className="pl-1" {...props} />,
                  strong: ({ ...props }) => (
                    <strong className="font-bold text-gray-900" {...props} />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Share2 className="h-5 w-5 text-primary-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Поділитися ТЗ</h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">
                Посилання дійсне протягом 7 днів. Будь-хто з цим посиланням зможе переглянути ТЗ без
                авторизації.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={secureLink}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 font-mono"
                />
                <Button
                  onClick={handleCopyLink}
                  variant="primary"
                  className="flex items-center gap-2"
                >
                  {linkCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Скопійовано
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Копія
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Eye className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Безпечний перегляд</p>
                <p>
                  Посилання містить унікальний токен і автоматично deaktivується через 7 днів або
                  після видалення.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setShowShareModal(false)} variant="secondary">
                Закрити
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDocs;
