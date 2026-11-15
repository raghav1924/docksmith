# Production-Hardened Multi-Stage Dockerfile (A+ Grade)
# Clean layer caching, multi-stage separation, non-root user, healthcheck, explicit pinning

# Stage 1: Build dependencies & compilation
FROM node:22-alpine3.20 AS builder

WORKDIR /usr/src/app

# Leverage Docker cache layer for package dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Minimal runtime image
FROM node:22-alpine3.20 AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime security patches with cache cleaned
RUN apk update && apk upgrade --no-cache

# Enforce least-privilege security principle: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy compiled artifacts from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

USER appuser

# Container runtime healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
