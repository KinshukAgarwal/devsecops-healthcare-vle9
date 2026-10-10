# Jenkins LTS with docker CLI + kubectl; plugins pre-installed so no setup wizard is needed
FROM jenkins/jenkins:lts-jdk21
USER root
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker/buildx-bin /buildx /usr/libexec/docker/cli-plugins/docker-buildx
RUN curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -fsSL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl
USER jenkins
ENV JAVA_OPTS="-Xmx512m -XX:+UseSerialGC -Djenkins.install.runSetupWizard=false"
ENV JENKINS_OPTS="--httpListenAddress=127.0.0.1"
RUN jenkins-plugin-cli --plugins git workflow-aggregator credentials-binding plain-credentials pipeline-stage-view pipeline-graph-view timestamper
COPY init.groovy.d/ /usr/share/jenkins/ref/init.groovy.d/
COPY job-config.xml /usr/share/jenkins/job-config.xml
