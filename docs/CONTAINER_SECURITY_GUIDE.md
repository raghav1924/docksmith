# Container Security Hardening Guide

A practical guide for engineering teams containerizing workloads with Docker and Kubernetes.

---

### 1. Principle of Least Privilege: Non-Root Execution
Running as root inside a container grants full root privileges if an attacker achieves remote code execution. If the host daemon is misconfigured or a vulnerability allows container escape, host compromise is possible.

**Best Practice:**
```dockerfile
# Alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Debian / Ubuntu
RUN useradd --create-home --shell /bin/bash appuser
USER appuser
```

---

### 2. Base Image Pinning
Avoid mutable tags such as `:latest`, `:alpine`, or major version shortcuts without patch pinning. Upstream maintainers can push breaking changes or compromised layers at any time.

**Best Practice:**
Pin to exact version tags or image digests (`@sha256:...`):
```dockerfile
FROM node:22.11.0-alpine3.20
```

---

### 3. Layer Cache Hygiene
Every `RUN` statement creates an immutable layer. Installing packages without removing the package manager cache bloats the final image by dozens or hundreds of megabytes.

**Best Practice:**
Combine update, install, and cache deletion in a single layer:
```dockerfile
# Debian / Ubuntu
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Alpine
RUN apk add --no-cache curl ca-certificates
```

---

### 4. Never Bake Secrets into Image Layers
Setting secrets via `ENV` or `ARG` persists them into the container image metadata. Anyone with read access to the image can run `docker history --no-trunc` and extract them.

**Best Practice:**
Mount secrets dynamically at build time or provide them at container runtime:
```dockerfile
# BuildKit secret mounting (not stored in image)
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm install
```
