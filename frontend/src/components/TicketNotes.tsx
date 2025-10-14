import React, { useState, useEffect } from 'react';
import { FileText, Plus, Edit2, Trash2, Save, X, Eye, EyeOff } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import Card from './UI/Card';
import Button from './UI/Button';
import { formatDate } from '../utils';

interface TicketNote {
  _id: string;
  content: string;
  isPrivate: boolean;
  createdBy: {
    _id: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface TicketNotesProps {
  ticketId: string;
  notes?: TicketNote[];
  onNotesUpdate?: () => void;
  canEdit?: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
}

const TicketNotes: React.FC<TicketNotesProps> = ({ 
  ticketId, 
  notes: externalNotes, 
  onNotesUpdate, 
  canEdit = true, 
  currentUserId, 
  isAdmin = false 
}) => {
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteIsPrivate, setNewNoteIsPrivate] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editIsPrivate, setEditIsPrivate] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    if (externalNotes) {
      setNotes(externalNotes);
    } else {
      loadNotes();
    }
  }, [ticketId, externalNotes]);

  // Завантаження нотаток
  const loadNotes = async () => {
    try {
      setLoading(true);
      const data = await apiService.getTicketNotes(ticketId);
      setNotes(data);
    } catch (error) {
      console.error('Помилка завантаження нотаток:', error);
    } finally {
      setLoading(false);
    }
  };

  // Створення нової нотатки
  const createNote = async () => {
    if (!newNoteContent.trim()) return;

    try {
      setLoading(true);
      const newNote = await apiService.createTicketNote(ticketId, {
        content: newNoteContent.trim(),
        isPrivate: newNoteIsPrivate
      });
      
      setNotes(prev => [newNote, ...prev]);
      setNewNoteContent('');
      setNewNoteIsPrivate(false);
      setShowAddForm(false);
      onNotesUpdate?.();
    } catch (error) {
      console.error('Помилка створення нотатки:', error);
    } finally {
      setLoading(false);
    }
  };

  // Початок редагування нотатки
  const startEditing = (note: TicketNote) => {
    setEditingNoteId(note._id);
    setEditContent(note.content);
    setEditIsPrivate(note.isPrivate);
  };

  // Скасування редагування
  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditContent('');
    setEditIsPrivate(false);
  };

  // Збереження змін нотатки
  const saveNote = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      setLoading(true);
      const updatedNote = await apiService.updateTicketNote(ticketId, noteId, {
        content: editContent.trim(),
        isPrivate: editIsPrivate
      });
      
      setNotes(prev => prev.map(note => 
        note._id === noteId ? updatedNote : note
      ));
      cancelEditing();
      onNotesUpdate?.();
    } catch (error) {
      console.error('Помилка оновлення нотатки:', error);
    } finally {
      setLoading(false);
    }
  };

  // Видалення нотатки
  const deleteNote = async (noteId: string) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цю нотатку?')) return;

    try {
      setLoading(true);
      await apiService.deleteTicketNote(ticketId, noteId);
      setNotes(prev => prev.filter(note => note._id !== noteId));
      onNotesUpdate?.();
    } catch (error) {
      console.error('Помилка видалення нотатки:', error);
    } finally {
      setLoading(false);
    }
  };

  // Перевірка чи може користувач редагувати нотатку
  const canEditNote = (note: TicketNote) => {
    if (!canEdit) return false;
    return isAdmin || note.createdBy._id === (currentUserId || user?._id);
  };

  // Фільтрація нотаток (приховати приватні для не-адмінів)
  const getVisibleNotes = () => {
    return notes.filter(note => {
      if (!note.isPrivate) return true;
      return isAdmin || note.createdBy._id === (currentUserId || user?._id);
    });
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Нотатки</h3>
          <span className="text-sm text-gray-500">({getVisibleNotes().length})</span>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Додати нотатку
          </Button>
        )}
      </div>

      {/* Форма додавання нової нотатки */}
      {showAddForm && (
        <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Введіть текст нотатки..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={4}
          />
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newNoteIsPrivate}
                onChange={(e) => setNewNoteIsPrivate(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <EyeOff className="w-4 h-4" />
                Приватна нотатка (тільки для адміністраторів)
              </span>
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                Скасувати
              </Button>
              <Button
                size="sm"
                onClick={createNote}
                disabled={!newNoteContent.trim() || loading}
              >
                Зберегти
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Список нотаток */}
      <div className="space-y-4">
        {loading && notes.length === 0 ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : getVisibleNotes().length > 0 ? (
          getVisibleNotes().map((note) => (
            <div
              key={note._id}
              className={`p-4 border rounded-lg ${
                note.isPrivate ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'
              }`}
            >
              {editingNoteId === note._id ? (
                // Режим редагування
                <div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={4}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editIsPrivate}
                        onChange={(e) => setEditIsPrivate(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        <EyeOff className="w-4 h-4" />
                        Приватна нотатка
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelEditing}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveNote(note._id)}
                        disabled={!editContent.trim() || loading}
                      >
                        <Save className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                // Режим перегляду
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {note.createdBy.email}
                      </span>
                      {note.isPrivate && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                          <EyeOff className="w-3 h-3" />
                          Приватна
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {formatDate(note.createdAt)}
                        {note.updatedAt !== note.createdAt && ' (редаговано)'}
                      </span>
                      {canEditNote(note) && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEditing(note)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteNote(note._id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-700 whitespace-pre-wrap">
                    {note.content}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>Нотатки відсутні</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TicketNotes;