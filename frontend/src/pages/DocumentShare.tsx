import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Share2, Copy, Check, X, Link, Clock } from 'lucide-react';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

interface Document {
  _id: string;
  title: string;
  slug: string;
}

const DocumentShare: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [shareToken, setShareToken] = useState<string>('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  useEffect(() => {
    fetchDocument();
  }, [slug]);

  const fetchDocument = async () => {
    try {
      const response = await fetch(`/api/documents/${slug}`);
      const data = await response.json();

      if (data.success) {
        setDocument(data.data);
      } else {
        toast.error('Документ не знайдено');
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

  const handleGenerateLink = async () => {
    setGenerating(true);
    try {
      const response = await fetch(`/api/documents/${slug}/share`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        const fullUrl = `${window.location.origin}/docs/secure/${data.token}`;
        setShareToken(fullUrl);
        setExpiresAt(new Date(data.expiresAt));
        toast.success('Посилання створено!');
      } else {
        toast.error('Не вдалося створити посилання');
      }
    } catch (error) {
      console.error('Error generating link:', error);
      toast.error('Помилка при створенні посилання');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareToken);
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
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <Share2 className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Поділитися документом</h1>
            <p className="text-sm text-gray-500">{document?.title}</p>
          </div>
        </div>
        <Button onClick={() => navigate(`/documents/${slug}/edit`)} variant="secondary">
          <X className="h-4 w-4" />
          Закрити
        </Button>
      </div>

      {/* Generate Link Card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <div className="h-16 w-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Link className="h-8 w-8 text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Безпечне посилання для перегляду
            </h3>
            <p className="text-gray-600">
              Створіть унікальне посилання для перегляду цього документа без авторизації
            </p>
          </div>

          {!shareToken ? (
            <Button
              onClick={handleGenerateLink}
              variant="primary"
              className="w-full"
              disabled={generating}
            >
              {generating ? 'Створення...' : 'Створити посилання'}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareToken}
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

              {expiresAt && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>
                    Действительне до{' '}
                    {expiresAt.toLocaleDateString('uk-UA', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Share2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Як це працює:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Будь-хто з цим посиланням зможе переглянути документ</li>
                      <li>Авторизація не потрібна</li>
                      <li>Посилання дійсне 7 днів</li>
                      <li>Можна створити нове посилання в будь-який час</li>
                    </ul>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleGenerateLink}
                variant="secondary"
                className="w-full"
                disabled={generating}
              >
                Створити нове посилання (старе буде видалено)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentShare;
