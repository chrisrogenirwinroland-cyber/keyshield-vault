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
    GIT_SHA   = "unknown"

    DOCKERHUB_NAMESPACE = "rogen7spark"
    DOCKERHUB_CREDS_ID  = "dockerhub-creds"

    SONAR_SERVER_NAME   = "SonarCloud"
    SONAR_SCANNER_TOOL  = "SonarQubeScanner"
    SONAR_TOKEN_ID      = "sonar-token"
    SONAR_ORG           = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY   = "chrisrogenirwinroland-cyber_keyshield-vault"

    ALERT_TO = "s225493677@deakin.edu.au"

    FE_URL  = "http://localhost:4200"
    API_URL = "http://localhost:3000"

    REPORT_DIR = "reports"
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        // Windows-safe cleanup (replaces deleteDir()) to avoid "file is being used" locks
        bat '''
          echo ===== WORKSPACE CLEANUP (WINDOWS SAFE) =====

          rem Kill common lock-holder processes (ignore failures)
          taskkill /F /IM node.exe /T 2>NUL
          taskkill /F /IM npm.exe /T 2>NUL
          taskkill /F /IM ng.exe /T 2>NUL
          taskkill /F /IM docker.exe /T 2>NUL

          cd /d "%WORKSPACE%"

          rem Best-effort delete all files in workspace
          del /F /Q /S * 2>NUL

          rem Best-effort delete all folders in workspace
          for /D %%G in (*) do rmdir /S /Q "%%G" 2>NUL

          echo ===== CLEANUP DONE (BEST EFFORT) =====
          dir
        '''

        checkout scm

        bat """
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short HEAD
          git log -1 --pretty=oneline
          git status
        """

        script {
          def sha = bat(
            returnStdout: true,
            script: '@echo off\r\ngit rev-parse --short HEAD'
          ).trim()

          env.GIT_SHA = sha ?: "${env.BUILD_NUMBER}"
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

          trivy image --input "%REPORT_DIR%\\api-image.tar" --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-api-image.json"
          trivy image --input "%REPORT_DIR%\\fe-image.tar"  --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-fe-image.json"
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
          docker rm -f keyshield-api 2>NUL || echo "No old keyshield-api to remove"
          docker rm -f keyshield-frontend 2>NUL || echo "No old keyshield-frontend to remove"

          docker compose -f docker-compose.yml down --remove-orphans
          docker compose -f docker-compose.yml up -d --build

          docker ps
        """
      }
    }

    stage('Release - Smoke / Health Validation') {
      steps {
        powershell(script: '''
          Write-Host "===== RELEASE SMOKE TEST ====="
          docker ps

          # API state
          try {
            $restartCount = (docker inspect -f "{{.RestartCount}}" keyshield-api) -as [int]
            $status       = (docker inspect -f "{{.State.Status}}" keyshield-api)
            Write-Host ("API Status: " + $status + " | RestartCount: " + $restartCount)

            if ($status -ne "running" -or $restartCount -gt 0) {
              Write-Host "API looks unstable. Showing last logs:"
              docker logs keyshield-api --tail 120
            }
          } catch {
            Write-Host "Could not inspect API container (maybe not created yet)."
          }

          # Frontend root
          $fe = $env:FE_URL
          $r1 = Invoke-WebRequest $fe -UseBasicParsing -TimeoutSec 20
          Write-Host ("FE Status: " + $r1.StatusCode)

          # API /health (fallback to /api/health if needed)
          $apiHealth = ($env:API_URL + "/health")
          try {
            $r2 = Invoke-WebRequest $apiHealth -UseBasicParsing -TimeoutSec 20
            Write-Host ("API /health Status: " + $r2.StatusCode)
          } catch {
            Write-Host "No /health endpoint; trying /api/health via FE proxy..."
            $r3 = Invoke-WebRequest ($env:FE_URL + "/api/health") -UseBasicParsing -TimeoutSec 20
            Write-Host ("FE /api/health Status: " + $r3.StatusCode)
          }
        ''')
      }
    }
  }

  post {
    always {
      // IMPORTANT: Never fail post on missing container
      bat """
        docker ps
        docker logs keyshield-api --tail 120 2>NUL || echo No keyshield-api container logs available
        exit /b 0
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
Commit: ${GIT_SHA}
URL: ${BUILD_URL}
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
""",
        attachLog: true
      )
    }
  }
}
