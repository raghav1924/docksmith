# Non-Root Execution Enforcement

Running containers as UID 0 exposes the underlying host kernel to breakout hazards:
- Always create a dedicated unprivileged user (`adduser -S appuser`).
- Explicitly declare `USER appuser` before the final `ENTRYPOINT` or `CMD`.
