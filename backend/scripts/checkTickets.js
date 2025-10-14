const mongoose = require('mongoose');
require('dotenv').config();

// Підключаємо всі моделі
require('../models');

async function checkTickets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Підключено до MongoDB');

    const Ticket = require('../models/Ticket');
    const tickets = await Ticket.find().populate('createdBy', 'name email').limit(5);
    
    console.log('\n📋 Існуючі тікети:');
    if (tickets.length === 0) {
      console.log('Тікетів не знайдено');
    } else {
      tickets.forEach(t => {
        console.log(`ID: ${t._id}, Назва: ${t.title}, Статус: ${t.status}, Автор: ${t.createdBy?.email || 'N/A'}`);
      });
    }

    // Перевіряємо існуючі оцінки
    const Rating = require('../models/Rating');
    const ratings = await Rating.find().populate('ticket', 'title').populate('user', 'email').limit(5);
    
    console.log('\n⭐ Існуючі оцінки:');
    if (ratings.length === 0) {
      console.log('Оцінок не знайдено');
    } else {
      ratings.forEach(r => {
        console.log(`Тікет: ${r.ticket?.title || 'N/A'}, Оцінка: ${r.rating || 'N/A'}, Користувач: ${r.user?.email || 'N/A'}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Помилка:', error);
    process.exit(1);
  }
}

checkTickets();