# Docker Layer Cache Optimization Guide

Optimizing Dockerfile structure significantly decreases CI build times and container image transfer overhead.

---

### 1. Order Instructions by Change Frequency
Docker caches layers sequentially. When an instruction changes, all subsequent cached layers are invalidated.

**Anti-Pattern:**
```dockerfile
# Busts cache on any source code change!
COPY . .
RUN npm install
```

**Optimized Pattern:**
```dockerfile
# Package descriptors change rarely:
COPY package*.json ./
RUN npm ci

# Source code changes frequently:
COPY . .
RUN npm run build
```

---

### 2. Multi-Stage Builds for Minimal Runtime Images
Avoid shipping build toolchains, compilers, header files, and documentation in production images.

```dockerfile
# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/service

# Runtime stage
FROM alpine:3.20
COPY --from=builder /bin/service /usr/local/bin/service
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/service"]
```

---

### 3. Maintain Comprehensive .dockerignore
Without a `.dockerignore` file, the Docker client uploads your entire working directory to the Docker daemon on every build.

Always exclude:
- `.git`
- `node_modules`
- `dist` / `build`
- `coverage`
- `.env*`
