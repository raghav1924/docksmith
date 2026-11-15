# DockSmith

> Developer-First Dockerfile Linter, Security Auditor, Layer Cache Optimizer & Multi-Stage DAG Studio.

Built with pure TypeScript and Node.js standard libraries. Zero external npm dependencies.

Developed by [Jatin Sharma](https://jatinsh.netlify.app/) ([@raghav1924](https://github.com/raghav1924)).

---

## Overview

Container security and build performance frequently suffer from common anti-patterns:
- **Root User Hazards**: Containers executing as UID 0 expose host systems to breakout risks.
- **Layer Cache Invalidation**: Placing broad file copies (`COPY . .`) before package installation forces full rebuilds on every edit.
- **Secrets in Layers**: Setting tokens via `ENV` or `ARG` bakes credentials into the immutable image history.
- **Single-Stage Image Bloat**: Leaving compilers, SDKs, and build dependencies in production images inflates attack surfaces and deployment sizes.
- **Missing Healthchecks**: Orchestrators cannot verify container readiness or detect deadlocks.

**DockSmith** solves these issues with static analysis, automated hardening, multi-stage DAG topology extraction, and an interactive dark-mode Web Studio.

---

## Features

- **12+ Production Security & Optimization Checks**:
  - `SEC-001`: Root user execution detection
  - `SEC-002`: Baked credentials and secret detection in `ENV` / `ARG`
  - `SEC-003`: Floating / unpinned base image tags (`:latest`)
  - `SEC-004`: Package cache cleanup validation (`apt-get`, `apk`, `dnf`, `yum`)
  - `SEC-005`: Insecure `ADD` vs `COPY` auditing
  - `SEC-006`: Container healthcheck presence
  - `OPT-001`: Build cache invalidation detection
  - `OPT-002`: Single-stage production bloat auditing
  - `OPT-003`: Consecutive `RUN` consolidation recommendation
  - `OPT-004`: Build context `.dockerignore` presence & completeness
  - `HYG-001`: Working directory (`WORKDIR`) specification
  - `HYG-002`: Deprecated `MAINTAINER` instruction detection
- **Automated Hardener**: Instantly patches missing `USER`, `WORKDIR`, `HEALTHCHECK`, and package manager flags.
- **Multi-Stage DAG Graph**: Analyzes stage inheritance, artifact passing (`--from=stage`), critical paths, and unused build stages. Generates Mermaid flowchart syntax.
- **Embedded Web Studio**: Zero-dependency local dashboard on port `5353` with visual health scores, findings list, DAG diagram, and one-click auto-hardening.
- **CI / CD Ready**: Configurable quality gates (`--min-score`, `--fail-on-sec`, `--json`).
- **High Performance**: Sub-50ms audit throughput on complex multi-stage configurations.

---

## Installation & Quick Start

```bash
# Clone the repository
git clone https://github.com/raghav1924/docksmith.git
cd docksmith

# Compile TypeScript
npm run build

# Run unit test suite
npm test
```

---

## CLI Usage

```bash
# Audit all Dockerfiles in current directory
node dist/bin.js audit .

# Enforce CI quality gates
node dist/bin.js audit . --min-score=85 --fail-on-sec

# Inspect multi-stage build dependency DAG
node dist/bin.js dag examples/hardened-multi-stage.Dockerfile

# Automatically fix security issues
node dist/bin.js fix examples/vulnerable.Dockerfile

# Launch interactive Web Studio
node dist/bin.js studio --port=5353
```

---

## Embedded Web Studio

Start the embedded studio:

```bash
node dist/bin.js studio
# Open http://localhost:5353 in your browser
```

The Web Studio provides:
- Live scan of workspace Dockerfiles
- Color-coded security grades (A+, A, B, C, F)
- Detailed remediation recommendations
- Interactive multi-stage visual DAG graph
- Automated one-click hardening with instant diff preview

---

## Programmatic API

```typescript
import { DockerfileParser, DockerfileAuditor, DockerfileHardener, MultiStageGraphBuilder } from 'docksmith';

const dockerfileContent = `FROM node:22\nWORKDIR /app\nCOPY . .\nCMD ["node", "app.js"]`;

// Parse
const parsed = DockerfileParser.parse(dockerfileContent);

// Audit
const report = DockerfileAuditor.audit(parsed);
console.log(`Score: ${report.score}/100 [Grade: ${report.grade}]`);

// Build DAG
const dag = MultiStageGraphBuilder.build(parsed);
console.log(`Critical Path: ${dag.criticalPath.join(' -> ')}`);

// Auto-harden
const result = DockerfileHardener.harden(dockerfileContent);
console.log(result.hardenedDockerfile);
```

---

## Quality Metrics & Performance

- **Zero External Dependencies**: Pure Node.js standard libraries (`node:fs`, `node:path`, `node:http`).
- **100% Test Coverage**: Comprehensive test suite covering parsers, security heuristics, DAG builders, and automated repair.
- **Execution Speed**: 50 complete audit and DAG cycles executed in under 45ms.

---

## Author

**Jatin Sharma**
- Portfolio: [https://jatinsh.netlify.app/](https://jatinsh.netlify.app/)
- GitHub: [@raghav1924](https://github.com/raghav1924)
- Email: raghavjatin245@gmail.com

---

## License

MIT License. See [LICENSE](LICENSE) for details.
