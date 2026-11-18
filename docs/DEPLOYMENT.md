# Deployment & Production Operations — DockSmith

**Target:** Dockerfile Linter, Container Security Auditor & Cache Optimizer  
**Author:** Jatin Sharma ([https://jatinsh.netlify.app/](https://jatinsh.netlify.app/))

---

## 1. Container Deployment (Docker)

```bash
docker build -t docksmith:latest .
docker run -d -p 5353:5353 --name docksmith docksmith:latest
```

## 2. Process Manager (PM2)

```bash
npm install -g pm2
pm2 start dist/bin.js --name "docksmith" -- studio --port 5353
```

## 3. Systemd Service Unit

```ini
[Unit]
Description=DockSmith Background Service
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/docksmith
ExecStart=/usr/bin/node dist/bin.js studio --port 5353
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
