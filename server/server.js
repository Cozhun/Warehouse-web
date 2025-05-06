const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const port = 3000;

// Middleware для логирования HTTP-запросов
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${duration}ms`);
    });
    next();
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));
app.use(session({
    secret: 'warehouse-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Middleware для проверки аутентификации
function requireAuth(req, res, next) {
    if (!req.session.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}

// Middleware для проверки прав администратора
function requireAdmin(req, res, next) {
    if (!req.session.user || !req.session.user.isAdmin) {
        // Логируем попытку неавторизованного доступа к админ-ресурсу
        console.warn(`[Auth] Unauthorized admin access attempt by user: ${req.session.user ? req.session.user.userId : 'Guest'} to ${req.originalUrl}`);
        res.status(403).json({ error: 'Forbidden: Administrator access required' });
        return;
    }
    next();
}

// Маршруты аутентификации
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email, 
                firstName, lastName, 
                joinExisting, enterpriseId, enterpriseName, 
                invitationToken } = req.body; // Добавлен invitationToken
        
        let userEnterpriseId = null;
        let determinedEnterpriseIdByToken = null; // Для ID предприятия из токена
        let newUserIsAdmin = false;

        if (invitationToken && enterpriseId) { // Регистрация по токену
            console.log(`[Register] Attempting registration with invitation token for enterprise ID: ${enterpriseId}`);
            const validatedToken = await db.validateInvitationToken(parseInt(enterpriseId), invitationToken);
            if (!validatedToken) {
                console.warn(`[Register] Invalid or expired token for enterprise ID: ${enterpriseId}`);
                return res.status(400).json({ error: 'Недействительный или истекший пригласительный токен.' });
            }
            console.log(`[Register] Token validated successfully. Token ID: ${validatedToken.tokenId}`);
            userEnterpriseId = validatedToken.enterpriseId;
            determinedEnterpriseIdByToken = validatedToken.enterpriseId;
            newUserIsAdmin = false; // Пользователи по токену не админы
            // Отмечаем токен как использованный ПОСЛЕ успешного создания пользователя

        } else if (joinExisting) { // Присоединение к существующему по ID (без токена)
            userEnterpriseId = parseInt(enterpriseId);
            if (!userEnterpriseId || isNaN(userEnterpriseId)) {
                 return res.status(400).json({ error: 'Некорректный ID предприятия для присоединения.' });
            }
            console.log(`[Register] Joining existing enterprise ID: ${userEnterpriseId}`);
            newUserIsAdmin = false; // Присоединяющийся по ID не админ
        
        } else { // Создание нового предприятия
            if (!enterpriseName || enterpriseName.trim() === '') {
                return res.status(400).json({ error: 'Название предприятия обязательно для заполнения при создании нового предприятия.' });
            }
            console.log(`[Register] Creating enterprise with name: ${enterpriseName.trim()}`);
            userEnterpriseId = await db.createEnterprise(enterpriseName.trim());
            console.log(`[Register] Created enterprise ID: ${userEnterpriseId}`);
            newUserIsAdmin = true; // Создатель предприятия - админ
        }
        
        if (userEnterpriseId === null || userEnterpriseId === undefined) {
            console.error('[Register] Error: userEnterpriseId is null or undefined before creating user.');
            return res.status(500).json({ error: 'Ошибка при определении предприятия пользователя.' });
        }

        console.log(`[Register] Creating user with enterpriseId: ${userEnterpriseId}, firstName: ${firstName}, lastName: ${lastName}, isAdmin: ${newUserIsAdmin}`);
        const newUserInfo = await db.createUser(username, password, email, userEnterpriseId, firstName, lastName, newUserIsAdmin);
        console.log(`[Register] Created user info:`, newUserInfo, `IsAdmin: ${newUserIsAdmin}`);
        
        // Если регистрация была по токену, отмечаем токен как использованный
        if (invitationToken && determinedEnterpriseIdByToken) {
            const validatedTokenForMarking = await db.validateInvitationToken(determinedEnterpriseIdByToken, invitationToken); // Перепроверяем перед использованием, чтобы взять ID
            if (validatedTokenForMarking) {
                 await db.markTokenAsUsed(validatedTokenForMarking.tokenId);
                 console.log(`[Register] Token ${validatedTokenForMarking.tokenId} marked as used after user creation.`);
            } else {
                // Эта ситуация не должна произойти, если первая валидация прошла, но логируем на всякий случай
                console.error(`[Register] CRITICAL: Token for enterprise ${determinedEnterpriseIdByToken} was valid but could not be re-validated to be marked as used.`);
            }
        }

        const userProfileForSession = await db.getUserProfile(newUserInfo.userid); 
        if (!userProfileForSession) {
            console.error(`[Register] Could not fetch profile for new user ID: ${newUserInfo.userid}`);
            return res.status(500).json({ error: 'Ошибка при создании сессии пользователя.' });
        }

        req.session.user = {
            userId: userProfileForSession.userId,
            username: userProfileForSession.username,
            enterpriseId: userProfileForSession.enterpriseId,
            firstName: userProfileForSession.firstName,
            lastName: userProfileForSession.lastName,
            isAdmin: userProfileForSession.isAdmin
        };
        console.log(`[Register] Session set:`, req.session.user);

        res.json({ success: true, user: req.session.user });

    } catch (err) {
        console.error('Registration error:', err);
        // Проверяем код ошибки PostgreSQL
        if (err.code === '23505') { // Unique violation
            // Определяем, какое поле вызвало ошибку (можно улучшить, анализируя err.constraint)
            let message = 'Ошибка регистрации.';
            if (err.constraint && err.constraint.includes('username')) {
                message = 'Пользователь с таким именем уже существует.';
            } else if (err.constraint && err.constraint.includes('email')) {
                message = 'Пользователь с таким email уже существует.';
            }
            // Отправляем 409 Conflict
            res.status(409).json({ error: message }); 
        } else if (err.code === '23503') { // Foreign key violation
             res.status(400).json({ error: 'Указанное предприятие не существует.' });
        } else {
            // Отправляем общую ошибку 500
            res.status(500).json({ error: 'Произошла ошибка при регистрации. Попробуйте позже.' });
        }
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.authenticateUser(username, password);
        
        if (user) {
            // Получаем полный профиль пользователя для сессии, включая имя и фамилию, если authenticateUser их не возвращает напрямую
            const userProfileForSession = await db.getUserProfile(user.userId);
            if (!userProfileForSession) {
                console.error(`[Login] Could not fetch profile for user ID: ${user.userId}`);
                // Можно вернуть ошибку или продолжить с данными из authenticateUser, если имя/фамилия не критичны для немедленной сессии
                // Пока что продолжим с тем, что есть в user, роль там уже должна быть
                req.session.user = {
                    userId: user.userId,
                    username: user.username,
                    enterpriseId: user.enterpriseId,
                    isAdmin: user.isAdmin
                };
            } else {
                req.session.user = {
                    userId: userProfileForSession.userId,
                    username: userProfileForSession.username,
                    enterpriseId: userProfileForSession.enterpriseId,
                    firstName: userProfileForSession.firstName,
                    lastName: userProfileForSession.lastName,
                    isAdmin: userProfileForSession.isAdmin
                };
            }
            console.log('[Login] Session set for user:', req.session.user);
            res.json({ success: true, user: req.session.user });
        } else {
            res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Проверка состояния аутентификации
app.get('/api/check-auth', (req, res) => {
    if (req.session.user) {
        // Возвращаем больше данных о пользователе, включая роль, имя и фамилию
        res.json({
            authenticated: true,
            userId: req.session.user.userId,
            username: req.session.user.username,
            email: req.session.user.email, // Email может отсутствовать в сессии после логина, его лучше брать из профиля
            enterpriseId: req.session.user.enterpriseId,
            enterpriseName: req.session.user.enterpriseName, // enterpriseName также лучше брать из профиля
            firstName: req.session.user.firstName,
            lastName: req.session.user.lastName,
            isAdmin: req.session.user.isAdmin
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Маршруты для работы с профилем пользователя
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.userId;
        console.log(`[Profile] Fetching profile for userId: ${userId}`);
        const profile = await db.getUserProfile(userId);
        console.log(`[Profile] Fetched profile data from DB:`, profile); // Логируем результат из БД
        
        if (!profile) {
            // Добавим проверку на случай, если пользователь не найден (маловероятно с requireAuth)
             console.error(`[Profile] Profile not found for userId: ${userId}`);
             return res.status(404).json({ error: 'Профиль не найден' });
        }

        res.json(profile);
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.post('/api/profile/update', requireAuth, async (req, res) => {
    try {
        const { email, firstName, lastName } = req.body;
        const userId = req.session.user.userId;
        
        // !! Валидация email, firstName, lastName !!
        if (email === undefined && firstName === undefined && lastName === undefined) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        await db.updateUserProfile(userId, email, firstName, lastName);
        
        // Обновляем сессию только для тех полей, которые могли измениться
        // и присутствуют в req.body
        if (email !== undefined) req.session.user.email = email;
        if (firstName !== undefined) req.session.user.firstName = firstName;
        if (lastName !== undefined) req.session.user.lastName = lastName;
        // req.session.user.isAdmin не меняется здесь, так что остается прежним
        
        // Логируем изменения и статус ответа
        const updatedFields = { email, firstName, lastName };
        console.log(`[API Response] POST /api/profile/update - Status: 200 - UserID: ${userId} - Updated:`, 
            Object.fromEntries(Object.entries(updatedFields).filter(([_, v]) => v !== undefined))
        );
        res.json({ success: true, message: 'Профиль успешно обновлен' });
    } catch (err) {
        console.error(`[API Error] POST /api/profile/update - Status: 500 - UserID: ${req.session.user.userId} - Error:`, err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

app.post('/api/profile/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // Проверяем текущий пароль
        const user = await db.authenticateUser(req.session.user.username, currentPassword);
        if (!user) {
            // Отправляем 401, но с более конкретным сообщением
            return res.status(401).json({ error: 'Текущий пароль неверен' }); 
        }
        
        // Валидация нового пароля (хотя бы на длину, как на клиенте)
        if (!newPassword || newPassword.length < 8) { // Добавим простую проверку длины
             return res.status(400).json({ error: 'Новый пароль должен быть не менее 8 символов' });
        }

        // Обновляем пароль
        await db.updateUserPassword(req.session.user.userId, newPassword);
        res.json({ success: true, message: 'Пароль успешно изменен' }); // Добавим message
    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({ error: 'Ошибка при смене пароля' }); // Изменим сообщение
    }
});

// Маршруты для работы с товарами
app.post('/api/products', requireAuth, async (req, res) => {
    try {
        const { name, categoryId, description, quantity, price } = req.body;
        const userId = req.session.user.userId; // Получаем userId из сессии
        const enterpriseId = req.session.user.enterpriseId; // Получаем enterpriseId из сессии
        
        console.log('Полученные данные для добавления товара:', req.body, `UserID: ${userId}`);

        // Проверяем наличие обязательных полей и их значения
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Название товара обязательно для заполнения' });
        }
        
        // Проверяем categoryId
        const numCategoryId = parseInt(categoryId);
        if (!categoryId || isNaN(numCategoryId)) { // Проверяем, что categoryId есть и парсится в число
            return res.status(400).json({ error: 'Выберите корректную категорию товара' });
        }

        // Проверяем quantity
        const numQuantity = parseInt(quantity);
        if (isNaN(numQuantity) || numQuantity < 0) {
            return res.status(400).json({ error: 'Укажите корректное количество товара (>= 0)' });
        }
        
        // Проверяем price
        const numPrice = parseFloat(price);
        if (isNaN(numPrice) || numPrice < 0) {
            return res.status(400).json({ error: 'Укажите корректную цену товара (>= 0)' });
        }

        // Добавляем товар, передавая enterpriseId и userId
        const productId = await db.addProduct(enterpriseId, userId, {
            name: name.trim(),
            categoryId: numCategoryId, 
            quantity: numQuantity,
            price: numPrice
        });

        // Явно устанавливаем статус 201 Created для успешного ответа
        console.log(`[Products API] Attempting to send 201 status for productId: ${productId}`); // Добавим лог перед отправкой
        res.status(201);
        console.log(`[Products API] Status code before json(): ${res.statusCode}`); // Проверим статус перед .json()
        res.json({ 
            success: true,
            productId,
            message: 'Товар успешно добавлен и залогирован.'
        });
        console.log(`[Products API] Response sent for productId: ${productId}`); // Добавим лог после отправки
    } catch (err) {
        console.error('Ошибка при добавлении товара:', err);
        // Отправляем более конкретную ошибку, если возможно
        const errorMessage = (err.code === '23503') // Код ошибки PostgreSQL для нарушения внешнего ключа
            ? 'Выбранная категория не существует.'
            : 'Произошла ошибка при добавлении товара. Попробуйте позже.';
        res.status(500).json({ error: errorMessage });
    }
});

app.get('/api/products', requireAuth, async (req, res) => {
    try {
        // Принимаем новый параметр quantityFilterType из query
        const { page = 1, limit = 10, sort, order, search, category, quantityFilterType } = req.query;
        const offset = (page - 1) * limit;
        
        // Логируем полученные параметры для отладки
        console.log('[API /products GET] Received params:', { page, limit, sort, order, search, category, quantityFilterType });

        const result = await db.getProducts(
            req.session.user.enterpriseId,
            {
                offset: parseInt(offset),
                limit: parseInt(limit),
                sort,
                order,
                search,
                category,
                quantityFilterType // Передаем новый параметр
            }
        );
        
        res.json({
            products: result.products,
            total: result.total,
            page: parseInt(page),
            totalPages: Math.ceil(result.total / limit)
        });
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

app.get('/api/categories', requireAuth, async (req, res) => {
    try {
        const categories = await db.getCategories(req.session.user.enterpriseId);
        res.json(categories);
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Маршрут для добавления новой категории
app.post('/api/categories', requireAuth, async (req, res) => {
    try {
        const { name } = req.body; // Description пока не используем
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Название категории обязательно для заполнения' });
        }
        
        // Получаем enterpriseId из сессии
        const enterpriseId = req.session.user.enterpriseId;
        if (!enterpriseId) {
             // Эта ситуация не должна возникать, если requireAuth работает правильно
             return res.status(500).json({ error: 'Не удалось определить ID предприятия пользователя' });
        }

        // Вызываем функцию для создания категории в БД
        const newCategory = await db.createCategory(enterpriseId, name.trim());
        
        // Отправляем успешный ответ с ID новой категории
        res.json({ success: true, categoryId: newCategory.categoryId, name: newCategory.name });

    } catch (err) {
        console.error('Ошибка при добавлении категории:', err);
        // Проверяем на уникальность (если будет добавлено ограничение UNIQUE на Name+EnterpriseID)
        // if (err.code === '23505') { 
        //    return res.status(400).json({ error: 'Категория с таким названием уже существует' });
        // }
        res.status(500).json({ error: 'Произошла ошибка при добавлении категории' });
    }
});

app.put('/api/products/:id/quantity', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;
        await db.updateProductQuantity(id, req.session.user.userId, quantity);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating product quantity:', err);
        res.status(500).json({ error: 'Failed to update quantity' });
    }
});

// Маршрут для получения статистики дашборда
app.get('/api/dashboard-stats', requireAuth, async (req, res) => {
    try {
        const enterpriseId = req.session.user.enterpriseId;
        if (!enterpriseId) {
            return res.status(401).json({ error: 'Enterprise ID not found in session' });
        }
        const stats = await db.getDashboardStats(enterpriseId);
        res.json(stats);
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

// Маршруты для управления пригласительными токенами (для администраторов)
app.post('/api/enterprise/invitation-tokens', requireAuth, requireAdmin, async (req, res) => {
    try {
        const enterpriseId = req.session.user.enterpriseId;
        const createdByUserId = req.session.user.userId;
        const { expiresInHours } = req.body; // Опционально, сколько часов токен будет действителен

        if (!enterpriseId) {
            return res.status(400).json({ error: 'ID предприятия не найдено в сессии администратора.' });
        }

        const tokenInfo = await db.generateInvitationToken(enterpriseId, createdByUserId, expiresInHours);
        
        console.log(`[API Response] POST /api/enterprise/invitation-tokens - Status: 201 - Token generated for enterprise ${enterpriseId}`);
        res.status(201).json({ 
            success: true, 
            message: 'Пригласительный токен успешно создан.',
            invitationToken: tokenInfo.originalToken, // Отправляем оригинальный токен админу
            tokenId: tokenInfo.tokenId, // ID токена в БД (для информации)
            expiresAt: new Date(new Date().getTime() + (expiresInHours || 24) * 60 * 60 * 1000).toISOString() // Примерное время истечения
        });
    } catch (err) {
        console.error(`[API Error] POST /api/enterprise/invitation-tokens - Status: 500 - Error:`, err);
        res.status(500).json({ error: 'Ошибка при создании пригласительного токена.' });
    }
});

app.get('/api/enterprise/invitation-tokens', requireAuth, requireAdmin, async (req, res) => {
    // TODO: Реализовать получение списка токенов для предприятия
    try {
        const enterpriseId = req.session.user.enterpriseId;
        // Пример: const tokens = await db.getInvitationTokensForEnterprise(enterpriseId);
        // Пока что заглушка:
        console.log(`[API Response] GET /api/enterprise/invitation-tokens - Status: 200 - Enterprise ${enterpriseId} - Returning placeholder`);
        res.json({ success: true, tokens: [] }); 
    } catch (err) {
        console.error(`[API Error] GET /api/enterprise/invitation-tokens - Status: 500 - Error:`, err);
        res.status(500).json({ error: 'Ошибка при получении списка токенов.' });
    }
});

// Маршруты для администрирования пользователей
app.get('/api/enterprise/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const enterpriseId = req.session.user.enterpriseId;
        if (!enterpriseId) {
            return res.status(400).json({ error: 'ID предприятия не найдено в сессии администратора.' });
        }
        const users = await db.getUsersByEnterpriseId(enterpriseId);
        console.log(`[API Response] GET /api/enterprise/users - Status: 200 - Fetched ${users.length} users for enterprise ${enterpriseId}`);
        res.json({ success: true, users });
    } catch (err) {
        console.error(`[API Error] GET /api/enterprise/users - Status: 500 - Error:`, err);
        res.status(500).json({ error: 'Ошибка при получении списка пользователей.' });
    }
});

app.put('/api/users/:userId/admin-status', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { isAdmin } = req.body; // Ожидаем boolean
        const currentAdminUserId = req.session.user.userId;

        if (typeof isAdmin !== 'boolean') {
            return res.status(400).json({ error: 'Некорректное значение для isAdmin. Ожидается true или false.' });
        }

        // Преобразуем userId к числу, если он приходит как строка из params
        const targetUserId = parseInt(userId);
        if (isNaN(targetUserId)) {
            return res.status(400).json({ error: 'Некорректный ID пользователя.' });
        }

        if (targetUserId === currentAdminUserId && !isAdmin) {
            console.warn(`[API] Admin ${currentAdminUserId} attempted to remove admin rights from themselves.`);
            return res.status(403).json({ error: 'Вы не можете снять с себя права администратора.' });
        }

        const updatedUser = await db.setUserAdminStatus(targetUserId, isAdmin, currentAdminUserId);
        console.log(`[API Response] PUT /api/users/${targetUserId}/admin-status - Status: 200 - User ${targetUserId} admin status set to ${isAdmin}`);
        res.json({ success: true, user: updatedUser, message: 'Статус администратора пользователя успешно обновлен.' });

    } catch (err) {
        console.error(`[API Error] PUT /api/users/:userId/admin-status - Status: 500 - Error:`, err);
        // Обрабатываем специфическую ошибку из db.js
        if (err.message === 'Администратор не может снять с себя права администратора.') {
            return res.status(403).json({ error: err.message });
        }
        if (err.message === 'Пользователь для обновления статуса администратора не найден.') {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Ошибка при обновлении статуса администратора пользователя.' });
    }
});

app.delete('/api/users/:userId', requireAuth, requireAdmin, async (req, res) => {
    try {
        const targetUserIdStr = req.params.userId;
        const currentAdminUserId = req.session.user.userId;
        const enterpriseId = req.session.user.enterpriseId;

        const targetUserId = parseInt(targetUserIdStr);
        if (isNaN(targetUserId)) {
            return res.status(400).json({ error: 'Некорректный ID пользователя.' });
        }

        if (targetUserId === currentAdminUserId) {
            console.warn(`[API] Admin ${currentAdminUserId} attempted to delete themselves.`);
            return res.status(403).json({ error: 'Вы не можете удалить свой собственный аккаунт.' });
        }

        const result = await db.deleteUser(targetUserId, currentAdminUserId, enterpriseId);
        console.log(`[API Response] DELETE /api/users/${targetUserId} - Status: 200 - User deleted successfully.`);
        res.json({ success: true, message: result.message, userId: result.userId });

    } catch (err) {
        console.error(`[API Error] DELETE /api/users/:userId - Status: 500 or other - Error:`, err);
        if (err.message.includes('Вы не можете удалить свой собственный аккаунт') || 
            err.message.includes('Пользователь не принадлежит вашему предприятию')) {
            return res.status(403).json({ error: err.message });
        }
        if (err.message.includes('Пользователь для удаления не найден')) {
            return res.status(404).json({ error: err.message });
        }
        // Обработка ошибки внешнего ключа, если вдруг SET NULL не сработал или есть другие ограничения
        if (err.code === '23503') { 
             console.error(`[API Error] Foreign key violation while deleting user ${req.params.userId}:`, err.detail);
             return res.status(409).json({ error: 'Невозможно удалить пользователя, так как с ним связаны другие данные (например, активные сессии или другие записи, не обработанные ON DELETE SET NULL).' });
        }
        res.status(500).json({ error: 'Ошибка при удалении пользователя.' });
    }
});

// Маршруты для отчетов
app.get('/api/reports/product-movement', requireAuth, async (req, res) => {
    try {
        const enterpriseId = req.session.user.enterpriseId;
        const { startDate, endDate, categoryId, userId, actionTypes } = req.query;

        const filters = {
            startDate: startDate || null,
            endDate: endDate || null,
            categoryId: categoryId ? parseInt(categoryId) : null,
            userId: userId ? parseInt(userId) : null,
            actionTypes: actionTypes ? actionTypes.split(',') : []
        };
        
        const reportData = await db.getProductMovementReport(enterpriseId, filters);
        res.json({ success: true, data: reportData });

    } catch (error) {
        console.error('Error generating product movement report:', error);
        res.status(500).json({ success: false, error: 'Failed to generate product movement report' });
    }
});

app.get('/api/reports/inventory-on-hand', requireAuth, async (req, res) => {
    try {
        const enterpriseId = req.session.user.enterpriseId;
        const { search, categoryId, quantityFilterType, sort, order } = req.query;

        const options = {
            search: search || undefined,
            categoryId: categoryId ? parseInt(categoryId) : undefined,
            quantityFilterType: quantityFilterType || 'all',
            sort: sort || 'productName',
            order: order || 'ASC'
        };
        
        const reportData = await db.getInventoryOnHandReport(enterpriseId, options);
        res.json({ success: true, data: reportData });

    } catch (error) {
        console.error('Error generating inventory on hand report:', error);
        res.status(500).json({ success: false, error: 'Failed to generate inventory on hand report' });
    }
});

// Запуск сервера
// Функция startServer больше не нужна, так как пул соединений
// инициализируется при подключении модуля db.js

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Ловим необработанные ошибки, чтобы сервер не падал
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // В продакшене здесь может быть логирование в систему мониторинга
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // В продакшене здесь может быть логирование в систему мониторинга
});
