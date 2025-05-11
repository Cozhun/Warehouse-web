# Используем официальный образ Node.js
FROM node:20-slim

# Устанавливаем рабочую директорию в контейнере
WORKDIR /usr/src/app

# Устанавливаем зависимости для сборки нативных модулей
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    make \
    g++ \
    python-is-python3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Очистим старые модули и лок-файл (если они были скопированы из хоста неявно)
# ВНИМАНИЕ: Это может привести к установке других версий пакетов, чем в package-lock.json
# Рассмотрите удаление node_modules локально перед сборкой, если хотите сохранить package-lock.json
RUN rm -rf node_modules package-lock.json

# Копируем package.json и (опционально) package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
# Попробуем пересобрать bcrypt принудительно
RUN npm install --build-from-source=bcrypt

# Копируем исходный код приложения
COPY . .

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Запускаем приложение
CMD [ "npm", "start" ] 