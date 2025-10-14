// Ініціалізація всіх моделей
// Це гарантує, що всі схеми будуть зареєстровані в Mongoose

const User = require('./User');
const Ticket = require('./Ticket');
const City = require('./City');
const Position = require('./Position');
const Comment = require('./Comment');
const Category = require('./Category');
const TimeEntry = require('./TimeEntry');
// const KnowledgeBase = require('./KnowledgeBase'); // Модуль не існує
const TicketTemplate = require('./TicketTemplate');
const QuickTip = require('./QuickTip');
const Event = require('./Event');
const AdminNote = require('./AdminNote');
const Rating = require('./Rating');

module.exports = {
  User,
  Ticket,
  City,
  Position,
  Comment,
  Category,
  TimeEntry,
  // KnowledgeBase, // Модуль не існує
  TicketTemplate,
  QuickTip,
  Event,
  AdminNote,
  Rating
};