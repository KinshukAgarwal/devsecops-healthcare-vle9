#!/usr/bin/env bash
# Builds and starts Jenkins on the EC2 host.
#  - host network, but HTTP bound to 127.0.0.1 only (SG allows SSH only; UI reached via the host)
#  - JENKINS_HOME bind-mounted at the SAME path so "docker run -v $WORKSPACE" from pipelines resolves on the host
#  - docker.sock for builds; secrets mounted read-only from ~/lab-secrets/jenkins
set -euo pipefail
cd "$(dirname "$0")"
sudo mkdir -p /var/jenkins_home && sudo chown 1000:1000 /var/jenkins_home
docker build -t jenkins-devsecops .
docker rm -f jenkins 2>/dev/null || true
docker run -d --name jenkins --restart unless-stopped --network host \
  --memory 900m --group-add "$(stat -c %g /var/run/docker.sock)" \
  -v /var/jenkins_home:/var/jenkins_home -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$HOME/lab-secrets/jenkins":/run/secrets/lab:ro jenkins-devsecops
