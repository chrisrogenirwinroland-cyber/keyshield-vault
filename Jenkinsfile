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

    // ✅ IMPORTANT CHANGE: test via frontend reverse proxy (/api), not direct API port
    FE_URL  = "http://localhost:4200"
    API_PROXY_BASE = "http://localhost:4200/api"

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
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-api-image.json, reports/trivy-fe-image.json, reports/*.tar'
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
        // ✅ Make deploy deterministic: down first, then up
        bat """
          docker compose -f docker-compose.yml down --remove-orphans || echo "compose down skipped"
          docker rm -f keyshield-api 2>NUL || echo "No old keyshield-api to remove"
          docker rm -f keyshield-frontend 2>NUL || echo "No old keyshield-frontend to remove"

          docker compose -f docker-compose.yml up -d --build

          docker ps
        """
      }
    }

    // ✅ UPDATED: end-to-end smoke test through frontend reverse proxy
    stage('Release - E2E Smoke Test (UI Proxy Paths)') {
      steps {
        powershell(script: '''
          Write-Host "===== E2E SMOKE TEST via NGINX /api ====="
          docker ps

          $fe = $env:FE_URL
          $api = $env:API_PROXY_BASE

          # 1) FE route
          try {
            $rFe = Invoke-WebRequest ($fe + "/admin") -UseBasicParsing -TimeoutSec 20
            Write-Host ("FE /admin Status: " + $rFe.StatusCode)
          } catch {
            Write-Error "Frontend /admin failed"
            throw
          }

          # 2) API health via proxy
          try {
            $rHealth = Invoke-RestMethod -Method Get -Uri ($api + "/health") -TimeoutSec 20
            Write-Host ("API /health ok: " + ($rHealth.status))
          } catch {
            Write-Error "API /health via proxy failed"
            throw
          }

          # 3) Login via proxy (known good creds)
          $loginBody = @{ username="admin"; password="admin123" } | ConvertTo-Json
          try {
            $login = Invoke-RestMethod -Method Post -Uri ($api + "/auth/login") -ContentType "application/json" -Body $loginBody -TimeoutSec 20
          } catch {
            Write-Error "Login via proxy failed"
            throw
          }

          if (-not $login.token) { throw "No token returned from /auth/login" }
          $token = $login.token
          Write-Host ("Got JWT token length=" + $token.Length)

          # 4) Create API key via proxy (admin)
          $keyBody = @{ label=("jenkins-key-" + $env:BUILD_NUMBER) } | ConvertTo-Json
          try {
            $newKey = Invoke-RestMethod -Method Post -Uri ($api + "/admin/keys") `
              -Headers @{ Authorization = ("Bearer " + $token) } `
              -ContentType "application/json" -Body $keyBody -TimeoutSec 20
          } catch {
            Write-Error "Create key via proxy failed"
            throw
          }

          if (-not $newKey.raw_key_once) { throw "No raw_key_once returned from /admin/keys" }
          $apiKey = $newKey.raw_key_once
          Write-Host ("Got raw_key_once length=" + $apiKey.Length + " last4=" + $newKey.key_last4)

          # 5) Client access via proxy (x-api-key)
          try {
            $client = Invoke-RestMethod -Method Post -Uri ($api + "/client/access") `
              -Headers @{ "x-api-key" = $apiKey } -TimeoutSec 20
          } catch {
            Write-Error "Client access via proxy failed"
            throw
          }

          Write-Host ("Client access=" + $client.access)
          if ($client.access -ne "granted") { throw "Expected access=granted but got: $($client.access)" }

          Write-Host "✅ E2E smoke test passed (login->createKey->clientAccess via /api proxy)."
        ''')
      }
    }
  }

  post {
    always {
      bat """
        docker ps
        docker logs keyshield-api --tail 120 2>NUL || echo "No keyshield-api container logs available"
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
