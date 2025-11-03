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

module.exports = {
  successResponse,
  createdResponse,
  deletedResponse,
  paginatedResponse
};
