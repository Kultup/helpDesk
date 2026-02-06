import React from 'react';

interface TicketRelatedArticlesProps {
  ticketId: string;
  categoryId?: string;
  tags?: string[];
}

/** AI інтеграція вимкнена — пов’язані статті не показуються. */
const TicketRelatedArticles: React.FC<TicketRelatedArticlesProps> = () => {
  return null;
};

export default TicketRelatedArticles;
