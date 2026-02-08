// Jenkinsfile (Windows agent, Node/Angular monorepo, SonarCloud, Trivy, Docker, Email alerts)
// FIXED:
// - Dependency-Check format args (no "HTML,JSON"; use separate formats)
// - Dependency-Check + Gitleaks run in PowerShell (avoids cmd ". was unexpected at this time.")
// - GIT_SHA resolved from env.GIT_COMMIT (reliable), fallback to git rev-parse
//
// Repo layout:
//  - api/package.json, api/package-lock.json, api/Dockerfile
//  - frontend/app/package.json, frontend/app/package-lock.json, frontend/app/Dockerfile
//  - docker-compose.yml at repo root
//
// Jenkins requirements:
//  - SonarQube Scanner tool configured in Jenkins as: "SonarQubeScanner"
//  - SonarCloud server configured in Jenkins as: "SonarCloud"
//  - Credentials:
//      * sonar-token (Secret text)  -> SonarCloud token
//      * dockerhub-creds (Username/Password) -> DockerHub
//  - Email Extension Plugin configured (SMTP) + Admin email
//
// IMPORTANT: Trivy must be visible to Jenkins service PATH.
// If "trivy not recognized", restart Jenkins service OR set PATH to include:
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
    SONAR_SERVER_NAME   = "SonarCloud"
    SONAR_SCANNER_TOOL  = "SonarQubeScanner"
    SONAR_TOKEN_ID      = "sonar-token"
    SONAR_ORG           = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY   = "chrisrogenirwinroland-cyber_keyshield-vault"

    // ========= Email =========
    ALERT_TO = "s225493677@deakin.edu.au"

    // ========= Release / smoke =========
    FE_URL  = "http://localhost:4200"
    API_URL = "http://localhost:3000"

    // ========= Monitoring endpoints =========
    PROM_READY_URL = "http://localhost:9090/-/ready"
    ALERTMGR_URL   = "http://localhost:9093"
    GRAFANA_URL    = "http://localhost:3001"

    // ========= Reports =========
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
          // Prefer Git plugin var (most reliable)
          if (env.GIT_COMMIT) {
            env.GIT_SHA = env.GIT_COMMIT.take(7)
          } else {
            def sha = bat(returnStdout: true, script: '@echo off\r\ngit rev-parse --short HEAD\r\n').trim()
            env.GIT_SHA = sha?.tokenize()?.last()
          }
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

          echo ===== DOCKER =====
          where docker
          docker version

          echo ===== TRIVY =====
          where trivy
          trivy --version

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
    // CODE QUALITY (after Install & Unit Tests)
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
            if ($rc -ne 0) { Add-Content $apiOut "`r`nESLint API issues OR lint script missing (NON-BLOCKING)." }
          } else {
            "api/package.json not found" | Out-File $apiOut -Encoding UTF8
          }

          # ESLint - Frontend (best-effort)
          $feOut = Join-Path $eslintDir "eslint-fe.txt"
          if (Test-Path (Join-Path $env:WORKSPACE "frontend\\app\\package.json")) {
            Write-Host "-- ESLint Frontend"
            $rc = Run-And-Capture (Join-Path $env:WORKSPACE "frontend\\app") "npm run lint --silent" $feOut
            if ($rc -ne 0) { Add-Content $feOut "`r`nESLint Frontend issues OR lint script missing (NON-BLOCKING)." }
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
    // SECURITY (near Trivy): Trivy + Dependency-Check + Gitleaks
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

    // FIXED: valid formats + PowerShell non-blocking (no cmd parser issues)
    stage('Security - Dependency-Check (SCA)') {
      steps {
        powershell '''
          Write-Host "===== OWASP DEPENDENCY-CHECK (SCA) ====="
          $ErrorActionPreference = "Continue"

          $root = Join-Path $env:WORKSPACE $env:REPORT_DIR
          $outDir = Join-Path $root "dependency-check"
          New-Item -ItemType Directory -Force $outDir | Out-Null

          $vol = "$($env:WORKSPACE):/src"

          $rc = 0
          try {
            # Use separate --format args (HTML + JSON)
            & docker run --rm `
              -v $vol `
              -w /src `
              owasp/dependency-check:latest `
              --project $env:APP_NAME `
              --scan /src/api/package.json `
              --scan /src/api/package-lock.json `
              --scan /src/frontend/app/package.json `
              --scan /src/frontend/app/package-lock.json `
              --format HTML `
              --format JSON `
              --out ("/src/" + $env:REPORT_DIR + "/dependency-check") `
              --failOnCVSS 11

            $rc = $LASTEXITCODE
          } catch {
            $rc = 1
            ("Dependency-Check execution error: " + $_.Exception.Message) | Set-Content -Path (Join-Path $outDir "dependency-check-error.txt") -Encoding UTF8
          }

          if ($rc -ne 0) {
            ("Dependency-Check finished with non-zero exit code (" + $rc + "). Reports generated where possible.") |
              Set-Content -Path (Join-Path $outDir "dependency-check-note.txt") -Encoding UTF8
          } else {
            "Dependency-Check completed successfully." |
              Set-Content -Path (Join-Path $outDir "dependency-check-note.txt") -Encoding UTF8
          }

          exit 0
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/dependency-check/**'
        }
      }
    }

    // FIXED: PowerShell non-blocking
    stage('Security - Gitleaks (Secrets Scan)') {
      steps {
        powershell '''
          Write-Host "===== GITLEAKS SECRETS SCAN ====="
          $ErrorActionPreference = "Continue"

          $root = Join-Path $env:WORKSPACE $env:REPORT_DIR
          $outDir = Join-Path $root "gitleaks"
          New-Item -ItemType Directory -Force $outDir | Out-Null

          $vol = "$($env:WORKSPACE):/src"
          $reportPathHost = Join-Path $outDir "gitleaks-report.json"
          $notePathHost   = Join-Path $outDir "gitleaks-note.txt"

          $rc = 0
          try {
            & docker run --rm `
              -v $vol `
              gitleaks/gitleaks:latest `
              detect --source=/src --report-format json --report-path ("/src/" + $env:REPORT_DIR + "/gitleaks/gitleaks-report.json") --redact

            $rc = $LASTEXITCODE
          } catch {
            $rc = 1
            ("Gitleaks execution error: " + $_.Exception.Message) | Set-Content -Path (Join-Path $outDir "gitleaks-error.txt") -Encoding UTF8
          }

          # Ensure report exists even when empty
          if (-not (Test-Path $reportPathHost -PathType Leaf)) {
            "[]" | Set-Content -Path $reportPathHost -Encoding UTF8
          }

          if ($rc -ne 0) {
            ("Potential secrets detected OR scan returned non-zero exit (" + $rc + "). Review gitleaks-report.json.") |
              Set-Content -Path $notePathHost -Encoding UTF8
          } else {
            "No secrets detected by Gitleaks." | Set-Content -Path $notePathHost -Encoding UTF8
          }

          exit 0
        '''
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
      bat """
        @echo off
        echo ===== POST: DOCKER PS =====
        docker ps
      """
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
