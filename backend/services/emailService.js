const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
  }

  /**
   * Ініціалізація email транспортера
   */
  async initialize() {
    try {
      const emailHost = process.env.EMAIL_HOST;
      const emailPort = process.env.EMAIL_PORT;
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS;

      if (!emailHost || !emailPort || !emailUser || !emailPass) {
        logger.warn('Email service not configured - missing environment variables');
        this.isConfigured = false;
        return false;
      }

      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: parseInt(emailPort),
        secure: parseInt(emailPort) === 465, // true for 465, false for other ports
        auth: {
          user: emailUser,
          pass: emailPass
        },
        tls: {
          rejectUnauthorized: false // Для самопідписаних сертифікатів
        }
      });

      // Перевіряємо підключення
      await this.transporter.verify();
      this.isConfigured = true;
      logger.info('✅ Email service initialized successfully');
      return true;
    } catch (error) {
      logger.error('❌ Error initializing email service:', error);
      this.isConfigured = false;
      return false;
    }
  }

  /**
   * Відправити email
   * @param {String} to - Отримувач
   * @param {String} subject - Тема
   * @param {String} html - HTML контент
   * @param {String} text - Текстовий контент
   * @param {Object} options - Додаткові опції (cc, bcc, attachments, replyTo)
   * @returns {Object} - Результат відправки
   */
  async sendEmail(to, subject, html, text = '', options = {}) {
    try {
      if (!this.isConfigured || !this.transporter) {
        logger.warn('Email service not configured, cannot send email');
        return {
          success: false,
          message: 'Email service not configured'
        };
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
        text,
        ...options
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(`✅ Email sent successfully to ${to}`, {
        messageId: result.messageId
      });

      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };
    } catch (error) {
      logger.error('❌ Error sending email:', error);
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Відправити email з шаблоном
   * @param {String} to - Отримувач
   * @param {String} template - Назва шаблону
   * @param {Object} variables - Змінні для шаблону
   * @param {Object} options - Додаткові опції
   * @returns {Object} - Результат відправки
   */
  async sendTemplatedEmail(to, template, variables = {}, options = {}) {
    try {
      // Отримуємо шаблон з бази даних
      const NotificationTemplate = require('../models/NotificationTemplate');
      const emailTemplate = await NotificationTemplate.findOne({
        type: 'email',
        name: template,
        isActive: true
      });

      if (!emailTemplate) {
        logger.warn(`Email template "${template}" not found`);
        return {
          success: false,
          message: `Email template "${template}" not found`
        };
      }

      // Замінюємо змінні в шаблоні
      let subject = emailTemplate.subject || '';
      let content = emailTemplate.content || '';

      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(regex, variables[key]);
        content = content.replace(regex, variables[key]);
      });

      return await this.sendEmail(to, subject, content, '', options);
    } catch (error) {
      logger.error('❌ Error sending templated email:', error);
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Відправити email про створення тикету
   * @param {Object} ticket - Тикет
   * @param {Object} user - Користувач
   * @returns {Object} - Результат відправки
   */
  async sendTicketCreatedEmail(ticket, user) {
    try {
      if (!user.email) {
        logger.warn('User email not found, cannot send email');
        return { success: false, message: 'User email not found' };
      }

      const variables = {
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        userEmail: user.email,
        userName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email
      };

      return await this.sendTemplatedEmail(
        user.email,
        'ticket_created',
        variables,
        {
          replyTo: process.env.EMAIL_USER
        }
      );
    } catch (error) {
      logger.error('❌ Error sending ticket created email:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Відправити email про зміну статусу тикету
   * @param {Object} ticket - Тикет
   * @param {Object} user - Користувач
   * @param {String} oldStatus - Старий статус
   * @param {String} newStatus - Новий статус
   * @returns {Object} - Результат відправки
   */
  async sendTicketStatusChangedEmail(ticket, user, oldStatus, newStatus) {
    try {
      if (!user.email) {
        return { success: false, message: 'User email not found' };
      }

      const variables = {
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        oldStatus,
        newStatus,
        userEmail: user.email,
        userName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email
      };

      return await this.sendTemplatedEmail(
        user.email,
        'ticket_status_changed',
        variables
      );
    } catch (error) {
      logger.error('❌ Error sending ticket status changed email:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Відправити email про SLA порушення
   * @param {Object} ticket - Тикет
   * @param {Object} users - Масив користувачів для сповіщення
   * @param {Object} breachInfo - Інформація про порушення
   * @returns {Object} - Результат відправки
   */
  async sendSLABreachEmail(ticket, users, breachInfo) {
    try {
      const results = [];
      for (const user of users) {
        if (user.email) {
          const variables = {
            ticketNumber: ticket.ticketNumber,
            title: ticket.title,
            breachType: breachInfo.type,
            percentage: breachInfo.percentage,
            userEmail: user.email
          };

          const result = await this.sendTemplatedEmail(
            user.email,
            'sla_breach',
            variables
          );
          results.push({ user: user.email, ...result });
        }
      }
      return { success: true, results };
    } catch (error) {
      logger.error('❌ Error sending SLA breach email:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Тестова відправка email
   * @param {String} to - Отримувач
   * @returns {Object} - Результат відправки
   */
  async testEmail(to) {
    try {
      const testHtml = `
        <h1>Тестовий email</h1>
        <p>Це тестовий email від Help Desk системи.</p>
        <p>Якщо ви отримали цей email, налаштування SMTP працюють правильно.</p>
        <p>Час відправки: ${new Date().toLocaleString('uk-UA')}</p>
      `;

      return await this.sendEmail(
        to,
        'Тестовий email від Help Desk',
        testHtml,
        'Це тестовий email від Help Desk системи.'
      );
    } catch (error) {
      logger.error('❌ Error sending test email:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new EmailService();
