const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Используем переменные окружения для конфигурации
// Эти значения будут установлены в docker-compose.yml
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'warehousedb',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Проверка соединения при старте
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to database (PostgreSQL)');
  release(); // освобождаем клиента обратно в пул
});

// Общая функция для выполнения запросов
async function query(text, params) {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error('Error executing query', { text, params, error: err.stack });
    throw err;
  }
}

// Функции для работы с пользователями
async function createUser(username, password, email, enterpriseId = null) {
  const passwordHash = await bcrypt.hash(password, 10);
  const text = 'INSERT INTO Users (Username, PasswordHash, Email, EnterpriseID) VALUES ($1, $2, $3, $4) RETURNING UserID';
  const params = [username, passwordHash, email, enterpriseId];
  const result = await query(text, params);
  return result.rows[0]; // Возвращаем созданного пользователя (или его ID)
}

async function authenticateUser(username, password) {
  const text = 'SELECT UserID, Username, PasswordHash, EnterpriseID FROM Users WHERE Username = $1';
  const params = [username];
  const result = await query(text, params);

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  // Переименуем поля для соответствия PostgreSQL (snake_case -> camelCase)
  const formattedUser = {
      userId: user.userid,
      username: user.username,
      passwordHash: user.passwordhash,
      enterpriseId: user.enterpriseid
  };

  const match = await bcrypt.compare(password, formattedUser.passwordHash);

  if (match) {
    return {
      userId: formattedUser.userId,
      username: formattedUser.username,
      enterpriseId: formattedUser.enterpriseId
    };
  }
  return null;
}

// Функции для работы с предприятиями
async function createEnterprise(name) {
  const text = 'INSERT INTO Enterprises (Name) VALUES ($1) RETURNING EnterpriseID';
  const params = [name];
  const result = await query(text, params);
  return result.rows[0].enterpriseid; // Имя поля в PostgreSQL будет lowercase
}

// Вспомогательная функция для преобразования ключей объекта в camelCase
function keysToCamelCase(obj) {
    const newObj = {};
    const keyMap = {
        productid: 'productId',
        categoryid: 'categoryId',
        enterpriseid: 'enterpriseId',
        createddate: 'createdDate',
        categoryname: 'categoryName',
        userid: 'userId',
        passwordhash: 'passwordHash',
        enterprisename: 'enterpriseName'
        // Добавьте другие маппинги по мере необходимости
    };

    for (const key in obj) {
        // Используем маппинг, если он есть, иначе оставляем ключ как есть (name, quantity, price и т.д.)
        const newKey = keyMap[key.toLowerCase()] || key;
        newObj[newKey] = obj[key];
    }
    return newObj;
}

// Функции для работы с товарами
async function getProducts(enterpriseId, options = {}) {
    const {
        offset = 0,
        limit = 10,
        sort = 'productid',
        order = 'ASC',
        search = '',
        category = '',
        quantityFilterType = 'all' // Новый параметр: 'all', 'inStock', 'lowStock', 'outOfStock'
    } = options;

    // Безопасная сортировка, чтобы избежать SQL инъекций
    const allowedSortColumns = ['productid', 'name', 'quantity', 'price', 'createddate'];
    const safeSort = allowedSortColumns.includes(sort.toLowerCase()) ? sort : 'productid';
    const safeOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let baseQuery = `
        SELECT 
            p.ProductID as productId,
            p.Name as name,
            p.CategoryID as categoryId,
            p.Quantity as quantity,
            p.Price as price,
            p.EnterpriseID as enterpriseId,
            p.CreatedDate as createdDate,
            c.Name as categoryName,
            COUNT(*) OVER() as total_count
        FROM Products p
        LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
        WHERE p.EnterpriseID = $1
    `;
    const values = [enterpriseId];
    let paramIndex = 2;

    // Фильтр по поиску
    if (search) {
        baseQuery += ` AND LOWER(p.Name) LIKE LOWER($${paramIndex})`;
        values.push(`%${search}%`);
        paramIndex++;
    }

    // Фильтр по категории
    if (category) {
        baseQuery += ` AND p.CategoryID = $${paramIndex}`;
        values.push(parseInt(category));
        paramIndex++;
    }

    // Фильтр по количеству (новый)
    if (quantityFilterType === 'inStock') {
        baseQuery += ` AND p.Quantity > 10`;
    } else if (quantityFilterType === 'lowStock') {
        baseQuery += ` AND p.Quantity <= 10 AND p.Quantity > 0`;
    } else if (quantityFilterType === 'outOfStock') {
        baseQuery += ` AND p.Quantity = 0`;
    }
    // Для 'all' дополнительное условие не добавляется

    baseQuery += ` ORDER BY ${safeSort} ${safeOrder}
                  LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await query(baseQuery, values);
    const total = result.rows[0] ? parseInt(result.rows[0].total_count) : 0;

    return {
        products: result.rows.map(row => {
            const { total_count, ...productData } = row;
            // Преобразуем ключи в camelCase перед возвратом
            return keysToCamelCase(productData); 
        }),
        total
    };
}

async function updateProductQuantity(productId, userId, newQuantity) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Получаем текущее значение
    const currentResult = await client.query('SELECT Quantity FROM Products WHERE ProductID = $1', [productId]);
    const oldQuantity = currentResult.rows[0].quantity;

    // Обновляем количество
    await client.query('UPDATE Products SET Quantity = $1 WHERE ProductID = $2', [newQuantity, productId]);

    // Добавляем запись в лог
    const logText = 'INSERT INTO ProductLogs (ProductID, UserID, Action, OldValue, NewValue) VALUES ($1, $2, $3, $4, $5)';
    const logParams = [productId, userId, 'UPDATE_QUANTITY', oldQuantity.toString(), newQuantity.toString()];
    await client.query(logText, logParams);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating product quantity (transaction rolled back):', err);
    throw err;
  } finally {
    client.release();
  }
}

async function addProduct(enterpriseId, productData) {
    const {
        name,
        categoryId, // Убедитесь, что передается categoryId, а не category name
        quantity,
        price
    } = productData;

    // В init.sql у нас нет Description, уберем его из запроса
    const text = `
        INSERT INTO Products (Name, CategoryID, Quantity, Price, EnterpriseID)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING ProductID
    `;
    const params = [name, categoryId, quantity, price, enterpriseId];
    const result = await query(text, params);
    return result.rows[0].productid;
}


async function getCategories(enterpriseId) {
    const text = `
        SELECT CategoryID as categoryId, Name as name
        FROM Categories
        WHERE EnterpriseID = $1
        ORDER BY Name
    `;
    const params = [enterpriseId];
    const result = await query(text, params);
    // Преобразуем ключи и для категорий
    return result.rows.map(row => keysToCamelCase(row));
}

// Функции для работы с профилем пользователя
async function getUserProfile(userId) {
  const text = `
      SELECT u.UserID as userId, u.Username as username, u.Email as email, e.Name as enterpriseName, e.EnterpriseID as enterpriseId
      FROM Users u
      LEFT JOIN Enterprises e ON u.EnterpriseID = e.EnterpriseID
      WHERE u.UserID = $1
  `;
  const params = [userId];
  const result = await query(text, params);
  // Преобразуем ключи и для профиля
  return keysToCamelCase(result.rows[0]);
}

async function updateUserProfile(userId, email) {
  const text = 'UPDATE Users SET Email = $1 WHERE UserID = $2';
  const params = [email, userId];
  await query(text, params);
  return true;
}

async function updateUserPassword(userId, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const text = 'UPDATE Users SET PasswordHash = $1 WHERE UserID = $2';
  const params = [passwordHash, userId];
  await query(text, params);
  return true;
}

// Функция для создания новой категории
async function createCategory(enterpriseId, name) {
  // Поле Description не используется, так как его нет в таблице Categories
  const text = 'INSERT INTO Categories (EnterpriseID, Name) VALUES ($1, $2) RETURNING CategoryID, Name';
  const params = [enterpriseId, name];
  const result = await query(text, params);
  // Преобразуем ключи и для созданной категории
  return keysToCamelCase({
      categoryId: result.rows[0].categoryid,
      name: result.rows[0].name
  });
}

// Функция для получения статистики для дашборда
async function getDashboardStats(enterpriseId) {
    const statsQueries = {
        totalProducts: 'SELECT COUNT(*) as count FROM Products WHERE EnterpriseID = $1',
        inStock: 'SELECT COUNT(*) as count FROM Products WHERE EnterpriseID = $1 AND Quantity > 10',
        lowStock: 'SELECT COUNT(*) as count FROM Products WHERE EnterpriseID = $1 AND Quantity <= 10 AND Quantity > 0',
        outOfStock: 'SELECT COUNT(*) as count FROM Products WHERE EnterpriseID = $1 AND Quantity = 0'
    };

    const results = {};
    const params = [enterpriseId];

    for (const key in statsQueries) {
        try {
            const result = await query(statsQueries[key], params);
            results[key] = parseInt(result.rows[0].count) || 0;
        } catch (err) {
            console.error(`Error fetching dashboard stat for ${key}:`, err);
            results[key] = 0; // Возвращаем 0 при ошибке
        }
    }
    
    // Можно добавить подсчет категорий, если карточка вернется
    try {
        const catResult = await query('SELECT COUNT(DISTINCT CategoryID) as count FROM Products WHERE EnterpriseID = $1', params);
        results.totalCategories = parseInt(catResult.rows[0].count) || 0;
    } catch (err) {
        console.error(`Error fetching dashboard stat for totalCategories:`, err);
        results.totalCategories = 0;
    }

    console.log(`[DB getDashboardStats] Stats for enterprise ${enterpriseId}:`, results);
    return results;
}

// Удаляем connectDB, так как Pool управляет соединениями автоматически
module.exports = {
  query, // Экспортируем общую функцию query, если нужна для других модулей
  createUser,
  authenticateUser,
  createEnterprise,
  getProducts,
  addProduct,
  updateProductQuantity,
  getCategories,
  createCategory, // Экспортируем новую функцию
  getUserProfile,
  updateUserProfile,
  updateUserPassword,
  getDashboardStats // Экспортируем новую функцию
};
