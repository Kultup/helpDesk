require('../config/env');
const mongoose = require('mongoose');
const User = require('../models/User');

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk')
  .then(async function () {
    const count = await User.countDocuments({
      telegramId: { $exists: true, $ne: null },
      isActive: true,
    });
    const all = await User.countDocuments({ telegramId: { $exists: true, $ne: null } });
    console.log('active:', count, 'total with telegramId:', all);
    const sample = await User.findOne({ telegramId: { $exists: true, $ne: null } }).select(
      'firstName lastName email telegramId isActive'
    );
    console.log('sample:', JSON.stringify(sample));
    mongoose.disconnect();
  })
  .catch(function (e) {
    console.error(e.message);
    process.exit(1);
  });
