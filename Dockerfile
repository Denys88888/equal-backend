FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma/

RUN npm install && npx prisma generate

COPY . .

RUN npm run build

EXPOSE 10000

CMD ["node", "dist/main"]
