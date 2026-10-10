#!/usr/bin/env bash
# SonarQube Community Build in Docker, sized for a 2 GB host (EC2 t3.small).
# Elasticsearch needs vm.max_map_count >= 262144 (set in /etc/sysctl.d/99-sonarqube.conf).
# Bound to 127.0.0.1 only; data kept in named volumes.
set -euo pipefail
docker rm -f sonarqube 2>/dev/null || true
docker run -d --name sonarqube -p 127.0.0.1:9000:9000 \
  -e SONAR_WEB_JAVAOPTS="-Xmx256m -Xms128m" \
  -e SONAR_CE_JAVAOPTS="-Xmx256m -Xms128m" \
  -e SONAR_SEARCH_JAVAOPTS="-Xmx384m -Xms384m" \
  -e SONAR_TELEMETRY_ENABLE=false \
  -v sonarqube_data:/opt/sonarqube/data -v sonarqube_extensions:/opt/sonarqube/extensions \
  -v sonarqube_logs:/opt/sonarqube/logs -v sonarqube_temp:/opt/sonarqube/temp \
  sonarqube:community
