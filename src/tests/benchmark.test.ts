import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DockerfileAuditor } from '../core/auditor.js';
import { MultiStageGraphBuilder } from '../core/graph.js';
import { DockerfileParser } from '../core/parser.js';
import { DockerfileHardener } from '../core/hardener.js';

describe('Performance Benchmarks', () => {
  it('should audit complex Dockerfile in sub-50ms', () => {
    const complexDockerfile = `
FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM alpine:3.20 AS runtime
WORKDIR /app
RUN apk add --no-cache nodejs
COPY --from=builder /app/dist ./dist
USER 10001
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:8080/health || exit 1
EXPOSE 8080
CMD ["node", "dist/server.js"]
`;

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      const doc = DockerfileParser.parse(complexDockerfile);
      DockerfileAuditor.audit(doc);
      const graph = MultiStageGraphBuilder.build(doc);
      MultiStageGraphBuilder.toMermaid(graph);
      DockerfileHardener.harden(complexDockerfile);
    }
    const elapsed = performance.now() - start;
    const avgPerRun = elapsed / 50;

    // Zero-dependency pure TS parsing should easily run in under 10ms per cycle
    assert.ok(avgPerRun < 50, `Average time per audit & harden was ${avgPerRun.toFixed(2)}ms, expected < 50ms`);
  });
});
