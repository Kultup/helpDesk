import React, { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, PencilIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { AdminNote, CreateNoteForm, UpdateNoteForm, NotePriority } from '../types';
import { apiService } from '../services/api';

const AdminNotes: React.FC = () => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [newNote, setNewNote] = useState<CreateNoteForm>({
    title: '',
    content: '',
    priority: NotePriority.MEDIUM
  });

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getAdminNotes();
      if (response.success && response.data) {
        setNotes(response.data);
      } else {
        setError('Помилка завантаження нотаток');
      }
    } catch (error) {
      console.error('Помилка завантаження нотаток:', error);
      setError('Помилка завантаження нотаток');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.title.trim() || !newNote.content.trim()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiService.createAdminNote({
        title: newNote.title.trim(),
        content: newNote.content.trim(),
        priority: newNote.priority
      });
      
      if (response.success && response.data) {
        setNotes([response.data, ...notes]);
        setNewNote({ title: '', content: '', priority: NotePriority.MEDIUM });
        setIsAddingNote(false);
      } else {
        setError('Помилка створення нотатки');
      }
    } catch (error) {
      console.error('Помилка створення нотатки:', error);
      setError('Помилка створення нотатки');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNote = async (id: string, updates: UpdateNoteForm) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.updateAdminNote(id, updates);
      
      if (response.success && response.data) {
        const updatedNote = response.data;
        setNotes(notes.map(note => 
          note._id === id ? updatedNote : note
        ));
        setEditingNote(null);
      } else {
        setError('Помилка оновлення нотатки');
      }
    } catch (error) {
      console.error('Помилка оновлення нотатки:', error);
      setError('Помилка оновлення нотатки');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цю нотатку?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiService.deleteAdminNote(id);
      
      if (response.success) {
        setNotes(notes.filter(note => note._id !== id));
      } else {
        setError(t('adminNotes.errors.deleteError'));
      }
    } catch (error) {
      console.error('Помилка видалення нотатки:', error);
      setError(t('adminNotes.errors.deleteError'));
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: NotePriority) => {
    switch (priority) {
      case NotePriority.URGENT:
        return 'bg-red-100 text-red-800 border-red-200';
      case NotePriority.HIGH:
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case NotePriority.MEDIUM:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case NotePriority.LOW:
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityLabel = (priority: NotePriority) => {
    switch (priority) {
      case NotePriority.URGENT:
        return t('adminNotes.priorities.urgent');
      case NotePriority.HIGH:
        return t('adminNotes.priorities.high');
      case NotePriority.MEDIUM:
        return t('adminNotes.priorities.medium');
      case NotePriority.LOW:
        return t('adminNotes.priorities.low');
      default:
        return t('adminNotes.priorities.medium');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('adminNotes.title')}</h3>
        <button
          onClick={() => setIsAddingNote(true)}
          disabled={loading}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          {t('adminNotes.addNote')}
        </button>
      </div>

      {/* Повідомлення про помилку */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Форма додавання нової нотатки */}
      {isAddingNote && (
        <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="space-y-3">
            <div>
              <input
                type="text"
                placeholder={t('adminNotes.titlePlaceholder')}
                value={newNote.title}
                onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-surface text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <textarea
                placeholder={t('adminNotes.contentPlaceholder')}
                value={newNote.content}
                onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-md bg-surface text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <select
                value={newNote.priority}
                onChange={(e) => setNewNote({ ...newNote, priority: e.target.value as NotePriority })}
                className="px-3 py-2 border border-border rounded-md bg-surface text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value={NotePriority.LOW}>{t('adminNotes.priorityOptions.low')}</option>
                <option value={NotePriority.MEDIUM}>{t('adminNotes.priorityOptions.medium')}</option>
                <option value={NotePriority.HIGH}>{t('adminNotes.priorityOptions.high')}</option>
                <option value={NotePriority.URGENT}>{t('adminNotes.priorityOptions.urgent')}</option>
              </select>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleAddNote}
                disabled={loading || !newNote.title.trim() || !newNote.content.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('common.saving') : t('common.save')}
              </button>
              <button
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNote({ title: '', content: '', priority: NotePriority.MEDIUM });
                }}
                disabled={loading}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Список нотаток */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {loading && notes.length === 0 ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{t('adminNotes.noNotes')}</p>
            <p className="text-sm">{t('adminNotes.noNotesDescription')}</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              {editingNote === note._id ? (
                <EditNoteForm
                  note={note}
                  onSave={(updates) => handleUpdateNote(note._id, updates)}
                  onCancel={() => setEditingNote(null)}
                  loading={loading}
                />
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{note.title}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(note.priority)}`}>
                          {getPriorityLabel(note.priority)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(note.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-1 ml-2">
                      <button
                        onClick={() => setEditingNote(note._id)}
                        disabled={loading}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('adminNotes.actions.edit')}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note._id)}
                        disabled={loading}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('adminNotes.actions.delete')}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">{note.content}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Компонент для редагування нотатки
interface EditNoteFormProps {
  note: AdminNote;
  onSave: (updates: UpdateNoteForm) => void;
  onCancel: () => void;
  loading?: boolean;
}

const EditNoteForm: React.FC<EditNoteFormProps> = ({ note, onSave, onCancel, loading = false }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [priority, setPriority] = useState(note.priority);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && content.trim()) {
      onSave({ title: title.trim(), content: content.trim(), priority });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={loading}
        className="w-full px-3 py-2 border border-border rounded-md bg-surface text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder={t('adminNotes.titlePlaceholder')}
        required
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        disabled={loading}
        className="w-full px-3 py-2 border border-border rounded-md bg-surface text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder={t('adminNotes.contentPlaceholder')}
        required
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as NotePriority)}
        disabled={loading}
        className="w-full px-3 py-2 border border-border rounded-md bg-surface text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value={NotePriority.LOW}>{t('adminNotes.priorities.low')}</option>
                <option value={NotePriority.MEDIUM}>{t('adminNotes.priorities.medium')}</option>
                <option value={NotePriority.HIGH}>{t('adminNotes.priorities.high')}</option>
                <option value={NotePriority.URGENT}>{t('adminNotes.priorities.urgent')}</option>
      </select>
      <div className="flex space-x-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
};

export default AdminNotes;