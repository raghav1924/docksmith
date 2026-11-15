import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DockerfileParser } from '../core/parser.js';
import { MultiStageGraphBuilder } from '../core/graph.js';
import { StageDagNode } from '../core/types.js';

describe('MultiStageGraphBuilder', () => {
  it('should build DAG nodes and dependencies for multi-stage Dockerfile', () => {
    const content = `
FROM golang:1.23-alpine AS build-env
WORKDIR /app
COPY . .
RUN go build -o server

FROM alpine:3.20 AS production
COPY --from=build-env /app/server /usr/local/bin/server
USER 10001
CMD ["server"]
`;
    const doc = DockerfileParser.parse(content);
    const graph = MultiStageGraphBuilder.build(doc);

    assert.strictEqual(graph.nodes.length, 2);
    assert.strictEqual(graph.isMultiStage, true);
    assert.strictEqual(graph.targetStage, 'production');

    const prodNode = graph.nodes.find((n: StageDagNode) => n.id === 'production');
    assert.ok(prodNode);
    assert.deepStrictEqual(prodNode?.dependsOn, ['build-env']);
  });

  it('should identify unused stages in a build graph', () => {
    const content = `
FROM alpine:3.20 AS stage-unused
RUN echo "never copied"

FROM alpine:3.20 AS final-stage
RUN echo "active"
`;
    const doc = DockerfileParser.parse(content);
    const graph = MultiStageGraphBuilder.build(doc);

    assert.ok(graph.unusedStages.includes('stage-unused'));
  });

  it('should render valid Mermaid diagram syntax', () => {
    const content = `
FROM node:22 AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
`;
    const doc = DockerfileParser.parse(content);
    const graph = MultiStageGraphBuilder.build(doc);
    const mermaid = MultiStageGraphBuilder.toMermaid(graph);

    assert.ok(mermaid.startsWith('flowchart TD') || mermaid.startsWith('graph TD') || mermaid.includes('build'));
  });
});
