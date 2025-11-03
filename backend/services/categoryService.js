const mongoose = require('mongoose');
const Category = require('../models/Category');
const Ticket = require('../models/Ticket');
const { AppError } = require('../middleware/errorHandler');

const CATEGORY_MAPPING = {
  'Технічні': 'technical',
  'Акаунт': 'account',
  'Фінанси': 'billing',
  'Загальні': 'general'
};

const ensureObjectId = (id, message = 'Невірний ідентифікатор') => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(message, 400);
  }
};

const list = async ({ includeInactive = false } = {}) => {
  const filter = includeInactive ? {} : { isActive: true };

  return Category.find(filter)
    .populate('createdBy', 'firstName lastName email')
    .sort({ sortOrder: 1, name: 1 });
};

const getById = async (id) => {
  ensureObjectId(id, 'Невірний ID категорії');

  const category = await Category.findById(id)
    .populate('createdBy', 'firstName lastName email');

  if (!category) {
    throw new AppError('Категорію не знайдено', 404);
  }

  return category;
};

const create = async ({ payload, createdBy }) => {
  const { name } = payload;

  const existingCategory = await Category.findByName(name);
  if (existingCategory) {
    throw new AppError('Категорія з такою назвою вже існує', 400);
  }

  const category = new Category({
    ...payload,
    createdBy
  });

  await category.save();
  await category.populate('createdBy', 'firstName lastName email');

  return category;
};

const update = async ({ id, payload }) => {
  ensureObjectId(id, 'Невірний ID категорії');

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Категорію не знайдено', 404);
  }

  const { name } = payload;
  if (name && name !== category.name) {
    const existingCategory = await Category.findByName(name);
    if (existingCategory) {
      throw new AppError('Категорія з такою назвою вже існує', 400);
    }
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      category[key] = value;
    }
  });

  await category.save();
  await category.populate('createdBy', 'firstName lastName email');

  return category;
};

const remove = async (id) => {
  ensureObjectId(id, 'Невірний ID категорії');

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Категорію не знайдено', 404);
  }

  let ticketsCount = await Ticket.countDocuments({
    category: category._id,
    isDeleted: false
  });

  if (ticketsCount === 0) {
    const categoryKey = CATEGORY_MAPPING[category.name] || category.name.toLowerCase();

    try {
      ticketsCount = await Ticket.countDocuments({
        category: categoryKey,
        isDeleted: false
      });
    } catch (error) {
      // Ігноруємо помилки касту для строкових legacy значень
      if (error.name !== 'CastError') {
        throw error;
      }
    }
  }

  if (ticketsCount > 0) {
    throw new AppError(
      `Неможливо видалити категорію. Вона використовується в ${ticketsCount} тікетах. Спочатку деактивуйте категорію або перенесіть тікети в іншу категорію.`,
      400
    );
  }

  await Category.findByIdAndDelete(id);
};

const deactivate = async (id) => {
  ensureObjectId(id, 'Невірний ID категорії');

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Категорію не знайдено', 404);
  }

  await category.deactivate();
  await category.populate('createdBy', 'firstName lastName email');

  return category;
};

const activate = async (id) => {
  ensureObjectId(id, 'Невірний ID категорії');

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Категорію не знайдено', 404);
  }

  await category.activate();
  await category.populate('createdBy', 'firstName lastName email');

  return category;
};

const getStats = async () => {
  return Ticket.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: '$category',
        totalTickets: { $sum: 1 },
        openTickets: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
        inProgressTickets: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        resolvedTickets: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        closedTickets: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } }
      }
    },
    { $sort: { totalTickets: -1 } }
  ]);
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  deactivate,
  activate,
  getStats
};
