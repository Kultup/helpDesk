const Imap = require('imap');
const { simpleParser } = require('mailparser');
const EmailThread = require('../models/EmailThread');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Category = require('../models/Category');
const logger = require('../utils/logger');

class EmailReceiveService {
  constructor() {
    this.imap = null;
    this.isConnected = false;
    this.settings = null;
  }

  /**
   * Ініціалізація IMAP підключення
   * @param {Object} settings - Email налаштування
   */
  async initialize(settings = null) {
    try {
      if (!settings) {
        const EmailSettings = require('../models/EmailSettings');
        this.settings = await EmailSettings.getActive();
      } else {
        this.settings = settings;
      }

      if (!this.settings || !this.settings.imap || !this.settings.imap.enabled) {
        logger.warn('IMAP not enabled in settings');
        return false;
      }

      this.imap = new Imap({
        user: this.settings.imap.user,
        password: this.settings.imap.password,
        host: this.settings.imap.host,
        port: this.settings.imap.port,
        tls: this.settings.imap.secure,
        tlsOptions: {
          rejectUnauthorized: false
        }
      });

      return new Promise((resolve, reject) => {
        this.imap.once('ready', () => {
          this.isConnected = true;
          logger.info('✅ IMAP connection established');
          resolve(true);
        });

        this.imap.once('error', (err) => {
          this.isConnected = false;
          logger.error('❌ IMAP connection error:', err);
          reject(err);
        });

        this.imap.connect();
      });
    } catch (error) {
      logger.error('❌ Error initializing IMAP:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Перевірити нові листи
   * @returns {Array} - Масив нових листів
   */
  async checkNewEmails() {
    try {
      if (!this.isConnected || !this.imap) {
        const initialized = await this.initialize();
        if (!initialized) {
          return [];
        }
      }

      return new Promise((resolve, reject) => {
        this.imap.openBox(this.settings.imap.mailbox || 'INBOX', false, (err, box) => {
          if (err) {
            logger.error('❌ Error opening mailbox:', err);
            reject(err);
            return;
          }

          // Шукаємо непрочитані листи
          this.imap.search(['UNSEEN'], (err, results) => {
            if (err) {
              logger.error('❌ Error searching emails:', err);
              reject(err);
              return;
            }

            if (!results || results.length === 0) {
              resolve([]);
              return;
            }

            const fetch = this.imap.fetch(results, { bodies: '', struct: true });
            const emails = [];

            fetch.on('message', (msg, seqno) => {
              let emailData = {
                messageId: null,
                inReplyTo: null,
                threadId: null,
                from: null,
                to: [],
                cc: [],
                subject: '',
                body: { html: '', text: '' },
                attachments: [],
                receivedAt: null,
                headers: {}
              };

              msg.on('body', (stream, info) => {
                simpleParser(stream, (err, parsed) => {
                  if (err) {
                    logger.error('❌ Error parsing email:', err);
                    return;
                  }

                  emailData.messageId = parsed.messageId || null;
                  emailData.inReplyTo = parsed.inReplyTo || null;
                  emailData.threadId = parsed.inReplyTo ? parsed.inReplyTo : parsed.messageId || null;
                  emailData.from = {
                    email: parsed.from?.value[0]?.address || '',
                    name: parsed.from?.value[0]?.name || ''
                  };
                  emailData.to = parsed.to?.value.map(addr => ({
                    email: addr.address,
                    name: addr.name || ''
                  })) || [];
                  emailData.cc = parsed.cc?.value.map(addr => ({
                    email: addr.address,
                    name: addr.name || ''
                  })) || [];
                  emailData.subject = parsed.subject || '';
                  emailData.body.html = parsed.html || '';
                  emailData.body.text = parsed.text || '';
                  emailData.receivedAt = parsed.date || new Date();
                  emailData.headers = parsed.headers || {};

                  // Обробка вкладень
                  if (parsed.attachments && parsed.attachments.length > 0) {
                    emailData.attachments = parsed.attachments.map(att => ({
                      filename: att.filename || 'attachment',
                      originalName: att.filename || 'attachment',
                      mimetype: att.contentType || 'application/octet-stream',
                      size: att.size || 0,
                      path: '', // Буде заповнено після збереження файлу
                      content: att.content
                    }));
                  }
                });
              });

              msg.once('end', () => {
                emails.push(emailData);
              });
            });

            fetch.once('error', (err) => {
              logger.error('❌ Error fetching emails:', err);
              reject(err);
            });

            fetch.once('end', () => {
              resolve(emails);
            });
          });
        });
      });
    } catch (error) {
      logger.error('❌ Error checking new emails:', error);
      return [];
    }
  }

  /**
   * Створити тикет з email
   * @param {Object} emailData - Дані email
   * @returns {Object} - Створений тикет
   */
  async createTicketFromEmail(emailData) {
    try {
      // Перевіряємо, чи вже існує thread для цього email
      const existingThread = await EmailThread.findOne({ messageId: emailData.messageId });
      if (existingThread && existingThread.ticket) {
        logger.info(`Email ${emailData.messageId} already processed, ticket: ${existingThread.ticket}`);
        return await Ticket.findById(existingThread.ticket);
      }

      // Перевіряємо, чи це відповідь на існуючий тикет
      if (emailData.inReplyTo) {
        const replyThread = await EmailThread.findOne({ messageId: emailData.inReplyTo });
        if (replyThread && replyThread.ticket) {
          // Додаємо email до існуючого тикету
          const thread = new EmailThread({
            ...emailData,
            direction: 'inbound',
            ticket: replyThread.ticket,
            isProcessed: true,
            processedAt: new Date()
          });
          await thread.save();

          // Додаємо коментар до тикету
          const ticket = await Ticket.findById(replyThread.ticket);
          if (ticket) {
            const comment = {
              content: `Email від ${emailData.from.email}: ${emailData.body.text || emailData.body.html}`,
              ticket: ticket._id,
              author: ticket.createdBy,
              type: 'email_reply'
            };
            // Тут можна додати коментар до тикету
          }

          return ticket;
        }
      }

      // Створюємо новий тикет
      // Знаходимо користувача по email
      let user = await User.findOne({ email: emailData.from.email });
      if (!user) {
        // Якщо користувача немає, використовуємо дефолтного користувача або створюємо тикет без користувача
        logger.warn(`User not found for email: ${emailData.from.email}`);
        // Можна створити тикет з дефолтним користувачем або без користувача
        return null;
      }

      // Автоматична категорізація (якщо налаштовано)
      let category = null;
      let priority = 'medium';
      
      if (this.settings && this.settings.autoCategorization && this.settings.autoCategorization.enabled) {
        for (const rule of this.settings.autoCategorization.rules) {
          const condition = rule.condition;
          let matches = false;

          if (condition.type === 'subject') {
            const subject = emailData.subject.toLowerCase();
            if (condition.operator === 'contains') {
              matches = subject.includes(condition.value.toLowerCase());
            } else if (condition.operator === 'equals') {
              matches = subject === condition.value.toLowerCase();
            } else if (condition.operator === 'startsWith') {
              matches = subject.startsWith(condition.value.toLowerCase());
            } else if (condition.operator === 'endsWith') {
              matches = subject.endsWith(condition.value.toLowerCase());
            }
          } else if (condition.type === 'from') {
            const from = emailData.from.email.toLowerCase();
            if (condition.operator === 'contains') {
              matches = from.includes(condition.value.toLowerCase());
            } else if (condition.operator === 'equals') {
              matches = from === condition.value.toLowerCase();
            }
          } else if (condition.type === 'body') {
            const body = (emailData.body.text || emailData.body.html || '').toLowerCase();
            if (condition.operator === 'contains') {
              matches = body.includes(condition.value.toLowerCase());
            }
          }

          if (matches) {
            category = rule.category;
            priority = rule.priority || 'medium';
            break;
          }
        }
      }

      // Створюємо тикет
      const ticket = new Ticket({
        title: emailData.subject || 'Email тикет',
        description: emailData.body.text || emailData.body.html || '',
        priority,
        category: category,
        createdBy: user._id,
        createdFromEmail: true,
        emailAddress: emailData.from.email,
        metadata: {
          source: 'email'
        }
      });

      await ticket.save();

      // Створюємо email thread
      const thread = new EmailThread({
        ...emailData,
        direction: 'inbound',
        ticket: ticket._id,
        isProcessed: true,
        processedAt: new Date()
      });
      await thread.save();

      // Оновлюємо тикет
      ticket.emailThread = thread._id;
      await ticket.save();

      logger.info(`✅ Ticket created from email: ${ticket.ticketNumber}`);

      return ticket;
    } catch (error) {
      logger.error('❌ Error creating ticket from email:', error);
      throw error;
    }
  }

  /**
   * Обробити нові листи
   * @returns {Object} - Статистика обробки
   */
  async processNewEmails() {
    try {
      const newEmails = await this.checkNewEmails();
      let ticketsCreated = 0;
      let ticketsUpdated = 0;
      let errors = 0;

      for (const email of newEmails) {
        try {
          // Перевіряємо, чи це лист для створення тикетів
          const ticketEmail = this.settings?.ticketEmail || process.env.EMAIL_USER;
          const isTicketEmail = email.to.some(addr => addr.email === ticketEmail);

          if (isTicketEmail) {
            const ticket = await this.createTicketFromEmail(email);
            if (ticket) {
              ticketsCreated++;
            }
          } else {
            // Якщо це відповідь на існуючий тикет
            if (email.inReplyTo) {
              const replyThread = await EmailThread.findOne({ messageId: email.inReplyTo });
              if (replyThread && replyThread.ticket) {
                // Додаємо email до тикету
                const thread = new EmailThread({
                  ...email,
                  direction: 'inbound',
                  ticket: replyThread.ticket,
                  isProcessed: true,
                  processedAt: new Date()
                });
                await thread.save();
                ticketsUpdated++;
              }
            }
          }
        } catch (error) {
          logger.error(`❌ Error processing email ${email.messageId}:`, error);
          errors++;
        }
      }

      return {
        emailsProcessed: newEmails.length,
        ticketsCreated,
        ticketsUpdated,
        errors
      };
    } catch (error) {
      logger.error('❌ Error processing new emails:', error);
      return {
        emailsProcessed: 0,
        ticketsCreated: 0,
        ticketsUpdated: 0,
        errors: 1
      };
    }
  }

  /**
   * Закрити підключення
   */
  async close() {
    try {
      if (this.imap && this.isConnected) {
        this.imap.end();
        this.isConnected = false;
        logger.info('✅ IMAP connection closed');
      }
    } catch (error) {
      logger.error('❌ Error closing IMAP connection:', error);
    }
  }
}

module.exports = new EmailReceiveService();

