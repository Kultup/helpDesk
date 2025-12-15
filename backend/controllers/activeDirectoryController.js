const activeDirectoryService = require('../services/activeDirectoryService');
const logger = require('../utils/logger');

// Отримання всіх користувачів з AD
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const filterStatus = req.query.filterStatus || 'all'; // all, enabled, disabled
    
    let users = await activeDirectoryService.getUsers();
    
    // Фільтрація за статусом
    if (filterStatus === 'enabled') {
      users = users.filter(user => user.enabled);
    } else if (filterStatus === 'disabled') {
      users = users.filter(user => !user.enabled);
    }
    
    // Пошук
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(user =>
        user.displayName?.toLowerCase().includes(searchLower) ||
        user.username?.toLowerCase().includes(searchLower) ||
        user.sAMAccountName?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.mail?.toLowerCase().includes(searchLower)
      );
    }
    
    // Пагінація
    const totalItems = users.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = users.slice(startIndex, endIndex);
    
    // Перевіряємо чи AD доступний
    const isADAvailable = activeDirectoryService.isADAvailable();
    
    res.json({
      success: true,
      data: paginatedUsers,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      count: totalItems,
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const filterStatus = req.query.filterStatus || 'all'; // all, enabled, disabled
    const filterOS = req.query.filterOS || 'all'; // all, windows, linux, mac
    
    let computers = await activeDirectoryService.getComputers();
    
    // Фільтрація за статусом
    if (filterStatus === 'enabled') {
      computers = computers.filter(computer => computer.enabled);
    } else if (filterStatus === 'disabled') {
      computers = computers.filter(computer => !computer.enabled);
    }
    
    // Фільтрація за ОС
    if (filterOS !== 'all') {
      computers = computers.filter(computer => {
        const os = computer.operatingSystem?.toLowerCase() || '';
        switch (filterOS) {
          case 'windows':
            return os.includes('windows');
          case 'linux':
            return os.includes('linux') || os.includes('ubuntu') || os.includes('centos');
          case 'mac':
            return os.includes('mac') || os.includes('darwin');
          default:
            return true;
        }
      });
    }
    
    // Пошук
    if (search) {
      const searchLower = search.toLowerCase();
      computers = computers.filter(computer =>
        computer.name?.toLowerCase().includes(searchLower) ||
        computer.dNSHostName?.toLowerCase().includes(searchLower) ||
        computer.dnsName?.toLowerCase().includes(searchLower) ||
        computer.operatingSystem?.toLowerCase().includes(searchLower)
      );
    }
    
    // Пагінація
    const totalItems = computers.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedComputers = computers.slice(startIndex, endIndex);
    
    // Перевіряємо чи AD доступний
    const isADAvailable = activeDirectoryService.isADAvailable();
    
    res.json({
      success: true,
      data: paginatedComputers,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      count: totalItems,
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
