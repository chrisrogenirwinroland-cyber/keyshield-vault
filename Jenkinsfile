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
    APP_NAME  = "keyshield-vault"

    // ===== DockerHub =====
    DOCKERHUB_NAMESPACE = "rogen7spark"
    DOCKERHUB_CREDS_ID  = "dockerhub-creds"

    // ===== SonarCloud =====
    SONAR_SERVER_NAME   = "SonarCloud"
    SONAR_SCANNER_TOOL  = "SonarQubeScanner"
    SONAR_TOKEN_ID      = "sonar-token"
    SONAR_ORG           = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY   = "chrisrogenirwinroland-cyber_keyshield-vault"

    // ===== Email =====
    ALERT_TO = "s225493677@deakin.edu.au"

    // ===== URLs =====
    FE_URL  = "http://localhost:4200"
    API_URL = "http://localhost:3000"

    // ===== Reports =====
    REPORT_DIR = "reports"
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        checkout scm
        script {
          def sha = bat(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          // ✅ Avoid "unknown" tags: if git fails, fallback to build number
          env.GIT_SHA = (sha && sha != "") ? sha : "${env.BUILD_NUMBER}"
          echo "Resolved IMAGE TAG = ${env.GIT_SHA}"
        }

        bat """
          echo ===== GIT TRACEABILITY =====
          git log -1 --pretty=oneline
        """
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
      }
    }

    stage('Install & Unit Tests - API') {
      steps {
        dir('api') {
          bat """
            npm ci
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
            npm ci
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
          bat "npm run build"
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
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"

          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format json  --output "%REPORT_DIR%\\trivy-fs.json" .
          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format table --output "%REPORT_DIR%\\trivy-fs.txt"  .
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
          set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

          docker build -t %API_IMAGE% -f api\\Dockerfile api
          docker build -t %FE_IMAGE% -f frontend\\app\\Dockerfile frontend\\app

          docker images | findstr %APP_NAME%
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"

          set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

          docker save -o "%REPORT_DIR%\\api-image.tar" %API_IMAGE%
          docker save -o "%REPORT_DIR%\\fe-image.tar"  %FE_IMAGE%

          trivy image --scanners vuln --input "%REPORT_DIR%\\api-image.tar" --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-api-image.json"
          trivy image --scanners vuln --input "%REPORT_DIR%\\fe-image.tar"  --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-fe-image.json"
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-api-image.json, reports/trivy-fe-image.json'
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKERHUB_CREDS_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
            set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

            docker push %API_IMAGE%
            docker push %FE_IMAGE%

            docker logout
          """
        }
      }
    }

    stage('Deploy - Docker Compose (Staging)') {
      steps {
        bat """
          docker compose -f docker-compose.yml down
          docker compose -f docker-compose.yml up -d --build
          docker ps
        """
      }
    }

    stage('Release - Smoke / Health Validation') {
      steps {
        powershell '''
          Write-Host "===== RELEASE SMOKE TEST ====="
          $ErrorActionPreference = "Stop"

          $r1 = Invoke-WebRequest "$env:FE_URL" -UseBasicParsing -TimeoutSec 20
          Write-Host ("FE Status: " + $r1.StatusCode)

          try {
            $r2 = Invoke-WebRequest "$env:API_URL/health" -UseBasicParsing -TimeoutSec 20
            Write-Host ("API /health Status: " + $r2.StatusCode)
          } catch {
            $r3 = Invoke-WebRequest "$env:API_URL" -UseBasicParsing -TimeoutSec 20
            Write-Host ("API Root Status: " + $r3.StatusCode)
          }
        '''
      }
    }

    // ✅ FIX: Validate monitoring ONLY if already running, with retries (no redeploy from Jenkins)
    stage('Monitoring - Validate (If Running)') {
      steps {
        powershell '''
          Write-Host "===== MONITORING VALIDATION (SAFE) ====="
          $ErrorActionPreference = "Continue"

          function Test-Ready($url, $name) {
            for ($i=1; $i -le 10; $i++) {
              try {
                $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 10
                if ($r.StatusCode -eq 200) {
                  Write-Host "$name READY (200) on attempt $i"
                  return $true
                }
              } catch {
                Start-Sleep -Seconds 3
              }
            }
            Write-Host "$name not ready after retries: $url"
            return $false
          }

          # Check if containers exist (avoid failing pipeline if not present)
          $ps = docker ps --format "{{.Names}}"
          $hasProm = $ps -match "monitoring-prometheus"
          $hasAM   = $ps -match "monitoring-alertmanager"

          if (-not $hasProm -and -not $hasAM) {
            Write-Host "Monitoring containers not running - skipping validation."
            exit 0
          }

          if ($hasProm) {
            $okP = Test-Ready "http://localhost:9090/-/ready" "Prometheus"
            if (-not $okP) { throw "Prometheus validation failed" }
          }

          if ($hasAM) {
            $okA = Test-Ready "http://localhost:9093/-/ready" "Alertmanager"
            if (-not $okA) { throw "Alertmanager validation failed" }
          }
        '''
      }
    }
  }

  post {
    always {
      bat """
        docker ps
      """
      archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/**'
    }

    success {
      emailext(
        to: "${ALERT_TO}",
        subject: "SUCCESS: ${JOB_NAME} #${BUILD_NUMBER} (${GIT_SHA})",
        body: """Build SUCCESS.

Job: ${JOB_NAME}
Build: #${BUILD_NUMBER}
Commit/Tag: ${GIT_SHA}
URL: ${BUILD_URL}

Images pushed:
- ${DOCKERHUB_NAMESPACE}/${APP_NAME}-api:${GIT_SHA}
- ${DOCKERHUB_NAMESPACE}/${APP_NAME}-web:${GIT_SHA}

Artifacts:
- Trivy reports: Jenkins artifacts -> reports/*
- SonarCloud: https://sonarcloud.io/dashboard?id=${SONAR_PROJECT_KEY}
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
Commit/Tag: ${GIT_SHA}
URL: ${BUILD_URL}

Look at console output for first failing stage.
Artifacts (if created): Jenkins artifacts -> reports/*
""",
        attachLog: true
      )
    }
  }
}
