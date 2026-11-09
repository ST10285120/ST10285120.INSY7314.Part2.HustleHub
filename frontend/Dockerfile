# syntax=docker/dockerfile:1

# ---- Stage 1: build the static React app ------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# In the container the browser talks to nginx only; nginx proxies /api.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---- Stage 2: serve with an unprivileged nginx ------------------------------
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

LABEL org.opencontainers.image.title="hustlehub-client" \
      org.opencontainers.image.description="HustleHub+ React frontend served by nginx"

USER root
RUN apk add --no-cache openssl \
 && mkdir -p /etc/nginx/certs \
 && chown -R 101:101 /etc/nginx/certs
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=755 docker/15-generate-cert.sh /docker-entrypoint.d/15-generate-cert.sh
COPY --from=build /app/dist /usr/share/nginx/html

# Back to the image's unprivileged nginx user (uid 101).
USER 101

EXPOSE 8443

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q --no-check-certificate -O /dev/null https://127.0.0.1:8443/healthz || exit 1
