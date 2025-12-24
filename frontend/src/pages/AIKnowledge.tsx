import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import { Link } from 'react-router-dom';

interface Item {
  _id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
}

const AIKnowledge: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await apiService.getAIKnowledge({ q, page, limit });
    if ((res as any).success && (res as any).data) {
      setItems((res as any).data as Item[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [q, page]);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Знання</h1>
        <Link to="/admin/ai-knowledge/create">
          <Button>Додати запис</Button>
        </Link>
      </div>
      <Card className="mb-4">
        <CardContent className="p-4 flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук..." />
          <Button onClick={() => { setPage(1); load(); }}>Пошук</Button>
        </CardContent>
      </Card>
      {loading ? (
        <div className="p-8 text-center">Завантаження...</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center">Немає записів</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {items.map(i => (
            <Card key={i._id}>
              <CardContent className="p-4">
                <div className="flex justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{i.title}</h3>
                    <p className="text-gray-600">{i.content.slice(0, 200)}...</p>
                  </div>
                  <Link to={`/admin/ai-knowledge/${i._id}`}>
                    <Button variant="outline">Відкрити</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AIKnowledge;
