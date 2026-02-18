import React, { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { AdminNote, CreateNoteForm, NotePriority, NoteStatus } from '../types';
import { apiService } from '../services/api';

interface KanbanColumnProps {
  title: string;
  status: NoteStatus;
  notes: AdminNote[];
  onAdd: (status: NoteStatus) => void;
  onEdit: (note: AdminNote) => void;
  onDelete: (id: string) => void;
  onMove: (note: AdminNote, newStatus: NoteStatus) => void;
  onView: (note: AdminNote) => void;
  loading: boolean;
  getPriorityColor: (priority: NotePriority) => string;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  title,
  status,
  notes,
  onAdd,
  onEdit,
  onDelete,
  onMove,
  onView,
  loading,
  getPriorityColor,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full bg-gray-50/50 rounded-xl border border-gray-200/60 min-w-[280px]">
      {/* Header */}
      <div
        className={`p-3 border-b border-gray-100 flex justify-between items-center rounded-t-xl ${
          status === NoteStatus.TODO
            ? 'bg-blue-50/50'
            : status === NoteStatus.IN_PROGRESS
              ? 'bg-amber-50/50'
              : 'bg-emerald-50/50'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status === NoteStatus.TODO
                ? 'bg-blue-500'
                : status === NoteStatus.IN_PROGRESS
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            }`}
          />
          <h4 className="font-bold text-gray-700 text-sm">{title}</h4>
          <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-0.5 rounded-md border border-gray-100">
            {notes.length}
          </span>
        </div>
        <button
          onClick={() => onAdd(status)}
          disabled={loading}
          className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-white/50 transition-all"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Cards container */}
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[400px] scrollbar-thin scrollbar-thumb-gray-200">
        {notes.map(note => (
          <div
            key={note._id}
            className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all group relative cursor-pointer"
            onClick={() => onView(note)}
          >
            {/* Action buttons (hover) */}
            <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-md shadow-sm border border-gray-100">
              <button
                onClick={e => {
                  e.stopPropagation();
                  onView(note);
                }}
                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-l-md"
                title={t('miniKanban.view')}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onEdit(note);
                }}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
              >
                <PencilIcon className="w-3 h-3" />
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDelete(note._id);
                }}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-r-md border-l border-gray-100"
              >
                <TrashIcon className="w-3 h-3" />
              </button>
            </div>

            <h5 className="font-semibold text-gray-800 text-sm mb-1 pr-12 line-clamp-2">
              {note.title}
            </h5>
            <p className="text-gray-500 text-xs line-clamp-3 mb-2 whitespace-pre-wrap">
              {note.content}
            </p>

            <div className="flex justify-between items-center mt-2">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium border ${getPriorityColor(note.priority)}`}
              >
                {t(`miniKanban.priorities.${note.priority}`)}
              </span>

              {/* Simple Move controls */}
              <div className="flex gap-1">
                {status !== NoteStatus.TODO && (
                  <button
                    onClick={() =>
                      onMove(
                        note,
                        status === NoteStatus.DONE ? NoteStatus.IN_PROGRESS : NoteStatus.TODO
                      )
                    }
                    className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-100"
                    title={t('miniKanban.moveBack')}
                  >
                    ←
                  </button>
                )}
                {status !== NoteStatus.DONE && (
                  <button
                    onClick={() =>
                      onMove(
                        note,
                        status === NoteStatus.TODO ? NoteStatus.IN_PROGRESS : NoteStatus.DONE
                      )
                    }
                    className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-100"
                    title={t('miniKanban.moveForward')}
                  >
                    →
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {notes.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-lg">
            <p className="text-xs text-gray-400">{t('miniKanban.empty')}</p>
            <button
              onClick={() => onAdd(status)}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium mt-1"
            >
              + {t('miniKanban.addCard')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const MiniKanban: React.FC = () => {
  const { t } = useTranslation();

  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [viewingNote, setViewingNote] = useState<AdminNote | null>(null);

  const [formData, setFormData] = useState<CreateNoteForm>({
    title: '',
    content: '',
    priority: NotePriority.MEDIUM,
    status: NoteStatus.TODO,
  });

  const getPriorityColor = (priority: NotePriority): string => {
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

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await apiService.getAdminNotes();
      if (response.success && response.data) {
        setNotes(
          response.data.map((n: any) => ({
            ...n,
            status: n.status || NoteStatus.TODO, // Default if missing
          }))
        );
      }
    } catch (err) {
      console.error(err);
      setError(t('miniKanban.errors.load'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClick = (status: NoteStatus): void => {
    setFormData({
      title: '',
      content: '',
      priority: NotePriority.MEDIUM,
      status: status,
    });
    setEditingNoteId(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (note: AdminNote): void => {
    setFormData({
      title: note.title,
      content: note.content,
      priority: note.priority,
      status: note.status || NoteStatus.TODO,
    });
    setEditingNoteId(note._id);
    setIsModalOpen(true);
  };

  const handleViewClick = (note: AdminNote): void => {
    setViewingNote(note);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    try {
      setLoading(true);
      if (editingNoteId) {
        // Update
        const response = await apiService.updateAdminNote(editingNoteId, formData);
        if (response.success && response.data) {
          const updatedNote = response.data;
          setNotes(prev =>
            prev.map(n =>
              n._id === editingNoteId ? { ...updatedNote, status: formData.status! } : n
            )
          );
        }
      } else {
        // Create
        const response = await apiService.createAdminNote(formData);
        if (response.success && response.data) {
          const newNote = response.data;
          setNotes(prev => [newNote, ...prev]);
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setError(t('miniKanban.errors.save'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await apiService.deleteAdminNote(id);
      setNotes(prev => prev.filter(n => n._id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMove = async (note: AdminNote, newStatus: NoteStatus): Promise<void> => {
    // Optimistic update
    setNotes(prev => prev.map(n => (n._id === note._id ? { ...n, status: newStatus } : n)));

    try {
      await apiService.updateAdminNote(note._id, { status: newStatus });
    } catch (err) {
      console.error(err);
      // Revert if failed
      loadNotes();
    }
  };

  const todoNotes = notes.filter(n => n.status === NoteStatus.TODO);
  const inProgressNotes = notes.filter(n => n.status === NoteStatus.IN_PROGRESS);
  const doneNotes = notes.filter(n => n.status === NoteStatus.DONE);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-border p-6 h-full flex flex-col">
      {/* Error display to use the variable */}
      {error && <div className="text-red-500 text-xs mb-2">{error}</div>}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
              {/* Icon placeholder */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <path d="M9 3v18" />
                <path d="M15 3v18" />
              </svg>
            </span>
            {t('miniKanban.title')}
          </h3>
          <p className="text-sm text-gray-500 ml-9">{t('miniKanban.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-h-[400px]">
        <KanbanColumn
          title={t('miniKanban.todo')}
          status={NoteStatus.TODO}
          notes={todoNotes}
          onAdd={handleCreateClick}
          onEdit={handleEditClick}
          onDelete={handleDelete}
          onMove={handleMove}
          onView={handleViewClick}
          loading={loading}
          getPriorityColor={getPriorityColor}
        />
        <KanbanColumn
          title={t('miniKanban.inProgress')}
          status={NoteStatus.IN_PROGRESS}
          notes={inProgressNotes}
          onAdd={handleCreateClick}
          onEdit={handleEditClick}
          onDelete={handleDelete}
          onMove={handleMove}
          onView={handleViewClick}
          loading={loading}
          getPriorityColor={getPriorityColor}
        />
        <KanbanColumn
          title={t('miniKanban.done')}
          status={NoteStatus.DONE}
          notes={doneNotes}
          onAdd={handleCreateClick}
          onEdit={handleEditClick}
          onDelete={handleDelete}
          onMove={handleMove}
          onView={handleViewClick}
          loading={loading}
          getPriorityColor={getPriorityColor}
        />
      </div>

      {/* Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-xl">
              <h3 className="font-bold text-gray-900">
                {editingNoteId ? t('miniKanban.editTask') : t('miniKanban.newTask')}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label
                  htmlFor="task-title"
                  className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1"
                >
                  {t('miniKanban.titleLabel')}
                </label>
                <input
                  id="task-title"
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder={t('miniKanban.titlePlaceholder')}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="task-details"
                  className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1"
                >
                  {t('miniKanban.detailsLabel')}
                </label>
                <textarea
                  id="task-details"
                  value={formData.content}
                  onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px] resize-none"
                  placeholder={t('miniKanban.detailsPlaceholder')}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="task-priority"
                    className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1"
                  >
                    {t('miniKanban.priorityLabel')}
                  </label>
                  <select
                    id="task-priority"
                    value={formData.priority}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, priority: e.target.value as NotePriority }))
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={NotePriority.LOW}>{t('miniKanban.priorities.low')}</option>
                    <option value={NotePriority.MEDIUM}>{t('miniKanban.priorities.medium')}</option>
                    <option value={NotePriority.HIGH}>{t('miniKanban.priorities.high')}</option>
                    <option value={NotePriority.URGENT}>{t('miniKanban.priorities.urgent')}</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="task-status"
                    className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1"
                  >
                    {t('miniKanban.statusLabel')}
                  </label>
                  <select
                    id="task-status"
                    value={formData.status}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, status: e.target.value as NoteStatus }))
                    }
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={NoteStatus.TODO}>{t('miniKanban.statuses.todo')}</option>
                    <option value={NoteStatus.IN_PROGRESS}>
                      {t('miniKanban.statuses.in_progress')}
                    </option>
                    <option value={NoteStatus.DONE}>{t('miniKanban.statuses.done')}</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all transform active:scale-95"
                >
                  {loading ? t('miniKanban.saving') : t('miniKanban.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Task Modal */}
      {viewingNote && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-xl">
              <h3 className="font-bold text-gray-900">{t('miniKanban.viewTask')}</h3>
              <button
                onClick={() => setViewingNote(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  {t('miniKanban.titleLabel')}
                </h4>
                <p className="text-gray-900 font-medium">{viewingNote.title}</p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  {t('miniKanban.detailsLabel')}
                </h4>
                <p className="text-gray-700 whitespace-pre-wrap">{viewingNote.content}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    {t('miniKanban.priorityLabel')}
                  </h4>
                  <span
                    className={`inline-block px-2 py-1 rounded-md text-xs font-medium border ${getPriorityColor(
                      viewingNote.priority
                    )}`}
                  >
                    {t(`miniKanban.priorities.${viewingNote.priority}`)}
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    {t('miniKanban.statusLabel')}
                  </h4>
                  <span
                    className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${
                      viewingNote.status === NoteStatus.TODO
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : viewingNote.status === NoteStatus.IN_PROGRESS
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {t(`miniKanban.statuses.${viewingNote.status}`)}
                  </span>
                </div>
              </div>

              {viewingNote.createdAt && (
                <div>
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                    {t('miniKanban.createdAt')}
                  </h4>
                  <p className="text-gray-600 text-sm">
                    {new Date(viewingNote.createdAt).toLocaleString('uk-UA')}
                  </p>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => {
                    setViewingNote(null);
                    handleEditClick(viewingNote);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {t('miniKanban.edit')}
                </button>
                <button
                  onClick={() => setViewingNote(null)}
                  className="flex-1 px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiniKanban;
