FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src/

# Build com verificação — falha explicitamente se dist não for gerado
RUN npm run build && ls -la dist/

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tzdata openssl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma/
RUN npx prisma generate

# Copia o dist do estágio de build
COPY --from=build /app/dist ./dist

# Verifica se o dist foi copiado corretamente
RUN ls -la dist/ && echo "✅ dist/main.js existe" || (echo "❌ dist/ vazio!" && exit 1)

# Cria pasta uploads
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]