const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const port = 3000;

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

// Маршруты аутентификации
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email, enterpriseName, joinExisting, enterpriseId } = req.body;
        
        // !! Добавить валидацию входных данных на сервере (длина, формат и т.д.) !!

        let userEnterpriseId = joinExisting ? parseInt(enterpriseId) : null;
        
        if (!joinExisting) {
            if (!enterpriseName || enterpriseName.trim() === '') {
                return res.status(400).json({ error: 'Название предприятия обязательно для заполнения при создании нового предприятия.' });
            }
            // Создаем новое предприятие
            console.log(`[Register] Creating enterprise with name: ${enterpriseName.trim()}`);
            userEnterpriseId = await db.createEnterprise(enterpriseName.trim());
            console.log(`[Register] Created enterprise ID: ${userEnterpriseId}`); // Логируем полученный ID
        } else {
            if (!userEnterpriseId || isNaN(userEnterpriseId)) {
                 return res.status(400).json({ error: 'Некорректный ID предприятия для присоединения.' });
            }
            console.log(`[Register] Joining existing enterprise ID: ${userEnterpriseId}`);
        }
        
        // Проверяем ID перед созданием пользователя
        if (userEnterpriseId === null || userEnterpriseId === undefined) {
            console.error('[Register] Error: userEnterpriseId is null or undefined before creating user.');
            return res.status(500).json({ error: 'Ошибка при определении предприятия пользователя.' });
        }

        // Создаем пользователя
        console.log(`[Register] Creating user with enterpriseId: ${userEnterpriseId}`);
        const newUserInfo = await db.createUser(username, password, email, userEnterpriseId);
        console.log(`[Register] Created user info:`, newUserInfo);
        
        // !!! Сразу после успешной регистрации устанавливаем сессию !!!
        req.session.user = {
            userId: newUserInfo.userid, 
            username: username,
            enterpriseId: userEnterpriseId
        };
        console.log(`[Register] Session set:`, req.session.user);

        // Отправляем ответ
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
            req.session.user = user;
            res.json({ success: true, user });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
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
        res.json({
            authenticated: true,
            username: req.session.user.username,
            email: req.session.user.email,
            enterprise: req.session.user.enterpriseName
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
        const { email } = req.body;
        await db.updateUserProfile(req.session.user.userId, email);
        req.session.user.email = email;
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

app.post('/api/profile/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // Проверяем текущий пароль
        const user = await db.authenticateUser(req.session.user.username, currentPassword);
        if (!user) {
            res.status(401).json({ error: 'Current password is incorrect' });
            return;
        }
        
        // Обновляем пароль
        await db.updateUserPassword(req.session.user.userId, newPassword);
        res.json({ success: true });
    } catch (err) {
        console.error('Error changing password:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Маршруты для работы с товарами
app.post('/api/products', requireAuth, async (req, res) => {
    try {
        // Получаем categoryId вместо category
        const { name, categoryId, description, quantity, price } = req.body;
        
        console.log('Полученные данные для добавления товара:', req.body);

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

        // Добавляем товар, передавая categoryId
        const productId = await db.addProduct(req.session.user.enterpriseId, {
            name: name.trim(),
            categoryId: numCategoryId, // Передаем распарсенный ID
            // description: description ? description.trim() : '', // Оставим, хотя в db.js не используется
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
            message: 'Товар успешно добавлен'
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
