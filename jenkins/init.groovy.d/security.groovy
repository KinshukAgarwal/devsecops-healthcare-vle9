// Runs at Jenkins start: admin user, login required, credentials and the pipeline job.
// Secret values are read from files mounted read-only at /run/secrets/lab (never from Git).
import jenkins.model.Jenkins
import hudson.security.*
import hudson.util.Secret
import com.cloudbees.plugins.credentials.*
import com.cloudbees.plugins.credentials.domains.Domain
import org.jenkinsci.plugins.plaincredentials.impl.*

def j = Jenkins.get()
def dir = new File('/run/secrets/lab')
if (!(j.securityRealm instanceof HudsonPrivateSecurityRealm)) {
  def realm = new HudsonPrivateSecurityRealm(false)          // no self sign-up
  realm.createAccount('admin', new File(dir, 'jenkins-admin-password').text.trim())
  j.securityRealm = realm
  def auth = new FullControlOnceLoggedInAuthorizationStrategy()
  auth.allowAnonymousRead = false
  j.authorizationStrategy = auth
}
j.numExecutors = 1
def store = SystemCredentialsProvider.instance.store
def ids = store.getCredentials(Domain.global())*.id
if (!('sonar-token' in ids))
  store.addCredentials(Domain.global(), new StringCredentialsImpl(CredentialsScope.GLOBAL, 'sonar-token', 'SonarQube analysis token',
    Secret.fromString(new File(dir, 'sonar-token').text.trim())))
if (!('kubeconfig-deployer' in ids))
  store.addCredentials(Domain.global(), new FileCredentialsImpl(CredentialsScope.GLOBAL, 'kubeconfig-deployer', 'kubeconfig for SA healthcare/jenkins-deployer',
    'config', SecretBytes.fromBytes(new File(dir, 'kubeconfig-deployer').bytes)))
if (j.getItem('healthcare-devsecops') == null)
  j.createProjectFromXML('healthcare-devsecops', new File('/usr/share/jenkins/job-config.xml').newInputStream())
j.save()
