# Distroless & Minimal Runtime Containers

Shipping minimal runtime images with DockSmith:
- Use Debian or Alpine in builder stages for package compilation.
- Copy compiled artifacts into Google Distroless or scratch runtime containers.
- Eliminates shell binaries (`/bin/sh`, `/bin/bash`), package managers, and root access.
