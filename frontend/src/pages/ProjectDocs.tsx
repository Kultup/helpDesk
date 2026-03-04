import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import Card, { CardContent } from '../components/UI/Card';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { FileText, List } from 'lucide-react';
import { cn } from '../utils';

const ProjectDocs: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    fetch('/docs/TS.md')
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load docs:', err);
        setContent('# Error\nFailed to load documentation.');
        setLoading(false);
      });
  }, []);

  // Simple TOC generator from markdown headers
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
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <FileText className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Проєктне ТЗ</h1>
            <p className="text-sm text-gray-500">Технічна документація системи Help Desk</p>
          </div>
        </div>

        <Card className="border-none shadow-premium overflow-hidden bg-white">
          <CardContent className="p-8 lg:p-12 prose prose-slate prose-headings:font-bold prose-h2:border-b prose-h2:pb-2 prose-h2:mt-12 prose-a:text-primary-600 hover:prose-a:text-primary-700 max-w-none">
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
                strong: ({ ...props }) => <strong className="font-bold text-gray-900" {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ProjectDocs;
