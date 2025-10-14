const TelegramService = require('../services/telegramService');

// Тестовий клас для перевірки логіки навігації
class NavigationTester {
  constructor() {
    this.telegramService = new TelegramService();
    this.testChatId = 12345;
  }

  // Тест базової логіки стеку станів
  testStateStack() {
    console.log('🧪 Тестування стеку станів...');
    
    // Очищуємо стан
    this.telegramService.userStates.delete(this.testChatId);
    
    // Тест 1: Початковий стан
    let currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`✅ Початковий стан: ${currentState} (очікується: main)`);
    
    // Тест 2: Додавання станів
    this.telegramService.pushState(this.testChatId, 'my_tickets');
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`✅ Після pushState('my_tickets'): ${currentState}`);
    
    this.telegramService.pushState(this.testChatId, 'create_ticket');
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`✅ Після pushState('create_ticket'): ${currentState}`);
    
    // Тест 3: Видалення станів
    let poppedState = this.telegramService.popState(this.testChatId);
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`✅ Після popState(): видалено '${poppedState}', поточний: '${currentState}'`);
    
    poppedState = this.telegramService.popState(this.testChatId);
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`✅ Після popState(): видалено '${poppedState}', поточний: '${currentState}'`);
    
    // Тест 4: Спроба видалити з порожнього стеку
    poppedState = this.telegramService.popState(this.testChatId);
    currentState = this.telegramService.getCurrentState(this.testChatId);
    console.log(`✅ Після popState() з порожнього стеку: видалено '${poppedState}', поточний: '${currentState}'`);
  }

  // Тест логіки навігації назад
  testBackNavigation() {
    console.log('\n🧪 Тестування логіки навігації назад...');
    
    // Очищуємо стан
    this.telegramService.userStates.delete(this.testChatId);
    this.telegramService.userSessions.delete(this.testChatId);
    
    // Симулюємо навігацію: main -> my_tickets -> create_ticket
    this.telegramService.pushState(this.testChatId, 'main');
    this.telegramService.pushState(this.testChatId, 'my_tickets');
    this.telegramService.pushState(this.testChatId, 'create_ticket');
    
    console.log(`📍 Поточний стан: ${this.telegramService.getCurrentState(this.testChatId)}`);
    
    // Симулюємо натискання кнопки "Назад"
    console.log('🔙 Симулюємо натискання "Назад"...');
    
    // Видаляємо сесію (як в handleBackCallback)
    this.telegramService.userSessions.delete(this.testChatId);
    
    // Повертаємося до попереднього стану
    this.telegramService.popState(this.testChatId);
    let newState = this.telegramService.getCurrentState(this.testChatId);
    
    console.log(`📍 Новий стан після "Назад": ${newState} (очікується: my_tickets)`);
    
    // Ще раз назад
    console.log('🔙 Ще раз "Назад"...');
    this.telegramService.userSessions.delete(this.testChatId);
    this.telegramService.popState(this.testChatId);
    newState = this.telegramService.getCurrentState(this.testChatId);
    
    console.log(`📍 Новий стан після другого "Назад": ${newState} (очікується: main)`);
  }

  // Тест сценаріїв реєстрації
  testRegistrationFlow() {
    console.log('\n🧪 Тестування потоку реєстрації...');
    
    // Очищуємо стан
    this.telegramService.userStates.delete(this.testChatId);
    this.telegramService.userSessions.delete(this.testChatId);
    
    // Симулюємо початок реєстрації
    this.telegramService.pushState(this.testChatId, 'main');
    this.telegramService.pushState(this.testChatId, 'registration');
    
    // Встановлюємо сесію реєстрації
    this.telegramService.userSessions.set(this.testChatId, {
      action: 'registration',
      step: 'firstName',
      data: {}
    });
    
    console.log(`📍 Стан реєстрації: ${this.telegramService.getCurrentState(this.testChatId)}`);
    console.log(`📝 Сесія: ${JSON.stringify(this.telegramService.userSessions.get(this.testChatId))}`);
    
    // Симулюємо натискання "Назад" під час реєстрації
    console.log('🔙 "Назад" під час реєстрації...');
    this.telegramService.userSessions.delete(this.testChatId);
    this.telegramService.popState(this.testChatId);
    let newState = this.telegramService.getCurrentState(this.testChatId);
    
    console.log(`📍 Стан після скасування реєстрації: ${newState} (очікується: main)`);
    console.log(`📝 Сесія видалена: ${this.telegramService.userSessions.has(this.testChatId) ? 'НІ' : 'ТАК'}`);
  }

  // Запуск всіх тестів
  runAllTests() {
    console.log('🚀 Запуск тестів навігації...\n');
    
    try {
      this.testStateStack();
      this.testBackNavigation();
      this.testRegistrationFlow();
      
      console.log('\n✅ Всі тести пройдено успішно!');
    } catch (error) {
      console.error('\n❌ Помилка під час тестування:', error);
    }
  }
}

// Запускаємо тести
const tester = new NavigationTester();
tester.runAllTests();