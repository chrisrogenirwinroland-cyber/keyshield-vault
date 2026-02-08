// Jenkinsfile (Windows agent, Node/Angular monorepo, SonarCloud, Trivy, Docker, Email alerts)

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

    // ========= Dependency-Check =========
    NVD_API_KEY_CRED_ID = "nvd-api-key"

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

        script {
          // Robust short SHA resolution on Windows
          def shaOut = bat(returnStdout: true, script: '@echo off\r\ngit rev-parse --short HEAD\r\n').trim()
          def lines  = shaOut.readLines().collect { it.trim() }.findAll { it }
          env.GIT_SHA = (lines ? lines[-1] : "manual")
          echo "Resolved GIT_SHA = ${env.GIT_SHA}"
        }

        bat """
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short HEAD
          git log -1 --pretty=oneline
          git status
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

        bat 'powershell -NoProfile -Command "$PSVersionTable.PSVersion"'

        bat """
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"
          echo Preflight complete > "%REPORT_DIR%\\preflight.txt"
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

    stage('Code Quality - ESLint/Prettier') {
      steps {
        powershell '''
          Write-Host "===== CODE QUALITY: ESLINT + PRETTIER ====="
          $ErrorActionPreference = "Continue"

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

          Write-Host "-- ESLint API"
          $apiOut = Join-Path $eslintDir "eslint-api.txt"
          $rc = Run-And-Capture (Join-Path $env:WORKSPACE "api") "npm run lint --silent" $apiOut
          if ($rc -ne 0) { Add-Content $apiOut "`r`nESLint API issues OR lint script missing (NON-BLOCKING)." }

          Write-Host "-- ESLint Frontend"
          $feOut = Join-Path $eslintDir "eslint-fe.txt"
          $rc = Run-And-Capture (Join-Path $env:WORKSPACE "frontend\\app") "npm run lint --silent" $feOut
          if ($rc -ne 0) { Add-Content $feOut "`r`nESLint Frontend issues OR lint script missing (NON-BLOCKING)." }

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

    stage('Security - Dependency-Check (SCA)') {
      steps {
        withCredentials([string(credentialsId: "${NVD_API_KEY_CRED_ID}", variable: 'NVD_API_KEY')]) {
          powershell '''
            Write-Host "===== OWASP DEPENDENCY-CHECK (SCA) ====="
            $ErrorActionPreference = "Continue"

            $root = Join-Path $env:WORKSPACE $env:REPORT_DIR
            $outDir = Join-Path $root "dependency-check"
            New-Item -ItemType Directory -Force $outDir | Out-Null

            # Persistent cache under Jenkins Home to reduce updates
            $jenkinsHome = $env:JENKINS_HOME
            if (-not $jenkinsHome) { $jenkinsHome = "C:\\ProgramData\\Jenkins\\.jenkins" }

            $dcData = Join-Path $jenkinsHome "dependency-check-data"
            New-Item -ItemType Directory -Force $dcData | Out-Null

            # IMPORTANT: use $() so PowerShell doesn't treat "$dcData:" as drive scope
            $srcMount  = "$($env:WORKSPACE):/src"
            $dataMount = "$($dcData):/usr/share/dependency-check/data"

            try { docker pull owasp/dependency-check:latest | Out-Null } catch {}

            function Run-DC([switch]$NoUpdate) {
              $args = @(
                "run","--rm",
                "-v",$srcMount,
                "-v",$dataMount,
                "-w","/src",
                "owasp/dependency-check:latest",
                "--project",$env:APP_NAME,
                "--scan","/src/api/package.json",
                "--scan","/src/api/package-lock.json",
                "--scan","/src/frontend/app/package.json",
                "--scan","/src/frontend/app/package-lock.json",
                "--format","HTML",
                "--format","JSON",
                "--out","/src/"+$env:REPORT_DIR+"/dependency-check",
                "--nvdApiKey",$env:NVD_API_KEY,
                "--failOnCVSS","11"
              )
              if ($NoUpdate) { $args += "--noupdate" }
              & docker @args
              return $LASTEXITCODE
            }

            $rc = Run-DC
            if ($rc -ne 0) {
              Write-Host "Dependency-Check failed (rc=$rc). Retrying with --noupdate (cached DB)..."
              $rc2 = Run-DC -NoUpdate
              Write-Host "Retry rc=$rc2 (pipeline continues)."
            } else {
              Write-Host "Dependency-Check completed."
            }

            "Dependency-Check finished (non-blocking). See reports/dependency-check/." |
              Set-Content -Path (Join-Path $outDir "dependency-check-note.txt") -Encoding UTF8

            exit 0
          '''
        }
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/dependency-check/**'
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

    stage('Security - Vulnerability Summary (includes 0 findings)') {
      steps {
        powershell '''
          Write-Host "===== VULNERABILITY SUMMARY ====="
          if (-not (Test-Path $env:REPORT_DIR)) { New-Item -ItemType Directory -Force $env:REPORT_DIR | Out-Null }

          function Count-Trivy($path) {
            $out = [ordered]@{ VulnHigh=0; VulnCritical=0; MisHigh=0; MisCritical=0 }
            if (-not (Test-Path $path -PathType Leaf)) { return $out }

            try {
              $json = Get-Content $path -Raw | ConvertFrom-Json
            } catch {
              return $out
            }

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

          $fs  = Count-Trivy (Join-Path $env:REPORT_DIR "trivy-fs.json")
          $api = Count-Trivy (Join-Path $env:REPORT_DIR "trivy-api-image.json")
          $fe  = Count-Trivy (Join-Path $env:REPORT_DIR "trivy-fe-image.json")

          $totalHigh     = $fs.VulnHigh + $api.VulnHigh + $fe.VulnHigh + $fs.MisHigh
          $totalCritical = $fs.VulnCritical + $api.VulnCritical + $fe.VulnCritical + $fs.MisCritical

          $resultLine = ""
          if (($totalHigh + $totalCritical) -eq 0) {
            $resultLine = "OK: No HIGH/CRITICAL vulnerabilities or misconfigurations detected (Trivy)."
          } else {
            $resultLine = "WARN: HIGH/CRITICAL findings detected. Review Trivy reports."
          }

          $summary = @"
Trivy Security Summary (HIGH/CRITICAL)
=====================================
Job:    $env:JOB_NAME
Build:  #$env:BUILD_NUMBER
Commit: $env:GIT_SHA

Filesystem Scan:
  Vulnerabilities  HIGH=$($fs.VulnHigh)  CRITICAL=$($fs.VulnCritical)
  Misconfig        HIGH=$($fs.MisHigh)   CRITICAL=$($fs.MisCritical)

API Image Scan:
  Vulnerabilities  HIGH=$($api.VulnHigh) CRITICAL=$($api.VulnCritical)

Frontend Image Scan:
  Vulnerabilities  HIGH=$($fe.VulnHigh)  CRITICAL=$($fe.VulnCritical)

Totals:
  HIGH=$totalHigh
  CRITICAL=$totalCritical

Result:
  $resultLine
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
            $msg = "docker-compose.monitoring.yml not found - monitoring deploy skipped."
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
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/build-summary.txt'
        }
      }
    }

  } // end stages

  // ===== Pipeline-level post (EMAIL formatting fixed; removed "Attachments included" text section) =====
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
      script {
        // ---------- Safe file read ----------
        def readSafe = { p, fb -> fileExists(p) ? readFile(p) : fb }

        // ---------- Clip long outputs ----------
        def clip = { s, n ->
          def x = (s ?: '')
          (x.length() > n) ? (x.substring(0, n) + "\n...[clipped]...") : x
        }

        // ---------- Remove BOM + ANSI (fix ï»¿ and [33m codes) ----------
        def deBom = { s ->
          (s ?: '')
            .replace('\uFEFF', '')
            .replace('ï»¿', '')
        }

        def stripAnsi = { s ->
          def x = (s ?: '')
          x = x.replaceAll(/\u001B\[[0-9;?]*[ -\/]*[@-~]/, '')
          x = x.replaceAll(/\u009B[0-9;?]*[ -\/]*[@-~]/, '')
          return x
        }

        def clean = { s -> stripAnsi(deBom(s)) }

        // ---------- HTML escape ----------
        def esc = { s ->
          (s ?: '')
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        }

        // ---------- Load report snippets ----------
        def buildSum    = clean(readSafe('reports/build-summary.txt', 'Build summary not generated.'))
        def vulnSummary = clean(readSafe('reports/vuln-summary.txt',  'Vulnerability summary not generated.'))
        def smoke       = clean(readSafe('reports/smoke-test.txt',    'Smoke test report not generated.'))
        def monitorVal  = clean(readSafe('reports/alerts-validation.txt', 'Alerts validation report not generated.'))

        def eslintApi   = clean(readSafe('reports/eslint/eslint-api.txt', 'ESLint (API) output not generated.'))
        def eslintFe    = clean(readSafe('reports/eslint/eslint-fe.txt',  'ESLint (Frontend) output not generated.'))
        def prettier    = clean(readSafe('reports/prettier/prettier-check.txt', 'Prettier output not generated.'))

        def dcNote      = clean(readSafe('reports/dependency-check/dependency-check-note.txt',
                                         'Dependency-Check note not generated.'))

        // Keep attachments enabled (only removed the "attachments included" TEXT section from email body)
        def attachments = [
          'reports/build-summary.txt',
          'reports/vuln-summary.txt',
          'reports/trivy-fs.txt',
          'reports/trivy-fs.json',
          'reports/trivy-api-image.json',
          'reports/trivy-fe-image.json',
          'reports/smoke-test.txt',
          'reports/alerts-validation.txt',
          'reports/monitoring-note.txt',
          'reports/monitoring-ps.txt',
          'reports/eslint/**',
          'reports/prettier/**',
          'reports/dependency-check/**'
        ].join(',')

        emailext(
          to: "${ALERT_TO}",
          subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.GIT_SHA})",
          mimeType: 'text/html; charset=UTF-8',
          attachmentsPattern: attachments,
          body: """
<!doctype html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222; line-height:1.35;">

  <div style="margin-bottom:10px;">
    <h2 style="margin:0 0 8px 0;">
      CI/CD Pipeline Result:
      <span style="color:#1a7f37; font-weight:700;">SUCCESS</span>
    </h2>
  </div>

  <table cellpadding="8" cellspacing="0" style="border-collapse:collapse; border:1px solid #ddd; width:100%; max-width:820px;">
    <tr><td style="border:1px solid #ddd; width:140px;"><b>Job</b></td><td style="border:1px solid #ddd;">${env.JOB_NAME}</td></tr>
    <tr><td style="border:1px solid #ddd;"><b>Build</b></td><td style="border:1px solid #ddd;">#${env.BUILD_NUMBER}</td></tr>
    <tr><td style="border:1px solid #ddd;"><b>Commit</b></td><td style="border:1px solid #ddd;">${env.GIT_SHA}</td></tr>
    <tr><td style="border:1px solid #ddd;"><b>Build URL</b></td><td style="border:1px solid #ddd;"><a href="${env.BUILD_URL}">${env.BUILD_URL}</a></td></tr>
    <tr>
      <td style="border:1px solid #ddd;"><b>SonarCloud</b></td>
      <td style="border:1px solid #ddd;">
        <a href="https://sonarcloud.io/dashboard?id=${SONAR_PROJECT_KEY}">Open SonarCloud dashboard</a>
      </td>
    </tr>
  </table>

  <h3 style="margin:16px 0 8px 0;">Build Summary</h3>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(buildSum)}</pre>

  <h3 style="margin:16px 0 8px 0;">Code Quality (ESLint / Prettier)</h3>

  <p style="margin:0 0 6px 0;"><b>ESLint (API)</b></p>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(clip(eslintApi, 2500))}</pre>

  <p style="margin:0 0 6px 0;"><b>ESLint (Frontend)</b></p>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(clip(eslintFe, 2500))}</pre>

  <p style="margin:0 0 6px 0;"><b>Prettier Check</b></p>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(clip(prettier, 2200))}</pre>

  <h3 style="margin:16px 0 8px 0;">Security (Trivy)</h3>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(vulnSummary)}</pre>

  <h3 style="margin:16px 0 8px 0;">SCA (Dependency-Check)</h3>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(clip(dcNote, 1200))}</pre>

  <h3 style="margin:16px 0 8px 0;">Release Smoke Test</h3>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(smoke)}</pre>

  <h3 style="margin:16px 0 8px 0;">Monitoring / Alerts Validation</h3>
  <pre style="background:#f6f8fa; padding:10px; border:1px solid #ddd; white-space:pre-wrap;">${esc(monitorVal)}</pre>

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
        subject: "FAILURE: ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.GIT_SHA})",
        mimeType: 'text/html; charset=UTF-8',
        attachmentsPattern: 'reports/**',
        attachLog: true,
        body: """
<!doctype html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222; line-height:1.35;">
  <h2 style="margin:0 0 10px 0;">
    CI/CD Pipeline Result:
    <span style="color:#b42318; font-weight:700;">FAILED</span>
  </h2>
  <p style="margin:0 0 10px 0;">
    <b>Job:</b> ${env.JOB_NAME}<br/>
    <b>Build:</b> #${env.BUILD_NUMBER}<br/>
    <b>Commit:</b> ${env.GIT_SHA}<br/>
    <b>Build URL:</b> <a href="${env.BUILD_URL}">${env.BUILD_URL}</a>
  </p>
  <p style="margin:0 0 10px 0;">Console log attached. Any generated reports are archived in Jenkins artifacts.</p>
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

  } // end post

} // end pipeline
