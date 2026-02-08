// Jenkinsfile (Windows agent, Node/Angular monorepo, SonarCloud, Trivy, Docker, Email alerts + Monitoring/Alerting)
//
// Repo layout (your confirmed structure):
//  - api/package.json, api/package-lock.json, api/Dockerfile
//  - frontend/app/package.json, frontend/app/package-lock.json, frontend/app/Dockerfile
//  - docker-compose.yml at repo root
//
// Jenkins requirements (already in your setup):
//  - SonarQube Scanner tool configured in Jenkins as: "SonarQubeScanner"
//  - SonarCloud server configured in Jenkins as: "SonarCloud"
//  - Credentials:
//      * sonar-token (Secret text)  -> SonarCloud token
//      * dockerhub-creds (Username/Password) -> DockerHub
//  - Email Extension Plugin configured (SMTP) + Admin email
//
// IMPORTANT: Trivy must be visible to Jenkins service PATH.
// If pipeline says "trivy not recognized", restart Jenkins service OR set PATH+TRIVY in Jenkins global env to:
//   C:\ProgramData\chocolatey\bin
//
pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
    skipDefaultCheckout(true)
  }

  environment {
    // ========= App / traceability =========
    APP_NAME  = "keyshield-vault"
    GIT_SHA   = "unknown"

    // ========= Docker Hub =========
    DOCKERHUB_NAMESPACE = "rogen7spark"
    DOCKERHUB_CREDS_ID  = "dockerhub-creds"

    // ========= SonarCloud =========
    SONAR_SERVER_NAME = "SonarCloud"
    SONAR_SCANNER_TOOL = "SonarQubeScanner"     // Manage Jenkins -> Tools -> SonarQube Scanner name
    SONAR_TOKEN_ID   = "sonar-token"
    SONAR_ORG        = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY= "chrisrogenirwinroland-cyber_keyshield-vault"

    // ========= Email =========
    ALERT_TO = "s225493677@deakin.edu.au"

    // ========= Release / smoke =========
    FE_URL  = "http://localhost:4200"
    API_URL = "http://localhost:3000"

    // ========= Reports =========
    REPORT_DIR = "reports"
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
          // More reliable on Windows than powershell(returnStdout) under some Jenkins services
          env.GIT_SHA = bat(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          if (!env.GIT_SHA) { env.GIT_SHA = "manual" }
          echo "Resolved GIT_SHA = ${env.GIT_SHA}"
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

          echo ===== DOCKER =====
          where docker
          docker version

          echo ===== TRIVY =====
          where trivy
          trivy --version
        """
        bat 'powershell -NoProfile -Command "$PSVersionTable.PSVersion"'
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
          junit allowEmptyResults: true, testResults: 'api/**/junit*.xml, api/**/TEST-*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'api/npm-debug.log, api/**/coverage/**'
        }
      }
    }

    stage('Install & Unit Tests - Frontend') {
      steps {
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
          junit allowEmptyResults: true, testResults: 'frontend/app/**/junit*.xml, frontend/app/**/TEST-*.xml'
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
          def scannerHome = tool("${SONAR_SCANNER_TOOL}")

          withSonarQubeEnv("${SONAR_SERVER_NAME}") {
            withCredentials([string(credentialsId: "${SONAR_TOKEN_ID}", variable: 'SONAR_TOKEN')]) {
              bat """
                echo ===== SONARCLOUD SCAN (MONOREPO) =====
                echo ProjectKey: %SONAR_PROJECT_KEY%
                echo Org: %SONAR_ORG%

                "${scannerHome}\\bin\\sonar-scanner.bat" ^
                  -Dsonar.host.url=https://sonarcloud.io ^
                  -Dsonar.token=%SONAR_TOKEN% ^
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
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"

          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format json  --output "%REPORT_DIR%\\trivy-fs.json" .
          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format table --output "%REPORT_DIR%\\trivy-fs.txt"  .

          echo ===== TRIVY FS SCAN COMPLETE =====
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

          echo ===== DOCKER IMAGES (filtered) =====
          docker images | findstr %APP_NAME%
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
          echo ===== TRIVY IMAGE SCAN (TAR) =====
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"

          set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

          docker save -o "%REPORT_DIR%\\api-image.tar" %API_IMAGE%
          docker save -o "%REPORT_DIR%\\fe-image.tar"  %FE_IMAGE%

          trivy image --input "%REPORT_DIR%\\api-image.tar" --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-api-image.json"
          trivy image --input "%REPORT_DIR%\\fe-image.tar"  --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-fe-image.json"

          echo ===== TRIVY IMAGE SCAN COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-api-image.json, reports/trivy-fe-image.json, reports/*.tar'
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
        bat '''
          echo ===== CLEAN OLD CONTAINERS =====
          docker rm -f keyshield-api 2>NUL || echo "No old keyshield-api to remove"
          docker rm -f keyshield-frontend 2>NUL || echo "No old keyshield-frontend to remove"
        '''
        bat """
          echo ===== DEPLOY STAGING =====
          docker compose -f docker-compose.yml down
          docker compose -f docker-compose.yml up -d --build
          echo ===== DOCKER PS =====
          docker ps
        """
      }
    }

    // ✅ FIXED: use triple single quotes so Groovy does NOT interpolate $r1/$r2/$PSVersionTable/etc.
    stage('Release - Smoke / Health Validation') {
      steps {
        powershell '''
          Write-Host "===== RELEASE SMOKE TEST ====="

          # Frontend
          try {
            $r1 = Invoke-WebRequest "$env:FE_URL" -UseBasicParsing -TimeoutSec 20
            Write-Host ("FE Status: " + $r1.StatusCode)
          } catch {
            Write-Error "Frontend smoke test failed"
            throw
          }

          # API - prefer /health but fallback to root
          try {
            $healthUrl = "$env:API_URL/health"
            $r2 = Invoke-WebRequest $healthUrl -UseBasicParsing -TimeoutSec 20
            Write-Host ("API /health Status: " + $r2.StatusCode)
          } catch {
            Write-Host "No /health endpoint or it failed; trying API root..."
            $r3 = Invoke-WebRequest "$env:API_URL" -UseBasicParsing -TimeoutSec 20
            Write-Host ("API Root Status: " + $r3.StatusCode)
          }
        '''
      }
    }

    // ✅ Monitoring stage (Windows-safe): only brings up monitoring stack if docker-compose.monitoring.yml exists.
    // If you already have monitoring running externally, this stage will just validate it's healthy.
    stage('Monitoring - Deploy Stack (Prometheus/Alertmanager)') {
      steps {
        bat """
          echo ===== MONITORING DEPLOY =====
          if exist "docker-compose.monitoring.yml" (
            docker compose -f docker-compose.monitoring.yml up -d
          ) else (
            echo docker-compose.monitoring.yml not found - assuming monitoring is already running.
          )

          echo ===== MONITORING CONTAINERS =====
          docker ps | findstr monitoring || exit /b 0
        """
      }
    }

    // ✅ Alerts validation: checks Prometheus + Alertmanager endpoints respond
    stage('Alerts - Validate Prometheus/Alertmanager') {
      steps {
        powershell '''
          Write-Host "===== VALIDATE PROMETHEUS / ALERTMANAGER ====="

          $prom = "http://localhost:9090/-/ready"
          $am   = "http://localhost:9093/-/ready"

          try {
            $p = Invoke-WebRequest $prom -UseBasicParsing -TimeoutSec 20
            Write-Host ("Prometheus Ready: " + $p.StatusCode)
          } catch {
            Write-Error "Prometheus is not ready at http://localhost:9090"
            throw
          }

          try {
            $a = Invoke-WebRequest $am -UseBasicParsing -TimeoutSec 20
            Write-Host ("Alertmanager Ready: " + $a.StatusCode)
          } catch {
            Write-Error "Alertmanager is not ready at http://localhost:9093"
            throw
          }
        '''
      }
    }
  }

  post {
    always {
      bat """
        echo ===== POST: DOCKER PS =====
        docker ps

        echo ===== POST: API CONTAINER LOG TAIL (if exists) =====
        docker logs keyshield-api --tail 80 2>NUL || echo "No keyshield-api container logs available"
      """

      archiveArtifacts allowEmptyArchive: true, artifacts: 'audit_*.json, reports/**'
    }

    success {
      emailext(
        to: "${ALERT_TO}",
        subject: "SUCCESS: ${JOB_NAME} #${BUILD_NUMBER} (${GIT_SHA})",
        body: """Build SUCCESS.

Job: ${JOB_NAME}
Build: #${BUILD_NUMBER}
Commit: ${GIT_SHA}
URL: ${BUILD_URL}

Artifacts:
- SonarCloud dashboard: https://sonarcloud.io/dashboard?id=${SONAR_PROJECT_KEY}
- Trivy reports are archived under Jenkins artifacts: reports/*
- Docker images pushed: ${DOCKERHUB_NAMESPACE}/${APP_NAME}-api:${GIT_SHA}, ${DOCKERHUB_NAMESPACE}/${APP_NAME}-web:${GIT_SHA}

Monitoring/Alerts:
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093
- Grafana: http://localhost:3001
"""
      )
    }

    failure {
      emailext(
        to: "${ALERT_TO}",
        subject: "FAILURE: ${JOB_NAME} #${BUILD_NUMBER} (${GIT_SHA})",
        body: """Build FAILED.

Job: ${JOB_NAME}
Build: #${BUILD_NUMBER}
Commit: ${GIT_SHA}
URL: ${BUILD_URL}

Next actions:
1) Open Jenkins console output and locate the first failing stage.
2) Review archived security reports (if generated): reports/*
3) If failure is in monitoring validation, confirm:
   - Prometheus: http://localhost:9090/-/ready
   - Alertmanager: http://localhost:9093/-/ready

Artifacts:
- SonarCloud: https://sonarcloud.io/dashboard?id=${SONAR_PROJECT_KEY}
- Trivy reports (if generated): Jenkins Artifacts -> reports/*
""",
        attachLog: true
      )
    }
  }
}
