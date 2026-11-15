# Layer Cache Optimization Principles

Maximize cache hits across CI builds:
1. Copy dependency descriptors first (`package*.json`, `go.mod`).
2. Run package installations (`npm ci`, `go mod download`).
3. Copy source code files (`COPY . .`) only after dependencies are cached.
