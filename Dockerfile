FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src/
RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tzdata openssl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma/
RUN npx prisma generate

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start:docker"]
