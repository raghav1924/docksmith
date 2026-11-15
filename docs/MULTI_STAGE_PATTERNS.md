# Multi-Stage Build Architectural Patterns

Separate compilation dependencies from minimal production runtimes:
- **Builder Stage**: Full SDK, compilers, dev dependencies (`AS builder`).
- **Runtime Stage**: Distroless or Alpine base with only compiled artifacts (`COPY --from=builder`).
