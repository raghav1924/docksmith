import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DockerfileHardener } from '../core/hardener.js';

describe('DockerfileHardener', () => {
  it('should inject non-root USER directive when missing', () => {
    const raw = `FROM node:22-alpine\nWORKDIR /app\nCMD ["node", "app.js"]\n`;
    const result = DockerfileHardener.harden(raw);
    assert.ok(result.appliedFixes.length > 0);
    assert.ok(result.hardenedDockerfile.includes('USER appuser') || result.hardenedDockerfile.includes('USER '));
  });

  it('should inject WORKDIR if missing', () => {
    const raw = `FROM alpine:3.20\nCMD ["sh"]\n`;
    const result = DockerfileHardener.harden(raw);
    assert.ok(result.hardenedDockerfile.includes('WORKDIR /app'));
  });

  it('should replace ADD with COPY when not fetching tar archive', () => {
    const raw = `FROM alpine:3.20\nWORKDIR /app\nADD config.json /app/config.json\nUSER 1000\n`;
    const result = DockerfileHardener.harden(raw);
    assert.ok(!result.hardenedDockerfile.includes('ADD config.json'));
    assert.ok(result.hardenedDockerfile.includes('COPY config.json /app/config.json'));
  });

  it('should add --no-install-recommends to apt-get install commands', () => {
    const raw = `FROM debian:bookworm-slim\nWORKDIR /app\nRUN apt-get update && apt-get install -y curl\nUSER app\n`;
    const result = DockerfileHardener.harden(raw);
    assert.ok(result.hardenedDockerfile.includes('--no-install-recommends'));
    assert.ok(result.hardenedDockerfile.includes('rm -rf /var/lib/apt/lists/*'));
  });
});
