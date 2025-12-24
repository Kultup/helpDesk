import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiService } from '../services/api';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';

const EditAIKnowledge: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getAIKnowledgeItem(id);
      if ((res as any).success && (res as any).data) {
        const item = (res as any).data as any;
        setTitle(item.title || '');
        setContent(item.content || '');
        setTags((item.tags && Array.isArray(item.tags)) ? item.tags.join(',') : (item.tags || ''));
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      formData.append('tags', tags);
      if (files && files.length > 0) {
        Array.from(files).forEach(f => formData.append('files', f));
      }
      const res = await apiService.updateAIKnowledgeWithFiles(id, formData);
      if ((res as any).success) {
        navigate(`/admin/ai-knowledge/${id}`);
      } else {
        setError((res as any).message || 'Не вдалося зберегти зміни');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Сталася помилка під час збереження');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !title) {
    return <div className="p-8 text-center">Завантаження...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Редагувати запис AI знань</h1>
      <Card>
        <CardContent className="p-4">
          <form onSubmit={submit} className="space-y-4">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Контент" className="w-full h-40 border rounded p-2" />
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Теги, через кому" />
            <input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="block w-full" />
            <div className="flex gap-2">
              <Button type="submit" isLoading={loading}>Зберегти</Button>
              <Button type="button" variant="outline" onClick={() => navigate(`/admin/ai-knowledge/${id}`)}>Скасувати</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditAIKnowledge;
