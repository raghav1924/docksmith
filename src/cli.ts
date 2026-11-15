import fs from 'node:fs';
import path from 'node:path';
import { DockerfileParser } from './core/parser.js';
import { DockerfileAuditor } from './core/auditor.js';
import { DockerfileHardener } from './core/hardener.js';
import { DockerfileGraph } from './core/graph.js';
import { DockSmithStudio } from './server/studio.js';
import { Logger, colors } from './utils/logger.js';

export function runCli(args: string[]): void {
  const command = args[0] || 'help';

  switch (command) {
    case 'audit':
    case 'scan':
    case 'check':
    case 'lint':
      handleAudit(args.slice(1));
      break;

    case 'fix':
    case 'harden':
      handleHarden(args.slice(1));
      break;

    case 'dag':
    case 'graph':
      handleDag(args.slice(1));
      break;

    case 'studio':
    case 'ui':
      handleStudio(args.slice(1));
      break;

    case 'version':
    case '-v':
    case '--version':
      console.log('DockSmith v1.0.0 — Crafted by Jatin Sharma (https://jatinsh.netlify.app/)');
      break;

    case 'help':
    case '--help':
    default:
      printHelp();
      break;
  }
}

function handleAudit(args: string[]): void {
  const targetPath = args.find(a => !a.startsWith('-')) || process.cwd();
  const minScoreArg = args.find(a => a.startsWith('--min-score='));
  const minScore = minScoreArg ? parseInt(minScoreArg.split('=')[1], 10) : 75;
  const failOnSec = args.includes('--fail-on-sec') || args.includes('--fail-on-critical');
  const jsonOutput = args.includes('--json');

  let filesToScan: string[] = [];

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    filesToScan.push(targetPath);
  } else {
    // Check root and subdirectories
    const candidateNames = ['Dockerfile', 'Dockerfile.dev', 'Dockerfile.prod'];
    for (const name of candidateNames) {
      const p = path.join(targetPath, name);
      if (fs.existsSync(p)) filesToScan.push(p);
    }
    const subDirs = ['examples', 'docker'];
    for (const sub of subDirs) {
      const subDir = path.join(targetPath, sub);
      if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
        const files = fs.readdirSync(subDir);
        for (const f of files) {
          if (f.toLowerCase().includes('dockerfile')) {
            filesToScan.push(path.join(subDir, f));
          }
        }
      }
    }
  }

  if (filesToScan.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'No Dockerfiles found', reports: [] }));
    } else {
      Logger.warn(`No Dockerfiles found in ${targetPath}`);
    }
    return;
  }

  const reports = [];
  let hasCriticalSecurityFailure = false;
  let hasScoreFailure = false;

  if (!jsonOutput) {
    Logger.header('DockSmith — Dockerfile Container Security & Layer Audit');
    console.log(`${colors.gray}Target: ${path.resolve(targetPath)}${colors.reset}\n`);
  }

  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf-8');
    const parsed = DockerfileParser.parse(content, file);
    const report = DockerfileAuditor.audit(parsed);
    reports.push(report);

    if (report.stats.criticalCount > 0 && failOnSec) {
      hasCriticalSecurityFailure = true;
    }
    if (report.score < minScore) {
      hasScoreFailure = true;
    }

    if (!jsonOutput) {
      const scoreColor = report.score >= 85 ? colors.green : report.score >= 70 ? colors.yellow : colors.red;
      console.log(`${colors.bold}${report.fileName}${colors.reset} • ${scoreColor}${report.score}% [${report.grade}]${colors.reset}`);
      console.log(`  Stages: ${report.stats.totalStages} | Instructions: ${report.stats.totalInstructions} | Layers: ${report.stats.layerCount}`);

      if (report.findings.length === 0) {
        console.log(`  ${colors.green}✔ No container security or layer issues detected.${colors.reset}\n`);
      } else {
        console.log(`  Findings: ${report.stats.criticalCount} Critical, ${report.stats.highCount} High, ${report.stats.mediumCount} Medium, ${report.stats.lowCount} Low`);
        for (const f of report.findings) {
          const sevColor = f.severity === 'CRITICAL' ? colors.red : f.severity === 'HIGH' ? colors.yellow : colors.cyan;
          console.log(`    ${sevColor}[${f.severity}]${colors.reset} ${colors.bold}${f.id}${colors.reset}: ${f.title} (Line ${f.line})`);
          console.log(`      ${colors.gray}${f.message}${colors.reset}`);
          console.log(`      ${colors.green}Fix: ${f.remediation}${colors.reset}`);
        }
        console.log('');
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ reports }, null, 2));
  } else {
    Logger.divider();
    console.log(`Audited ${reports.length} Dockerfile(s).`);
  }

  if (hasCriticalSecurityFailure || hasScoreFailure) {
    if (!jsonOutput) {
      Logger.error(`Audit failed quality gates! (Min Score: ${minScore}%, Fail-On-Security: ${failOnSec})`);
    }
    process.exit(1);
  }
}

function handleHarden(args: string[]): void {
  const filePath = args.find(a => !a.startsWith('-'));
  if (!filePath || !fs.existsSync(filePath)) {
    Logger.error('Please specify an existing Dockerfile to harden (e.g. docksmith fix Dockerfile)');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const result = DockerfileHardener.harden(content);

  if (result.appliedFixes.length === 0) {
    Logger.success(`Dockerfile '${path.basename(filePath)}' is already properly hardened! Zero automated fixes needed.`);
    return;
  }

  fs.writeFileSync(filePath, result.hardenedDockerfile, 'utf-8');
  Logger.header(`DockSmith — Automated Dockerfile Hardening`);
  Logger.success(`Updated ${filePath} with ${result.appliedFixes.length} security/layer fix(es):`);
  for (const fix of result.appliedFixes) {
    console.log(`  ${colors.green}✔${colors.reset} ${fix}`);
  }
}

function handleDag(args: string[]): void {
  const filePath = args.find(a => !a.startsWith('-'));
  if (!filePath || !fs.existsSync(filePath)) {
    Logger.error('Please specify an existing Dockerfile (e.g. docksmith dag Dockerfile)');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = DockerfileParser.parse(content, filePath);
  const dag = DockerfileGraph.buildDag(parsed.stages);

  Logger.header(`Multi-Stage Build DAG: ${parsed.fileName}`);
  console.log(`Total Stages: ${dag.nodes.length} | Unused Stages: ${dag.unusedStages.length}`);
  console.log(`Critical Path: ${colors.bold}${dag.criticalPath.join(' ➔ ') || 'None'}${colors.reset}\n`);

  console.log(`${colors.cyan}Mermaid Flowchart Syntax:${colors.reset}`);
  console.log(dag.mermaid);
}

function handleStudio(args: string[]): void {
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : 5353;
  const targetDir = args.find(a => !a.startsWith('-')) || process.cwd();

  const studio = new DockSmithStudio(port, targetDir);
  studio.start();
}

function printHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}🐳 DockSmith — Dockerfile Linter, Security Auditor & Layer Studio${colors.reset}
${colors.gray}Crafted by Jatin Sharma (https://jatinsh.netlify.app/) • GitHub: @raghav1924${colors.reset}

${colors.bold}USAGE:${colors.reset}
  $ docksmith <command> [options]

${colors.bold}COMMANDS:${colors.reset}
  ${colors.cyan}audit${colors.reset} [path]             Audit Dockerfiles for security hazards and layer cache anti-patterns
  ${colors.cyan}fix${colors.reset} <file>               Auto-harden Dockerfile (inject non-root user, workdir, healthcheck)
  ${colors.cyan}dag${colors.reset} <file>               Compute multi-stage dependency DAG & critical build path
  ${colors.cyan}studio${colors.reset} [--port=5353]      Launch interactive dark-mode Web Studio on localhost
  ${colors.cyan}version${colors.reset}                  Print version information
  ${colors.cyan}help${colors.reset}                     Show this help message

${colors.bold}OPTIONS:${colors.reset}
  ${colors.yellow}--min-score=<n>${colors.reset}       Minimum acceptable health score (default: 75)
  ${colors.yellow}--fail-on-sec${colors.reset}         Exit with code 1 if any CRITICAL security flaw exists
  ${colors.yellow}--json${colors.reset}                Output machine-readable JSON for CI integration

${colors.bold}EXAMPLES:${colors.reset}
  $ docksmith audit . --min-score=85 --fail-on-sec
  $ docksmith fix Dockerfile
  $ docksmith studio --port=5353
`);
}
