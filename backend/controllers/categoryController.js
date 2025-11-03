const { validationResult } = require('express-validator');
const categoryService = require('../services/categoryService');
const { successResponse, createdResponse, deletedResponse } = require('../utils/response');
const { AppError, catchAsync } = require('../middleware/errorHandler');

const ensureValidRequest = (req) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    throw new AppError('Помилки валідації', 400, true);
  }
};

exports.getCategories = catchAsync(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const categories = await categoryService.list({ includeInactive });

  return successResponse(res, categories);
});

exports.getCategoryById = catchAsync(async (req, res) => {
  const category = await categoryService.getById(req.params.id);

  return successResponse(res, category);
});

exports.createCategory = catchAsync(async (req, res) => {
  ensureValidRequest(req);

  const category = await categoryService.create({
    payload: req.body,
    createdBy: req.user?._id
  });

  return createdResponse(res, category, 'Категорію успішно створено');
});

exports.updateCategory = catchAsync(async (req, res) => {
  ensureValidRequest(req);

  const category = await categoryService.update({
    id: req.params.id,
    payload: req.body
  });

  return successResponse(res, category, 'Категорію успішно оновлено');
});

exports.deleteCategory = catchAsync(async (req, res) => {
  await categoryService.remove(req.params.id);

  return deletedResponse(res, 'Категорію успішно видалено');
});

exports.deactivateCategory = catchAsync(async (req, res) => {
  const category = await categoryService.deactivate(req.params.id);

  return successResponse(res, category, 'Категорію успішно деактивовано');
});

exports.activateCategory = catchAsync(async (req, res) => {
  const category = await categoryService.activate(req.params.id);

  return successResponse(res, category, 'Категорію успішно активовано');
});

exports.getCategoryStats = catchAsync(async (req, res) => {
  const stats = await categoryService.getStats();

  return successResponse(res, stats);
});
