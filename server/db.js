const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // Добавляем crypto для генерации токенов
const fs = require('fs');
const path = require('path');

// Используем переменные окружения для конфигурации
// Эти значения будут установлены в docker-compose.yml
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'warehousedb',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Функция инициализации базы данных
async function initializeDatabase() {
  try {
    // Читаем SQL файл
    const initSql = fs.readFileSync(path.join(__dirname, '../sql/init.sql'), 'utf8');
    
    // Выполняем SQL скрипт
    await pool.query(initSql);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

// Проверка соединения и инициализация при старте
pool.connect(async (err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to database (PostgreSQL)');
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
  release(); // освобождаем клиента обратно в пул
});

// Общая функция для выполнения запросов
async function query(text, params) {
  console.log('[DB Request]', { text, params }); // Логирование запроса
  try {
    const res = await pool.query(text, params);
    console.log('[DB Response]', { rowCount: res.rowCount }); // Логирование ответа
    return res;
  } catch (err) {
    console.error('[DB Error]', { text, params, errorCode: err.code, error: err.message }); // Улучшенное логирование ошибки
    throw err;
  }
}

// Функции для работы с пользователями
async function createUser(username, password, email, enterpriseId = null, firstName = null, lastName = null, isAdmin = false) {
  const passwordHash = await bcrypt.hash(password, 10);
  const text = 'INSERT INTO Users (Username, PasswordHash, Email, EnterpriseID, FirstName, LastName, IsAdmin) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING UserID';
  const params = [username, passwordHash, email, enterpriseId, firstName, lastName, isAdmin];
  const result = await query(text, params);
  return result.rows[0];
}

async function authenticateUser(username, password) {
  const text = 'SELECT UserID, Username, PasswordHash, EnterpriseID, IsAdmin FROM Users WHERE Username = $1';
  const params = [username];
  const result = await query(text, params);

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  const formattedUser = {
      userId: user.userid,
      username: user.username,
      passwordHash: user.passwordhash,
      enterpriseId: user.enterpriseid,
      isAdmin: user.isadmin
  };

  const match = await bcrypt.compare(password, formattedUser.passwordHash);

  if (match) {
    return {
      userId: formattedUser.userId,
      username: formattedUser.username,
      enterpriseId: formattedUser.enterpriseId,
      isAdmin: formattedUser.isAdmin
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
    if (!obj) return null;
    const newObj = {};
    const keyMap = {
        productid: 'productId',
        categoryid: 'categoryId',
        enterpriseid: 'enterpriseId',
        createddate: 'createdDate',
        categoryname: 'categoryName',
        userid: 'userId',
        passwordhash: 'passwordHash',
        enterprisename: 'enterpriseName',
        firstname: 'firstName',
        lastname: 'lastName',
        isadmin: 'isAdmin',
        logid: 'logId',
        logdate: 'logDate',
        productname: 'productName',
        reportuserid: 'reportUserId',
        userfirstname: 'userFirstName',
        userlastname: 'userLastName',
        oldquantity: 'oldQuantity',
        newquantity: 'newQuantity',
        quantitychange: 'quantityChange'
    };

    for (const key in obj) {
        const lowerKey = key.toLowerCase();
        const newKey = keyMap[lowerKey] || key;
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

async function updateProductQuantity(productId, userId, newQuantity, actionType) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query('SELECT Quantity FROM Products WHERE ProductID = $1 FOR UPDATE', [productId]);
    if (currentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error('Товар не найден для обновления количества.');
    }
    const oldQuantity = currentResult.rows[0].quantity;

    // Если actionType не передан явно, определяем его по изменению количества
    let determinedActionType = actionType;
    if (!determinedActionType) {
        if (newQuantity > oldQuantity) {
            determinedActionType = 'ADJUSTMENT_IN';
        } else if (newQuantity < oldQuantity) {
            determinedActionType = 'ADJUSTMENT_OUT';
        } else {
            // Если количество не изменилось, можно не логировать или использовать спец. Action
            // Пока что, если количество не меняется, лог не будет создан (см. ниже)
            determinedActionType = 'NO_CHANGE'; 
        }
    }
    
    // Обновляем количество в таблице Products
    await client.query('UPDATE Products SET Quantity = $1 WHERE ProductID = $2', [newQuantity, productId]);

    // Добавляем запись в лог, только если количество изменилось или actionType был задан принудительно
    // и не равен NO_CHANGE (на случай если был передан NO_CHANGE, но количество по факту изменилось - приоритет у факта изменения)
    if (newQuantity !== oldQuantity || (actionType && actionType !== 'NO_CHANGE')) {
        // Если actionType был NO_CHANGE, но количество изменилось, переопределяем его.
        if (determinedActionType === 'NO_CHANGE' && newQuantity !== oldQuantity) {
             determinedActionType = newQuantity > oldQuantity ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        }

        const logText = 'INSERT INTO ProductLogs (ProductID, UserID, Action, OldValue, NewValue) VALUES ($1, $2, $3, $4, $5)';
        const logParams = [productId, userId, determinedActionType, oldQuantity.toString(), newQuantity.toString()];
        await client.query(logText, logParams);
        console.log(`[DB updateProductQuantity] Product ${productId} quantity updated to ${newQuantity} by user ${userId}. Action: ${determinedActionType}. Logged.`);
    } else {
        console.log(`[DB updateProductQuantity] Product ${productId} quantity not changed or actionType is NO_CHANGE. Not logged.`);
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[DB Error] Failed to update product quantity for ${productId} (user: ${userId}, action: ${actionType || 'auto'}):`, err);
    throw err;
  } finally {
    client.release();
  }
}

async function addProduct(enterpriseId, userId, productData) {
    const {
        name,
        categoryId, 
        quantity,
        price
    } = productData;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const productInsertText = `
            INSERT INTO Products (Name, CategoryID, Quantity, Price, EnterpriseID)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING ProductID, CreatedDate
        `;
        const productInsertParams = [name, categoryId, quantity, price, enterpriseId];
        const productResult = await client.query(productInsertText, productInsertParams);
        const newProductId = productResult.rows[0].productid;
        const createdDate = productResult.rows[0].createddate; // Получаем дату создания товара

        // Добавляем запись в лог о создании товара
        const logText = 'INSERT INTO ProductLogs (ProductID, UserID, Action, OldValue, NewValue, LogDate) VALUES ($1, $2, $3, $4, $5, $6)';
        // LogDate для этой записи будет такой же, как CreatedDate товара для консистентности
        const logParams = [newProductId, userId, 'PRODUCT_ADDED', '0', quantity.toString(), createdDate]; 
        await client.query(logText, logParams);

        await client.query('COMMIT');
        console.log(`[DB addProduct] Product ${newProductId} added by user ${userId} with quantity ${quantity}. Logged.`);
        return newProductId;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB Error] Failed to add product or log its creation (enterprise: ${enterpriseId}, user: ${userId}):`, err);
        throw err;
    } finally {
        client.release();
    }
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
      SELECT 
        u.UserID as userId, 
        u.Username as username, 
        u.Email as email, 
        u.FirstName as firstName, 
        u.LastName as lastName, 
        u.IsAdmin as isAdmin, 
        e.Name as enterpriseName, 
        e.EnterpriseID as enterpriseId
      FROM Users u
      LEFT JOIN Enterprises e ON u.EnterpriseID = e.EnterpriseID
      WHERE u.UserID = $1
  `;
  const params = [userId];
  const result = await query(text, params);
  if (result.rows[0]) {
      return keysToCamelCase(result.rows[0]); 
  }
  return null;
}

async function updateUserProfile(userId, email, firstName, lastName) {
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (email !== undefined) {
    updates.push(`Email = $${paramIndex++}`);
    params.push(email);
  }
  if (firstName !== undefined) {
    updates.push(`FirstName = $${paramIndex++}`);
    params.push(firstName);
  }
  if (lastName !== undefined) {
    updates.push(`LastName = $${paramIndex++}`);
    params.push(lastName);
  }

  if (updates.length === 0) {
    return true;
  }

  params.push(userId);
  const text = `UPDATE Users SET ${updates.join(', ')} WHERE UserID = $${paramIndex}`;
  
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

// Функции для администрирования пользователей внутри предприятия
async function getUsersByEnterpriseId(enterpriseId) {
  const text = `
    SELECT UserID as userId, Username as username, Email as email, 
           FirstName as firstName, LastName as lastName, IsAdmin as isAdmin, 
           TO_CHAR(CreatedDate, 'YYYY-MM-DD HH24:MI:SS') as createdDate
    FROM Users 
    WHERE EnterpriseID = $1 
    ORDER BY UserID ASC
  `;
  const params = [enterpriseId];
  try {
    const result = await query(text, params);
    return result.rows.map(row => keysToCamelCase(row)); // keysToCamelCase уже должен быть определен выше
  } catch (err) {
    console.error(`[DB Error] Failed to get users for enterprise ${enterpriseId}:`, err);
    throw err;
  }
}

async function setUserAdminStatus(userId, isAdmin, currentAdminUserId) {
  // Проверка, чтобы администратор не снял права с самого себя,
  // или чтобы не было попытки изменить статус несуществующего пользователя.
  // Эта логика может быть и на уровне API, но базовую проверку можно и тут.
  if (userId === currentAdminUserId && !isAdmin) {
      throw new Error('Администратор не может снять с себя права администратора.');
  }

  const text = 'UPDATE Users SET IsAdmin = $1 WHERE UserID = $2 RETURNING UserID, IsAdmin';
  const params = [isAdmin, userId];
  try {
    const result = await query(text, params);
    if (result.rows.length === 0) {
        throw new Error('Пользователь для обновления статуса администратора не найден.');
    }
    console.log(`[DB setUserAdminStatus] User ${userId} admin status set to ${isAdmin} by admin ${currentAdminUserId}`);
    return keysToCamelCase(result.rows[0]);
  } catch (err) {
    console.error(`[DB Error] Failed to set admin status for user ${userId}:`, err);
    throw err;
  }
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

// Функции для работы с пригласительными токенами
async function generateInvitationToken(enterpriseId, createdByUserId, expiresInHours = 24) {
  const token = crypto.randomBytes(32).toString('hex'); // Генерируем случайный токен
  const tokenHash = await bcrypt.hash(token, 10); // Хэшируем токен

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + expiresInHours * 60 * 60 * 1000);

  const text = 'INSERT INTO InvitationTokens (EnterpriseID, TokenHash, CreatedByUserID, CreatedAt, ExpiresAt, IsUsed) VALUES ($1, $2, $3, $4, $5, $6) RETURNING TokenID';
  const params = [enterpriseId, tokenHash, createdByUserId, createdAt, expiresAt, false];
  
  try {
    const result = await query(text, params);
    console.log(`[DB generateInvitationToken] Token created for enterprise ${enterpriseId} by user ${createdByUserId}, expires at ${expiresAt.toISOString()}`);
    return { tokenId: result.rows[0].tokenid, originalToken: token }; // Возвращаем ID и оригинальный токен
  } catch (err) {
    console.error(`[DB Error] Failed to generate invitation token for enterprise ${enterpriseId}:`, err);
    throw err; // Перебрасываем ошибку для обработки выше
  }
}

async function validateInvitationToken(enterpriseId, providedToken) {
  // Сначала получаем все активные, неиспользованные и не истекшие токены для данного предприятия
  const text = 'SELECT TokenID, TokenHash, ExpiresAt FROM InvitationTokens WHERE EnterpriseID = $1 AND IsUsed = FALSE AND ExpiresAt > NOW()';
  const params = [enterpriseId];
  const result = await query(text, params);

  if (result.rows.length === 0) {
    console.log(`[DB validateInvitationToken] No active tokens found for enterprise ${enterpriseId}`);
    return null;
  }

  for (const row of result.rows) {
    const match = await bcrypt.compare(providedToken, row.tokenhash); // postgresql возвращает lowercase
    if (match) {
      console.log(`[DB validateInvitationToken] Token ${row.tokenid} validated successfully for enterprise ${enterpriseId}`);
      return { tokenId: row.tokenid, enterpriseId: enterpriseId }; // Возвращаем ID токена и ID предприятия
    }
  }
  
  console.log(`[DB validateInvitationToken] Invalid token provided for enterprise ${enterpriseId}`);
  return null;
}

async function markTokenAsUsed(tokenId) {
  const text = 'UPDATE InvitationTokens SET IsUsed = TRUE WHERE TokenID = $1';
  const params = [tokenId];
  try {
    await query(text, params);
    console.log(`[DB markTokenAsUsed] Token ${tokenId} marked as used.`);
    return true;
  } catch (err) {
    console.error(`[DB Error] Failed to mark token ${tokenId} as used:`, err);
    throw err;
  }
}

async function deleteUser(targetUserId, currentAdminUserId, enterpriseId) {
  // Администратор не может удалить сам себя
  if (targetUserId === currentAdminUserId) {
    throw new Error('Вы не можете удалить свой собственный аккаунт через эту панель.');
  }

  // Сначала проверим, принадлежит ли удаляемый пользователь указанному предприятию
  // и не является ли он последним администратором (если такая логика нужна - пока нет)
  const userCheckText = 'SELECT UserID, EnterpriseID, IsAdmin FROM Users WHERE UserID = $1';
  const userCheckResult = await query(userCheckText, [targetUserId]);

  if (userCheckResult.rows.length === 0) {
    throw new Error('Пользователь для удаления не найден.');
  }
  const userToDelete = userCheckResult.rows[0];
  if (userToDelete.enterpriseid !== enterpriseId) {
      // Это дополнительная проверка безопасности, чтобы админ одного предприятия случайно не удалил пользователя другого,
      // если бы API как-то позволил это сделать (хотя текущие API защищены сессией админа).
      throw new Error('Пользователь не принадлежит вашему предприятию.');
  }
  
  // Прежде чем удалять пользователя, нужно удалить связанные с ним токены, где он является создателем
  // Foreign key ON DELETE CASCADE в InvitationTokens.CreatedByUserID -> Users.UserID уже должен это сделать.
  // Но если бы его не было, нужно было бы сделать это вручную:
  // const deleteTokensText = 'DELETE FROM InvitationTokens WHERE CreatedByUserID = $1';
  // await query(deleteTokensText, [targetUserId]);

  const deleteUserText = 'DELETE FROM Users WHERE UserID = $1 RETURNING UserID';
  const params = [targetUserId];
  try {
    const result = await query(deleteUserText, params);
    if (result.rows.length === 0) {
      // Это не должно произойти, если предыдущая проверка нашла пользователя
      throw new Error('Не удалось удалить пользователя (возможно, он был удален параллельно).');
    }
    console.log(`[DB deleteUser] User ${targetUserId} deleted by admin ${currentAdminUserId} from enterprise ${enterpriseId}`);
    return { userId: result.rows[0].userid, message: 'Пользователь успешно удален.' };
  } catch (err) {
    console.error(`[DB Error] Failed to delete user ${targetUserId}:`, err);
    // Ошибки внешних ключей (например, если бы мы не использовали ON DELETE SET NULL в ProductLogs)
    // будут пойманы здесь (err.code === '23503')
    throw err;
  }
}

async function getProductMovementReport(enterpriseId, filters = {}) {
  const { startDate, endDate, categoryId, userId, actionTypes = [] } = filters; // Изменено productId на categoryId

  let baseQuery = `
    SELECT
      pl.LogID as logId,
      TO_CHAR(pl.LogDate, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as logDate, -- Форматируем дату в ISO 8601
      p.ProductID as productId,
      p.Name as productName,
      c.Name as categoryName,
      u.UserID as reportUserId,
      u.FirstName as userFirstName,
      u.LastName as userLastName,
      pl.Action as action, -- Используем существующее поле Action
      pl.OldValue as oldQuantity,
      pl.NewValue as newQuantity,
      (CAST(pl.NewValue AS INTEGER) - CAST(pl.OldValue AS INTEGER)) as quantityChange
    FROM ProductLogs pl
    JOIN Products p ON pl.ProductID = p.ProductID
    JOIN Users u ON pl.UserID = u.UserID
    LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
    WHERE p.EnterpriseID = $1
  `;

  const queryParams = [enterpriseId];
  let paramIndex = 2;

  if (startDate) {
    baseQuery += ` AND pl.LogDate >= $${paramIndex++}`;
    queryParams.push(startDate);
  }
  if (endDate) {
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
    baseQuery += ` AND pl.LogDate < $${paramIndex++}`;
    queryParams.push(adjustedEndDate.toISOString().split('T')[0]);
  }
  if (categoryId) { // Добавляем фильтр по categoryId
    baseQuery += ` AND p.CategoryID = $${paramIndex++}`;
    queryParams.push(parseInt(categoryId)); // Убедимся, что это число
  }
  if (userId) {
    baseQuery += ` AND u.UserID = $${paramIndex++}`;
    queryParams.push(userId);
  }

  // Фильтр по типам действий (Action)
  if (actionTypes && actionTypes.length > 0) {
    // Создаем плейсхолдеры для каждого типа действия: ($3, $4, ...)
    const actionPlaceholders = actionTypes.map(() => `$${paramIndex++}`).join(', ');
    baseQuery += ` AND pl.Action IN (${actionPlaceholders})`;
    queryParams.push(...actionTypes);
  }

  baseQuery += ' ORDER BY pl.LogDate DESC, pl.LogID DESC';

  try {
    const result = await query(baseQuery, queryParams);
    return result.rows.map(row => keysToCamelCase(row)); // keysToCamelCase уже обрабатывает имена полей
  } catch (err) {
    console.error(`[DB Error] Failed to get product movement report for enterprise ${enterpriseId} with filters ${JSON.stringify(filters)}:`, err);
    throw err;
  }
}

async function getInventoryOnHandReport(enterpriseId, options = {}) {
  const {
    search = '', // search теперь не используется на фронте, но оставим на бэке для гибкости
    categoryId = '',
    quantityFilterType = 'all', 
    sort = 'productName', 
    order = 'ASC'
  } = options;

  const allowedSortColumns = ['productid', 'productname', 'categoryname', 'quantity', 'price'];
  const sortColumnMap = {
    productid: 'p.ProductID',
    productname: 'p.Name',
    categoryname: 'c.Name',
    quantity: 'p.Quantity',
    price: 'p.Price'
  };
  
  const safeSortKey = sort.toLowerCase();
  const safeSort = sortColumnMap[safeSortKey] || 'p.Name'; 
  const safeOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  let baseQuery = `
    SELECT
      p.ProductID as productId,
      p.Name as productName,
      p.Quantity as quantity,
      p.Price as price,
      c.CategoryID as categoryId,
      c.Name as categoryName
    FROM Products p
    LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
    WHERE p.EnterpriseID = $1
  `;
  const queryParams = [enterpriseId];
  let paramIndex = 2;

  if (search) { // Оставим на бэке, если понадобится
    baseQuery += ` AND LOWER(p.Name) LIKE LOWER($${paramIndex++})`;
    queryParams.push(`%${search}%`);
  }

  if (categoryId) {
    baseQuery += ` AND p.CategoryID = $${paramIndex++}`;
    queryParams.push(parseInt(categoryId));
  }

  if (quantityFilterType === 'inStock') {
    baseQuery += ` AND p.Quantity > 10`;
  } else if (quantityFilterType === 'lowStock') {
    baseQuery += ` AND p.Quantity <= 10 AND p.Quantity > 0`;
  } else if (quantityFilterType === 'outOfStock') {
    baseQuery += ` AND p.Quantity = 0`;
  }

  baseQuery += ` ORDER BY ${safeSort} ${safeOrder}`;

  try {
    const result = await query(baseQuery, queryParams);
    return result.rows.map(row => keysToCamelCase(row));
  } catch (err) {
    console.error(`[DB Error] Failed to get inventory on hand report for enterprise ${enterpriseId} with options ${JSON.stringify(options)}:`, err);
    throw err;
  }
}

// Удаляем connectDB, так как Pool управляет соединениями автоматически
module.exports = {
  query, 
  createUser,
  authenticateUser,
  createEnterprise,
  getProducts,
  addProduct,
  updateProductQuantity,
  getCategories,
  createCategory, 
  getUserProfile,
  updateUserProfile,
  updateUserPassword,
  getDashboardStats, 
  generateInvitationToken, 
  validateInvitationToken,
  markTokenAsUsed,
  getUsersByEnterpriseId,   
  setUserAdminStatus,
  deleteUser,
  getProductMovementReport, 
  getInventoryOnHandReport 
};