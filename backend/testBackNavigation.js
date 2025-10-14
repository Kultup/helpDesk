const TelegramService = require('./services/telegramService');

// Мокаємо бота для тестування
class MockBot {
  constructor() {
    this.messages = [];
  }

  async sendMessage(chatId, text, options = {}) {
    this.messages.push({
      chatId,
      text,
      options,
      timestamp: new Date()
    });
    console.log(`📤 Повідомлення до ${chatId}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
    return { message_id: Date.now() };
  }

  getLastMessage() {
    return this.messages[this.messages.length - 1];
  }

  clearMessages() {
    this.messages = [];
  }
}

async function testCompleteNavigation() {
  console.log('🧪 Повний тест навігації "Назад" у Telegram боті...\n');
  
  const telegramService = new TelegramService();
  const mockBot = new MockBot();
  
  // Замінюємо бота на мок
  telegramService.bot = mockBot;
  
  const testChatId = 123456789;
  const testUser = {
    _id: 'test_user_id',
    telegramId: testChatId,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    registrationStatus: 'approved',
    isActive: true,
    department: 'IT Department',
    city: { name: 'Київ' },
    position: { title: 'Developer' }
  };

  // Мокаємо функцію пошуку користувача
  telegramService.findUserByTelegramId = async (chatId) => {
    return testUser;
  };

  try {
    console.log('🔄 Тест 1: Основна навігація');
    console.log('═'.repeat(50));
    
    // Очищаємо стан
    telegramService.userStates.delete(testChatId);
    mockBot.clearMessages();
    
    // /start -> main
    await telegramService.handleStartCommand(testChatId);
    console.log('📍 Після /start:', telegramService.getCurrentState(testChatId));
    console.log('📚 Стек:', telegramService.userStates.get(testChatId));
    
    // main -> my_tickets
    await telegramService.handleCallbackQuery(testChatId, 'my_tickets', testUser, true);
    console.log('📍 Після my_tickets:', telegramService.getCurrentState(testChatId));
    console.log('📚 Стек:', telegramService.userStates.get(testChatId));
    
    // my_tickets -> back -> main
    mockBot.clearMessages();
    await telegramService.handleCallbackQuery(testChatId, 'back', testUser, true);
    console.log('📍 Після back:', telegramService.getCurrentState(testChatId));
    console.log('📚 Стек:', telegramService.userStates.get(testChatId));
    
    const lastMessage = mockBot.getLastMessage();
    const test1Result = lastMessage && lastMessage.text.includes('Вітаємо');
    console.log(test1Result ? '✅ Тест 1 ПРОЙДЕНО' : '❌ Тест 1 ПРОВАЛЕНО');
    console.log('');

    console.log('🔄 Тест 2: Глибока навігація');
    console.log('═'.repeat(50));
    
    // Очищаємо стан
    telegramService.userStates.delete(testChatId);
    
    // main -> my_tickets -> create_ticket -> settings
    await telegramService.handleStartCommand(testChatId);
    await telegramService.handleCallbackQuery(testChatId, 'my_tickets', testUser, true);
    await telegramService.handleCallbackQuery(testChatId, 'create_ticket', testUser, true);
    await telegramService.handleCallbackQuery(testChatId, 'settings', testUser, true);
    
    console.log('📚 Стек після навігації:', telegramService.userStates.get(testChatId));
    
    // settings -> back -> create_ticket
    await telegramService.handleCallbackQuery(testChatId, 'back', testUser, true);
    const state1 = telegramService.getCurrentState(testChatId);
    console.log('📍 Після 1-го back:', state1);
    
    // create_ticket -> back -> my_tickets
    await telegramService.handleCallbackQuery(testChatId, 'back', testUser, true);
    const state2 = telegramService.getCurrentState(testChatId);
    console.log('📍 Після 2-го back:', state2);
    
    // my_tickets -> back -> main
    mockBot.clearMessages();
    await telegramService.handleCallbackQuery(testChatId, 'back', testUser, true);
    const state3 = telegramService.getCurrentState(testChatId);
    console.log('📍 Після 3-го back:', state3);
    
    const finalMessage = mockBot.getLastMessage();
    const test2Result = state1 === 'create_ticket' && state2 === 'my_tickets' && 
                       state3 === 'main' && finalMessage && finalMessage.text.includes('Вітаємо');
    console.log(test2Result ? '✅ Тест 2 ПРОЙДЕНО' : '❌ Тест 2 ПРОВАЛЕНО');
    console.log('');

    console.log('🔄 Тест 3: Перевірка дублікатів');
    console.log('═'.repeat(50));
    
    // Очищаємо стан
    telegramService.userStates.delete(testChatId);
    
    // main -> my_tickets -> my_tickets (повторний перехід)
    await telegramService.handleStartCommand(testChatId);
    await telegramService.handleCallbackQuery(testChatId, 'my_tickets', testUser, true);
    console.log('📚 Стек після 1-го my_tickets:', telegramService.userStates.get(testChatId));
    
    await telegramService.handleCallbackQuery(testChatId, 'my_tickets', testUser, true);
    console.log('📚 Стек після 2-го my_tickets:', telegramService.userStates.get(testChatId));
    
    const stack = telegramService.userStates.get(testChatId);
    const test3Result = stack.length === 2 && stack[0] === 'main' && stack[1] === 'my_tickets';
    console.log(test3Result ? '✅ Тест 3 ПРОЙДЕНО (дублікати не додаються)' : '❌ Тест 3 ПРОВАЛЕНО');
    console.log('');

    console.log('🔄 Тест 4: Навігація з порожнім стеком');
    console.log('═'.repeat(50));
    
    // Очищаємо стан повністю
    telegramService.userStates.delete(testChatId);
    
    // Спробуємо натиснути "Назад" без попереднього стану
    mockBot.clearMessages();
    await telegramService.handleCallbackQuery(testChatId, 'back', testUser, true);
    const emptyStackState = telegramService.getCurrentState(testChatId);
    console.log('📍 Стан після back з порожнім стеком:', emptyStackState);
    
    const test4Result = emptyStackState === 'main';
    console.log(test4Result ? '✅ Тест 4 ПРОЙДЕНО' : '❌ Тест 4 ПРОВАЛЕНО');
    console.log('');

    // Підсумок
    console.log('📊 ПІДСУМОК ТЕСТУВАННЯ');
    console.log('═'.repeat(50));
    const allTestsPassed = test1Result && test2Result && test3Result && test4Result;
    
    if (allTestsPassed) {
      console.log('🎉 ВСІ ТЕСТИ ПРОЙДЕНО УСПІШНО!');
      console.log('✅ Основна навігація працює');
      console.log('✅ Глибока навігація працює');
      console.log('✅ Дублікати не додаються');
      console.log('✅ Обробка порожнього стеку працює');
    } else {
      console.log('❌ ДЕЯКІ ТЕСТИ ПРОВАЛЕНО');
      console.log(`${test1Result ? '✅' : '❌'} Основна навігація`);
      console.log(`${test2Result ? '✅' : '❌'} Глибока навігація`);
      console.log(`${test3Result ? '✅' : '❌'} Перевірка дублікатів`);
      console.log(`${test4Result ? '✅' : '❌'} Порожній стек`);
    }

  } catch (error) {
    console.error('❌ Помилка під час тестування:', error);
  }
}

// Запускаємо тест
testCompleteNavigation();