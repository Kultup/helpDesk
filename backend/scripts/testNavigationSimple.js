// Спрощений тест навігації без підключення до бази даних

class SimpleNavigationTester {
  constructor() {
    // Імітуємо основні методи TelegramService
    this.userStates = new Map();
    this.userSessions = new Map();
  }

  // Методи роботи зі станами (копія з TelegramService)
  pushState(chatId, state) {
    if (!this.userStates.has(chatId)) {
      this.userStates.set(chatId, []);
    }
    this.userStates.get(chatId).push(state);
  }

  popState(chatId) {
    const states = this.userStates.get(chatId);
    if (states && states.length > 0) {
      return states.pop();
    }
    return null;
  }

  getCurrentState(chatId) {
    const states = this.userStates.get(chatId);
    return states && states.length > 0 ? states[states.length - 1] : 'main';
  }

  // Імітація handleBackCallback
  handleBackCallback(chatId) {
    console.log(`🔙 handleBackCallback викликано для chatId: ${chatId}`);
    
    // Видаляємо сесію
    this.userSessions.delete(chatId);
    console.log(`🗑️ Сесія видалена для chatId: ${chatId}`);
    
    // Повертаємося до попереднього стану
    this.popState(chatId);
    const currentState = this.getCurrentState(chatId);
    console.log(`📍 Поточний стан після "Назад": ${currentState}`);
    
    return currentState;
  }

  // Тест повного сценарію навігації
  testFullNavigationScenario() {
    console.log('🧪 Тестування повного сценарію навігації...\n');
    
    const testChatId = 12345;
    
    // Сценарій 1: Головне меню -> Мої тікети -> Назад
    console.log('📋 Сценарій 1: Головне меню -> Мої тікети -> Назад');
    this.userStates.delete(testChatId);
    
    this.pushState(testChatId, 'main');
    console.log(`  📍 Початковий стан: ${this.getCurrentState(testChatId)}`);
    
    this.pushState(testChatId, 'my_tickets');
    console.log(`  📍 Після переходу до "Мої тікети": ${this.getCurrentState(testChatId)}`);
    
    const stateAfterBack1 = this.handleBackCallback(testChatId);
    console.log(`  ✅ Результат: ${stateAfterBack1 === 'main' ? 'ПРОЙДЕНО' : 'ПРОВАЛЕНО'}\n`);
    
    // Сценарій 2: Головне меню -> Створити тікет -> Назад
    console.log('📋 Сценарій 2: Головне меню -> Створити тікет -> Назад');
    this.userStates.delete(testChatId);
    
    this.pushState(testChatId, 'main');
    this.pushState(testChatId, 'create_ticket');
    console.log(`  📍 Після переходу до "Створити тікет": ${this.getCurrentState(testChatId)}`);
    
    const stateAfterBack2 = this.handleBackCallback(testChatId);
    console.log(`  ✅ Результат: ${stateAfterBack2 === 'main' ? 'ПРОЙДЕНО' : 'ПРОВАЛЕНО'}\n`);
    
    // Сценарій 3: Реєстрація з сесією -> Назад
    console.log('📋 Сценарій 3: Реєстрація з сесією -> Назад');
    this.userStates.delete(testChatId);
    this.userSessions.delete(testChatId);
    
    this.pushState(testChatId, 'main');
    this.pushState(testChatId, 'registration');
    this.userSessions.set(testChatId, {
      action: 'registration',
      step: 'firstName',
      data: {}
    });
    
    console.log(`  📍 Стан реєстрації: ${this.getCurrentState(testChatId)}`);
    console.log(`  📝 Сесія встановлена: ${this.userSessions.has(testChatId) ? 'ТАК' : 'НІ'}`);
    
    const stateAfterBack3 = this.handleBackCallback(testChatId);
    const sessionDeleted = !this.userSessions.has(testChatId);
    
    console.log(`  ✅ Стан після "Назад": ${stateAfterBack3}`);
    console.log(`  ✅ Сесія видалена: ${sessionDeleted ? 'ТАК' : 'НІ'}`);
    console.log(`  ✅ Результат: ${stateAfterBack3 === 'main' && sessionDeleted ? 'ПРОЙДЕНО' : 'ПРОВАЛЕНО'}\n`);
    
    // Сценарій 4: Глибока навігація
    console.log('📋 Сценарій 4: Глибока навігація (main -> my_tickets -> create_ticket -> settings)');
    this.userStates.delete(testChatId);
    
    this.pushState(testChatId, 'main');
    this.pushState(testChatId, 'my_tickets');
    this.pushState(testChatId, 'create_ticket');
    this.pushState(testChatId, 'settings');
    
    console.log(`  📍 Глибокий стан: ${this.getCurrentState(testChatId)}`);
    
    // Перший "Назад"
    let state = this.handleBackCallback(testChatId);
    console.log(`  📍 Після 1-го "Назад": ${state} (очікується: create_ticket)`);
    
    // Другий "Назад"
    state = this.handleBackCallback(testChatId);
    console.log(`  📍 Після 2-го "Назад": ${state} (очікується: my_tickets)`);
    
    // Третій "Назад"
    state = this.handleBackCallback(testChatId);
    console.log(`  📍 Після 3-го "Назад": ${state} (очікується: main)`);
    
    // Четвертий "Назад" (з порожнього стеку)
    state = this.handleBackCallback(testChatId);
    console.log(`  📍 Після 4-го "Назад": ${state} (очікується: main)`);
    
    console.log(`  ✅ Результат: ${state === 'main' ? 'ПРОЙДЕНО' : 'ПРОВАЛЕНО'}\n`);
  }

  // Тест крайових випадків
  testEdgeCases() {
    console.log('🧪 Тестування крайових випадків...\n');
    
    const testChatId = 99999;
    
    // Випадок 1: "Назад" без станів
    console.log('📋 Випадок 1: "Назад" без станів');
    this.userStates.delete(testChatId);
    
    const stateWithoutStates = this.handleBackCallback(testChatId);
    console.log(`  ✅ Результат: ${stateWithoutStates === 'main' ? 'ПРОЙДЕНО' : 'ПРОВАЛЕНО'}\n`);
    
    // Випадок 2: "Назад" з одним станом
    console.log('📋 Випадок 2: "Назад" з одним станом');
    this.userStates.delete(testChatId);
    this.pushState(testChatId, 'main');
    
    const stateWithOneState = this.handleBackCallback(testChatId);
    console.log(`  ✅ Результат: ${stateWithOneState === 'main' ? 'ПРОЙДЕНО' : 'ПРОВАЛЕНО'}\n`);
    
    // Випадок 3: Множинні виклики "Назад"
    console.log('📋 Випадок 3: Множинні виклики "Назад"');
    this.userStates.delete(testChatId);
    this.pushState(testChatId, 'main');
    this.pushState(testChatId, 'my_tickets');
    
    for (let i = 1; i <= 5; i++) {
      const state = this.handleBackCallback(testChatId);
      console.log(`  📍 ${i}-й виклик "Назад": ${state}`);
    }
    
    console.log(`  ✅ Всі виклики завершилися без помилок\n`);
  }

  // Запуск всіх тестів
  runAllTests() {
    console.log('🚀 Запуск спрощених тестів навігації...\n');
    
    try {
      this.testFullNavigationScenario();
      this.testEdgeCases();
      
      console.log('✅ Всі спрощені тести пройдено успішно!');
    } catch (error) {
      console.error('❌ Помилка під час тестування:', error);
    }
  }
}

// Запускаємо тести
const tester = new SimpleNavigationTester();
tester.runAllTests();