# node:24-alpine index digest verified from Docker Hub on 2026-07-17.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build

WORKDIR /workspace
RUN corepack enable
COPY . .
RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm --filter @aker-build/github-app-server build

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

RUN apk add --no-cache git \
    && mkdir -p /var/lib/aker-build/tmp \
    && chown -R node:node /var/lib/aker-build
WORKDIR /app
COPY --from=build --chown=node:node /workspace/packages/github-app-server/dist ./dist

ENV NODE_ENV=production \
    PORT=3000 \
    AKER_BUILD_BIND_HOST=0.0.0.0 \
    AKER_BUILD_TMP_ROOT=/var/lib/aker-build/tmp

VOLUME ["/var/lib/aker-build/tmp"]
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/healthz | grep -q '"status":"ok"' || exit 1

CMD ["node", "dist/server.mjs"]
