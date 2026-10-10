// Secure DevSecOps pipeline: Build -> SAST -> Security Scan -> Deploy -> DAST
// Jenkins runs in Docker on the same EC2 host, uses the host Docker daemon and a
// least-privilege kubeconfig (ServiceAccount jenkins-deployer). No secret is stored in this file.
pipeline {
  agent any
  options { timestamps(); disableConcurrentBuilds(); buildDiscarder(logRotator(numToKeepStr: '10')) }
  triggers { pollSCM('H/2 * * * *') }
  environment {
    IMAGE      = "healthcare-app:${env.BUILD_NUMBER}"
    SONAR_HOST = 'http://127.0.0.1:9000'
    APP_URL    = 'http://127.0.0.1:30080'
  }
  stages {
    stage('Build') {
      steps {
        // unit tests + coverage (for SonarQube), then the hardened image (its build stage re-runs the tests)
        sh 'docker run --rm -u $(id -u):$(id -g) -e npm_config_cache=/tmp/.npm -v "$WORKSPACE":/app -w /app node:24-alpine sh -c "npm ci --ignore-scripts && npm run coverage"'
        sh 'docker build -t $IMAGE -t healthcare-app:latest .'
      }
    }
    stage('SAST') {
      steps {
        withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
          // sonar-scanner; qualitygate.wait=true fails the build if the Quality Gate fails
          sh '''docker run --rm --network host -u $(id -u):$(id -g) -e SONAR_HOST_URL=$SONAR_HOST -e SONAR_TOKEN \
                  -v "$WORKSPACE":/usr/src sonarsource/sonar-scanner-cli \
                  -Dsonar.projectVersion=$BUILD_NUMBER -Dsonar.qualitygate.wait=true -Dsonar.qualitygate.timeout=300'''
        }
      }
    }
    stage('Security Scan') {
      steps {
        sh 'mkdir -p reports'
        // trivy image app: full HIGH/CRITICAL report, then a gate that fails on fixable CRITICAL CVEs
        sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache/ aquasec/trivy:latest image --no-progress --scanners vuln --severity HIGH,CRITICAL $IMAGE | tee reports/trivy-image.txt'
        sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache/ aquasec/trivy:latest image --no-progress --scanners vuln --severity CRITICAL --ignore-unfixed --exit-code 1 --quiet $IMAGE'
        // config scan of Dockerfile + Kubernetes manifests (misconfigurations)
        sh 'docker run --rm -v "$WORKSPACE":/src:ro -v trivy-cache:/root/.cache/ aquasec/trivy:latest config --severity HIGH,CRITICAL /src | tee reports/trivy-config.txt'
      }
    }
    stage('Deploy') {
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-deployer', variable: 'KUBECONFIG')]) {
          sh 'sed "s|healthcare-app:latest|$IMAGE|" k8s/deployment.yaml | kubectl apply -f -'
          sh 'kubectl -n healthcare rollout status deployment/healthcare-app --timeout=180s'
          sh 'kubectl -n healthcare get deploy,pods -o wide'
        }
      }
    }
    stage('DAST') {
      steps {
        // OWASP ZAP baseline (passive) scan against the freshly deployed app
        sh '''docker run --rm --network host -u $(id -u):$(id -g) -v "$WORKSPACE/reports":/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable \
                zap-baseline.py -t $APP_URL -r zap-baseline.html -J zap-baseline.json -I'''
      }
    }
  }
  post {
    always { archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true }
  }
}
