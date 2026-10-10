# ---- build + test stage (tests must pass or the image is not built) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY test ./test
RUN npm test && npm prune --omit=dev

# ---- minimal runtime stage ----
FROM node:24-alpine
# patch OS packages; drop npm/npx/corepack/yarn (not needed at runtime, frequent CVE source); add unprivileged user
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn* \
 && adduser -D -H -u 10001 appuser
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=3000
USER 10001
EXPOSE 3000
CMD ["node", "src/server.js"]
