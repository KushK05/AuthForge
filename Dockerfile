FROM node:22-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src

ENV NODE_ENV=production

CMD ["npm", "run", "start:api"]
