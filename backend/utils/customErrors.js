/**
 * Власні класи помилок для кращої обробки та логування
 */

/**
 * Помилка AI сервісу (Groq/OpenAI)
 */
class AIServiceError extends Error {
    constructor(message, originalError = null, context = {}) {
        super(message);
        this.name = 'AIServiceError';
        this.originalError = originalError;
        this.context = context;
        this.timestamp = new Date();

        // Зберігаємо stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AIServiceError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            context: this.context,
            timestamp: this.timestamp,
            originalError: this.originalError ? {
                message: this.originalError.message,
                name: this.originalError.name
            } : null
        };
    }
}

/**
 * Помилка створення тікета
 */
class TicketCreationError extends Error {
    constructor(message, ticketData = null, originalError = null) {
        super(message);
        this.name = 'TicketCreationError';
        this.ticketData = ticketData;
        this.originalError = originalError;
        this.timestamp = new Date();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TicketCreationError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            ticketData: this.ticketData,
            timestamp: this.timestamp,
            originalError: this.originalError ? {
                message: this.originalError.message,
                name: this.originalError.name
            } : null
        };
    }
}

/**
 * Помилка валідації
 */
class ValidationError extends Error {
    constructor(message, field = null, value = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.value = value;
        this.timestamp = new Date();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ValidationError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            field: this.field,
            value: this.value,
            timestamp: this.timestamp
        };
    }
}

/**
 * Помилка сесії
 */
class SessionError extends Error {
    constructor(message, chatId = null, sessionData = null) {
        super(message);
        this.name = 'SessionError';
        this.chatId = chatId;
        this.sessionData = sessionData;
        this.timestamp = new Date();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, SessionError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            chatId: this.chatId,
            timestamp: this.timestamp
        };
    }
}

/**
 * Помилка Telegram API
 */
class TelegramAPIError extends Error {
    constructor(message, method = null, params = null, originalError = null) {
        super(message);
        this.name = 'TelegramAPIError';
        this.method = method;
        this.params = params;
        this.originalError = originalError;
        this.timestamp = new Date();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TelegramAPIError);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            method: this.method,
            params: this.params,
            timestamp: this.timestamp,
            originalError: this.originalError ? {
                message: this.originalError.message,
                name: this.originalError.name
            } : null
        };
    }
}

module.exports = {
    AIServiceError,
    TicketCreationError,
    ValidationError,
    SessionError,
    TelegramAPIError
};
