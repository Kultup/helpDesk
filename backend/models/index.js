// Ініціалізація всіх моделей
// Це гарантує, що всі схеми будуть зареєстровані в Mongoose

const User = require('./User');
const Ticket = require('./Ticket');
const City = require('./City');
const Position = require('./Position');
const Comment = require('./Comment');
const Category = require('./Category');
const TimeEntry = require('./TimeEntry');
const TicketTemplate = require('./TicketTemplate');
const NotificationTemplate = require('./NotificationTemplate');
const QuickTip = require('./QuickTip');
const Event = require('./Event');
const AdminNote = require('./AdminNote');
const Tag = require('./Tag');
const SLAPolicy = require('./SLAPolicy');
const KnowledgeBase = require('./KnowledgeBase');
const EmailThread = require('./EmailThread');
const EmailSettings = require('./EmailSettings');
const TelegramConfig = require('./TelegramConfig');
const ActiveDirectoryConfig = require('./ActiveDirectoryConfig');
const Notification = require('./Notification');
const TicketHistory = require('./TicketHistory');
const Attachment = require('./Attachment');
const ZabbixConfig = require('./ZabbixConfig');
const ZabbixAlert = require('./ZabbixAlert');
const ZabbixAlertGroup = require('./ZabbixAlertGroup');

module.exports = {
  User,
  Ticket,
  City,
  Position,
  Comment,
  Category,
  TimeEntry,
  TicketTemplate,
  NotificationTemplate,
  QuickTip,
  Event,
  AdminNote,
  Tag,
  SLAPolicy,
  KnowledgeBase,
  EmailThread,
  EmailSettings,
  TelegramConfig,
  ActiveDirectoryConfig,
  Notification,
  TicketHistory,
  Attachment,
  ZabbixConfig,
  ZabbixAlert,
  ZabbixAlertGroup,
};