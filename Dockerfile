# syntax=docker/dockerfile:1

# --- build: install everything, build the web app and bundle the API -------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# --- runtime: the bundle has no node_modules to install --------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_ROOT=/app/web
COPY --from=build /app/apps/api/dist ./api
COPY --from=build /app/apps/web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "api/server.mjs"]
