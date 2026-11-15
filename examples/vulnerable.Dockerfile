# Vulnerable single-stage Node.js container
# Anti-patterns: root execution, unpinned tag, cache-busting copy, baked mock token, missing healthcheck
FROM node:latest

# Missing non-root user (runs as root)
WORKDIR /app

# Cache bust: Copying entire directory before installing dependencies!
COPY . .

# Inefficient package install with lingering apt cache
RUN apt-get update && apt-get install -y curl python3 build-essential

# Hardcoded mock credential (anti-pattern)
ENV APP_ENV=production
ENV SERVICE_API_KEY=mock_dev_dummy_token_12345

RUN npm install

EXPOSE 3000
CMD ["node", "server.js"]
