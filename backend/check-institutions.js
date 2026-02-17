/* eslint-disable no-console */
const mongoose = require('mongoose');
require('dotenv').config();

const checkInstitutions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Підключено до MongoDB');

    const Institution = mongoose.model('Institution', new mongoose.Schema({}, { strict: false }));

    // Перевіряємо всі заклади
    const allInstitutions = await Institution.find({}).limit(10);
    console.log('\n📊 Всього закладів в БД:', await Institution.countDocuments());

    console.log('\n🏢 Перші 10 закладів:');
    allInstitutions.forEach(inst => {
      console.log(`  - ${inst.name}`);
      console.log(`    ID: ${inst._id}`);
      console.log(`    Місто ID: ${inst.address?.city || 'немає'}`);
      console.log('');
    });

    // Перевіряємо заклади для Києва
    const kyivCityId = '69109e4b44ae9716751a87b8';
    console.log(`\n🔍 Пошук закладів для міста ID: ${kyivCityId}`);
    const kyivInstitutions = await Institution.find({ 'address.city': kyivCityId });
    console.log(`📍 Знайдено ${kyivInstitutions.length} закладів для Києва`);
    kyivInstitutions.forEach(inst => {
      console.log(`  - ${inst.name}`);
    });

    // Перевіряємо заклади для Львова
    const lvivCityId = '694056d1507c5445a7c4735a';
    console.log(`\n🔍 Пошук закладів для міста ID: ${lvivCityId}`);
    const lvivInstitutions = await Institution.find({ 'address.city': lvivCityId });
    console.log(`📍 Знайдено ${lvivInstitutions.length} закладів для Львова`);
    lvivInstitutions.forEach(inst => {
      console.log(`  - ${inst.name}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Відключено від MongoDB');
  } catch (error) {
    console.error('❌ Помилка:', error);
  }
  process.exit(0);
};

checkInstitutions();
