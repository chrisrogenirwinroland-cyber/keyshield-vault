pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  environment {
    // ========= Repo / Traceability =========
    APP_NAME = "keyshield-vault"
    // IMPORTANT: use env.GIT_SHA everywhere (not plain GIT_SHA)
    GIT_SHA  = "unknown"

    // ========= Docker Hub =========
    DOCKERHUB_NAMESPACE = "rogen7spark"
    DOCKERHUB_CREDS_ID  = "dockerhub-creds"

    // ========= SonarCloud =========
    // Jenkins: Manage Jenkins -> System -> SonarQube servers -> Name = SonarCloud
    SONAR_SERVER_NAME   = "SonarCloud"
    // Jenkins: Manage Jenkins -> Credentials -> ID = sonar-token (Secret text)
    SONAR_TOKEN_ID      = "sonar-token"
    // From your SonarCloud URL: https://sonarcloud.io/project/overview?id=...
    SONAR_ORG           = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY   = "chrisrogenirwinroland-cyber_keyshield-vault"

    // Jenkins: Manage Jenkins -> Tools -> SonarQube Scanner -> Name MUST match
    SONAR_SCANNER_TOOL  = "SonarQubeScanner"

    // ========= Email / Alerts =========
    ALERT_TO = "s225493677@deakin.edu.au"

    // ========= Local staging URLs =========
    FE_URL  = "http://localhost:4200"
    API_URL = "http://localhost:3000"
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        checkout scm
        bat """
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short HEAD
          git log -1 --pretty=oneline
          git status
        """
        script {
          env.GIT_SHA = bat(script: "git rev-parse --short HEAD", returnStdout: true).trim()
          if (!env.GIT_SHA) { env.GIT_SHA = "unknown" }
          echo "Resolved env.GIT_SHA = ${env.GIT_SHA}"
        }
      }
    }

    stage('Preflight (Toolchain Verification)') {
      steps {
        bat """
          echo ===== TOOL VERSIONS =====
          where node
          node -v
          npm -v
          where docker
          docker version
          where trivy
          trivy --version
          where git
          git --version
        """
      }
    }

    stage('Install & Unit Tests - API') {
      steps {
        dir('api') {
          bat """
            echo ===== API INSTALL =====
            npm ci
            echo ===== API TEST =====
            npm test
          """
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'api/**/junit*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'api/npm-debug.log, api/**/coverage/**'
        }
      }
    }

    stage('Install & Unit Tests - Frontend') {
      steps {
        // REQUIRED: FE stages must run inside frontend/app
        dir('frontend/app') {
          bat """
            echo ===== FE INSTALL =====
            npm ci
            echo ===== FE TEST =====
            npm test
          """
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'frontend/app/**/junit*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'frontend/app/npm-debug.log, frontend/app/**/coverage/**'
        }
      }
    }

    stage('Build - Frontend (Angular)') {
      steps {
        dir('frontend/app') {
          bat """
            echo ===== FE BUILD =====
            npm run build
          """
        }
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'frontend/app/dist/**'
        }
      }
    }

    stage('Code Quality - SonarCloud') {
      steps {
        script {
          // Uses Jenkins Tool installation (fixes: 'sonar-scanner' not recognized)
          def scannerHome = tool("${SONAR_SCANNER_TOOL}")
          withSonarQubeEnv("${SONAR_SERVER_NAME}") {
            withCredentials([string(credentialsId: "${SONAR_TOKEN_ID}", variable: 'SONAR_TOKEN')]) {
              bat """
                echo ===== SONARCLOUD SCAN (MONOREPO) =====
                echo ProjectKey: %SONAR_PROJECT_KEY%
                echo Org: %SONAR_ORG%
                "${scannerHome}\\bin\\sonar-scanner.bat" ^
                  -Dsonar.host.url=https://sonarcloud.io ^
                  -Dsonar.login=%SONAR_TOKEN% ^
                  -Dsonar.organization=%SONAR_ORG% ^
                  -Dsonar.projectKey=%SONAR_PROJECT_KEY% ^
                  -Dsonar.projectName=%SONAR_PROJECT_KEY% ^
                  -Dsonar.sources=api,frontend/app/src ^
                  -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/.angular/**,**/coverage/** ^
                  -Dsonar.javascript.lcov.reportPaths=api/coverage/lcov.info,frontend/app/coverage/lcov.info
              """
            }
          }
        }
      }
    }

    stage('Security - Trivy FS Scan (vuln+misconfig)') {
      steps {
        bat """
          echo ===== TRIVY FILESYSTEM SCAN =====
          if not exist reports mkdir reports
          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format json --output reports\\trivy-fs.json .
          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format table --output reports\\trivy-fs.txt .
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-fs.json, reports/trivy-fs.txt'
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        bat """
          echo ===== DOCKER BUILD =====
          set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

          echo Building %API_IMAGE%
          docker build -t %API_IMAGE% -f api\\Dockerfile api

          echo Building %FE_IMAGE%
          docker build -t %FE_IMAGE% -f frontend\\app\\Dockerfile frontend\\app

          echo ===== DOCKER IMAGES =====
          docker images | findstr %APP_NAME%
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
          echo ===== TRIVY IMAGE SCAN =====
          if not exist reports mkdir reports

          set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

          docker save -o reports\\api-image.tar %API_IMAGE%
          docker save -o reports\\fe-image.tar %FE_IMAGE%

          trivy image --input reports\\api-image.tar --severity HIGH,CRITICAL --format json --output reports\\trivy-api-image.json
          trivy image --input reports\\fe-image.tar  --severity HIGH,CRITICAL --format json --output reports\\trivy-fe-image.json
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports\\trivy-*-image.json, reports\\*.tar'
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKERHUB_CREDS_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo ===== DOCKER LOGIN =====
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
            set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

            echo ===== PUSH =====
            docker push %API_IMAGE%
            docker push %FE_IMAGE%

            echo ===== LOGOUT =====
            docker logout
          """
        }
      }
    }

    stage('Deploy - Docker Compose (Staging)') {
      steps {
        bat """
          echo ===== DEPLOY STAGING =====
          docker compose -f docker-compose.yml down
          docker compose -f docker-compose.yml up -d --build
          docker ps
        """
      }
    }

    stage('Release - Smoke / Health Validation') {
      steps {
        powershell """
          Write-Host '===== RELEASE SMOKE TEST ====='

          # Frontend
          try {
            \$r1 = Invoke-WebRequest '${env:FE_URL}' -UseBasicParsing -TimeoutSec 20
            Write-Host ('FE Status: ' + \$r1.StatusCode)
          } catch {
            Write-Error 'Frontend smoke test failed'
            throw
          }

          # API (fallback: root if /health not present)
          try {
            \$healthUrl = '${env:API_URL}/health'
            \$r2 = Invoke-WebRequest \$healthUrl -UseBasicParsing -TimeoutSec 20
            Write-Host ('API Health Status: ' + \$r2.StatusCode)
          } catch {
            Write-Host 'No /health endpoint or it failed; trying API root...'
            \$r3 = Invoke-WebRequest '${env:API_URL}' -UseBasicParsing -TimeoutSec 20
            Write-Host ('API Root Status: ' + \$r3.StatusCode)
          }
        """
      }
    }
  }

  post {
    always {
      bat """
        echo ===== POST: DOCKER PS =====
        docker ps
      """
      archiveArtifacts allowEmptyArchive: true, artifacts: 'audit_*.json, reports/**'
    }

    success {
      emailext(
        to: "${env.ALERT_TO}",
        subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.GIT_SHA})",
        body: """Build SUCCESS.

Job: ${env.JOB_NAME}
Build: #${env.BUILD_NUMBER}
Commit: ${env.GIT_SHA}
URL: ${env.BUILD_URL}

Artifacts: Trivy reports + logs are archived in Jenkins.
"""
      )
    }

    failure {
      emailext(
        to: "${env.ALERT_TO}",
        subject: "FAILURE: ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.GIT_SHA})",
        body: """Build FAILED.

Job: ${env.JOB_NAME}
Build: #${env.BUILD_NUMBER}
Commit: ${env.GIT_SHA}
URL: ${env.BUILD_URL}

Check stage logs for root cause. Artifacts (if generated) are archived.
""",
        attachLog: true
      )
    }
  }
}
