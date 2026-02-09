const logger = require('../utils/logger');

/**
 * Сервіс для роботи з робочими годинами (Business Hours)
 * Використовується для точного розрахунку SLA
 */
class BusinessHoursService {
    constructor() {
        // Налаштування робочих годин (можна винести в Settings)
        this.workingHours = {
            start: 9,  // 09:00
            end: 18,   // 18:00
            timezone: 'Europe/Kiev'
        };

        // Робочі дні (1 = понеділок, 5 = п'ятниця)
        this.workingDays = [1, 2, 3, 4, 5];

        // Святкові дні (формат: 'MM-DD')
        this.holidays = [
            '01-01', // Новий рік
            '01-07', // Різдво
            '03-08', // 8 березня
            '05-01', // День праці
            '05-09', // День перемоги
            '06-28', // День Конституції
            '08-24', // День незалежності
            '10-14', // День захисника
            '12-25', // Католицьке Різдво
        ];
    }

    /**
     * Перевірка чи дата є робочим днем
     * @param {Date} date - Дата для перевірки
     * @returns {boolean}
     */
    isWorkingDay(date) {
        const dayOfWeek = date.getDay();

        // Перевірка вихідних (0 = неділя, 6 = субота)
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return false;
        }

        // Перевірка святкових днів
        const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (this.holidays.includes(monthDay)) {
            return false;
        }

        return true;
    }

    /**
     * Перевірка чи час знаходиться в робочих годинах
     * @param {Date} date - Дата/час для перевірки
     * @returns {boolean}
     */
    isWorkingHours(date) {
        const hour = date.getHours();
        return hour >= this.workingHours.start && hour < this.workingHours.end;
    }

    /**
     * Отримати наступний робочий час
     * @param {Date} date - Поточна дата
     * @returns {Date} Наступний робочий час
     */
    getNextWorkingTime(date) {
        const result = new Date(date);

        // Якщо поточний час в робочих годинах - повертаємо як є
        if (this.isWorkingDay(result) && this.isWorkingHours(result)) {
            return result;
        }

        // Якщо після робочих годин - переходимо на наступний день
        if (result.getHours() >= this.workingHours.end) {
            result.setDate(result.getDate() + 1);
            result.setHours(this.workingHours.start, 0, 0, 0);
        } else if (result.getHours() < this.workingHours.start) {
            // Якщо до робочих годин - встановлюємо початок робочого дня
            result.setHours(this.workingHours.start, 0, 0, 0);
        }

        // Пропускаємо вихідні та святкові дні
        while (!this.isWorkingDay(result)) {
            result.setDate(result.getDate() + 1);
            result.setHours(this.workingHours.start, 0, 0, 0);
        }

        return result;
    }

    /**
     * Розрахунок робочих годин між двома датами
     * @param {Date} startDate - Початкова дата
     * @param {Date} endDate - Кінцева дата
     * @returns {number} Кількість робочих годин
     */
    calculateWorkingHours(startDate, endDate) {
        let current = new Date(startDate);
        let totalHours = 0;
        const end = new Date(endDate);

        while (current < end) {
            if (this.isWorkingDay(current)) {
                const currentHour = current.getHours();

                if (currentHour >= this.workingHours.start && currentHour < this.workingHours.end) {
                    // Розраховуємо скільки хвилин в цій годині
                    const minutesInHour = 60;
                    const currentMinute = current.getMinutes();

                    // Перевіряємо чи кінцева дата в цій же годині
                    if (end.getFullYear() === current.getFullYear() &&
                        end.getMonth() === current.getMonth() &&
                        end.getDate() === current.getDate() &&
                        end.getHours() === currentHour) {
                        totalHours += (end.getMinutes() - currentMinute) / minutesInHour;
                        break;
                    } else {
                        totalHours += (minutesInHour - currentMinute) / minutesInHour;
                    }
                }
            }

            // Переходимо на наступну годину
            current.setHours(current.getHours() + 1, 0, 0, 0);
        }

        return Math.round(totalHours * 100) / 100; // Округлюємо до 2 знаків
    }

    /**
     * Додати робочі години до дати
     * @param {Date} startDate - Початкова дата
     * @param {number} hoursToAdd - Кількість робочих годин для додавання
     * @returns {Date} Результуюча дата
     */
    addWorkingHours(startDate, hoursToAdd) {
        let current = this.getNextWorkingTime(new Date(startDate));
        let remainingHours = hoursToAdd;

        while (remainingHours > 0) {
            if (this.isWorkingDay(current) && this.isWorkingHours(current)) {
                const hoursLeftInDay = this.workingHours.end - current.getHours();

                if (remainingHours <= hoursLeftInDay) {
                    // Всі години вміщуються в поточний день
                    current.setHours(current.getHours() + Math.floor(remainingHours));
                    const minutes = (remainingHours % 1) * 60;
                    current.setMinutes(current.getMinutes() + minutes);
                    remainingHours = 0;
                } else {
                    // Переходимо на наступний робочий день
                    remainingHours -= hoursLeftInDay;
                    current.setDate(current.getDate() + 1);
                    current.setHours(this.workingHours.start, 0, 0, 0);
                    current = this.getNextWorkingTime(current);
                }
            } else {
                current = this.getNextWorkingTime(current);
            }
        }

        return current;
    }

    /**
     * Отримати налаштування робочих годин
     * @returns {Object}
     */
    getSettings() {
        return {
            workingHours: this.workingHours,
            workingDays: this.workingDays,
            holidays: this.holidays
        };
    }

    /**
     * Оновити налаштування робочих годин
     * @param {Object} settings - Нові налаштування
     */
    updateSettings(settings) {
        if (settings.workingHours) {
            this.workingHours = { ...this.workingHours, ...settings.workingHours };
        }
        if (settings.workingDays) {
            this.workingDays = settings.workingDays;
        }
        if (settings.holidays) {
            this.holidays = settings.holidays;
        }
        logger.info('✅ Налаштування робочих годин оновлено');
    }
}

module.exports = new BusinessHoursService();
