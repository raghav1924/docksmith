# Product Brief: DockSmith

**Product Name:** DockSmith  
**Tagline:** Developer-First Dockerfile Linter, Container Security Auditor, Layer Cache Optimizer & Visual Multi-Stage Studio.  
**Author:** [Jatin Sharma](https://jatinsh.netlify.app/) (`@raghav1924`)  
**Target Repository:** `https://github.com/raghav1924/docksmith`  
**Date:** 2026-11-15 (Build #10 Milestone)  

---

## 1. Problem Statement

Docker is the universal runtime container format for microservices, cloud native deployments, and CI/CD pipelines. However, Dockerfiles are written as unstructured shell scripts disguised as container manifests, introducing critical security vulnerabilities and massive build inefficiencies:

1. **High-Severity Container Vulnerabilities:**
   - **Root User Execution (CWE-250):** Over 75% of Docker containers run as UID 0 (`root`). If an attacker escapes a web application via Remote Code Execution (RCE), they gain immediate root control over the host namespace.
   - **Hardcoded Secrets in Layers:** Developers pass API keys, tokens, or private keys via `ENV` or `ARG`. Even if deleted in a later step, the secret remains permanently accessible in the uncompressed image layer history (`docker history`).
   - **Unpinned Floating Base Images:** Using `FROM node:latest` or `FROM alpine` causes unpredictable build breakage and exposes builds to upstream supply-chain tampering.
   - **Uncleaned Package Caches:** Running `apt-get install` without `--no-install-recommends` or failing to clean `/var/lib/apt/lists/*` bloats images by 200MB - 800MB.
2. **Layer Cache Busting & Build Queue Choke:**
   - **Premature Context Copy:** Placing `COPY . .` before `RUN npm install` or `pip install` invalidates Docker's build layer cache on every code change, turning a 5-second build into a 5-minute build.
   - **Single-Stage Image Bloat:** Compiling code and running in the same stage bundles compilers (`gcc`, `make`), git metadata, and build tools into production containers, increasing attack surface and cold-start latency.
3. **Orchestrator Blind Spots:**
   - Missing `HEALTHCHECK` instructions prevents Kubernetes and Docker Swarm from detecting deadlocked processes, causing traffic to be routed to zombie containers.
   - Missing `.dockerignore` causes multi-gigabyte build context uploads (sending `.git` and `node_modules` across the Docker socket).

---

## 2. Solution: DockSmith

**DockSmith** is an open-source, zero-dependency static analysis engine, multi-stage DAG visualizer, and local dark-mode Web Studio built in pure TypeScript for Node.js standard runtime.

### Key Capabilities:
- **Zero-Dependency Dockerfile AST Parser:** Parses single and multi-stage Dockerfiles with full support for line continuations (`\`), quoted arguments, heredocs, and inline comments.
- **15+ Container Security & Layer Heuristics:**
  - `SEC-001`: Root user execution linter (checks for non-root `USER` switch).
  - `SEC-002`: Hardcoded build secret scanner (`ENV` / `ARG` token leaks).
  - `SEC-003`: Floating mutable base image tag auditor (`:latest`, `:alpine`).
  - `SEC-004`: Insecure package manager cache auditor (`apt`, `apk`, `dnf`, `yum`).
  - `SEC-005`: Dangerous `ADD` instruction linter (advises explicit `COPY`).
  - `SEC-006`: Missing production `HEALTHCHECK` detector.
  - `OPT-001`: Layer cache busting sequence detector (`COPY . .` before package install).
  - `OPT-002`: Single-stage production container anti-pattern linter.
  - `OPT-003`: Unchained consecutive `RUN` instructions layer bloat detector.
  - `OPT-004`: Missing `.dockerignore` exclusion auditor (`.git`, `node_modules`, `.env`).
- **Multi-Stage Build Pipeline DAG:** Maps multi-stage inheritance, cross-stage artifact copies (`COPY --from=...`), and computes critical build path with Mermaid diagrams.
- **Automated Dockerfile Hardener (`docksmith fix`):** Automatically injects non-root user creation, reorders layer cache statements, chains `RUN` steps, and adds healthchecks.
- **Interactive Dark-Mode Web Studio (:5353):** Embedded visual dashboard with live stage topology, layer breakdown, and one-click hardening.

---

## 3. Zero External Dependencies Philosophy

DockSmith operates completely with Node.js standard libraries:
- `node:fs` & `node:path`: File discovery and `.dockerignore` verification.
- `node:http`: Embedded Web Studio server.
- Pure TypeScript implementation for lexical instruction tokenization and DAG traversal.
