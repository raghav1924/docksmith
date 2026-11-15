import { DockerfileParser } from './parser.js';

export interface HardeningResult {
  hardenedDockerfile: string;
  hardenedContent: string;
  appliedFixes: string[];
}

export class DockerfileHardener {
  /**
   * Automatically patches and hardens a Dockerfile.
   */
  public static harden(rawDockerfile: string): HardeningResult {
    const appliedFixes: string[] = [];
    let updated = rawDockerfile;

    const parsed = DockerfileParser.parse(rawDockerfile);

    // 1. Replace ADD with COPY for local files
    const addMatches = updated.match(/^ADD\s+([^\s]+)\s+([^\s]+)/gm);
    if (addMatches) {
      for (const m of addMatches) {
        if (!m.includes('http://') && !m.includes('https://') && !m.includes('.tar')) {
          const replacement = m.replace(/^ADD\b/, 'COPY');
          updated = updated.replace(m, replacement);
          appliedFixes.push(`Replaced insecure 'ADD' with 'COPY' for local file: ${m.trim()}`);
        }
      }
    }

    // 2. Add --no-cache to apk add if missing
    if (/apk\s+add\b/i.test(updated) && !/apk\s+add\s+.*--no-cache/i.test(updated)) {
      updated = updated.replace(/apk\s+add\s+(?!.*--no-cache)/gi, 'apk add --no-cache ');
      appliedFixes.push("Added '--no-cache' flag to Alpine apk package installations");
    }

    // 3. Add --no-install-recommends and cleanup to apt-get install if missing
    if (/apt-get\s+install\s+-y\b/i.test(updated) && !/--no-install-recommends/i.test(updated)) {
      updated = updated.replace(/apt-get\s+install\s+-y\s+/gi, 'apt-get install -y --no-install-recommends ');
      if (!updated.includes('rm -rf /var/lib/apt/lists/*')) {
        updated = updated.replace(/(apt-get\s+install[^\n\\]+)/i, '$1 && rm -rf /var/lib/apt/lists/*');
      }
      appliedFixes.push("Added '--no-install-recommends' and layer cache cleanup to apt-get");
    }

    // 4. Inject WORKDIR /app if missing
    const hasWorkdir = parsed.allInstructions.some(i => i.instruction === 'WORKDIR');
    if (!hasWorkdir && parsed.stages.length > 0) {
      const lines = updated.split(/\r?\n/);
      let fromIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('FROM ')) {
          fromIdx = i;
          break;
        }
      }
      if (fromIdx !== -1) {
        lines.splice(fromIdx + 1, 0, '', 'WORKDIR /app');
        updated = lines.join('\n');
        appliedFixes.push("Injected isolated 'WORKDIR /app'");
      }
    }

    // 5. Inject Non-Root User into target stage if running as root
    const targetStage = parsed.stages[parsed.stages.length - 1];
    if (targetStage && (!targetStage.user || targetStage.user.toLowerCase() === 'root')) {
      const lines = updated.split(/\r?\n/);
      let insertIdx = -1;

      // Find position before CMD or ENTRYPOINT
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('CMD ') || trimmed.startsWith('ENTRYPOINT ')) {
          insertIdx = i;
          break;
        }
      }

      if (insertIdx === -1) {
        insertIdx = lines.length;
      }

      const userBlock = [
        '# Run as non-root user for container security',
        'RUN addgroup -S appgroup 2>/dev/null || groupadd -r appgroup 2>/dev/null || true && \\',
        '    adduser -S appuser -G appgroup 2>/dev/null || useradd -r -g appgroup appuser 2>/dev/null || true',
        'USER appuser',
        '',
      ];

      lines.splice(insertIdx, 0, ...userBlock);
      updated = lines.join('\n');
      appliedFixes.push("Injected non-root user 'appuser' (UID switch) to eliminate root container risk");
    }

    // 6. Inject HEALTHCHECK if missing in target stage
    if (targetStage && !targetStage.hasHealthcheck) {
      const lines = updated.split(/\r?\n/);
      let insertIdx = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('CMD ') || trimmed.startsWith('ENTRYPOINT ')) {
          insertIdx = i;
          break;
        }
      }
      if (insertIdx === -1) insertIdx = lines.length;

      const healthcheckBlock = [
        '# Healthcheck for orchestrator readiness',
        'HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\',
        '  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1',
        '',
      ];

      lines.splice(insertIdx, 0, ...healthcheckBlock);
      updated = lines.join('\n');
      appliedFixes.push('Injected production HEALTHCHECK instruction');
    }

    return {
      hardenedDockerfile: updated,
      hardenedContent: updated,
      appliedFixes,
    };
  }
}
