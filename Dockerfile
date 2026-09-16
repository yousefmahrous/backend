# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1) deps — full install (dependencies + devDependencies)
#    prisma CLI is a devDependency, so `postinstall: prisma generate`
#    can only run in a stage that has the dev deps installed.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma's engines are linked against OpenSSL; alpine/musl needs it explicitly.
RUN apk add --no-cache openssl

# prisma.config.js resolves env('DATABASE_URL') at generate time.
# This placeholder is BUILD-ONLY and is never present in the runtime stage —
# the real connection string is injected at run time.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

COPY package.json package-lock.json ./
COPY prisma.config.js ./
COPY prisma ./prisma

# npm ci (not npm install): installs exactly what's in the lockfile.
RUN npm ci

# ---------------------------------------------------------------------------
# 2) migrator — one-shot image used to run migrations
#    `prisma migrate deploy` needs the prisma CLI, which we deliberately
#    keep OUT of the runtime image. Build with:
#      docker build --target migrator -t backend-migrator .
#    or reference `target: migrator` from a docker-compose service.
# ---------------------------------------------------------------------------
FROM deps AS migrator
WORKDIR /app
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# 3) prod-deps — strip devDependencies, keep the generated Prisma client
#    npm ignores dot-directories, so node_modules/.prisma survives the prune.
#    Pruning here (not in the runtime stage) means the fat node_modules layer
#    never ends up in the final image.
# ---------------------------------------------------------------------------
FROM deps AS prod-deps
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# 4) runtime — what actually ships
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma.config.js ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src

# Fail the build (instead of the first request) if the Prisma client
# didn't survive the prune for any reason.
RUN node -e "import('@prisma/client').then(() => console.log('prisma client OK'))"

# Don't run as root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# node directly, NOT `npm run ...`:
# npm swallows SIGTERM, which means `docker stop` would hang for 10s and then
# SIGKILL the process mid-request.
CMD ["node", "src/app.js"]