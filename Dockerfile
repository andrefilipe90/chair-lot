# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM base AS build
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dummy"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run generate \
 && npx next build

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
WORKDIR /app
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/package.json ./
COPY --from=build --chown=nextjs:nodejs /app/next.config.js ./
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/src/server/env.js ./src/server/env.js
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
USER nextjs
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
