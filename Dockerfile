# Используем официальный образ Node.js LTS
FROM node:lts-alpine

# Устанавливаем рабочую директорию в контейнере
WORKDIR /usr/src/app

# Копируем package.json и package-lock.json
# Используем wildcard *, чтобы скопировать оба файла
COPY package*.json ./

# Устанавливаем зависимости приложения
# Используем --only=production для установки только production зависимостей,
# если devDependencies не нужны для запуска
RUN npm install --only=production
# Если devDependencies нужны (например, для nodemon), используйте:
# RUN npm install

# Копируем исходный код приложения
# Используем .dockerignore для исключения ненужных файлов
COPY . .

# Открываем порт, на котором работает приложение
EXPOSE 3000

# Команда для запуска приложения
CMD [ "node", "server/server.js" ]
# Или используйте "npm", "start", если скрипт start определен в package.json
# CMD [ "npm", "start" ] 