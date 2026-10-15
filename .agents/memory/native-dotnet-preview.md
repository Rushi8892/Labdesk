---
name: Native .NET preview routing
description: Replit port forwarding when the app runs directly from a native .NET workflow instead of an artifact service.
---

When all artifact services are removed and the app runs as a direct .NET workflow, map its local port to the root preview port explicitly. A Kestrel process can be healthy on `0.0.0.0:5000` while the preview returns a generic `Running` placeholder if the root route is not forwarded.

**Why:** Removing the artifact services removed the shared artifact router; the direct workflow alone did not connect port 5000 to the root preview.

**How to apply:** Keep the workflow's `PORT`/listening port, `waitForPort`, and `.replit` port mapping aligned. Verify the app through its Replit development domain and health endpoint rather than relying on the old localhost artifact proxy.
