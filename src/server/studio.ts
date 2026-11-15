import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DockerfileParser } from '../core/parser.js';
import { DockerfileAuditor } from '../core/auditor.js';
import { DockerfileHardener } from '../core/hardener.js';
import { DockerfileAuditReport } from '../core/types.js';

export class DockSmithStudio {
  private port: number;
  private targetDir: string;

  constructor(port = 5353, targetDir = process.cwd()) {
    this.port = port;
    this.targetDir = targetDir;
  }

  public start(): http.Server {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // API: Get Audit Reports
      if (url.pathname === '/api/audit' && req.method === 'GET') {
        const reports = this.scanDockerfiles();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reports, targetDir: this.targetDir }));
        return;
      }

      // API: Harden Dockerfile
      if (url.pathname === '/api/harden' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            let contentToHarden = data.content;
            if (!contentToHarden && data.filePath && fs.existsSync(data.filePath)) {
              contentToHarden = fs.readFileSync(data.filePath, 'utf-8');
            }
            if (!contentToHarden) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No content or valid filePath provided' }));
              return;
            }

            const result = DockerfileHardener.harden(contentToHarden);
            if (data.save && data.filePath) {
              fs.writeFileSync(data.filePath, result.hardenedDockerfile, 'utf-8');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ...result, saved: Boolean(data.save) }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Web Studio HTML
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderHtml());
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.listen(this.port, () => {
      console.log(`\n⚡ DockSmith Studio live at: \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
    });

    return server;
  }

  public scanDockerfiles(): DockerfileAuditReport[] {
    const reports: DockerfileAuditReport[] = [];
    const candidates = [
      path.join(this.targetDir, 'Dockerfile'),
      path.join(this.targetDir, 'Dockerfile.dev'),
      path.join(this.targetDir, 'Dockerfile.prod'),
    ];

    // Also look inside examples/ or docker/
    const subDirs = ['examples', 'docker'];
    for (const sub of subDirs) {
      const fullSub = path.join(this.targetDir, sub);
      if (fs.existsSync(fullSub) && fs.statSync(fullSub).isDirectory()) {
        const files = fs.readdirSync(fullSub);
        for (const file of files) {
          if (file.toLowerCase().includes('dockerfile')) {
            candidates.push(path.join(fullSub, file));
          }
        }
      }
    }

    for (const file of candidates) {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const parsed = DockerfileParser.parse(content, file);
          const report = DockerfileAuditor.audit(parsed);
          reports.push(report);
        } catch (e) {
          // ignore parsing error
        }
      }
    }

    return reports;
  }

  private renderHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DockSmith — Container Security & Layer Studio</title>
  <style>
    :root {
      --bg: #08090d;
      --card-bg: #10121a;
      --card-border: #1d212e;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --cyan: #06b6d4;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #ef4444;
      --purple: #8b5cf6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 24px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
    }
    .logo-group { display: flex; align-items: center; gap: 12px; }
    .badge {
      background: rgba(6, 182, 212, 0.15);
      color: var(--cyan);
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .grid { display: grid; grid-template-columns: 320px 1fr; gap: 24px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
    }
    .file-item {
      padding: 12px 14px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      background: #141724;
      border: 1px solid transparent;
      transition: all 0.2s;
    }
    .file-item:hover, .file-item.active {
      border-color: var(--cyan);
      background: rgba(6, 182, 212, 0.08);
    }
    .score-pill {
      font-weight: bold;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .score-A { background: rgba(16, 185, 129, 0.2); color: var(--emerald); }
    .score-B { background: rgba(245, 158, 11, 0.2); color: var(--amber); }
    .score-C, .score-F { background: rgba(239, 68, 68, 0.2); color: var(--rose); }
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .stat-box {
      background: #141724;
      padding: 14px;
      border-radius: 8px;
      border: 1px solid var(--card-border);
      text-align: center;
    }
    .stat-val { font-size: 24px; font-weight: bold; margin-top: 4px; }
    .finding-card {
      background: #141724;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .finding-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .sev-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .sev-CRITICAL { background: var(--rose); color: white; }
    .sev-HIGH { background: #f97316; color: white; }
    .sev-MEDIUM { background: var(--amber); color: black; }
    .sev-LOW { background: #3b82f6; color: white; }
    .code-block {
      background: #0d0f17;
      padding: 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 13px;
      color: #38bdf8;
      margin-top: 8px;
      white-space: pre-wrap;
    }
    .btn {
      background: var(--cyan);
      color: #08090d;
      border: none;
      padding: 10px 18px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .dag-box {
      background: #0d0f17;
      padding: 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 13px;
      color: #a7f3d0;
      margin-top: 14px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-group">
      <h1>🐳 DockSmith</h1>
      <span class="badge">Container Studio v1.0.0</span>
    </div>
    <div>
      <span style="color: var(--text-muted); font-size: 14px;">Author: <a href="https://jatinsh.netlify.app/" target="_blank" style="color: var(--cyan); text-decoration: none; font-weight: 600;">Jatin Sharma</a></span>
    </div>
  </div>

  <div class="grid">
    <!-- Sidebar -->
    <div class="card">
      <h3 style="margin-bottom: 14px;">Dockerfiles</h3>
      <div id="fileList">Loading Dockerfiles...</div>
      <button class="btn" style="width: 100%; margin-top: 16px;" onclick="loadData()">↻ Refresh Files</button>
    </div>

    <!-- Main View -->
    <div class="card" id="detailView">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 id="dfName">Select a Dockerfile</h2>
          <p id="dfPath" style="color: var(--text-muted); font-size: 13px;"></p>
        </div>
        <button id="hardenBtn" class="btn" onclick="hardenSelected()" style="display: none;">🛡️ Auto-Harden Dockerfile</button>
      </div>

      <div class="stats-row">
        <div class="stat-box">
          <div style="color: var(--text-muted); font-size: 12px;">SECURITY SCORE</div>
          <div id="dfScore" class="stat-val">--</div>
        </div>
        <div class="stat-box">
          <div style="color: var(--text-muted); font-size: 12px;">CRITICAL RISKS</div>
          <div id="critCount" class="stat-val" style="color: var(--rose);">0</div>
        </div>
        <div class="stat-box">
          <div style="color: var(--text-muted); font-size: 12px;">TOTAL STAGES</div>
          <div id="stageCount" class="stat-val">0</div>
        </div>
        <div class="stat-box">
          <div style="color: var(--text-muted); font-size: 12px;">FS LAYERS</div>
          <div id="layerCount" class="stat-val" style="color: var(--emerald);">0</div>
        </div>
      </div>

      <h3 style="margin: 20px 0 12px 0;">Multi-Stage Pipeline DAG & Artifact Flow</h3>
      <div id="dagContainer" class="dag-box">No stages loaded</div>

      <h3 style="margin: 24px 0 12px 0;">Audit Findings & Layer Remediation</h3>
      <div id="findingsContainer">No findings</div>
    </div>
  </div>

  <script>
    let currentReports = [];
    let selectedIdx = 0;

    async function loadData() {
      try {
        const res = await fetch('/api/audit');
        const data = await res.json();
        currentReports = data.reports || [];
        renderList();
        if (currentReports.length > 0) {
          selectDockerfile(0);
        } else {
          document.getElementById('dfName').innerText = 'No Dockerfiles found in project';
        }
      } catch (err) {
        document.getElementById('fileList').innerText = 'Error loading Dockerfiles: ' + err.message;
      }
    }

    function renderList() {
      const el = document.getElementById('fileList');
      if (currentReports.length === 0) {
        el.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">No Dockerfiles detected.</div>';
        return;
      }
      el.innerHTML = currentReports.map((r, i) => \`
        <div class="file-item \${i === selectedIdx ? 'active' : ''}" onclick="selectDockerfile(\${i})">
          <div>
            <div style="font-weight: 600; font-size: 14px;">\${r.fileName}</div>
            <div style="color: var(--text-muted); font-size: 11px;">Stages: \${r.stats.totalStages} | Layers: \${r.stats.layerCount}</div>
          </div>
          <span class="score-pill score-\${r.grade}">\${r.score}%</span>
        </div>
      \`).join('');
    }

    function selectDockerfile(idx) {
      selectedIdx = idx;
      renderList();
      const r = currentReports[idx];
      if (!r) return;

      document.getElementById('dfName').innerText = r.fileName;
      document.getElementById('dfPath').innerText = r.filePath;
      document.getElementById('dfScore').innerText = r.score + '% (' + r.grade + ')';
      document.getElementById('critCount').innerText = r.stats.criticalCount;
      document.getElementById('stageCount').innerText = r.stats.totalStages;
      document.getElementById('layerCount').innerText = r.stats.layerCount;
      document.getElementById('hardenBtn').style.display = 'block';

      // Render DAG
      const dagHtml = r.dag.nodes.map(n => {
        const targetTag = n.isTargetStage ? '<span style="color: var(--cyan); font-weight: bold;">[TARGET]</span> ' : '';
        const deps = n.dependsOn.length > 0 ? ' ← (' + n.dependsOn.join(', ') + ')' : ' (root base)';
        return targetTag + n.name + deps;
      }).join('\\n');
      document.getElementById('dagContainer').innerText = dagHtml || 'Single stage container.';

      // Render Findings
      const fc = document.getElementById('findingsContainer');
      if (r.findings.length === 0) {
        fc.innerHTML = '<div style="color: var(--emerald); font-weight: 600;">✨ Zero container security or layer optimization issues found! Excellent container hygiene.</div>';
      } else {
        fc.innerHTML = r.findings.map(f => \`
          <div class="finding-card">
            <div class="finding-header">
              <span class="sev-tag sev-\${f.severity}">\${f.severity}</span>
              <span style="font-family: monospace; font-size: 12px; color: var(--text-muted);">\${f.id} • Line \${f.line}</span>
            </div>
            <h4 style="margin-bottom: 6px;">\${f.title}</h4>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">\${f.message}</p>
            <div style="font-size: 12px; color: var(--emerald);"><strong>Remediation:</strong> \${f.remediation}</div>
            \${f.autoFixSnippet ? '<div class="code-block">' + f.autoFixSnippet + '</div>' : ''}
          </div>
        \`).join('');
      }
    }

    async function hardenSelected() {
      const r = currentReports[selectedIdx];
      if (!r) return;
      if (!confirm('Apply automated security and layer fixes to ' + r.fileName + '?')) return;

      try {
        const res = await fetch('/api/harden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: r.filePath, save: true })
        });
        const result = await res.json();
        alert('Applied fixes:\\n• ' + result.appliedFixes.join('\\n• '));
        loadData();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    window.onload = loadData;
  </script>
</body>
</html>`;
  }
}

export function startStudioServer(port = 5353, targetDir = process.cwd()): http.Server {
  const studio = new DockSmithStudio(port, targetDir);
  return studio.start();
}
