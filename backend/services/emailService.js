// Email service - буде реалізовано в Фазі 2.1
const logger = require('../utils/logger');

const sendEmail = async (to, subject, html, text) => {
  logger.info('Email service not implemented yet', { to, subject });
  // Placeholder - буде реалізовано з nodemailer/SendGrid
  return Promise.resolve(true);
};

module.exports = {
  sendEmail
};

