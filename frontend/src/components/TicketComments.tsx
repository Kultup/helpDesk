import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { Comment } from '../types';
import Card from './UI/Card';
import Button from './UI/Button';
import LoadingSpinner from './UI/LoadingSpinner';
import { formatDate } from '../utils';
import { Send, Trash2, User } from 'lucide-react';
import { useWindowSize } from '../hooks';

interface TicketCommentsProps {
  ticketId: string;
}

const TicketComments: React.FC<TicketCommentsProps> = ({ ticketId }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const { width } = useWindowSize();
  const isMobile = width < 640;

  const loadComments = async () => {
    try {
      setIsLoading(true);
      // TODO: Implement getTicketComments API method
      // For now, comments are stored in ticket.comments
      // This will need to be updated when the API is ready
      setComments([]);
    } catch (error) {
      console.error('Помилка завантаження коментарів:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [ticketId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const response = await apiService.addComment(ticketId, newComment.trim());
      if (response.success && response.data) {
        const newCommentData = response.data as unknown as Comment;
        setComments(prev => [newCommentData, ...prev]);
        setNewComment('');
      }
    } catch (error) {
      console.error('Помилка додавання коментаря:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
      if (!confirm(t('common.confirmDeleteComment'))) return;

    try {
      const response = await apiService.deleteComment(ticketId, commentId);
      if (response.success) {
        setComments(prev => prev.filter(c => c._id !== commentId));
      }
    } catch (error) {
      console.error('Помилка видалення коментаря:', error);
    }
  };

  const canDelete = (comment: Comment) => {
    return user?._id === comment.author._id || user?.role === 'admin';
  };

  return (
    <Card>
      <div className={`p-3 sm:p-4 lg:p-6`}>
        <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-900">
          {t('common.comments')} ({comments.length})
        </h3>

        {/* Form to add new comment */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t('common.writeComment')}
              className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white text-gray-900 placeholder-gray-500"
              rows={isMobile ? 3 : 4}
              disabled={isSubmitting}
            />
            <Button
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2"
              size={isMobile ? "sm" : "md"}
            >
              <Send className="w-4 h-4" />
              {t('common.send')}
            </Button>
          </div>
        </form>

        {/* Comments list */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm sm:text-base">
              {t('common.noComments')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div
                key={comment._id}
                className="p-3 sm:p-4 border border-gray-200 rounded-lg bg-gray-50 text-gray-900"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <User className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base font-semibold text-gray-900">
                          {comment.author?.email || t('common.unknownUser')}
                        </span>
                        <span className="text-xs sm:text-sm text-gray-500">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      {canDelete(comment) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(comment._id)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default TicketComments;

