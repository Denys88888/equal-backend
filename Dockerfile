# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Clear npm and Docker cache (fixes Render cache errors)
# Cache bust: increment this number to force fresh build
ARG CACHE_BUST=2

RUN npm cache clean --force

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 3000

# Start: migrate DB, then run app (seed is optional)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
