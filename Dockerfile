# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Forzar NODE_ENV=development para incluir devDeps (TypeScript, etc.)
RUN NODE_ENV=development npm install

COPY . .

RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# npm install en lugar de npm ci (no requiere package-lock.json)
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 5000

ENV PORT=5000

CMD ["node", "dist/server/index.js"]

