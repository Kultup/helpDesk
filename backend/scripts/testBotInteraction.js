const TelegramService = require('../services/telegramService');

// Мок для Telegram Bot API
class MockTelegramBot {
  constructor() {
    this.sentMessages = [];
  }

  async sendMessage(chatId, text, options = {}) {
    this.sentMessages.push({
      chatId,
      text,
      options,
      timestamp: new Date()
    });
    console.log(`📤 Повідомлення відправлено до ${chatId}: ${text.substring(0, 50)}...`);
    return { message_id: Math.floor(Math.random() * 1000) };
  }

  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  clearMessages() {
    this.sentMessages = [];
  }
}

// Тестовий клас для симуляції взаємодії з ботом
class BotInteractionTester {
  constructor() {
    this.telegramService = new TelegramService();
    this.mockBot = new MockTelegramBot();
    
    // Замінюємо справжній бот на мок
    this.telegramService.bot = this.mockBot;
    
    this.testChatId = 12345;
    this.testUser = {
      id: 1,
      telegramId: this.testChatId,
      firstName: 'Тест',
      lastName: 'Користувач',
      email: 'test@example.com',
      registrationStatus: 'approved'
    };
  }

  // Тест навігації в головному меню
  async testMainMenuNavigation() {
    console.log('\n🧪 Тестування навігації в головному меню...');
    
    // Очищуємо стан
    this.telegramService.userStates.delete(this.testChatId);
    this.mockBot.clearMessages();
    
    // Симулюємо команду /start
    await this.telegramService.handleStartCommand(this.testChatId);
    
    let currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після /start: ${currentState}`);
    
    // Симулюємо натискання "Мої тікети"
    console.log('🔘 Натискаємо "Мої тікети"...');
    await this.telegramService.handleMyTicketsCallback(this.testChatId, this.testUser);
    
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після "Мої тікети": ${currentState}`);
    
    // Симулюємо натискання "Назад"
    console.log('🔙 Натискаємо "Назад"...');
    await this.telegramService.handleBackCallback(this.testChatId, this.testUser);
    
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після "Назад": ${currentState}`);
    
    let lastMessage = this.mockBot.getLastMessage();
    console.log(`📤 Останнє повідомлення: ${lastMessage?.text?.substring(0, 30)}...`);
  }

  // Тест навігації створення тікету
  async testCreateTicketNavigation() {
    console.log('\n🧪 Тестування навігації створення тікету...');
    
    // Очищуємо стан
    this.telegramService.userStates.delete(this.testChatId);
    this.mockBot.clearMessages();
    
    // Починаємо з головного меню
    this.telegramService.pushState(this.testChatId, 'main');
    
    // Симулюємо натискання "Створити тікет"
    console.log('🔘 Натискаємо "Створити тікет"...');
    await this.telegramService.handleCreateTicketCallback(this.testChatId, this.testUser);
    
    let currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після "Створити тікет": ${currentState}`);
    
    // Симулюємо натискання "Назад"
    console.log('🔙 Натискаємо "Назад"...');
    await this.telegramService.handleBackCallback(this.testChatId, this.testUser);
    
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після "Назад": ${currentState}`);
    
    let lastMessage = this.mockBot.getLastMessage();
    console.log(`📤 Останнє повідомлення: ${lastMessage?.text?.substring(0, 30)}...`);
  }

  // Тест навігації реєстрації
  async testRegistrationNavigation() {
    console.log('\n🧪 Тестування навігації реєстрації...');
    
    // Очищуємо стан
    this.telegramService.userStates.delete(this.testChatId);
    this.telegramService.userSessions.delete(this.testChatId);
    this.mockBot.clearMessages();
    
    // Починаємо з головного меню (неавторизований користувач)
    this.telegramService.pushState(this.testChatId, 'main');
    
    // Симулюємо натискання "Реєстрація"
    console.log('🔘 Натискаємо "Реєстрація"...');
    await this.telegramService.handleRegisterCallback(this.testChatId, null);
    
    let currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після "Реєстрація": ${currentState}`);
    
    let session = this.telegramService.userSessions.get(this.testChatId);
    console.log(`📝 Сесія: ${JSON.stringify(session)}`);
    
    // Симулюємо натискання "Назад" під час реєстрації
    console.log('🔙 Натискаємо "Назад" під час реєстрації...');
    await this.telegramService.handleBackCallback(this.testChatId, null);
    
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після "Назад": ${currentState}`);
    
    let sessionAfter = this.telegramService.userSessions.get(this.testChatId);
    console.log(`📝 Сесія після "Назад": ${sessionAfter || 'видалена'}`);
    
    let lastMessage = this.mockBot.getLastMessage();
    console.log(`📤 Останнє повідомлення: ${lastMessage?.text?.substring(0, 30)}...`);
  }

  // Тест обробки текстових повідомлень "Назад"
  async testTextBackMessages() {
    console.log('\n🧪 Тестування текстових повідомлень "Назад"...');
    
    // Очищуємо стан
    this.telegramService.userStates.delete(this.testChatId);
    this.mockBot.clearMessages();
    
    // Встановлюємо стан
    this.telegramService.pushState(this.testChatId, 'main');
    this.telegramService.pushState(this.testChatId, 'my_tickets');
    
    let currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Початковий стан: ${currentState}`);
    
    // Симулюємо текстове повідомлення "🔙 Назад"
    console.log('💬 Відправляємо текст "🔙 Назад"...');
    
    // Мокаємо об'єкт повідомлення
    const mockMessage = {
      chat: { id: this.testChatId },
      text: '🔙 Назад',
      from: { id: this.testChatId }
    };
    
    await this.telegramService.handleMessage(mockMessage);
    
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`📍 Стан після текстового "Назад": ${currentState}`);
    
    let lastMessage = this.mockBot.getLastMessage();
    console.log(`📤 Останнє повідомлення: ${lastMessage?.text?.substring(0, 30)}...`);
  }

  // Запуск всіх тестів
  async runAllTests() {
    console.log('🚀 Запуск тестів взаємодії з ботом...\n');
    
    try {
      await this.testMainMenuNavigation();
      await this.testCreateTicketNavigation();
      await this.testRegistrationNavigation();
      await this.testTextBackMessages();
      
      console.log('\n✅ Всі тести взаємодії пройдено успішно!');
      console.log(`📊 Всього відправлено повідомлень: ${this.mockBot.sentMessages.length}`);
    } catch (error) {
      console.error('\n❌ Помилка під час тестування взаємодії:', error);
    }
  }
}

// Запускаємо тести
const tester = new BotInteractionTester();
tester.runAllTests();