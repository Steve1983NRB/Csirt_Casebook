ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

ENV CI=true \
    NODE_ENV=production \
    SITES_RUNTIME_ROOT=/data/runtime \
    CASEBOOK_DATA=/data

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN NODE_ENV=development pnpm install --frozen-lockfile

COPY . .
# Normalise line endings: a CRLF shebang makes the container fail with "no such file or directory".
RUN pnpm build \
 && mkdir -p /data \
 && sed -i 's/\r$//' /app/docker/entrypoint.sh \
 && chmod +x /app/docker/entrypoint.sh \
 && chown -R node:node /app /data

USER node
VOLUME /data
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5173/api/auth/session').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker/entrypoint.sh"]
