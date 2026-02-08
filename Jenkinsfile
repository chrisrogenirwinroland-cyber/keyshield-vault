// Jenkinsfile (Windows-safe) — FULL pipeline (no empty stages)
// FIX: PowerShell blocks use ''' ''' so $null / $env:* never break Groovy parsing.
//
// Features:
// ✅ Clean SHA tag (no "unknown")
// ✅ Sonar stage safe (UNSTABLE if sonar-scanner/token missing)
// ✅ Trivy JSON + human summary + ZIP bundle
// ✅ DockerHub push
// ✅ Staging deploy + smoke tests
// ✅ Monitoring Alertmanager mount fix + safe deploy + safe validation
// ✅ Professional HTML email WITH ATTACHMENTS + links

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    APP_NAME       = "keyshield-vault"
    DOCKERHUB_USER = "rogen7spark"
    EMAIL_TO       = "s225493677@deakin.edu.au"

    // Jenkins credential IDs (UPDATE to match your Jenkins)
    DOCKER_CRED_ID      = "dockerhub-creds"     // Username with password
    SONAR_TOKEN_CRED_ID = "sonar-token"    // Secret text (optional)

    // SonarCloud (optional)
    SONAR_HOST_URL    = "https://sonarcloud.io"
    SONAR_ORG         = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY = "chrisrogenirwinroland-cyber_keyshield-vault"
    SONAR_DASHBOARD   = "https://sonarcloud.io/dashboard?id=chrisrogenirwinroland-cyber_keyshield-vault"

    // Local endpoints (compose publishes these)
    FE_URL         = "http://localhost:4200"
    API_HEALTH_URL = "http://localhost:3000/health"

    PROM_READY_URL = "http://localhost:9090/-/ready"
    ALERT_URL      = "http://localhost:9093"
    GRAFANA_URL    = "http://localhost:3001"
  }

  stages {

    stage('0) Preflight (Tools + Folders)') {
      steps {
        bat """
        @echo off
        echo ===== PREFLIGHT =====
        echo Workspace: %CD%
        if not exist "reports" mkdir "reports"
        if not exist "reports\\logs" mkdir "reports\\logs"

        where git && git --version
        where docker && docker version
        where trivy && trivy --version

        echo ===== PREFLIGHT OK =====
        """
      }
    }

    stage('1) Checkout') {
      steps {
        checkout scm
        bat """
        @echo off
        echo ===== CHECKOUT DONE =====
        git status
        """
      }
    }

    stage('2) Resolve Build Metadata (Clean SHA + Tags)') {
      steps {
        script {
          def raw = bat(returnStdout: true, script: '@echo off\r\ngit rev-parse --short HEAD').trim()
          env.GIT_SHA   = raw.tokenize().last()
          env.IMAGE_TAG = env.GIT_SHA ?: "${env.BUILD_NUMBER}"

          env.API_IMAGE = "${env.DOCKERHUB_USER}/${env.APP_NAME}-api:${env.IMAGE_TAG}"
          env.WEB_IMAGE = "${env.DOCKERHUB_USER}/${env.APP_NAME}-web:${env.IMAGE_TAG}"

          echo "GIT_SHA=${env.GIT_SHA}"
          echo "IMAGE_TAG=${env.IMAGE_TAG}"
          echo "API_IMAGE=${env.API_IMAGE}"
          echo "WEB_IMAGE=${env.WEB_IMAGE}"
        }

        powershell '''
          @"
Build: $env:JOB_NAME #$env:BUILD_NUMBER
Commit: $env:GIT_SHA
API Image: $env:API_IMAGE
WEB Image: $env:WEB_IMAGE
Build URL: $env:BUILD_URL
Sonar: $env:SONAR_DASHBOARD
"@ | Set-Content -Path "reports\\build-meta.txt" -Encoding UTF8
        '''
      }
    }

    stage('3) Code Quality - Sonar (safe, never empty)') {
      steps {
        // If token/scanner missing -> stage UNSTABLE, pipeline continues.
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          withCredentials([string(credentialsId: "${env.SONAR_TOKEN_CRED_ID}", variable: 'SONAR_TOKEN')]) {
            bat """
            @echo off
            echo ===== SONAR SCAN =====
            where sonar-scanner
            if %ERRORLEVEL% NEQ 0 (
              echo sonar-scanner not found on PATH. Install SonarScanner to enable this stage.
              exit /b 1
            )

            sonar-scanner ^
              -Dsonar.host.url=${env.SONAR_HOST_URL} ^
              -Dsonar.login=%SONAR_TOKEN% ^
              -Dsonar.organization=${env.SONAR_ORG} ^
              -Dsonar.projectKey=${env.SONAR_PROJECT_KEY} ^
              -Dsonar.projectName=${env.APP_NAME} ^
              -Dsonar.sources=backend,frontend ^
              -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/build/**

            echo ===== SONAR COMPLETE =====
            """
          }
        }

        powershell '''
          @"
Sonar Stage completed (result may be UNSTABLE if sonar-scanner/token is missing).
Dashboard: $env:SONAR_DASHBOARD
"@ | Set-Content -Path "reports\\sonar-note.txt" -Encoding UTF8
        '''
      }
    }

    stage('4) Build - API Image') {
      steps {
        bat """
        @echo off
        echo ===== DOCKER BUILD API =====
        docker build -t ${env.API_IMAGE} -f backend\\Dockerfile backend
        """
      }
    }

    stage('5) Build - Web Image') {
      steps {
        bat """
        @echo off
        echo ===== DOCKER BUILD WEB =====
        docker build -t ${env.WEB_IMAGE} -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    stage('6) Evidence - Docker Images List') {
      steps {
        bat """
        @echo off
        echo ===== DOCKER IMAGES (filtered) =====
        docker images | findstr ${env.APP_NAME} > reports\\docker-images.txt
        type reports\\docker-images.txt
        """
      }
    }

    stage('7) Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
        @echo off
        echo ===== TRIVY IMAGE SCAN (TAR) =====

        if not exist "reports" mkdir "reports"

        echo -- Saving images to TAR
        docker save -o "reports\\api-image.tar" ${env.API_IMAGE}
        docker save -o "reports\\web-image.tar" ${env.WEB_IMAGE}

        echo -- Trivy scan API (vuln only for speed)
        trivy image --skip-version-check --scanners vuln --input "reports\\api-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-api-image.json"

        echo -- Trivy scan WEB (vuln only for speed)
        trivy image --skip-version-check --scanners vuln --input "reports\\web-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-web-image.json"

        echo ===== TRIVY COMPLETE =====
        """
      }
    }

    stage('8) Report - Summarise Trivy (human-readable)') {
      steps {
        powershell '''
          Write-Host "===== TRIVY SUMMARY ====="

          function Get-TrivyCounts($path) {
            if (-not (Test-Path $path -PathType Leaf)) { return @{High=0;Critical=0;Total=0} }
            $json = Get-Content $path -Raw | ConvertFrom-Json
            $high = 0; $critical = 0; $total = 0

            foreach ($r in $json.Results) {
              if ($null -ne $r.Vulnerabilities) {
                foreach ($v in $r.Vulnerabilities) {
                  $total++
                  if ($v.Severity -eq "HIGH") { $high++ }
                  if ($v.Severity -eq "CRITICAL") { $critical++ }
                }
              }
            }
            return @{High=$high;Critical=$critical;Total=$total}
          }

          $api = Get-TrivyCounts "reports\\trivy-api-image.json"
          $web = Get-TrivyCounts "reports\\trivy-web-image.json"

          @"
Trivy Summary (HIGH/CRITICAL)
Build: $env:JOB_NAME #$env:BUILD_NUMBER
Commit: $env:GIT_SHA

API Image: $env:API_IMAGE
  Total:     $($api.Total)
  HIGH:      $($api.High)
  CRITICAL:  $($api.Critical)

WEB Image: $env:WEB_IMAGE
  Total:     $($web.Total)
  HIGH:      $($web.High)
  CRITICAL:  $($web.Critical)
"@ | Set-Content -Path "reports\\trivy-summary.txt" -Encoding UTF8

          Get-Content "reports\\trivy-summary.txt"
        '''
      }
    }

    stage('9) Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${env.DOCKER_CRED_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
          @echo off
          echo ===== DOCKER LOGIN =====
          echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

          echo ===== PUSH API =====
          docker push ${env.API_IMAGE}

          echo ===== PUSH WEB =====
          docker push ${env.WEB_IMAGE}

          echo ===== LOGOUT =====
          docker logout
          """
        }
      }
    }

    stage('10) Deploy - Docker Compose (Staging)') {
      steps {
        bat """
        @echo off
        echo ===== DEPLOY STAGING =====

        docker rm -f keyshield-api 2>NUL || echo No old keyshield-api
        docker rm -f keyshield-frontend 2>NUL || echo No old keyshield-frontend

        docker compose -f docker-compose.yml down
        docker compose -f docker-compose.yml up -d --build

        docker ps > reports\\docker-ps-after-staging.txt
        type reports\\docker-ps-after-staging.txt
        """
      }
    }

    stage('11) Release - Smoke / Health Validation') {
      steps {
        powershell '''
          Write-Host "===== RELEASE SMOKE TEST ====="
          $fe = Invoke-WebRequest $env:FE_URL -UseBasicParsing -TimeoutSec 30
          Write-Host ("FE Status: " + $fe.StatusCode)

          $api = Invoke-WebRequest $env:API_HEALTH_URL -UseBasicParsing -TimeoutSec 30
          Write-Host ("API /health Status: " + $api.StatusCode)

          @"
Smoke Test
Frontend: $env:FE_URL -> $($fe.StatusCode)
API Health: $env:API_HEALTH_URL -> $($api.StatusCode)
"@ | Set-Content -Path "reports\\smoke-test.txt" -Encoding UTF8
        '''
      }
    }

    stage('12) Monitoring - Prepare Alertmanager Config (mount fix)') {
      steps {
        powershell '''
          Write-Host "===== MONITORING PREP ====="

          if (-not (Test-Path 'docker-compose.monitoring.yml' -PathType Leaf)) {
            "Monitoring compose missing (docker-compose.monitoring.yml). Monitoring deploy will be skipped." |
              Set-Content -Path "reports\\monitoring-note.txt" -Encoding UTF8
            Write-Host "docker-compose.monitoring.yml not found."
            exit 0
          }

          $amPath = Join-Path (Get-Location) 'monitoring\\alertmanager\\alertmanager.yml'

          if (Test-Path $amPath -PathType Container) {
            Write-Host "alertmanager.yml is a DIRECTORY -> removing to fix bind mount"
            Remove-Item $amPath -Recurse -Force
          }

          if (-not (Test-Path $amPath -PathType Leaf)) {
            Write-Host "Creating default alertmanager.yml"
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

          "Alertmanager config ready: $amPath" | Set-Content -Path "reports\\monitoring-note.txt" -Encoding UTF8
        '''
      }
    }

    stage('13) Monitoring - Deploy Stack (safe)') {
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          powershell '''
            Write-Host "===== MONITORING DEPLOY ====="
            if (-not (Test-Path 'docker-compose.monitoring.yml' -PathType Leaf)) {
              Write-Host "docker-compose.monitoring.yml not found - no deploy performed."
              exit 0
            }

            docker compose -f docker-compose.monitoring.yml up -d

            docker ps | findstr monitoring > reports\\docker-ps-monitoring.txt
            Get-Content reports\\docker-ps-monitoring.txt
          '''
        }
      }
    }

    stage('14) Monitoring - Validate (Prometheus + Alertmanager)') {
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          powershell '''
            Write-Host "===== MONITORING VALIDATION ====="

            $promOk = $false
            for ($i=1; $i -le 8; $i++) {
              try {
                $r = Invoke-WebRequest $env:PROM_READY_URL -UseBasicParsing -TimeoutSec 10
                if ($r.StatusCode -eq 200) {
                  Write-Host "Prometheus READY (200) on attempt $i"
                  $promOk = $true
                  break
                }
              } catch {
                Write-Host "Prometheus not ready (attempt $i) ... waiting"
                Start-Sleep -Seconds 3
              }
            }

            $amCode = "N/A"
            try {
              $a = Invoke-WebRequest $env:ALERT_URL -UseBasicParsing -TimeoutSec 10
              $amCode = $a.StatusCode
              Write-Host ("Alertmanager Status: " + $amCode)
            } catch {
              Write-Host "Alertmanager not reachable"
            }

            @"
Monitoring Validation
Prometheus Ready: $promOk  ($env:PROM_READY_URL)
Alertmanager: $amCode      ($env:ALERT_URL)
Grafana: $env:GRAFANA_URL
"@ | Set-Content -Path "reports\\monitoring-validation.txt" -Encoding UTF8
          '''
        }
      }
    }

    stage('15) Evidence - Collect Container Logs') {
      steps {
        bat """
        @echo off
        echo ===== CAPTURE LOGS =====

        docker ps > reports\\logs\\docker-ps.txt

        docker logs keyshield-api --tail 200 > reports\\logs\\api-tail.log 2>NUL || echo No keyshield-api logs > reports\\logs\\api-tail.log
        docker logs keyshield-frontend --tail 200 > reports\\logs\\fe-tail.log 2>NUL || echo No keyshield-frontend logs > reports\\logs\\fe-tail.log

        echo ===== LOGS CAPTURED =====
        """
      }
    }

    stage('16) Package Reports (ZIP)') {
      steps {
        powershell '''
          Write-Host "===== PACKAGE REPORTS ====="

          @"
Build Summary
============
Job: $env:JOB_NAME
Build: #$env:BUILD_NUMBER
Commit: $env:GIT_SHA

Images
- $env:API_IMAGE
- $env:WEB_IMAGE

Links
- Build: $env:BUILD_URL
- Artifacts: $($env:BUILD_URL)artifact/
- Sonar: $env:SONAR_DASHBOARD

Endpoints
- Frontend: $env:FE_URL
- API /health: $env:API_HEALTH_URL
- Prometheus: http://localhost:9090
- Grafana: $env:GRAFANA_URL
"@ | Set-Content -Path "reports\\build-summary.txt" -Encoding UTF8

          if (Test-Path "reports\\security-reports.zip") { Remove-Item "reports\\security-reports.zip" -Force }
          Compress-Archive -Path "reports\\*" -DestinationPath "reports\\security-reports.zip" -Force

          Write-Host "Created reports\\security-reports.zip"
        '''
      }
    }

    stage('17) Archive Artifacts (reports/**)') {
      steps {
        archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
      }
    }
  }

  post {
    success {
      script {
        def subject = "✅ SUCCESS | ${env.APP_NAME} | ${env.JOB_NAME} #${env.BUILD_NUMBER} | ${env.GIT_SHA}"
        def artifactsUrl = "${env.BUILD_URL}artifact/"
        def zipUrl = "${env.BUILD_URL}artifact/reports/security-reports.zip"

        emailext(
          to: "${env.EMAIL_TO}",
          subject: subject,
          mimeType: 'text/html',
          attachmentsPattern: 'reports/security-reports.zip,reports/build-summary.txt',
          body: """
          <html>
            <body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222;">
              <h2 style="margin:0 0 10px 0;">CI/CD Pipeline Result: <span style="color:#1a7f37;">SUCCESS</span></h2>
              <p style="margin:0 0 12px 0;">Build completed successfully. Security and evidence reports are attached.</p>

              <table cellpadding="8" cellspacing="0" style="border-collapse:collapse; border:1px solid #ddd;">
                <tr><td style="border:1px solid #ddd;"><b>Application</b></td><td style="border:1px solid #ddd;">${env.APP_NAME}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Job</b></td><td style="border:1px solid #ddd;">${env.JOB_NAME}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Build</b></td><td style="border:1px solid #ddd;">#${env.BUILD_NUMBER}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Commit</b></td><td style="border:1px solid #ddd;">${env.GIT_SHA}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Build URL</b></td><td style="border:1px solid #ddd;"><a href="${env.BUILD_URL}">${env.BUILD_URL}</a></td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Artifacts</b></td><td style="border:1px solid #ddd;"><a href="${artifactsUrl}">${artifactsUrl}</a></td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Reports ZIP</b></td><td style="border:1px solid #ddd;"><a href="${zipUrl}">${zipUrl}</a></td></tr>

                <tr><td style="border:1px solid #ddd;"><b>Docker Images</b></td>
                    <td style="border:1px solid #ddd;">
                      <div>${env.API_IMAGE}</div>
                      <div>${env.WEB_IMAGE}</div>
                    </td></tr>

                <tr><td style="border:1px solid #ddd;"><b>Deployed Endpoints</b></td>
                    <td style="border:1px solid #ddd;">
                      <div>Frontend: <a href="${env.FE_URL}">${env.FE_URL}</a></div>
                      <div>API /health: <a href="${env.API_HEALTH_URL}">${env.API_HEALTH_URL}</a></div>
                      <div>Prometheus: <a href="http://localhost:9090">http://localhost:9090</a></div>
                      <div>Grafana: <a href="${env.GRAFANA_URL}">${env.GRAFANA_URL}</a></div>
                    </td></tr>

                <tr><td style="border:1px solid #ddd;"><b>SonarCloud</b></td>
                    <td style="border:1px solid #ddd;"><a href="${env.SONAR_DASHBOARD}">${env.SONAR_DASHBOARD}</a></td></tr>
              </table>

              <p style="margin-top:12px;">
                <b>Attachments:</b> security-reports.zip (Trivy JSON + summary + logs), build-summary.txt
              </p>

              <p style="color:#666; margin-top:16px;">Generated automatically by Jenkins.</p>
            </body>
          </html>
          """
        )
      }
    }

    failure {
      script {
        def subject = "❌ FAILED | ${env.APP_NAME} | ${env.JOB_NAME} #${env.BUILD_NUMBER} | ${env.GIT_SHA ?: 'no-sha'}"
        emailext(
          to: "${env.EMAIL_TO}",
          subject: subject,
          mimeType: 'text/html',
          attachLog: true,
          attachmentsPattern: 'reports/**',
          body: """
          <html>
            <body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222;">
              <h2 style="margin:0 0 10px 0;">CI/CD Pipeline Result: <span style="color:#b42318;">FAILED</span></h2>
              <p>Build failed. Console log and any available reports are attached.</p>
              <p><b>Build URL:</b> <a href="${env.BUILD_URL}">${env.BUILD_URL}</a></p>
            </body>
          </html>
          """
        )
      }
    }

    always {
      bat """
      @echo off
      echo ===== POST: FINAL DOCKER PS =====
      docker ps
      docker ps > reports\\final-docker-ps.txt
      """
      archiveArtifacts artifacts: 'reports/final-docker-ps.txt', allowEmptyArchive: true
    }
  }
}
