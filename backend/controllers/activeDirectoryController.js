const activeDirectoryService = require('../services/activeDirectoryService');
const logger = require('../utils/logger');

// Отримання всіх користувачів з AD
const getUsers = async (req, res) => {
  try {
    const users = await activeDirectoryService.getUsers();
    
    // Перевіряємо чи AD доступний
    const isADAvailable = activeDirectoryService.isADAvailable();
    
    res.json({
      success: true,
      data: users,
      count: users.length,
      source: isADAvailable ? 'active_directory' : 'cache',
      adAvailable: isADAvailable
    });
  } catch (error) {
    logger.error('Error getting AD users:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання користувачів з Active Directory',
      error: error.message,
      adAvailable: false
    });
  }
};

// Отримання всіх комп'ютерів з AD
const getComputers = async (req, res) => {
  try {
    const computers = await activeDirectoryService.getComputers();
    
    // Перевіряємо чи AD доступний
    const isADAvailable = activeDirectoryService.isADAvailable();
    
    res.json({
      success: true,
      data: computers,
      count: computers.length,
      source: isADAvailable ? 'active_directory' : 'cache',
      adAvailable: isADAvailable
    });
  } catch (error) {
    logger.error('Error getting AD computers:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка отримання комп\'ютерів з Active Directory',
      error: error.message,
      adAvailable: false
    });
  }
};

// Пошук користувача за ім'ям
const searchUser = async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Не вказано ім\'я користувача для пошуку'
      });
    }

    logger.info(`Searching for user: ${username}`);
    const user = await activeDirectoryService.searchUser(username);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Користувача не знайдено'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Error searching AD user:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка пошуку користувача в Active Directory',
      error: error.message
    });
  }
};

// Тестування підключення до AD
const testConnection = async (req, res) => {
  try {
    logger.info('Testing Active Directory connection');
    const result = await activeDirectoryService.testConnection();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Підключення до Active Directory успішне'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Помилка підключення до Active Directory',
        error: result.message
      });
    }
  } catch (error) {
    logger.error('Error testing AD connection:', error);
    res.status(500).json({
      success: false,
      message: 'Помилка тестування підключення до Active Directory',
      error: error.message
    });
  }
};

// Отримання статистики AD
const getStatistics = async (req, res) => {
  try {
    logger.info('Getting Active Directory statistics');
    
    // Перевіряємо чи AD доступний
    const isADAvailable = activeDirectoryService.isADAvailable();
    
    if (!isADAvailable) {
      // Якщо AD недоступний, повертаємо порожню статистику
      return res.json({
        success: true,
        data: {
          users: {
            total: 0,
            enabled: 0,
            disabled: 0
          },
          computers: {
            total: 0,
            enabled: 0,
            disabled: 0
          },
          operatingSystems: {},
          departments: {}
        },
        adAvailable: false
      });
    }
    
    const [users, computers] = await Promise.all([
      activeDirectoryService.getUsers(),
      activeDirectoryService.getComputers()
    ]);

    const enabledUsers = users.filter(user => user.enabled).length;
    const disabledUsers = users.filter(user => !user.enabled).length;
    const enabledComputers = computers.filter(computer => computer.enabled).length;
    const disabledComputers = computers.filter(computer => !computer.enabled).length;

    // Статистика по операційних системах
    const osStats = computers.reduce((acc, computer) => {
      const os = computer.operatingSystem || 'Unknown';
      acc[os] = (acc[os] || 0) + 1;
      return acc;
    }, {});

    // Статистика по департаментах
    const departmentStats = users.reduce((acc, user) => {
      const dept = user.department || 'Unknown';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        users: {
          total: users.length,
          enabled: enabledUsers,
          disabled: disabledUsers
        },
        computers: {
          total: computers.length,
          enabled: enabledComputers,
          disabled: disabledComputers
        },
        operatingSystems: osStats,
        departments: departmentStats
      },
      adAvailable: true
    });
  } catch (error) {
    logger.error('Error getting AD statistics:', error);
    // Повертаємо успішну відповідь навіть при помилці, але з порожніми даними
    res.json({
      success: true,
      data: {
        users: {
          total: 0,
          enabled: 0,
          disabled: 0
        },
        computers: {
          total: 0,
          enabled: 0,
          disabled: 0
        },
        operatingSystems: {},
        departments: {}
      },
      adAvailable: false,
      message: 'Active Directory недоступний'
    });
  }
};

module.exports = {
  getUsers,
  getComputers,
  searchUser,
  testConnection,
  getStatistics
};
