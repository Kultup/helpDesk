import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  Share2,
  ExternalLink,
  Search,
  AlertCircle,
} from 'lucide-react';
import Card, { CardContent } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { cn } from '../utils';

interface Document {
  _id: string;
  title: string;
  slug: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

const Documents: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/documents');
      const data = await response.json();

      if (data.success) {
        setDocuments(data.data);
      } else {
        toast.error('Не вдалося завантажити документи');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Помилка при завантаженні документів');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!docToDelete) return;

    try {
      const response = await fetch(`/api/documents/${docToDelete}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        toast.success('Документ видалено');
        fetchDocuments();
      } else {
        toast.error('Не вдалося видалити документ');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Помилка при видаленні');
    } finally {
      setShowDeleteModal(false);
      setDocToDelete(null);
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <FileText className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Документи</h1>
            <p className="text-sm text-gray-500">Управління технічною документацією</p>
          </div>
        </div>
        <Button
          onClick={() => navigate('/documents/new')}
          className="flex items-center gap-2"
          variant="primary"
        >
          <Plus className="h-4 w-4" />
          Створити документ
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Пошук документів..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Documents List */}
      {filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm ? 'Нічого не знайдено' : 'Ще немає документів'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm
                ? 'Спробуйте змінити пошуковий запит'
                : 'Створіть перший документ, щоб почати'}
            </p>
            {!searchTerm && (
              <Button
                onClick={() => navigate('/documents/new')}
                className="flex items-center gap-2 mx-auto"
                variant="primary"
              >
                <Plus className="h-4 w-4" />
                Створити документ
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredDocuments.map(doc => (
            <Card key={doc._id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="h-10 w-10 bg-primary-50 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{doc.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{new Date(doc.createdAt).toLocaleDateString('uk-UA')}</span>
                        {doc.isPublic && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            Публічний
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => navigate(`/documents/${doc.slug}`)}
                      variant="ghost"
                      size="sm"
                      title="Переглянути"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => navigate(`/documents/${doc.slug}/edit`)}
                      variant="ghost"
                      size="sm"
                      title="Редагувати"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => navigate(`/documents/${doc.slug}/share`)}
                      variant="ghost"
                      size="sm"
                      title="Поділитися"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => {
                        setDocToDelete(doc.slug);
                        setShowDeleteModal(true);
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Видалити"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Видалити документ?</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Ця дія не може бути скасована. Документ буде видалено назавжди.
            </p>
            <div className="flex gap-3 justify-end">
              <Button onClick={() => setShowDeleteModal(false)} variant="secondary">
                Скасувати
              </Button>
              <Button onClick={handleDelete} variant="danger">
                Видалити
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
