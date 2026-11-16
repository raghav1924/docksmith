# DockSmith CLI Cheatsheet

```bash
# Audit all Dockerfiles in workspace
docksmith audit .

# Enforce strict CI quality gates
docksmith audit Dockerfile --min-score=85 --fail-on-sec

# Inspect multi-stage build DAG & critical path
docksmith dag Dockerfile

# Automatically harden Dockerfiles
docksmith fix Dockerfile

# Launch Web Studio
docksmith studio --port 5353
```
