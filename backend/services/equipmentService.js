const ExcelJS = require('exceljs');
const Equipment = require('../models/Equipment');
const City = require('../models/City');
const Institution = require('../models/Institution');
const logger = require('../utils/logger');
const fs = require('fs');

class EquipmentService {
  /**
   * Масовий імпорт обладнання з Excel файлу
   * @param {string} filePath - Шлях до файлу
   * @param {Object} user - Користувач, який виконує імпорт
   * @returns {Promise<Object>} Статистика імпорту
   */
  async importEquipment(filePath, user) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error('Невірний формат файлу або пустий лист');
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [],
      };

      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          return;
        }
        rows.push({ row, rowNumber });
      });

      const cities = await City.find().lean();
      const institutions = await Institution.find().lean();

      const cityMap = new Map(cities.map(c => [c.name.toLowerCase(), c._id]));
      const institutionMap = new Map(institutions.map(i => [i.name.toLowerCase(), i._id]));

      for (const { row, rowNumber } of rows) {
        try {
          const rowData = {
            name: row.getCell(1).text,
            type: row.getCell(2).text,
            brand: row.getCell(3).text,
            model: row.getCell(4).text,
            serialNumber: row.getCell(5).text,
            inventoryNumber: row.getCell(6).text,
            cityName: row.getCell(7).text,
            institutionName: row.getCell(8).text,
            location: row.getCell(9).text,
            status: row.getCell(10).text,
            purchaseDate: row.getCell(11).text,
            notes: row.getCell(12).text,
          };

          if (!rowData.name || !rowData.type || !rowData.status) {
            throw new Error("Відсутні обов'язкові поля (Назва, Тип, Статус)");
          }

          const allowedTypes = [
            'computer',
            'printer',
            'phone',
            'monitor',
            'router',
            'switch',
            'ups',
            'other',
          ];
          const allowedStatuses = ['working', 'not_working', 'new', 'used'];

          if (!allowedTypes.includes(rowData.type)) {
            throw new Error(`Невірний тип: ${rowData.type}`);
          }
          if (!allowedStatuses.includes(rowData.status)) {
            throw new Error(`Невірний статус: ${rowData.status}`);
          }

          let cityId = null;
          let institutionId = null;

          if (rowData.cityName) {
            cityId = cityMap.get(rowData.cityName.toLowerCase());
          }

          if (rowData.institutionName) {
            institutionId = institutionMap.get(rowData.institutionName.toLowerCase());
          }

          const equipmentData = {
            name: rowData.name,
            type: rowData.type,
            brand: rowData.brand,
            model: rowData.model,
            serialNumber: rowData.serialNumber,
            city: cityId,
            institution: institutionId,
            location: rowData.location,
            status: rowData.status,
            notes: rowData.notes,
            createdBy: user._id,
            updatedBy: user._id,
          };

          if (rowData.inventoryNumber) {
            equipmentData.inventoryNumber = rowData.inventoryNumber;
          }

          if (rowData.purchaseDate) {
            const date = new Date(rowData.purchaseDate);
            if (!isNaN(date.getTime())) {
              equipmentData.purchaseDate = date;
            }
          }

          Object.keys(equipmentData).forEach(key => {
            if (
              equipmentData[key] === '' ||
              equipmentData[key] === null ||
              equipmentData[key] === undefined
            ) {
              delete equipmentData[key];
            }
          });

          const equipment = new Equipment(equipmentData);
          await equipment.save();
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push(`Рядок ${rowNumber}: ${err.message}`);
        }
      }

      // Видаляємо файл після успішної або частково успішної обробки
      fs.unlink(filePath, err => {
        if (err) {
          logger.error('Помилка видалення тимчасового файлу імпорту:', err);
        }
      });

      return results;
    } catch (error) {
      logger.error('Помилка сервісу масового імпорту:', error);
      // Спробуємо видалити файл у разі критичної помилки
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        // Ignore error during cleanup
      }
      throw error;
    }
  }
}

module.exports = new EquipmentService();
