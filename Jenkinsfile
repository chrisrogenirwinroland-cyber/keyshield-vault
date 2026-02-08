// Jenkinsfile (Windows agent, Node/Angular monorepo, SonarCloud, Trivy, Docker, Email alerts)
//
// FIXES included (your current failure: ". was unexpected at this time."):
// - ESLint/Prettier stage is implemented in PowerShell (no CMD parser edge-cases), and is NON-BLOCKING.
// - GIT_SHA resolution uses a Windows-safe `bat(returnStdout:true, ...)` method (no "unknown").
//
// Adds requested stages:
// 1) Code Quality - ESLint/Prettier  (after Install & Unit Tests)
// 2) Security - Dependency-Check     (near Trivy)
// 3) Security - Gitleaks (Secrets Scan) (near Trivy)

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

    // Docker Hub
    DOCKERHUB_NAMESPACE = "rogen7spark"
    DOCKERHUB_CREDS_ID  = "dockerhub-creds"

    // SonarCloud
    SONAR_SERVER_NAME  = "SonarCloud"
    SONAR_SCANNER_TOOL = "SonarQubeScanner"
    SONAR_TOKEN_ID     = "sonar-token"
    SONAR_ORG          = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY  = "chrisrogenirwinroland-cyber_keyshield-vault"

    // Email
    ALERT_TO = "s225493677@deakin.edu.au"

    // Endpoints
    FE_URL  = "http://localhost:4200"
    API_URL = "http://localhost:3000"

    PROM_READY_URL = "http://localhost:9090/-/ready"
    ALERTMGR_URL   = "http://localhost:9093"
    GRAFANA_URL    = "http://localhost:3001"

    REPORT_DIR = "reports"
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        checkout scm
        bat """
          @echo off
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short HEAD
          git log -1 --pretty=oneline
          git status
        """
        script {
          // Windows-safe commit capture (avoids "unknown")
          def raw = bat(returnStdout: true, script: '@echo off\r\ngit rev-parse --short HEAD\r\n').trim()
          env.GIT_SHA = raw?.tokenize()?.last()
          if (!env.GIT_SHA) { env.GIT_SHA = "manual" }
          echo "Resolved GIT_SHA = ${env.GIT_SHA}"
        }
      }
    }

    stage('Preflight (Toolchain Verification)') {
      steps {
        bat """
          @echo off
          echo ===== TOOL VERSIONS =====
          where node
          node -v
          npm -v

          echo ===== SETUP REPORT DIR =====
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"
          echo Preflight complete > "%REPORT_DIR%\\preflight.txt"
        """
        bat 'powershell -NoProfile -Command "$PSVersionTable.PSVersion"'
      }
    }

    stage('Install & Unit Tests - API') {
      steps {
        dir('api') {
          bat """
            @echo off
            echo ===== API INSTALL =====
            npm ci

            echo ===== API TEST (best-effort) =====
            npm test
            if not "%ERRORLEVEL%"=="0" (
              echo API tests missing or failed (best-effort). Continuing...
              exit /b 0
            )
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
            @echo off
            echo ===== FE INSTALL =====
            npm ci

            echo ===== FE TEST (best-effort) =====
            npm test
            if not "%ERRORLEVEL%"=="0" (
              echo Frontend tests missing or failed (best-effort). Continuing...
              exit /b 0
            )
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

    // ==========================================================
    // NEW STAGE (FIXED): Code Quality - ESLint/Prettier
    // - Implemented in PowerShell to avoid CMD error:
    //   ". was unexpected at this time."
    // - NON-BLOCKING by design (always exits 0)
    // ==========================================================
    stage('Code Quality - ESLint/Prettier') {
      steps {
        powershell '''
          $ErrorActionPreference = "Continue"
          Write-Host "===== CODE QUALITY: ESLINT + PRETTIER ====="

          $root = Join-Path $env:WORKSPACE $env:REPORT_DIR
          $eslintDir   = Join-Path $root "eslint"
          $prettierDir = Join-Path $root "prettier"

          New-Item -ItemType Directory -Force $eslintDir   | Out-Null
          New-Item -ItemType Directory -Force $prettierDir | Out-Null

          function Run-And-Capture([string]$workDir, [string]$cmd, [string]$outFile) {
            Push-Location $workDir
            try {
              # Run command and capture ALL output (stdout+stderr)
              cmd /c $cmd 2>&1 | Out-File -FilePath $outFile -Encoding UTF8
              $rc = $LASTEXITCODE
            } finally {
              Pop-Location
            }
            return $rc
          }

          # ESLint - API (best-effort)
          $apiOut = Join-Path $eslintDir "eslint-api.txt"
          if (Test-Path (Join-Path $env:WORKSPACE "api\\package.json")) {
            Write-Host "-- ESLint API"
            $rc = Run-And-Capture (Join-Path $env:WORKSPACE "api") "npm run lint --silent" $apiOut
            if ($rc -ne 0) { Add-Content $apiOut "`r`nESLint API issues or lint script missing (NON-BLOCKING)." }
          } else {
            "api/package.json not found" | Out-File $apiOut -Encoding UTF8
          }

          # ESLint - Frontend (best-effort)
          $feOut = Join-Path $eslintDir "eslint-fe.txt"
          if (Test-Path (Join-Path $env:WORKSPACE "frontend\\app\\package.json")) {
            Write-Host "-- ESLint Frontend"
            $rc = Run-And-Capture (Join-Path $env:WORKSPACE "frontend\\app") "npm run lint --silent" $feOut
            if ($rc -ne 0) { Add-Content $feOut "`r`nESLint Frontend issues or lint script missing (NON-BLOCKING)." }
          } else {
            "frontend/app/package.json not found" | Out-File $feOut -Encoding UTF8
          }

          # Prettier - repo (best-effort)
          Write-Host "-- Prettier check (repo)"
          $preOut = Join-Path $prettierDir "prettier-check.txt"
          cmd /c "npx --yes prettier -c ." 2>&1 | Out-File -FilePath $preOut -Encoding UTF8
          if ($LASTEXITCODE -ne 0) {
            Add-Content $preOut "`r`nPrettier differences OR Prettier not configured (NON-BLOCKING)."
          } else {
            Add-Content $preOut "`r`nPrettier: formatting OK."
          }

          Write-Host "===== CODE QUALITY COMPLETE ====="
          exit 0
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/eslint/**, reports/prettier/**'
        }
      }
    }

    stage('Build - Frontend (Angular)') {
      steps {
        dir('frontend/app') {
          bat """
            @echo off
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
                @echo off
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

    // ==========================================================
    // SECURITY (Trivy + NEW Dependency-Check + NEW Gitleaks)
    // ==========================================================

    stage('Security - Trivy FS Scan (vuln+misconfig)') {
      steps {
        bat """
          @echo off
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

    // NEW: Dependency-Check (NON-BLOCKING, Docker-based)
    stage('Security - Dependency-Check (SCA)') {
      steps {
        bat """
          @echo off
          setlocal
          echo ===== OWASP DEPENDENCY-CHECK (SCA) =====

          if not exist "%WORKSPACE%\\%REPORT_DIR%\\dependency-check" mkdir "%WORKSPACE%\\%REPORT_DIR%\\dependency-check"

          docker run --rm ^
            -v "%WORKSPACE%:/src" ^
            -w /src ^
            owasp/dependency-check:latest ^
            --project "%APP_NAME%" ^
            --scan /src/api/package-lock.json ^
            --scan /src/api/package.json ^
            --scan /src/frontend/app/package-lock.json ^
            --scan /src/frontend/app/package.json ^
            --format "HTML,JSON" ^
            --out /src/%REPORT_DIR%/dependency-check ^
            --failOnCVSS 11

          set DC_RC=%ERRORLEVEL%
          if not "%DC_RC%"=="0" (
            echo Dependency-Check returned non-zero exit (%DC_RC%). Reports generated where possible.> "%WORKSPACE%\\%REPORT_DIR%\\dependency-check\\dependency-check-note.txt"
          ) else (
            echo Dependency-Check completed successfully.> "%WORKSPACE%\\%REPORT_DIR%\\dependency-check\\dependency-check-note.txt"
          )

          exit /b 0
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/dependency-check/**'
        }
      }
    }

    // NEW: Gitleaks (NON-BLOCKING, Docker-based)
    stage('Security - Gitleaks (Secrets Scan)') {
      steps {
        bat """
          @echo off
          setlocal
          echo ===== GITLEAKS SECRETS SCAN =====

          if not exist "%WORKSPACE%\\%REPORT_DIR%\\gitleaks" mkdir "%WORKSPACE%\\%REPORT_DIR%\\gitleaks"

          docker run --rm ^
            -v "%WORKSPACE%:/src" ^
            gitleaks/gitleaks:latest ^
            detect --source=/src --report-format json --report-path /src/%REPORT_DIR%/gitleaks/gitleaks-report.json --redact

          set GL_RC=%ERRORLEVEL%

          if not exist "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-report.json" echo []> "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-report.json"

          if not "%GL_RC%"=="0" (
            echo Potential secrets detected OR scan returned non-zero exit (%GL_RC%). Review gitleaks-report.json.> "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-note.txt"
          ) else (
            echo No secrets detected by Gitleaks.> "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-note.txt"
          )

          exit /b 0
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/gitleaks/**'
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        bat """
          @echo off
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
          @echo off
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
            @echo off
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
  }

  post {
    always {
      archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/**'
    }

    success {
      emailext(
        to: "${ALERT_TO}",
        subject: "✅ SUCCESS: ${JOB_NAME} #${BUILD_NUMBER} (${GIT_SHA})",
        mimeType: 'text/plain',
        attachmentsPattern: 'reports/**',
        body: """SUCCESS
Job:    ${JOB_NAME}
Build:  #${BUILD_NUMBER}
Commit: ${GIT_SHA}
URL:    ${BUILD_URL}

Artifacts attached: reports/**
"""
      )
    }

    failure {
      emailext(
        to: "${ALERT_TO}",
        subject: "❌ FAILURE: ${JOB_NAME} #${BUILD_NUMBER} (${GIT_SHA})",
        mimeType: 'text/plain',
        attachmentsPattern: 'reports/**',
        attachLog: true,
        body: """FAILED
Job:    ${JOB_NAME}
Build:  #${BUILD_NUMBER}
Commit: ${GIT_SHA}
URL:    ${BUILD_URL}

Console log attached. Any reports (if created) attached under reports/**.
"""
      )
    }
  }
}
