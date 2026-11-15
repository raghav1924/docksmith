import fs from 'node:fs';
import path from 'node:path';
import { AuditFinding, DockerfileAuditReport, ParsedDockerfile } from './types.js';
import { DockerfileGraph } from './graph.js';
import { DockerfileParser } from './parser.js';

export class DockerfileAuditor {
  /**
   * Run comprehensive security and optimization audit on a ParsedDockerfile or raw Dockerfile string.
   */
  public static audit(dockerfileOrContent: ParsedDockerfile | string): DockerfileAuditReport {
    const dockerfile = typeof dockerfileOrContent === 'string'
      ? DockerfileParser.parse(dockerfileOrContent)
      : dockerfileOrContent;

    const findings: AuditFinding[] = [];
    const stages = dockerfile.stages;
    const targetStage = stages.length > 0 ? stages[stages.length - 1] : null;

    // 1. Audit .dockerignore Presence (OPT-004)
    if (dockerfile.filePath && fs.existsSync(dockerfile.filePath)) {
      const dockerfileDir = path.dirname(dockerfile.filePath);
      const dockerignorePath = path.join(dockerfileDir, '.dockerignore');
      if (!fs.existsSync(dockerignorePath)) {
        findings.push({
          id: 'OPT-004',
          title: 'Missing .dockerignore File',
          category: 'OPTIMIZATION',
          severity: 'MEDIUM',
          line: 1,
          message: 'No .dockerignore file was found in the Dockerfile directory. The Docker daemon will upload entire workspace contents (including .git, local node_modules, and secrets) into the build context.',
          remediation: 'Create a .dockerignore file excluding .git, node_modules, dist, and .env*.',
          autoFixSnippet: '.git\nnode_modules\ndist\n.env*\n*.log',
        });
      } else {
        const ignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');
        const missingCrucials = [];
        if (!ignoreContent.includes('.git')) missingCrucials.push('.git');
        if (!ignoreContent.includes('node_modules')) missingCrucials.push('node_modules');
        if (!ignoreContent.includes('.env')) missingCrucials.push('.env*');

        if (missingCrucials.length > 0) {
          findings.push({
            id: 'OPT-004',
            title: `Inadequate .dockerignore (Missing: ${missingCrucials.join(', ')})`,
            category: 'OPTIMIZATION',
            severity: 'MEDIUM',
            line: 1,
            message: `.dockerignore does not exclude crucial directories: ${missingCrucials.join(', ')}.`,
            remediation: `Add ${missingCrucials.join(', ')} to .dockerignore.`,
          });
        }
      }
    }

    // 2. Audit Single-Stage Production Image Anti-Pattern (OPT-002)
    if (stages.length === 1) {
      const rawAll = dockerfile.rawContent.toLowerCase();
      const hasBuildStep = rawAll.includes('npm run build') || rawAll.includes('yarn build') || rawAll.includes('pnpm build') || rawAll.includes('cargo build') || rawAll.includes('tsc');
      if (hasBuildStep) {
        findings.push({
          id: 'OPT-002',
          title: 'Single-Stage Production Container Anti-Pattern',
          category: 'OPTIMIZATION',
          severity: 'HIGH',
          stageName: targetStage?.name || 'stage_0',
          stageIndex: 0,
          line: targetStage?.instructions[0]?.line || 1,
          message: 'The Dockerfile compiles code (npm run build / cargo build) in a single stage. This bundles compilers, devDependencies, and raw source code directly into your production deployment image.',
          remediation: 'Split into a multi-stage Dockerfile: compile in a "builder" stage and copy only production artifacts into a lightweight "runner" stage.',
        });
      }
    }

    // Iterate through all stages
    for (let sIdx = 0; sIdx < stages.length; sIdx++) {
      const stage = stages[sIdx];
      const isTarget = sIdx === stages.length - 1;
      const stageName = stage.name || `stage_${sIdx}`;

      // SEC-003: Floating or Mutable Base Image Tag
      if (!stage.baseTag || stage.baseTag.toLowerCase() === 'latest') {
        const fromInst = stage.instructions.find(i => i.instruction === 'FROM');
        findings.push({
          id: 'SEC-003',
          title: `Floating / Mutable Base Image Tag '${stage.baseImage}:${stage.baseTag || 'latest'}'`,
          category: 'SECURITY',
          severity: 'HIGH',
          stageName,
          stageIndex: sIdx,
          line: fromInst?.line || 1,
          instruction: 'FROM',
          message: `Stage '${stageName}' uses floating tag '${stage.baseTag || 'latest'}'. Upstream image updates can silently break builds or introduce security regressions.`,
          remediation: `Pin base image to explicit version (e.g. ${stage.baseImage}:22-alpine) or digest sha256:...`,
        });
      }

      // Track instruction flow for cache busting and workdir
      let seenCopyAll = false;
      let hasWorkdir = false;
      let consecutiveRunCount = 0;

      for (const inst of stage.instructions) {
        if (inst.instruction === 'WORKDIR') {
          hasWorkdir = true;
          consecutiveRunCount = 0;
        }

        // HYG-002: Deprecated MAINTAINER
        if (inst.instruction === 'MAINTAINER') {
          findings.push({
            id: 'HYG-002',
            title: 'Deprecated MAINTAINER Instruction',
            category: 'HYGIENE',
            severity: 'LOW',
            stageName,
            stageIndex: sIdx,
            line: inst.line,
            instruction: 'MAINTAINER',
            message: 'MAINTAINER instruction is deprecated in modern Docker.',
            remediation: 'Use LABEL maintainer="name@example.com" instead.',
            autoFixSnippet: `LABEL maintainer="${inst.args}"`,
          });
          consecutiveRunCount = 0;
        }

        // SEC-005: Dangerous ADD Instruction
        if (inst.instruction === 'ADD') {
          const args = inst.args.trim();
          const isUrl = args.startsWith('http://') || args.startsWith('https://');
          const isTar = args.endsWith('.tar') || args.endsWith('.tar.gz') || args.endsWith('.tgz');
          if (!isUrl && !isTar) {
            findings.push({
              id: 'SEC-005',
              title: `Unnecessary ADD Instruction for Local Files`,
              category: 'SECURITY',
              severity: 'MEDIUM',
              stageName,
              stageIndex: sIdx,
              line: inst.line,
              instruction: 'ADD',
              message: `ADD instruction used for local file copying ('${inst.args}'). ADD has implicit tar extraction and URL fetching behavior.`,
              remediation: 'Replace ADD with explicit COPY for local files.',
              autoFixSnippet: `COPY ${inst.args}`,
            });
          }
          consecutiveRunCount = 0;
        }

        // SEC-002: Hardcoded Build Secret in ENV/ARG
        if (inst.instruction === 'ENV' || inst.instruction === 'ARG') {
          const secretKeywords = ['secret', 'token', 'password', 'passwd', 'api_key', 'apikey', 'private_key', 'auth_token'];
          const lowerArgs = inst.args.toLowerCase();
          for (const kw of secretKeywords) {
            if (lowerArgs.includes(kw) && (lowerArgs.includes('=') || lowerArgs.includes(' '))) {
              const eqIdx = inst.args.indexOf('=');
              const val = eqIdx !== -1 ? inst.args.slice(eqIdx + 1).trim() : '';
              if (val.length > 5 && !val.startsWith('$')) {
                findings.push({
                  id: 'SEC-002',
                  title: `Hardcoded Secret Baked into Layer via ${inst.instruction}`,
                  category: 'SECURITY',
                  severity: 'CRITICAL',
                  stageName,
                  stageIndex: sIdx,
                  line: inst.line,
                  instruction: inst.instruction,
                  message: `${inst.instruction} sets potential secret '${kw}' directly in image layer. Even if deleted in later steps, this secret is permanently inspectable via docker history.`,
                  remediation: 'Do not bake secrets into ENV/ARG. Use BuildKit secrets mount (RUN --mount=type=secret) or inject runtime environment variables.',
                });
                break;
              }
            }
          }
          consecutiveRunCount = 0;
        }

        // OPT-001: Cache Busting Anti-Pattern
        if (inst.instruction === 'COPY') {
          const args = inst.args.trim();
          if (args.startsWith('. .') || args.startsWith('./ .') || args === '. /app' || args === '. ./') {
            seenCopyAll = true;
          }
          consecutiveRunCount = 0;
        }

        if (inst.instruction === 'RUN') {
          consecutiveRunCount++;
          const runCmd = inst.args.toLowerCase();

          // Check if RUN is a dependency installer after COPY . .
          if (seenCopyAll) {
            const isInstall = runCmd.includes('npm install') || runCmd.includes('npm ci') || runCmd.includes('yarn install') || runCmd.includes('pnpm install') || runCmd.includes('pip install') || runCmd.includes('bundle install');
            if (isInstall) {
              findings.push({
                id: 'OPT-001',
                title: 'Layer Cache Busting Anti-Pattern',
                category: 'OPTIMIZATION',
                severity: 'CRITICAL',
                stageName,
                stageIndex: sIdx,
                line: inst.line,
                instruction: 'RUN',
                message: `Executing dependency install ('${inst.args.slice(0, 30)}...') after 'COPY . .' busts Docker's layer cache on every source code edit, triggering slow full re-installs.`,
                remediation: 'Copy package manifests first (e.g. COPY package*.json ./), execute dependency install, and then copy application source code (COPY . .).',
              });
            }
          }

          // SEC-004: Insecure Package Manager Caching
          if (runCmd.includes('apt-get install') || runCmd.includes('apt install')) {
            const hasNoRecommends = runCmd.includes('--no-install-recommends');
            const hasCleanLists = runCmd.includes('rm -rf /var/lib/apt/lists/*');
            if (!hasNoRecommends || !hasCleanLists) {
              findings.push({
                id: 'SEC-004',
                title: 'Uncleaned Apt Cache & Recommended Packages',
                category: 'OPTIMIZATION',
                severity: 'HIGH',
                stageName,
                stageIndex: sIdx,
                line: inst.line,
                instruction: 'RUN',
                message: 'apt-get install without --no-install-recommends or missing rm -rf /var/lib/apt/lists/* leaves hundreds of megabytes of temporary cache in the layer.',
                remediation: 'Add --no-install-recommends and chain rm -rf /var/lib/apt/lists/* in the same RUN layer.',
              });
            }
          }

          if (runCmd.includes('apk add') && !runCmd.includes('--no-cache')) {
            findings.push({
              id: 'SEC-004',
              title: 'Uncached Alpine Apk Package Installation',
              category: 'OPTIMIZATION',
              severity: 'HIGH',
              stageName,
              stageIndex: sIdx,
              line: inst.line,
              instruction: 'RUN',
              message: 'apk add without --no-cache retains local index cache.',
              remediation: 'Use apk add --no-cache to keep Alpine image layers minimal.',
            });
          }
        } else {
          consecutiveRunCount = 0;
        }

        // OPT-003: Unchained consecutive RUNs
        if (consecutiveRunCount >= 3) {
          findings.push({
            id: 'OPT-003',
            title: `Excessive Unchained RUN Instructions in '${stageName}'`,
            category: 'OPTIMIZATION',
            severity: 'LOW',
            stageName,
            stageIndex: sIdx,
            line: inst.line,
            instruction: 'RUN',
            message: 'Multiple consecutive RUN statements create redundant intermediate filesystem layers.',
            remediation: 'Combine related RUN commands into a single instruction chained with && \\.',
          });
          consecutiveRunCount = 0; // flag once per sequence
        }
      }

      // HYG-001: Missing WORKDIR
      if (!hasWorkdir && stage.instructions.length > 2) {
        findings.push({
          id: 'HYG-001',
          title: `Missing WORKDIR in Stage '${stageName}'`,
          category: 'HYGIENE',
          severity: 'LOW',
          stageName,
          stageIndex: sIdx,
          line: stage.instructions[0]?.line || 1,
          instruction: 'WORKDIR',
          message: `Stage '${stageName}' does not specify WORKDIR, causing commands to execute directly in the container root filesystem (/).`,
          remediation: 'Specify WORKDIR /app to keep container filesystem isolated.',
          autoFixSnippet: 'WORKDIR /app',
        });
      }

      // Target Stage Specific Checks
      if (isTarget) {
        // SEC-001: Root User Check
        if (!stage.user || stage.user.toLowerCase() === 'root') {
          findings.push({
            id: 'SEC-001',
            title: 'Production Container Runs as Root (UID 0)',
            category: 'SECURITY',
            severity: 'CRITICAL',
            stageName,
            stageIndex: sIdx,
            line: stage.instructions[stage.instructions.length - 1]?.line || 1,
            instruction: 'USER',
            message: 'Target production container runs as root. An attacker achieving application code execution gains full root control inside container with potential host breakout risk.',
            remediation: 'Define a dedicated non-root user (e.g. USER node or RUN adduser -D appuser && USER appuser).',
            autoFixSnippet: 'RUN addgroup -S appgroup && adduser -S appuser -G appgroup\nUSER appuser',
          });
        }

        // SEC-006: Missing HEALTHCHECK
        if (!stage.hasHealthcheck) {
          findings.push({
            id: 'SEC-006',
            title: 'Missing Container HEALTHCHECK Instruction',
            category: 'RELIABILITY',
            severity: 'MEDIUM',
            stageName,
            stageIndex: sIdx,
            line: stage.instructions[stage.instructions.length - 1]?.line || 1,
            instruction: 'HEALTHCHECK',
            message: 'Production stage lacks HEALTHCHECK instruction. Orchestrators (Kubernetes, ECS, Swarm) cannot verify application readiness.',
            remediation: 'Add HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8080/health || exit 1.',
            autoFixSnippet: 'HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\\n  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1',
          });
        }
      }
    }

    // Build DAG
    const dagResult = DockerfileGraph.buildDag(stages);

    // Compute Health Score (0 - 100)
    let score = 100;
    const stats = {
      totalStages: stages.length,
      totalInstructions: dockerfile.allInstructions.length,
      layerCount: dockerfile.allInstructions.filter(i => ['RUN', 'COPY', 'ADD'].includes(i.instruction)).length,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    };

    for (const f of findings) {
      f.ruleId = f.id;
      if (f.severity === 'CRITICAL') {
        score -= 25;
        stats.criticalCount++;
      } else if (f.severity === 'HIGH') {
        score -= 15;
        stats.highCount++;
      } else if (f.severity === 'MEDIUM') {
        score -= 8;
        stats.mediumCount++;
      } else if (f.severity === 'LOW') {
        score -= 3;
        stats.lowCount++;
      }
    }

    score = Math.max(0, Math.min(100, score));

    let grade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'A+';
    if (score >= 95) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 50) grade = 'C';
    else grade = 'F';

    return {
      filePath: dockerfile.filePath,
      fileName: dockerfile.fileName,
      score,
      grade,
      findings,
      stats,
      dag: {
        nodes: dagResult.nodes,
        criticalPath: dagResult.criticalPath,
        mermaid: dagResult.mermaid,
      },
    };
  }
}
