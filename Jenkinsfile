// Jenkinsfile (Windows agent, Node/Angular monorepo, SonarCloud, Trivy, Docker, Email alerts)
//
// Adds stages:
//  1) Code Quality - ESLint/Prettier   (right after Install & Unit Tests)
//  2) Security - Dependency-Check      (near Trivy)
//  3) Security - Gitleaks (Secrets Scan) (near Trivy)
//
// Notes:
// - ESLint/Prettier stages are NON-BLOCKING (pipeline continues even if issues exist).
// - Dependency-Check + Gitleaks are run via Docker images (no local install required) and are NON-BLOCKING.
// - Windows-safe file redirection is done via temp files then copy to avoid "file in use" errors.
// - GIT_SHA is resolved using Jenkins env first, then CMD fallback (reliable on Windows services).

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
          // Prefer Jenkins-provided commit if available, else CMD fallback (Windows service-safe)
          if (env.GIT_COMMIT) {
            env.GIT_SHA = env.GIT_COMMIT.take(7)
          } else {
            def raw = bat(returnStdout: true, script: """@echo off
git rev-parse --short HEAD
""").trim()
            env.GIT_SHA = raw?.readLines()?.last()?.trim()
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
            @echo off
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

    // ==========================================================
    // NEW STAGE: Code Quality - ESLint/Prettier (NON-BLOCKING)
    // Place: after "Install & Unit Tests"
    // ==========================================================
    stage('Code Quality - ESLint/Prettier') {
      steps {
        bat """
          @echo off
          setlocal enabledelayedexpansion
          echo ===== CODE QUALITY: ESLINT + PRETTIER =====

          if not exist "%WORKSPACE%\\%REPORT_DIR%\\eslint"   mkdir "%WORKSPACE%\\%REPORT_DIR%\\eslint"
          if not exist "%WORKSPACE%\\%REPORT_DIR%\\prettier" mkdir "%WORKSPACE%\\%REPORT_DIR%\\prettier"

          rem ---------- ESLint (API) ----------
          set OUT_API=%WORKSPACE%\\%REPORT_DIR%\\eslint\\eslint-api.txt
          set TMP_API=%WORKSPACE%\\%REPORT_DIR%\\eslint\\eslint-api.%BUILD_NUMBER%.tmp

          echo -- ESLint API
          pushd api
          if exist package.json (
            call npm run lint --silent > "!TMP_API!" 2>&1
            set RC=!ERRORLEVEL!
            if not "!RC!"=="0" (
              echo.>> "!TMP_API!"
              echo ESLint API issues detected (NON-BLOCKING).>> "!TMP_API!"
            ) else (
              echo.>> "!TMP_API!"
              echo ESLint API: OK.>> "!TMP_API!"
            )
          ) else (
            echo api/package.json not found> "!TMP_API!"
          )
          popd
          copy /y "!TMP_API!" "!OUT_API!" >nul 2>&1

          rem ---------- ESLint (Frontend) ----------
          set OUT_FE=%WORKSPACE%\\%REPORT_DIR%\\eslint\\eslint-fe.txt
          set TMP_FE=%WORKSPACE%\\%REPORT_DIR%\\eslint\\eslint-fe.%BUILD_NUMBER%.tmp

          echo -- ESLint Frontend
          pushd frontend\\app
          if exist package.json (
            call npm run lint --silent > "!TMP_FE!" 2>&1
            set RC=!ERRORLEVEL!
            if not "!RC!"=="0" (
              echo.>> "!TMP_FE!"
              echo ESLint Frontend issues detected (NON-BLOCKING).>> "!TMP_FE!"
            ) else (
              echo.>> "!TMP_FE!"
              echo ESLint Frontend: OK.>> "!TMP_FE!"
            )
          ) else (
            echo frontend/app/package.json not found> "!TMP_FE!"
          )
          popd
          copy /y "!TMP_FE!" "!OUT_FE!" >nul 2>&1

          rem ---------- Prettier check (repo) ----------
          set OUT_PRE=%WORKSPACE%\\%REPORT_DIR%\\prettier\\prettier-check.txt
          set TMP_PRE=%WORKSPACE%\\%REPORT_DIR%\\prettier\\prettier-check.%BUILD_NUMBER%.tmp

          echo -- Prettier (format check)
          npx --yes prettier -c . > "!TMP_PRE!" 2>&1
          set PRC=!ERRORLEVEL!
          if not "!PRC!"=="0" (
            echo.>> "!TMP_PRE!"
            echo Prettier found formatting differences OR not configured (NON-BLOCKING).>> "!TMP_PRE!"
          ) else (
            echo.>> "!TMP_PRE!"
            echo Prettier: formatting OK.>> "!TMP_PRE!"
          )
          copy /y "!TMP_PRE!" "!OUT_PRE!" >nul 2>&1

          echo ===== CODE QUALITY COMPLETE =====
          exit /b 0
        """
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
    // SECURITY AREA (Trivy + NEW Dependency-Check + NEW Gitleaks)
    // Place new stages near Trivy
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

    // --------------------
    // NEW: Dependency-Check
    // --------------------
    stage('Security - Dependency-Check (SCA)') {
      steps {
        bat """
          @echo off
          setlocal
          echo ===== OWASP DEPENDENCY-CHECK (SCA) =====

          if not exist "%WORKSPACE%\\%REPORT_DIR%\\dependency-check" mkdir "%WORKSPACE%\\%REPORT_DIR%\\dependency-check"

          rem Run via Docker (no local install). Scan lockfiles + package.json only for speed.
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

          rem NON-BLOCKING
          exit /b 0
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/dependency-check/**'
        }
      }
    }

    // --------------------
    // NEW: Gitleaks
    // --------------------
    stage('Security - Gitleaks (Secrets Scan)') {
      steps {
        bat """
          @echo off
          setlocal
          echo ===== GITLEAKS SECRETS SCAN =====

          if not exist "%WORKSPACE%\\%REPORT_DIR%\\gitleaks" mkdir "%WORKSPACE%\\%REPORT_DIR%\\gitleaks"

          rem Run via Docker image (no local install required)
          docker run --rm ^
            -v "%WORKSPACE%:/src" ^
            gitleaks/gitleaks:latest ^
            detect --source=/src --report-format json --report-path /src/%REPORT_DIR%/gitleaks/gitleaks-report.json --redact

          set GL_RC=%ERRORLEVEL%

          rem Create empty report if tool created none
          if not exist "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-report.json" echo []> "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-report.json"

          if not "%GL_RC%"=="0" (
            echo Potential secrets detected OR scan returned non-zero exit (%GL_RC%). Review gitleaks-report.json.> "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-note.txt"
          ) else (
            echo No secrets detected by Gitleaks.> "%WORKSPACE%\\%REPORT_DIR%\\gitleaks\\gitleaks-note.txt"
          )

          rem NON-BLOCKING
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

    stage('Security - Vulnerability Summary (includes 0 findings)') {
      steps {
        powershell '''
          Write-Host "===== SECURITY SUMMARY (TRIVY + DEP-CHECK + GITLEAKS) ====="
          if (-not (Test-Path $env:REPORT_DIR)) { New-Item -ItemType Directory -Force $env:REPORT_DIR | Out-Null }

          function Count-Trivy($path) {
            $out = [ordered]@{ VulnHigh=0; VulnCritical=0; MisHigh=0; MisCritical=0 }
            if (-not (Test-Path $path -PathType Leaf)) { return $out }
            try { $json = Get-Content $path -Raw | ConvertFrom-Json } catch { return $out }
            if ($null -eq $json.Results) { return $out }

            foreach ($r in $json.Results) {
              if ($null -ne $r.Vulnerabilities) {
                foreach ($v in $r.Vulnerabilities) {
                  if ($v.Severity -eq "HIGH")     { $out.VulnHigh++ }
                  if ($v.Severity -eq "CRITICAL") { $out.VulnCritical++ }
                }
              }
              if ($null -ne $r.Misconfigurations) {
                foreach ($m in $r.Misconfigurations) {
                  if ($m.Severity -eq "HIGH")     { $out.MisHigh++ }
                  if ($m.Severity -eq "CRITICAL") { $out.MisCritical++ }
                }
              }
            }
            return $out
          }

          # Trivy counts
          $fs  = Count-Trivy (Join-Path $env:REPORT_DIR "trivy-fs.json")
          $api = Count-Trivy (Join-Path $env:REPORT_DIR "trivy-api-image.json")
          $fe  = Count-Trivy (Join-Path $env:REPORT_DIR "trivy-fe-image.json")
          $trivyHigh     = $fs.VulnHigh + $api.VulnHigh + $fe.VulnHigh + $fs.MisHigh
          $trivyCritical = $fs.VulnCritical + $api.VulnCritical + $fe.VulnCritical + $fs.MisCritical

          $trivyLine = if (($trivyHigh + $trivyCritical) -eq 0) {
            "✅ No HIGH/CRITICAL vulnerabilities or misconfigurations were detected (Trivy)."
          } else {
            "⚠️ HIGH/CRITICAL findings detected (Trivy). Review attachments."
          }

          # Dependency-Check parse (best-effort)
          $dcPath = Join-Path $env:REPORT_DIR "dependency-check\\dependency-check-report.json"
          $dcCount = 0; $dcHigh = 0; $dcCritical = 0
          if (Test-Path $dcPath -PathType Leaf) {
            try {
              $dc = Get-Content $dcPath -Raw | ConvertFrom-Json
              if ($dc.dependencies) {
                foreach ($d in $dc.dependencies) {
                  if ($d.vulnerabilities) {
                    foreach ($v in $d.vulnerabilities) {
                      $dcCount++
                      $sev = ("$($v.severity)").ToUpperInvariant()
                      if ($sev -eq "HIGH") { $dcHigh++ }
                      if ($sev -eq "CRITICAL") { $dcCritical++ }
                    }
                  }
                }
              }
            } catch {}
          }
          $dcLine = if ($dcCount -eq 0) {
            "✅ No vulnerabilities detected (Dependency-Check) OR report not present."
          } else {
            "⚠️ Dependency-Check vulnerabilities: Total=$dcCount (HIGH=$dcHigh, CRITICAL=$dcCritical)."
          }

          # Gitleaks count
          $glPath = Join-Path $env:REPORT_DIR "gitleaks\\gitleaks-report.json"
          $glCount = 0
          if (Test-Path $glPath -PathType Leaf) {
            try {
              $gl = Get-Content $glPath -Raw | ConvertFrom-Json
              if ($gl) { $glCount = @($gl).Count } else { $glCount = 0 }
            } catch { $glCount = 0 }
          }
          $glLine = if ($glCount -eq 0) {
            "✅ No secrets detected (Gitleaks)."
          } else {
            "⚠️ Potential secrets detected (Gitleaks): Findings=$glCount."
          }

          $summary = @"
Security Summary (HIGH/CRITICAL focus)
=====================================
Job:    $env:JOB_NAME
Build:  #$env:BUILD_NUMBER
Commit: $env:GIT_SHA

Trivy:
  HIGH=$trivyHigh
  CRITICAL=$trivyCritical
  Result: $trivyLine

Dependency-Check (SCA):
  Total=$dcCount
  HIGH=$dcHigh
  CRITICAL=$dcCritical
  Result: $dcLine

Gitleaks:
  Findings=$glCount
  Result: $glLine
"@

          $outPath = Join-Path $env:REPORT_DIR "vuln-summary.txt"
          $summary | Set-Content -Path $outPath -Encoding UTF8
          Write-Host $summary
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/vuln-summary.txt'
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

    stage('Deploy - Docker Compose (Staging)') {
      steps {
        bat '''
          @echo off
          echo ===== CLEAN OLD CONTAINERS =====
          docker rm -f keyshield-api 2>NUL || echo "No old keyshield-api to remove"
          docker rm -f keyshield-frontend 2>NUL || echo "No old keyshield-frontend to remove"
        '''
        bat """
          @echo off
          echo ===== DEPLOY STAGING =====
          docker compose -f docker-compose.yml down
          docker compose -f docker-compose.yml up -d --build
          echo ===== DOCKER PS =====
          docker ps
        """
      }
    }

    stage('Release - Smoke / Health Validation') {
      steps {
        powershell '''
          Write-Host "===== RELEASE SMOKE TEST ====="
          if (-not (Test-Path $env:REPORT_DIR)) { New-Item -ItemType Directory -Force $env:REPORT_DIR | Out-Null }

          $feCode = "N/A"
          $apiCode = "N/A"

          try {
            $r1 = Invoke-WebRequest $env:FE_URL -UseBasicParsing -TimeoutSec 20
            $feCode = $r1.StatusCode
            Write-Host ("FE Status: " + $feCode)
          } catch {
            Write-Host "Frontend smoke test failed"
            throw
          }

          try {
            $healthUrl = "$env:API_URL/health"
            $r2 = Invoke-WebRequest $healthUrl -UseBasicParsing -TimeoutSec 20
            $apiCode = $r2.StatusCode
            Write-Host ("API /health Status: " + $apiCode)
          } catch {
            Write-Host "No /health endpoint or it failed; trying API root..."
            $r3 = Invoke-WebRequest $env:API_URL -UseBasicParsing -TimeoutSec 20
            $apiCode = $r3.StatusCode
            Write-Host ("API Root Status: " + $apiCode)
          }

          @"
Release Smoke Test
==================
Frontend URL: $env:FE_URL
Frontend HTTP: $feCode

API URL: $env:API_URL
API HTTP: $apiCode
"@ | Set-Content -Path (Join-Path $env:REPORT_DIR "smoke-test.txt") -Encoding UTF8
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/smoke-test.txt'
        }
      }
    }

    stage('Monitoring - Deploy Stack (Prometheus/Alertmanager)') {
      steps {
        powershell '''
          Write-Host "===== MONITORING DEPLOY ====="
          if (-not (Test-Path $env:REPORT_DIR)) { New-Item -ItemType Directory -Force $env:REPORT_DIR | Out-Null }

          if (-not (Test-Path "docker-compose.monitoring.yml" -PathType Leaf)) {
            $msg = "docker-compose.monitoring.yml not found - monitoring deploy skipped (stage completed)."
            Write-Host $msg
            $msg | Set-Content -Path (Join-Path $env:REPORT_DIR "monitoring-note.txt") -Encoding UTF8
            exit 0
          }

          $amPath = Join-Path (Get-Location) "monitoring\\alertmanager\\alertmanager.yml"

          if (Test-Path $amPath -PathType Container) {
            Write-Host "Found alertmanager.yml as DIRECTORY. Removing to fix mount..."
            Remove-Item $amPath -Recurse -Force
          }

          if (-not (Test-Path $amPath -PathType Leaf)) {
            Write-Host "Creating default alertmanager.yml..."
            New-Item -ItemType Directory -Force (Split-Path $amPath) | Out-Null
            @"
global:
  resolve_timeout: 5m
route:
  receiver: 'default'
receivers:
- name: 'default'
"@ | Set-Content -Path $amPath -Encoding UTF8
          }

          docker compose -f docker-compose.monitoring.yml up -d

          $ps = (docker ps) | Out-String
          $ps | Set-Content -Path (Join-Path $env:REPORT_DIR "monitoring-ps.txt") -Encoding UTF8

          "Monitoring deployed (or already running)." | Set-Content -Path (Join-Path $env:REPORT_DIR "monitoring-note.txt") -Encoding UTF8
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/monitoring-note.txt, reports/monitoring-ps.txt'
        }
      }
    }

    stage('Alerts - Validate Prometheus/Alertmanager/Grafana') {
      steps {
        powershell '''
          Write-Host "===== ALERTS VALIDATION ====="
          if (-not (Test-Path $env:REPORT_DIR)) { New-Item -ItemType Directory -Force $env:REPORT_DIR | Out-Null }

          $promOk = $false
          for ($i=1; $i -le 8; $i++) {
            try {
              $p = Invoke-WebRequest $env:PROM_READY_URL -UseBasicParsing -TimeoutSec 10
              if ($p.StatusCode -eq 200) { $promOk = $true; break }
            } catch {
              Start-Sleep -Seconds 3
            }
          }

          $amCode = "N/A"
          try { $a = Invoke-WebRequest $env:ALERTMGR_URL -UseBasicParsing -TimeoutSec 10; $amCode = $a.StatusCode } catch {}

          $gCode = "N/A"
          try { $g = Invoke-WebRequest $env:GRAFANA_URL -UseBasicParsing -TimeoutSec 10; $gCode = $g.StatusCode } catch {}

          @"
Monitoring Validation
=====================
Prometheus READY: $promOk  ($env:PROM_READY_URL)
Alertmanager HTTP: $amCode ($env:ALERTMGR_URL)
Grafana HTTP: $gCode ($env:GRAFANA_URL)
"@ | Set-Content -Path (Join-Path $env:REPORT_DIR "alerts-validation.txt") -Encoding UTF8

          Write-Host "Prometheus READY: $promOk"
          Write-Host "Alertmanager HTTP: $amCode"
          Write-Host "Grafana HTTP: $gCode"
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/alerts-validation.txt'
        }
      }
    }

    stage('Package Reports for Email') {
      steps {
        powershell '''
          Write-Host "===== PACKAGE REPORTS ====="
          if (-not (Test-Path $env:REPORT_DIR)) { New-Item -ItemType Directory -Force $env:REPORT_DIR | Out-Null }

          $summary = @"
Build Summary
=============
Job:    $env:JOB_NAME
Build:  #$env:BUILD_NUMBER
Commit: $env:GIT_SHA
URL:    $env:BUILD_URL

Endpoints
---------
Frontend:   $env:FE_URL
API:        $env:API_URL
Prometheus: $env:PROM_READY_URL
Alertmgr:   $env:ALERTMGR_URL
Grafana:    $env:GRAFANA_URL
"@

          $summary | Set-Content -Path (Join-Path $env:REPORT_DIR "build-summary.txt") -Encoding UTF8
          Write-Host "Created reports\\build-summary.txt"
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/build-summary.txt'
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

        echo ===== POST: API CONTAINER LOG TAIL (if exists) =====
        docker logs keyshield-api --tail 80 2>NUL || echo "No keyshield-api container logs available"
      """
      archiveArtifacts allowEmptyArchive: true, artifacts: 'audit_*.json, reports/**'
    }

    success {
      script {
        def vulnSummary = fileExists('reports/vuln-summary.txt') ? readFile('reports/vuln-summary.txt') : 'No vuln-summary.txt generated.'
        def smoke      = fileExists('reports/smoke-test.txt') ? readFile('reports/smoke-test.txt') : 'No smoke-test.txt generated.'
        def monitorVal = fileExists('reports/alerts-validation.txt') ? readFile('reports/alerts-validation.txt') : 'No alerts-validation.txt generated.'

        def esc = { s ->
          (s ?: '')
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        }

        emailext(
          to: "${ALERT_TO}",
          subject: "✅ SUCCESS: ${JOB_NAME} #${BUILD_NUMBER} (${GIT_SHA})",
          mimeType: 'text/html',
          attachmentsPattern: 'reports/build-summary.txt,reports/vuln-summary.txt,' +
                              'reports/trivy-fs.txt,reports/trivy-fs.json,reports/trivy-api-image.json,reports/trivy-fe-image.json,' +
                              'reports/smoke-test.txt,reports/alerts-validation.txt,reports/monitoring-note.txt,reports/monitoring-ps.txt,' +
                              'reports/eslint/**,reports/prettier/**,reports/dependency-check/**,reports/gitleaks/**',
          body: """
          <html>
            <body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222;">
              <h2 style="margin:0 0 10px 0;">
                CI/CD Pipeline Result: <span style="color:#1a7f37;">SUCCESS</span>
              </h2>

              <table cellpadding="8" cellspacing="0" style="border-collapse:collapse; border:1px solid #ddd;">
                <tr><td style="border:1px solid #ddd;"><b>Job</b></td><td style="border:1px solid #ddd;">${JOB_NAME}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Build</b></td><td style="border:1px solid #ddd;">#${BUILD_NUMBER}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Commit</b></td><td style="border:1px solid #ddd;">${GIT_SHA}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Build URL</b></td><td style="border:1px solid #ddd;"><a href="${BUILD_URL}">${BUILD_URL}</a></td></tr>
                <tr><td style="border:1px solid #ddd;"><b>SonarCloud</b></td>
                    <td style="border:1px solid #ddd;">
                      <a href="https://sonarcloud.io/dashboard?id=${SONAR_PROJECT_KEY}">https://sonarcloud.io/dashboard?id=${SONAR_PROJECT_KEY}</a>
                    </td>
                </tr>
              </table>

              <h3 style="margin:14px 0 8px 0;">Release Smoke Test</h3>
              <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(smoke)}</pre>

              <h3 style="margin:14px 0 8px 0;">Security Summary (Trivy + Dependency-Check + Gitleaks)</h3>
              <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(vulnSummary)}</pre>

              <h3 style="margin:14px 0 8px 0;">Monitoring / Alerts Validation</h3>
              <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(monitorVal)}</pre>

              <p style="margin-top:12px;">
                <b>Attachments included:</b> build-summary.txt, vuln-summary.txt, Trivy reports (txt/json),
                Dependency-Check (HTML/JSON), Gitleaks (JSON+note), ESLint/Prettier reports, smoke-test.txt, monitoring validation notes.
              </p>

              <p style="color:#666; margin-top:16px;">
                Regards,<br/>
                Jenkins CI/CD Pipeline<br/>
                ${APP_NAME}
              </p>
            </body>
          </html>
          """
        )
      }
    }

    failure {
      emailext(
        to: "${ALERT_TO}",
        subject: "❌ FAILURE: ${JOB_NAME} #${BUILD_NUMBER} (${GIT_SHA})",
        mimeType: 'text/html',
        attachmentsPattern: 'reports/**',
        attachLog: true,
        body: """
        <html>
          <body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222;">
            <h2 style="margin:0 0 10px 0;">CI/CD Pipeline Result: <span style="color:#b42318;">FAILED</span></h2>
            <p>
              <b>Job:</b> ${JOB_NAME}<br/>
              <b>Build:</b> #${BUILD_NUMBER}<br/>
              <b>Commit:</b> ${GIT_SHA}<br/>
              <b>Build URL:</b> <a href="${BUILD_URL}">${BUILD_URL}</a>
            </p>
            <p>Console log attached. Any generated reports are attached/archived under Jenkins artifacts.</p>
            <p style="color:#666; margin-top:16px;">Regards,<br/>Jenkins CI/CD Pipeline<br/>${APP_NAME}</p>
          </body>
        </html>
        """
      )
    }
  }
}
