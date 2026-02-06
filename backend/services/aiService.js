const logger = require('../utils/logger');
const BotSettings = require('../models/BotSettings');
const groqService = require('./groqService');
const openaiService = require('./openaiService');

/**
 * Універсальний AI сервіс, який роутить запити до обраного провайдера
 */
class AIService {
  constructor() {
    this.currentProvider = null;
    this.settings = null;
  }

  async initialize() {
    try {
      this.settings = await BotSettings.findOne({ key: 'default' });
      
      if (!this.settings) {
        logger.warn('Налаштування не знайдено');
        return false;
      }

      // Визначаємо активний провайдер
      this.currentProvider = this.settings.aiProvider || 'groq';
      
      logger.info(`🤖 AI Provider: ${this.currentProvider}`);

      // Ініціалізуємо обраний провайдер
      if (this.currentProvider === 'openai') {
        return await openaiService.initialize();
      } else {
        return await groqService.initialize();
      }
    } catch (error) {
      logger.error('Помилка ініціалізації AI сервісу:', error);
      return false;
    }
  }

  isEnabled() {
    if (!this.settings || !this.settings.aiEnabled) {
      return false;
    }

    if (this.currentProvider === 'openai') {
      return openaiService.isEnabled();
    } else {
      return groqService.isEnabled();
    }
  }

  getActiveService() {
    if (this.currentProvider === 'openai') {
      return openaiService;
    } else {
      return groqService;
    }
  }

  async getAIResponse(userMessage, conversationHistory = [], context = {}) {
    const service = this.getActiveService();
    return await service.getAIResponse(userMessage, conversationHistory, context);
  }

  async analyzeIntent(userMessage) {
    const service = this.getActiveService();
    return await service.analyzeIntent(userMessage);
  }

  async generateNextQuestion(conversation, ticketData = {}) {
    const service = this.getActiveService();
    return await service.generateNextQuestion(conversation, ticketData);
  }

  async analyzeTicket(ticket, options = {}) {
    const service = this.getActiveService();
    return await service.analyzeTicket(ticket, options);
  }

  async generateReport(tickets, analyticsData, options = {}) {
    const service = this.getActiveService();
    return await service.generateReport(tickets, analyticsData, options);
  }

  async analyzeAnalytics(tickets, analyticsData, options = {}) {
    const service = this.getActiveService();
    return await service.analyzeAnalytics(tickets, analyticsData, options);
  }

  async generateFAQ(tickets, options = {}) {
    const service = this.getActiveService();
    return await service.generateFAQ(tickets, options);
  }

  async transcribeAudio(filePath) {
    const service = this.getActiveService();
    return await service.transcribeAudio(filePath);
  }

  async reloadSettings() {
    await this.initialize();
    
    // Перезавантажуємо обидва сервіси
    await groqService.reloadSettings();
    await openaiService.reloadSettings();
  }

  async getUsageStats(days = 7) {
    const service = this.getActiveService();
    return await service.getUsageStats(days);
  }
}

module.exports = new AIService();
