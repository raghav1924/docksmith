import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DockerfileAuditor } from '../core/auditor.js';
import { AuditFinding } from '../core/types.js';

describe('DockerfileAuditor', () => {
  it('should detect root user execution (SEC-001)', () => {
    const content = `
FROM node:22-alpine
WORKDIR /app
COPY . .
CMD ["node", "app.js"]
`;
    const report = DockerfileAuditor.audit(content);
    const sec001 = report.findings.find((f: AuditFinding) => f.id === 'SEC-001' || f.ruleId === 'SEC-001');
    assert.ok(sec001, 'Should find SEC-001 root user warning');
    assert.ok(['critical', 'high'].includes(sec001?.severity.toLowerCase() || ''));
  });

  it('should detect unpinned or floating base image tags (SEC-003)', () => {
    const content = `
FROM python:latest
WORKDIR /app
USER app
`;
    const report = DockerfileAuditor.audit(content);
    const sec003 = report.findings.find((f: AuditFinding) => f.id === 'SEC-003' || f.ruleId === 'SEC-003');
    assert.ok(sec003, 'Should find SEC-003 floating tag');
  });

  it('should detect uncleaned package manager caches (SEC-004)', () => {
    const content = `
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y curl
USER app
`;
    const report = DockerfileAuditor.audit(content);
    const sec004 = report.findings.find((f: AuditFinding) => f.id === 'SEC-004' || f.ruleId === 'SEC-004');
    assert.ok(sec004, 'Should find SEC-004 apt-cache');
  });

  it('should detect cache busting COPY ordering (OPT-001)', () => {
    const content = `
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
USER node
`;
    const report = DockerfileAuditor.audit(content);
    const opt001 = report.findings.find((f: AuditFinding) => f.id === 'OPT-001' || f.ruleId === 'OPT-001');
    assert.ok(opt001, 'Should detect cache invalidation before npm install');
  });

  it('should detect missing healthcheck (SEC-006)', () => {
    const content = `
FROM node:22-alpine
WORKDIR /app
USER node
CMD ["node", "server.js"]
`;
    const report = DockerfileAuditor.audit(content);
    const sec006 = report.findings.find((f: AuditFinding) => f.id === 'SEC-006' || f.ruleId === 'SEC-006');
    assert.ok(sec006, 'Should detect missing HEALTHCHECK');
  });

  it('should give an A or A+ grade for a pristine multi-stage Dockerfile', () => {
    const content = `
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk update && apk upgrade --no-cache && adduser -S appuser
COPY --from=builder /app/dist ./dist
USER appuser
HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/ || exit 1
CMD ["node", "dist/index.js"]
`;
    const report = DockerfileAuditor.audit(content);
    assert.ok(report.score >= 85, `Score was ${report.score}, expected >= 85`);
    assert.ok(['A', 'A+'].includes(report.grade), `Grade was ${report.grade}`);
  });
});
