import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface AIItem {
  _id: string;
  title: string;
  content: string;
  tags: string[];
  category?: string;
  updatedAt: string;
  createdBy?: { email: string; firstName?: string; lastName?: string };
}

const AIKnowledgeItem: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [item, setItem] = useState<AIItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getAIKnowledgeItem(id);
      if ((res as any).success && (res as any).data) {
        setItem((res as any).data as AIItem);
      } else {
        setError((res as any).message || 'Не вдалося завантажити запис');
      }
    } catch (e: any) {
      setError(e.message || 'Сталася помилка під час завантаження');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm('Ви впевнені, що хочете видалити цей запис?')) return;
    setDeleting(true);
    try {
      const res = await apiService.deleteAIKnowledge(id);
      if ((res as any).success) {
        navigate('/admin/ai-knowledge');
      } else {
        setError((res as any).message || 'Помилка видалення');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Помилка видалення');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">{error || 'Запис не знайдено'}</p>
            <Link to="/admin/ai-knowledge">
              <Button variant="outline">Назад до списку</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/admin/ai-knowledge">
          <Button variant="outline">Назад</Button>
        </Link>
        {isAdmin && (
          <div className="flex gap-2">
            <Link to={`/admin/ai-knowledge/${item._id}/edit`}>
              <Button variant="secondary">Редагувати</Button>
            </Link>
            <Button variant="danger" onClick={handleDelete} isLoading={deleting}>Видалити</Button>
          </div>
        )}
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <h1 className="text-2xl font-bold">{item.title}</h1>
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.tags.map((t, idx) => (
                <span key={idx} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="prose max-w-none">
            {item.content}
          </div>
          <div className="text-sm text-gray-500">
            Оновлено: {new Date(item.updatedAt).toLocaleDateString('uk-UA')}
            {item.createdBy?.email && (
              <> • Автор: {item.createdBy.email}</>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIKnowledgeItem;
