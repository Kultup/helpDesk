import React, { useState } from 'react';
import { apiService } from '../services/api';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import { useNavigate } from 'react-router-dom';

const CreateAIKnowledge: React.FC = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    formData.append('tags', tags);
    if (files && files.length > 0) {
      Array.from(files).forEach(f => formData.append('files', f));
    }
    const res = await apiService.createAIKnowledgeWithFiles(formData);
    if ((res as any).success) {
      navigate('/admin/ai-knowledge');
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Новий запис AI знань</h1>
      <Card>
        <CardContent className="p-4">
          <form onSubmit={submit} className="space-y-4">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Контент" className="w-full h-40 border rounded p-2" />
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Теги, через кому" />
            <input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="block w-full" />
            <Button type="submit">Зберегти</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateAIKnowledge;
