# Container CI Pipeline Gates

Block insecure Dockerfile configurations before image build:
```yaml
- name: Audit Dockerfile Security & Caching
  run: node dist/bin.js audit Dockerfile --fail-on-sec --min-score=85
```
