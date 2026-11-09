# syntax=docker/dockerfile:1

# ---- Stage 1: production dependencies only ----------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=dev keeps Jest, Supertest and mongodb-memory-server out of the image.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.title="hustlehub-api" \
      org.opencontainers.image.description="HustleHub+ secure freelance marketplace API"

# The TLS key/cert paths default in docker-entrypoint.sh (not ENV here), so no
# secret-looking variable is baked into the image metadata (Trivy DS-0031).
ENV NODE_ENV=production \
    PORT=5443 \
    LOG_TO_FILE=false

# tini: proper PID 1 (signal forwarding for graceful shutdown).
# openssl: generates a self-signed dev certificate at first start if none is mounted.
RUN apk add --no-cache tini openssl

WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /app/certs && chown node:node /app/certs

# Never run as root.
USER node

EXPOSE 5443

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('https').get({host:'127.0.0.1',port:process.env.PORT||5443,path:'/api/health',rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "server.js"]
