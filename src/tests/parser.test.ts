import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DockerfileParser } from '../core/parser.js';
import { DockerInstruction } from '../core/types.js';

describe('DockerfileParser', () => {
  it('should parse simple instructions and stages correctly', () => {
    const content = `
# Comment line
FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install
CMD ["node", "index.js"]
`;
    const dockerfile = DockerfileParser.parse(content);
    assert.strictEqual(dockerfile.stages.length, 1);
    assert.strictEqual(dockerfile.allInstructions.length, 5);
    assert.strictEqual(dockerfile.stages[0].baseImage, 'node');
  });

  it('should handle multi-line continuations with backslash', () => {
    const content = `
FROM debian:bookworm-slim
RUN apt-get update && \\
    apt-get install -y --no-install-recommends curl \\
    ca-certificates && \\
    rm -rf /var/lib/apt/lists/*
`;
    const dockerfile = DockerfileParser.parse(content);
    assert.strictEqual(dockerfile.allInstructions.length, 2);
    const runInstruction = dockerfile.allInstructions.find((i: DockerInstruction) => i.instruction === 'RUN');
    assert.ok(runInstruction);
    if (!runInstruction) throw new Error('runInstruction not found');
    assert.ok(runInstruction.raw.includes('apt-get install'));
    assert.ok(runInstruction.raw.includes('rm -rf /var/lib/apt/lists/*'));
  });

  it('should extract flags correctly (e.g., --from=builder)', () => {
    const content = `
FROM alpine:3.20 AS runner
COPY --from=builder /bin/app /usr/local/bin/app
`;
    const dockerfile = DockerfileParser.parse(content);
    const copyInstruction = dockerfile.allInstructions.find((i: DockerInstruction) => i.instruction === 'COPY');
    assert.ok(copyInstruction);
    if (!copyInstruction) throw new Error('copyInstruction not found');
    assert.ok(copyInstruction.flags);
    assert.strictEqual(copyInstruction.flags['from'], 'builder');
  });

  it('should parse multi-stage builds and stage names correctly', () => {
    const content = `
FROM golang:1.23 AS build-stage
WORKDIR /src
COPY . .
RUN go build -o /bin/hello

FROM alpine:3.20 AS production-stage
COPY --from=build-stage /bin/hello /bin/hello
USER 1000
CMD ["/bin/hello"]
`;
    const dockerfile = DockerfileParser.parse(content);
    assert.strictEqual(dockerfile.stages.length, 2);
    assert.strictEqual(dockerfile.stages[0].name, 'build-stage');
    assert.strictEqual(dockerfile.stages[0].baseImage, 'golang');
    assert.strictEqual(dockerfile.stages[1].name, 'production-stage');
    assert.strictEqual(dockerfile.stages[1].baseImage, 'alpine');
  });
});
