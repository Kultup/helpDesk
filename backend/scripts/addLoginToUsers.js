const mongoose = require('mongoose');
const User = require('../models/User');

async function addLoginToUsers() {
  try {
    console.log('Підключення до MongoDB...');
    
    // Підключення до MongoDB
    await mongoose.connect('mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Підключено до MongoDB');
    
    // Знаходимо всіх користувачів без поля login
    const usersWithoutLogin = await mongoose.connection.db.collection('users').find({
      $or: [
        { login: { $exists: false } },
        { login: null },
        { login: '' }
      ]
    }).toArray();
    
    console.log(`📊 Знайдено ${usersWithoutLogin.length} користувачів без логіну`);
    
    if (usersWithoutLogin.length === 0) {
      console.log('✅ Всі користувачі вже мають логін');
      return;
    }
    
    // Оновлюємо кожного користувача
    for (const user of usersWithoutLogin) {
      let login = '';
      
      // Якщо є email, створюємо логін з email (частина до @)
      if (user.email) {
        login = user.email.split('@')[0].toLowerCase();
        
        // Перевіряємо, чи такий логін вже існує
        const existingUser = await mongoose.connection.db.collection('users').findOne({
          login: login,
          _id: { $ne: user._id }
        });
        
        // Якщо логін вже існує, додаємо суфікс
        if (existingUser) {
          let counter = 1;
          let newLogin = `${login}${counter}`;
          
          while (await mongoose.connection.db.collection('users').findOne({ 
            login: newLogin,
            _id: { $ne: user._id }
          })) {
            counter++;
            newLogin = `${login}${counter}`;
          }
          
          login = newLogin;
        }
      } else {
        // Якщо немає email, створюємо логін з ID
        login = `user_${user._id.toString().substring(0, 8)}`;
      }
      
      // Оновлюємо користувача
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $set: { login: login } }
      );
      
      console.log(`✅ Оновлено користувача ${user.email || user._id}: login = ${login}`);
    }
    
    console.log('\n✅ Всі користувачі оновлено успішно!');
    
    // Перевіряємо результат
    const usersWithLogin = await mongoose.connection.db.collection('users').countDocuments({
      login: { $exists: true, $ne: null, $ne: '' }
    });
    
    console.log(`📊 Користувачів з логіном: ${usersWithLogin}`);
    
  } catch (error) {
    console.error('❌ Помилка:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Відключено від MongoDB');
  }
}

addLoginToUsers();

