# DevSecOps for a Healthcare API (VLE-9)

Small patient-records API (Node.js/Express, **synthetic data only, no real PHI**) shipped through a
secure pipeline: **Build → SAST (SonarQube) → Security Scan (Trivy) → Deploy (k3s) → DAST (OWASP ZAP)**,
monitored by Prometheus, Alertmanager and Grafana.

| Path | What |
|---|---|
| `src/`, `test/` | API with input validation, helmet headers, `Cache-Control: no-store`, HMAC tokens, `/metrics` (prom-client); unit tests (`node --test`) |
| `Dockerfile`, `.dockerignore` | multi-stage, tests run during build, `node:24-alpine`, npm removed, non-root UID 10001 |
| `sonar-project.properties` | SonarQube project + lcov coverage |
| `k8s/bootstrap/` | namespace (Pod Security `restricted`), ServiceAccounts + RBAC, Service, secret generator (admin, run once) |
| `k8s/deployment.yaml` | ConfigMap + Deployment (secrets via `secretKeyRef`, securityContext, limits) applied by Jenkins |
| `monitoring/` | Prometheus (+ alert rules), Alertmanager, Grafana (provisioned dashboard) |
| `jenkins/` | Jenkins image (docker CLI, kubectl, plugins), init script (admin user, credentials, job) |
| `Jenkinsfile` | the pipeline |
| `scripts/sonarqube.sh` | SonarQube container tuned for 2 GB RAM |

Secrets are never committed: they are generated on the server (`k8s/bootstrap/create-secrets.sh`) and
reach the app only through Kubernetes Secrets (encrypted at rest by k3s `secrets-encryption`).
