FROM node:22-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src

# Public AWS trust anchors, not credentials. Node validates RDS certificates.
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
RUN chmod 444 /app/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/rds-global-bundle.pem
USER node

ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "src/api/server.ts"]
