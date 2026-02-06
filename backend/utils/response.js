const buildEnvelope = ({ success = true, message = 'Операція виконана успішно', data = null, meta }) => {
  const payload = { success, message };

  if (data !== undefined) {
    payload.data = data;
  }

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return payload;
};

const successResponse = (res, data, message = 'Операція виконана успішно', statusCode = 200, meta) => {
  return res.status(statusCode).json(buildEnvelope({ success: true, message, data, meta }));
};

const createdResponse = (res, data, message = 'Ресурс успішно створено') => {
  return successResponse(res, data, message, 201);
};

const deletedResponse = (res, message = 'Ресурс успішно видалено') => {
  return successResponse(res, null, message, 200);
};

const paginatedResponse = (res, data, pagination, message = 'Операція виконана успішно') => {
  return successResponse(res, data, message, 200, { pagination });
};

// Додаткові alias-функції для зручності
const sendSuccess = (res, data, statusCode = 200, message = 'Операція виконана успішно') => {
  return res.status(statusCode).json(buildEnvelope({ success: true, message, data }));
};

const sendError = (res, message = 'Помилка виконання операції', statusCode = 500, error = null) => {
  const payload = buildEnvelope({ success: false, message, data: null });
  if (error) {
    payload.error = error;
  }
  return res.status(statusCode).json(payload);
};

module.exports = {
  successResponse,
  createdResponse,
  deletedResponse,
  paginatedResponse,
  sendSuccess,
  sendError
};
