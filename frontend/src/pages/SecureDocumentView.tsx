import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { useParams, Link } from 'react-router-dom';
import { FileText, Lock, AlertCircle, ExternalLink } from 'lucide-react';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import Card, { CardContent } from '../components/UI/Card';
import { cn } from '../utils';

const SecureDocumentView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setError('Токен не надано');
      setLoading(false);
      return;
    }

    const fetchDocument = async () => {
      try {
        const response = await fetch(`/api/documents/share/${token}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.message || 'Документ не знайдено або термін дії посилання минув');
          return;
        }

        setContent(data.data.content);
        setTitle(data.data.title || 'Документ');
      } catch (err) {
        setError('Помилка завантаження документа');
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [token]);

  // Generate TOC from markdown headers
  const toc = content
    .split('\n')
    .filter(line => line.startsWith('## '))
    .map(line => {
      const title = line.replace('## ', '');
      const id = title.toLowerCase().replace(/[^\wа-яієґ-]+/g, '-');
      return { title, id };
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Завантаження документа...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-l-4 border-l-red-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Помилка доступу</h2>
            </div>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
            >
              <ExternalLink className="h-4 w-4" />
              Перейти до системи
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">{title}</h1>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Lock className="h-3 w-3" />
                  <span>Безпечний перегляд</span>
                </div>
              </div>
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Увійти
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm sticky top-24">
              <div className="flex items-center gap-2 mb-4 text-primary-600 font-semibold">
                <FileText className="h-4 w-4" />
                <span>Зміст</span>
              </div>
              <nav className="space-y-1">
                {toc.map(item => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
                  >
                    {item.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Document Content */}
          <main className="flex-1 min-w-0">
            <Card className="border-none shadow-premium overflow-hidden bg-white">
              <CardContent className="p-8 lg:p-12 max-w-none">
                <div className="prose prose-slate prose-headings:font-bold prose-h2:border-b prose-h2:pb-2 prose-h2:mt-12 prose-h2:text-2xl prose-h2:font-bold prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3 prose-p:text-gray-600 prose-p:leading-relaxed prose-p:mb-4 prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-2 prose-ul:mb-6 prose-li:pl-1 prose-strong:font-bold prose-a:text-primary-600 hover:prose-a:text-primary-700 max-w-none">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>

            {/* Footer Notice */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Безпечний перегляд</p>
                  <p>
                    Це посилання дійсне протягом 7 днів. Після цього терміну доступ буде автоматично
                    заблоковано.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default SecureDocumentView;
