const Joi = require('joi');

// Базові схеми валідації
const schemas = {
  // Валідація ID
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Невірний формат ID'),
  
  // Валідація email
  email: Joi.string().email().required().messages({
    'string.email': 'Невірний формат email',
    'any.required': 'Email є обов\'язковим'
  }),
  
  // Валідація пароля
  password: Joi.string().min(6).max(128).required().messages({
    'string.min': 'Пароль повинен містити мінімум 6 символів',
    'string.max': 'Пароль не може перевищувати 128 символів',
    'any.required': 'Пароль є обов\'язковим'
  }),
  
  // Валідація назви
  name: Joi.string().min(2).max(100).trim().required().messages({
    'string.min': 'Назва повинна містити мінімум 2 символи',
    'string.max': 'Назва не може перевищувати 100 символів',
    'any.required': 'Назва є обов\'язковою'
  }),
  
  // Валідація опису
  description: Joi.string().max(1000).trim().allow('').messages({
    'string.max': 'Опис не може перевищувати 1000 символів'
  }),
  
  // Валідація статусу тикету
  ticketStatus: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').messages({
    'any.only': 'Статус повинен бути одним з: open, in_progress, resolved, closed'
  }),
  
  // Валідація пріоритету
  priority: Joi.string().valid('low', 'medium', 'high').messages({
    'any.only': 'Пріоритет повинен бути одним з: low, medium, high'
  }),
  
  // Валідація ролі користувача
  userRole: Joi.string().valid('admin', 'user').messages({
    'any.only': 'Роль повинна бути admin або user'
  }),
  
  // Валідація пагінації
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('createdAt', '-createdAt', 'title', '-title', 'status', '-status').default('-createdAt')
  },
  
  // Валідація дат
  date: Joi.date().iso().messages({
    'date.format': 'Дата повинна бути в ISO форматі'
  }),
  
  // Валідація координат
  coordinates: {
    lat: Joi.number().min(-90).max(90).required().messages({
      'number.min': 'Широта повинна бути від -90 до 90',
      'number.max': 'Широта повинна бути від -90 до 90',
      'any.required': 'Широта є обов\'язковою'
    }),
    lng: Joi.number().min(-180).max(180).required().messages({
      'number.min': 'Довгота повинна бути від -180 до 180',
      'number.max': 'Довгота повинна бути від -180 до 180',
      'any.required': 'Довгота є обов\'язковою'
    })
  }
};

// Схеми для різних сутностей
const validationSchemas = {
  // Реєстрація користувача
  userRegister: Joi.object({
    email: schemas.email,
    password: schemas.password,
    firstName: schemas.name,
    lastName: schemas.name,
    position: schemas.objectId,
    city: schemas.objectId,
    telegramId: Joi.string().optional()
  }),
  
  // Логін користувача
  userLogin: Joi.object({
    email: schemas.email,
    password: schemas.password
  }),
  
  // Оновлення користувача
  userUpdate: Joi.object({
    firstName: schemas.name.optional(),
    lastName: schemas.name.optional(),
    position: schemas.objectId.optional(),
    city: schemas.objectId.optional(),
    role: schemas.userRole.optional(),
    telegramId: Joi.string().optional().allow('')
  }),
  
  // Зміна пароля
  changePassword: Joi.object({
    currentPassword: schemas.password,
    newPassword: schemas.password
  }),
  
  // Створення тикету
  ticketCreate: Joi.object({
    title: schemas.name,
    description: schemas.description.required(),
    priority: schemas.priority.default('medium'),
    city: schemas.objectId,
    assignedTo: schemas.objectId.optional(),
    category: Joi.string().max(50).optional()
  }),
  
  // Оновлення тикету
  ticketUpdate: Joi.object({
    title: schemas.name.optional(),
    description: schemas.description.optional(),
    status: schemas.ticketStatus.optional(),
    priority: schemas.priority.optional(),
    assignedTo: schemas.objectId.optional().allow(null),
    category: Joi.string().max(50).optional()
  }),
  
  // Створення міста
  cityCreate: Joi.object({
    name: schemas.name,
    region: schemas.name,
    coordinates: Joi.object(schemas.coordinates).optional()
  }),
  
  // Оновлення міста
  cityUpdate: Joi.object({
    name: schemas.name.optional(),
    region: schemas.name.optional(),
    coordinates: Joi.object(schemas.coordinates).optional()
  }),
  
  // Створення посади
  positionCreate: Joi.object({
    name: schemas.name,
    description: schemas.description.optional(),
    department: schemas.name.optional(),
    permissions: Joi.array().items(Joi.string()).optional()
  }),
  
  // Оновлення посади
  positionUpdate: Joi.object({
    name: schemas.name.optional(),
    description: schemas.description.optional(),
    department: schemas.name.optional(),
    permissions: Joi.array().items(Joi.string()).optional()
  }),
  
  // Коментар до тикету
  commentCreate: Joi.object({
    content: Joi.string().min(1).max(1000).required().messages({
      'string.min': 'Коментар не може бути порожнім',
      'string.max': 'Коментар не може перевищувати 1000 символів',
      'any.required': 'Коментар є обов\'язковим'
    }),
    isInternal: Joi.boolean().default(false)
  }),
  
  // Пошук та фільтрація
  search: Joi.object({
    q: Joi.string().max(100).optional(),
    status: schemas.ticketStatus.optional(),
    priority: schemas.priority.optional(),
    city: schemas.objectId.optional(),
    assignedTo: schemas.objectId.optional(),
    createdBy: schemas.objectId.optional(),
    dateFrom: schemas.date.optional(),
    dateTo: schemas.date.optional(),
    ...schemas.pagination
  }),
  
  // Експорт даних
  export: Joi.object({
    format: Joi.string().valid('csv', 'excel', 'json').default('csv'),
    dateFrom: schemas.date.optional(),
    dateTo: schemas.date.optional(),
    status: schemas.ticketStatus.optional(),
    city: schemas.objectId.optional()
  })
};

// Middleware для валідації
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Помилка валідації',
        errors
      });
    }
    
    req[property] = value;
    next();
  };
};

// Валідація параметрів URL
const validateParams = (schema) => validate(schema, 'params');

// Валідація query параметрів
const validateQuery = (schema) => validate(schema, 'query');

module.exports = {
  schemas,
  validationSchemas,
  validate,
  validateParams,
  validateQuery
};