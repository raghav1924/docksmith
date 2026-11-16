# Base Image Digest Pinning vs Floating Tags

Why pinning to immutable digests prevents supply chain compromises:
- Floating tags like `:latest` or `:alpine` can be overwritten upstream at any time.
- Pinning by SHA256 digest (`node@sha256:7b1e8...`) guarantees reproducible, tamper-proof builds.
