FROM node:20-alpine

WORKDIR /app

# Установка зависимостей для Prisma
RUN apk add --no-cache openssl

# Копируем package.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходники
COPY . .

# Генерируем Prisma клиент
RUN npx prisma generate

# Собираем проект
RUN npm run build

EXPOSE 3001

# Запуск с миграциями
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
