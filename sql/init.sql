-- Создание таблицы предприятий
CREATE TABLE IF NOT EXISTS Enterprises (
    EnterpriseID SERIAL PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    CreatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы пользователей
CREATE TABLE IF NOT EXISTS Users (
    UserID SERIAL PRIMARY KEY,
    Username VARCHAR(50) NOT NULL UNIQUE,
    PasswordHash VARCHAR(256) NOT NULL,
    Email VARCHAR(100) NOT NULL UNIQUE,
    EnterpriseID INT,
    CreatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (EnterpriseID) REFERENCES Enterprises(EnterpriseID)
);

-- Создание таблицы категорий товаров
CREATE TABLE IF NOT EXISTS Categories (
    CategoryID SERIAL PRIMARY KEY,
    Name VARCHAR(50) NOT NULL,
    EnterpriseID INT,
    FOREIGN KEY (EnterpriseID) REFERENCES Enterprises(EnterpriseID)
);

-- Создание таблицы товаров
CREATE TABLE IF NOT EXISTS Products (
    ProductID SERIAL PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    CategoryID INT,
    Quantity INT NOT NULL DEFAULT 0,
    Price DECIMAL(18,2) NOT NULL,
    EnterpriseID INT,
    CreatedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID),
    FOREIGN KEY (EnterpriseID) REFERENCES Enterprises(EnterpriseID)
);

-- Создание таблицы для логов изменений
CREATE TABLE IF NOT EXISTS ProductLogs (
    LogID SERIAL PRIMARY KEY,
    ProductID INT,
    UserID INT,
    Action VARCHAR(50),
    OldValue TEXT, -- Используем TEXT вместо NVARCHAR(MAX)
    NewValue TEXT, -- Используем TEXT вместо NVARCHAR(MAX)
    LogDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ProductID) REFERENCES Products(ProductID),
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

-- Добавление тестовых данных (если таблицы были только что созданы)
-- Добавляем проверку, чтобы избежать дублирования при повторном запуске
DO $$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM Enterprises WHERE Name = 'Тестовое предприятие') THEN
      INSERT INTO Enterprises (Name) VALUES ('Тестовое предприятие');
   END IF;
END $$;

DO $$
DECLARE
    test_enterprise_id INT;
BEGIN
    SELECT EnterpriseID INTO test_enterprise_id FROM Enterprises WHERE Name = 'Тестовое предприятие' LIMIT 1;

    IF NOT EXISTS (SELECT 1 FROM Categories WHERE Name = 'Электроника' AND EnterpriseID = test_enterprise_id) THEN
        INSERT INTO Categories (Name, EnterpriseID) 
        VALUES 
            ('Электроника', test_enterprise_id),
            ('Мебель', test_enterprise_id),
            ('Одежда', test_enterprise_id),
            ('Продукты питания', test_enterprise_id);
    END IF;
END $$;

DO $$
DECLARE
    test_enterprise_id INT;
    electronics_category_id INT;
    furniture_category_id INT;
    clothing_category_id INT;
    food_category_id INT;
BEGIN
    SELECT EnterpriseID INTO test_enterprise_id FROM Enterprises WHERE Name = 'Тестовое предприятие' LIMIT 1;
    SELECT CategoryID INTO electronics_category_id FROM Categories WHERE Name = 'Электроника' AND EnterpriseID = test_enterprise_id LIMIT 1;
    SELECT CategoryID INTO furniture_category_id FROM Categories WHERE Name = 'Мебель' AND EnterpriseID = test_enterprise_id LIMIT 1;
    SELECT CategoryID INTO clothing_category_id FROM Categories WHERE Name = 'Одежда' AND EnterpriseID = test_enterprise_id LIMIT 1;
    SELECT CategoryID INTO food_category_id FROM Categories WHERE Name = 'Продукты питания' AND EnterpriseID = test_enterprise_id LIMIT 1;

    IF NOT EXISTS (SELECT 1 FROM Products WHERE Name = 'Ноутбук Dell XPS 13' AND EnterpriseID = test_enterprise_id) THEN
        INSERT INTO Products (Name, CategoryID, Quantity, Price, EnterpriseID)
        VALUES 
            ('Ноутбук Dell XPS 13', electronics_category_id, 15, 89999.00, test_enterprise_id),
            ('Смартфон iPhone 13', electronics_category_id, 25, 79999.00, test_enterprise_id),
            ('Монитор Samsung', electronics_category_id, 30, 19999.00, test_enterprise_id),
            ('Диван угловой', furniture_category_id, 5, 45999.00, test_enterprise_id),
            ('Куртка зимняя', clothing_category_id, 50, 5999.00, test_enterprise_id),
            ('Молоко 3.2%', food_category_id, 100, 89.00, test_enterprise_id);
    END IF;
END $$;
