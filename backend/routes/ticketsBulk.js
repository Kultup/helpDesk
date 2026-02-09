const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const { authenticateToken, requirePermission, logUserAction } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

/**
 * @route   POST /api/tickets/bulk/close
 * @desc    Масове закриття тікетів
 * @access  Private (Admin only)
 */
router.post('/bulk/close',
    authenticateToken,
    requirePermission('manage_tickets'),
    [
        body('ticketIds')
            .isArray({ min: 1 })
            .withMessage('ticketIds повинен бути непустим масивом'),
        body('ticketIds.*')
            .isMongoId()
            .withMessage('Кожен ID тікету повинен бути валідним')
    ],
    logUserAction('масово закрив тікети'),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Помилки валідації',
                    errors: errors.array()
                });
            }

            const { ticketIds } = req.body;

            // Оновлюємо статус всіх тікетів
            const result = await Ticket.updateMany(
                { _id: { $in: ticketIds }, status: { $ne: 'closed' } },
                {
                    $set: {
                        status: 'closed',
                        closedAt: new Date()
                    }
                }
            );

            logger.info(`✅ Масово закрито ${result.modifiedCount} тікетів`);

            res.json({
                success: true,
                message: `Успішно закрито ${result.modifiedCount} тікетів`,
                data: {
                    modifiedCount: result.modifiedCount
                }
            });
        } catch (error) {
            logger.error('Помилка масового закриття тікетів:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера',
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/tickets/bulk/update-priority
 * @desc    Масова зміна пріоритету тікетів
 * @access  Private (Admin only)
 */
router.post('/bulk/update-priority',
    authenticateToken,
    requirePermission('manage_tickets'),
    [
        body('ticketIds')
            .isArray({ min: 1 })
            .withMessage('ticketIds повинен бути непустим масивом'),
        body('ticketIds.*')
            .isMongoId()
            .withMessage('Кожен ID тікету повинен бути валідним'),
        body('priority')
            .isIn(['low', 'medium', 'high', 'urgent'])
            .withMessage('Невалідний пріоритет')
    ],
    logUserAction('масово змінив пріоритет тікетів'),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Помилки валідації',
                    errors: errors.array()
                });
            }

            const { ticketIds, priority } = req.body;

            const result = await Ticket.updateMany(
                { _id: { $in: ticketIds } },
                { $set: { priority } }
            );

            logger.info(`✅ Масово змінено пріоритет ${result.modifiedCount} тікетів на ${priority}`);

            res.json({
                success: true,
                message: `Успішно змінено пріоритет ${result.modifiedCount} тікетів`,
                data: {
                    modifiedCount: result.modifiedCount,
                    priority
                }
            });
        } catch (error) {
            logger.error('Помилка масової зміни пріоритету:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера',
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/tickets/bulk/update-status
 * @desc    Масова зміна статусу тікетів
 * @access  Private (Admin only)
 */
router.post('/bulk/update-status',
    authenticateToken,
    requirePermission('manage_tickets'),
    [
        body('ticketIds')
            .isArray({ min: 1 })
            .withMessage('ticketIds повинен бути непустим масивом'),
        body('ticketIds.*')
            .isMongoId()
            .withMessage('Кожен ID тікету повинен бути валідним'),
        body('status')
            .isIn(['open', 'in_progress', 'resolved', 'closed', 'cancelled'])
            .withMessage('Невалідний статус')
    ],
    logUserAction('масово змінив статус тікетів'),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Помилки валідації',
                    errors: errors.array()
                });
            }

            const { ticketIds, status } = req.body;

            const updateData = { status };

            // Додаємо відповідні часові мітки
            if (status === 'resolved') {
                updateData.resolvedAt = new Date();
            } else if (status === 'closed') {
                updateData.closedAt = new Date();
            }

            const result = await Ticket.updateMany(
                { _id: { $in: ticketIds } },
                { $set: updateData }
            );

            logger.info(`✅ Масово змінено статус ${result.modifiedCount} тікетів на ${status}`);

            res.json({
                success: true,
                message: `Успішно змінено статус ${result.modifiedCount} тікетів`,
                data: {
                    modifiedCount: result.modifiedCount,
                    status
                }
            });
        } catch (error) {
            logger.error('Помилка масової зміни статусу:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера',
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/tickets/bulk/add-tags
 * @desc    Масове додавання тегів до тікетів
 * @access  Private (Admin only)
 */
router.post('/bulk/add-tags',
    authenticateToken,
    requirePermission('manage_tickets'),
    [
        body('ticketIds')
            .isArray({ min: 1 })
            .withMessage('ticketIds повинен бути непустим масивом'),
        body('ticketIds.*')
            .isMongoId()
            .withMessage('Кожен ID тікету повинен бути валідним'),
        body('tags')
            .isArray({ min: 1 })
            .withMessage('tags повинен бути непустим масивом'),
        body('tags.*')
            .isMongoId()
            .withMessage('Кожен ID тегу повинен бути валідним')
    ],
    logUserAction('масово додав теги до тікетів'),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Помилки валідації',
                    errors: errors.array()
                });
            }

            const { ticketIds, tags } = req.body;

            const result = await Ticket.updateMany(
                { _id: { $in: ticketIds } },
                { $addToSet: { tags: { $each: tags } } }
            );

            logger.info(`✅ Масово додано теги до ${result.modifiedCount} тікетів`);

            res.json({
                success: true,
                message: `Успішно додано теги до ${result.modifiedCount} тікетів`,
                data: {
                    modifiedCount: result.modifiedCount,
                    tagsAdded: tags.length
                }
            });
        } catch (error) {
            logger.error('Помилка масового додавання тегів:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера',
                error: error.message
            });
        }
    }
);

/**
 * @route   POST /api/tickets/bulk/assign
 * @desc    Масове призначення тікетів адміністратору
 * @access  Private (Admin only)
 */
router.post('/bulk/assign',
    authenticateToken,
    requirePermission('manage_tickets'),
    [
        body('ticketIds')
            .isArray({ min: 1 })
            .withMessage('ticketIds повинен бути непустим масивом'),
        body('ticketIds.*')
            .isMongoId()
            .withMessage('Кожен ID тікету повинен бути валідним'),
        body('assignedTo')
            .isMongoId()
            .withMessage('assignedTo повинен бути валідним ID користувача')
    ],
    logUserAction('масово призначив тікети'),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Помилки валідації',
                    errors: errors.array()
                });
            }

            const { ticketIds, assignedTo } = req.body;

            // Перевіряємо чи існує користувач
            const User = require('../models/User');
            const user = await User.findById(assignedTo);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Користувача не знайдено'
                });
            }

            const result = await Ticket.updateMany(
                { _id: { $in: ticketIds } },
                {
                    $set: {
                        assignedTo,
                        assignedAt: new Date()
                    }
                }
            );

            logger.info(`✅ Масово призначено ${result.modifiedCount} тікетів користувачу ${user.email}`);

            res.json({
                success: true,
                message: `Успішно призначено ${result.modifiedCount} тікетів`,
                data: {
                    modifiedCount: result.modifiedCount,
                    assignedTo: {
                        id: user._id,
                        name: `${user.firstName} ${user.lastName}`,
                        email: user.email
                    }
                }
            });
        } catch (error) {
            logger.error('Помилка масового призначення:', error);
            res.status(500).json({
                success: false,
                message: 'Помилка сервера',
                error: error.message
            });
        }
    }
);

module.exports = router;
