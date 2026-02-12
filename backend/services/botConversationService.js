const BotConversation = require('../models/BotConversation');
const BotConversationMessage = require('../models/BotConversationMessage');
const Ticket = require('../models/Ticket');
const logger = require('../utils/logger');

/**
 * Отримати або створити розмову для користувача в чаті.
 * @param {string} telegramChatId
 * @param {Object} user - User document (з _id)
 * @param {string} [subject] - перше повідомлення для subject
 * @returns {Promise<Object>} conversation
 */
async function getOrCreateConversation(telegramChatId, user, subject = '') {
  let conv = await BotConversation.findOne({
    user: user._id,
    telegramChatId: String(telegramChatId),
  }).sort({ lastMessageAt: -1 });

  const now = new Date();
  if (!conv) {
    conv = await BotConversation.create({
      user: user._id,
      telegramChatId: String(telegramChatId),
      subject: (subject || '').slice(0, 200),
      messageCount: 0,
      startedAt: now,
      lastMessageAt: now,
    });
    return conv;
  }
  if (subject && !conv.subject) {
    conv.subject = subject.slice(0, 200);
    await conv.save();
  }
  return conv;
}

/**
 * Додати повідомлення до розмови. Якщо розмови немає — створити.
 * @param {string} telegramChatId
 * @param {Object} user - User document
 * @param {string} role - 'user' | 'assistant'
 * @param {string} content
 * @param {string} [telegramMessageId]
 * @param {string} [subject] - для нової розмови (перше повідомлення)
 * @returns {Promise<Object|null>} conversation або null
 */
async function appendMessage(
  telegramChatId,
  user,
  role,
  content,
  telegramMessageId = null,
  subject = ''
) {
  if (!user || !user._id) {
    return null;
  }
  try {
    const conv = await getOrCreateConversation(telegramChatId, user, subject);
    await BotConversationMessage.create({
      conversation: conv._id,
      role,
      content: (content || '').slice(0, 8000),
      telegramMessageId: telegramMessageId || null,
    });
    conv.messageCount = (conv.messageCount || 0) + 1;
    conv.lastMessageAt = new Date();
    await conv.save();
    return conv;
  } catch (err) {
    logger.error('botConversationService.appendMessage', { err: err.message, telegramChatId });
    return null;
  }
}

/**
 * Привʼязати тікет до розмови та зберегти діалог у тікет (aiDialogHistory).
 * @param {string} telegramChatId
 * @param {Object} user - User document
 * @param {string} ticketId - ObjectId тікета
 * @param {Array<{role: string, content: string}>} dialogHistory - session.dialog_history
 */
async function linkTicketAndSaveDialog(telegramChatId, user, ticketId, dialogHistory) {
  if (!user || !user._id || !ticketId || !dialogHistory || !Array.isArray(dialogHistory)) {
    return;
  }
  try {
    const conv = await BotConversation.findOne({
      user: user._id,
      telegramChatId: String(telegramChatId),
    }).sort({ lastMessageAt: -1 });

    if (conv) {
      conv.ticket = ticketId;
      await conv.save();
    }

    const history = dialogHistory
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content || '').slice(0, 5000),
      }))
      .filter(m => m.content.trim());
    if (history.length === 0) {
      return;
    }

    await Ticket.findByIdAndUpdate(ticketId, {
      $set: {
        aiDialogHistory: history,
      },
    });
  } catch (err) {
    logger.error('botConversationService.linkTicketAndSaveDialog', { err: err.message, ticketId });
  }
}

/**
 * Оновити resolutionSummary тікета при закритті/вирішенні (для навчання AI).
 * @param {string} ticketId
 * @param {string} summary - короткий опис рішення
 */
async function setResolutionSummary(ticketId, summary) {
  if (!ticketId || !summary) {
    return;
  }
  try {
    await Ticket.findByIdAndUpdate(ticketId, {
      $set: { resolutionSummary: String(summary).slice(0, 2000) },
    });
    const ticketEmbeddingService = require('./ticketEmbeddingService');
    ticketEmbeddingService.indexTicket(ticketId).catch(() => {});
  } catch (err) {
    logger.error('botConversationService.setResolutionSummary', { err: err.message });
  }
}

module.exports = {
  getOrCreateConversation,
  appendMessage,
  linkTicketAndSaveDialog,
  setResolutionSummary,
};
