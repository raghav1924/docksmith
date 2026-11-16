# BuildKit Secret Mounts vs Baked Secrets

Never pass secrets via `ENV` or `ARG`:
```dockerfile
# INSECURE: Permanently visible in docker history
ARG GITHUB_TOKEN
RUN npm install

# SECURE: Mounted in memory during build step only
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm install
```
