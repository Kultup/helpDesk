import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import Card, { CardContent } from '../components/UI/Card';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import Button from '../components/UI/Button';
import { FileText, List, Edit2, Save, X, Eye } from 'lucide-react';
import { cn } from '../utils';
import toast from 'react-hot-toast';

interface TocItem {
  title: string;
  id: string;
}

const ProjectDocs: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeId, setActiveId] = useState<string>('');

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

  // Save to backend
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/project-docs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
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
              <Button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2"
                variant="primary"
              >
                <Edit2 className="h-4 w-4" />
                Редагувати
              </Button>
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
                <div className="flex items-center justify-between pb-4 border-b">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Eye className="h-4 w-4" />
                    <span>Режим редагування Markdown</span>
                  </div>
                  <span className="text-xs text-gray-500">{content.length} символів</span>
                </div>
                <textarea
                  value={content}
                  onChange={handleTextareaChange}
                  className="w-full h-[600px] font-mono text-sm p-4 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Введіть текст у форматі Markdown..."
                />
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-700 mb-2">Підказки Markdown:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-600">
                    <code># Заголовок 1</code>
                    <code>## Заголовок 2</code>
                    <code>### Заголовок 3</code>
                    <code>**жирний**</code>
                    <code>*курсив*</code>
                    <code>- список</code>
                    <code>1. нумерований</code>
                    <code>[посилання](url)</code>
                    <code>![зображення](url)</code>
                  </div>
                </div>
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
    </div>
  );
};

export default ProjectDocs;
