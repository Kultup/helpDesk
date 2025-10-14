import React, { useState, useEffect } from 'react';
import { Tag, Plus, X, Hash } from 'lucide-react';
import { apiService } from '../services/api';
import Card from './UI/Card';
import Button from './UI/Button';

interface TicketTag {
  _id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: string;
}

interface TicketTagsProps {
  ticketId: string;
  tags: TicketTag[];
  onTagsUpdate: (tags: TicketTag[]) => void;
  canEdit?: boolean;
}

const TicketTags: React.FC<TicketTagsProps> = ({ 
  ticketId, 
  tags, 
  onTagsUpdate, 
  canEdit = true 
}) => {
  const [availableTags, setAvailableTags] = useState<TicketTag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const predefinedColors = [
    '#3B82F6', // blue
    '#EF4444', // red
    '#10B981', // green
    '#F59E0B', // yellow
    '#8B5CF6', // purple
    '#F97316', // orange
    '#06B6D4', // cyan
    '#84CC16', // lime
    '#EC4899', // pink
    '#6B7280'  // gray
  ];

  useEffect(() => {
    loadAvailableTags();
  }, []);

  // Завантаження доступних тегів
  const loadAvailableTags = async () => {
    try {
      const data = await apiService.getTags();
      setAvailableTags(data);
    } catch (error) {
      console.error('Помилка завантаження тегів:', error);
    }
  };

  // Додавання тегу до тікету
  const addTagToTicket = async (tagId: string) => {
    try {
      setLoading(true);
      await apiService.addTagToTicket(ticketId, tagId);
      
      const addedTag = availableTags.find(tag => tag._id === tagId);
      if (addedTag) {
        const updatedTags = [...tags, addedTag];
        onTagsUpdate(updatedTags);
      }
    } catch (error) {
      console.error('Помилка додавання тегу:', error);
    } finally {
      setLoading(false);
    }
  };

  // Видалення тегу з тікету
  const removeTagFromTicket = async (tagId: string) => {
    try {
      setLoading(true);
      await apiService.removeTagFromTicket(ticketId, tagId);
      
      const updatedTags = tags.filter(tag => tag._id !== tagId);
      onTagsUpdate(updatedTags);
    } catch (error) {
      console.error('Помилка видалення тегу:', error);
    } finally {
      setLoading(false);
    }
  };

  // Створення нового тегу
  const createNewTag = async () => {
    if (!newTagName.trim()) return;

    try {
      setLoading(true);
      const newTag = await apiService.createTag({
        name: newTagName.trim(),
        color: newTagColor
      });
      
      setAvailableTags(prev => [...prev, newTag]);
      setNewTagName('');
      setNewTagColor('#3B82F6');
      setShowAddForm(false);
      
      // Автоматично додати новий тег до тікету
      await addTagToTicket(newTag._id);
    } catch (error) {
      console.error('Помилка створення тегу:', error);
    } finally {
      setLoading(false);
    }
  };

  // Фільтрація доступних тегів (виключаючи вже додані)
  const getAvailableTagsForAdd = () => {
    const currentTagIds = tags.map(tag => tag._id);
    return availableTags.filter(tag => !currentTagIds.includes(tag._id));
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">Теги</h3>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Додати тег
          </Button>
        )}
      </div>

      {/* Поточні теги тікету */}
      <div className="mb-4">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div
                key={tag._id}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: tag.color }}
              >
                <Tag className="w-3 h-3" />
                {tag.name}
                {canEdit && (
                  <button
                    onClick={() => removeTagFromTicket(tag._id)}
                    className="ml-1 hover:bg-black hover:bg-opacity-20 rounded-full p-0.5"
                    disabled={loading}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Теги не додані</p>
        )}
      </div>

      {/* Форма додавання тегу */}
      {showAddForm && canEdit && (
        <div className="border-t pt-4">
          <div className="space-y-4">
            {/* Вибір з існуючих тегів */}
            {getAvailableTagsForAdd().length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Доступні теги:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {getAvailableTagsForAdd().map((tag) => (
                    <button
                      key={tag._id}
                      onClick={() => addTagToTicket(tag._id)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium text-white hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: tag.color }}
                      disabled={loading}
                    >
                      <Tag className="w-3 h-3" />
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Створення нового тегу */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Створити новий тег:
              </h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Назва тегу"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && createNewTag()}
                />
                <div className="flex gap-1">
                  {predefinedColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        newTagColor === color ? 'border-gray-800' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <Button
                  onClick={createNewTag}
                  disabled={!newTagName.trim() || loading}
                  size="sm"
                >
                  Створити
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        </div>
      )}
    </Card>
  );
};

export default TicketTags;