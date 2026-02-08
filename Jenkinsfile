// Jenkinsfile (Windows-safe) — Professional email + attached reports + clean SHA + monitoring mount fix

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

    // Jenkins credential IDs (update to match your Jenkins)
    DOCKER_CRED_ID = "dockerhub-creds"   // type: Username with password

    // Your SonarCloud dashboard (optional)
    SONAR_DASHBOARD = "https://sonarcloud.io/dashboard?id=chrisrogenirwinroland-cyber_keyshield-vault"

    // Ports used in your compose
    FE_URL   = "http://localhost:4200"
    API_HEALTH_URL = "http://localhost:3000/health"
    PROM_READY_URL = "http://localhost:9090/-/ready"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Resolve Build Metadata (Clean SHA)') {
      steps {
        script {
          def raw = bat(returnStdout: true, script: '@echo off\r\ngit rev-parse --short HEAD').trim()
          env.GIT_SHA = raw.tokenize().last()
          env.IMAGE_TAG = env.GIT_SHA ?: "${env.BUILD_NUMBER}"

          env.API_IMAGE = "${env.DOCKERHUB_USER}/${env.APP_NAME}-api:${env.IMAGE_TAG}"
          env.WEB_IMAGE = "${env.DOCKERHUB_USER}/${env.APP_NAME}-web:${env.IMAGE_TAG}"

          echo "GIT_SHA=${env.GIT_SHA}"
          echo "API_IMAGE=${env.API_IMAGE}"
          echo "WEB_IMAGE=${env.WEB_IMAGE}"
        }
      }
    }

    stage('Build - API Image') {
      steps {
        bat """
        @echo off
        echo ===== BUILD API =====
        docker build -t ${env.API_IMAGE} -f backend\\Dockerfile backend
        """
      }
    }

    stage('Build - Web Image') {
      steps {
        bat """
        @echo off
        echo ===== BUILD WEB =====
        docker build -t ${env.WEB_IMAGE} -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
        @echo off
        echo ===== TRIVY IMAGE SCAN (TAR) =====
        if not exist "reports" mkdir "reports"

        echo -- Saving images to TAR
        docker save -o "reports\\api-image.tar" ${env.API_IMAGE}
        docker save -o "reports\\web-image.tar" ${env.WEB_IMAGE}

        echo -- Trivy scan API
        trivy image --skip-version-check --input "reports\\api-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-api-image.json"

        echo -- Trivy scan WEB
        trivy image --skip-version-check --input "reports\\web-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-web-image.json"

        echo ===== TRIVY COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${env.DOCKER_CRED_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
          @echo off
          echo ===== DOCKER LOGIN =====
          echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

          echo ===== PUSH =====
          docker push ${env.API_IMAGE}
          docker push ${env.WEB_IMAGE}

          echo ===== LOGOUT =====
          docker logout
          """
        }
      }
    }

    stage('Deploy - Docker Compose (Staging)') {
      steps {
        bat """
        @echo off
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
          \$fe = Invoke-WebRequest '${env.FE_URL}' -UseBasicParsing -TimeoutSec 30
          Write-Host ('FE Status: ' + \$fe.StatusCode)

          \$api = Invoke-WebRequest '${env.API_HEALTH_URL}' -UseBasicParsing -TimeoutSec 30
          Write-Host ('API /health Status: ' + \$api.StatusCode)
        """
      }
    }

    stage('Monitoring - Deploy Stack (Prometheus/Alertmanager)') {
      steps {
        powershell """
          Write-Host '===== MONITORING DEPLOY (SAFE) ====='

          if (-not (Test-Path 'docker-compose.monitoring.yml' -PathType Leaf)) {
            Write-Host 'docker-compose.monitoring.yml not found - skipping monitoring deploy.'
            exit 0
          }

          # Fix the common Windows mount failure:
          # host path monitoring\\alertmanager\\alertmanager.yml must exist AND be a file (not a directory)
          \$amPath = Join-Path (Get-Location) 'monitoring\\alertmanager\\alertmanager.yml'

          if (Test-Path \$amPath -PathType Container) {
            Write-Host 'Found alertmanager.yml as a DIRECTORY. Removing to fix bind mount...'
            Remove-Item \$amPath -Recurse -Force
          }

          if (-not (Test-Path \$amPath -PathType Leaf)) {
            Write-Host 'Creating default alertmanager.yml for stable bind-mount...'
            New-Item -ItemType Directory -Force (Split-Path \$amPath) | Out-Null
            @"
global:
  resolve_timeout: 5m
route:
  receiver: 'default'
receivers:
- name: 'default'
"@ | Set-Content -Path \$amPath -Encoding UTF8
          }

          # Deploy monitoring (no build needed)
          docker compose -f docker-compose.monitoring.yml up -d

          Write-Host '===== MONITORING CONTAINERS ====='
          docker ps | findstr monitoring
        """
      }
    }

    stage('Monitoring - Validate (Prometheus Ready)') {
      steps {
        powershell """
          Write-Host '===== VALIDATE PROMETHEUS (SAFE RETRY) ====='
          \$url = '${env.PROM_READY_URL}'
          \$ok = \$false

          for (\$i=1; \$i -le 8; \$i++) {
            try {
              \$r = Invoke-WebRequest \$url -UseBasicParsing -TimeoutSec 10
              if (\$r.StatusCode -eq 200) {
                Write-Host "Prometheus READY (200) on attempt \$i"
                \$ok = \$true
                break
              }
            } catch {
              Write-Host "Prometheus not ready yet (attempt \$i). Waiting..."
              Start-Sleep -Seconds 3
            }
          }

          if (-not \$ok) {
            Write-Host 'Prometheus still not ready. Continuing without failing the build.'
          }
        """
      }
    }

    stage('Package Reports for Email') {
      steps {
        powershell """
          Write-Host '===== PACKAGE REPORTS ====='
          if (-not (Test-Path 'reports' -PathType Container)) {
            New-Item -ItemType Directory -Force 'reports' | Out-Null
          }

          # Optional: add a simple text summary report
          \$summary = @"
Build: ${env.JOB_NAME} #${env.BUILD_NUMBER}
Commit: ${env.GIT_SHA}
Images:
  - ${env.API_IMAGE}
  - ${env.WEB_IMAGE}
URLs:
  - Build: ${env.BUILD_URL}
  - Artifacts: ${env.BUILD_URL}artifact/
  - SonarCloud: ${env.SONAR_DASHBOARD}
Deployed:
  - FE: ${env.FE_URL}
  - API: ${env.API_HEALTH_URL}
  - Prometheus: http://localhost:9090
  - Grafana: http://localhost:3001
"@
          \$summary | Set-Content -Path 'reports\\build-summary.txt' -Encoding UTF8

          if (Test-Path 'reports\\security-reports.zip') { Remove-Item 'reports\\security-reports.zip' -Force }
          Compress-Archive -Path 'reports\\*' -DestinationPath 'reports\\security-reports.zip' -Force
          Write-Host 'Created reports\\security-reports.zip'
        """
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/security-reports.zip,reports/build-summary.txt', allowEmptyArchive: true
        }
      }
    }
  }

  post {
    success {
      script {
        def subject = "✅ SUCCESS | ${env.JOB_NAME} #${env.BUILD_NUMBER} | ${env.GIT_SHA}"
        def artifactsUrl = "${env.BUILD_URL}artifact/"
        def zipUrl = "${env.BUILD_URL}artifact/reports/security-reports.zip"

        emailext(
          to: "${env.EMAIL_TO}",
          subject: subject,
          mimeType: 'text/html',
          attachmentsPattern: 'reports/security-reports.zip,reports/trivy-*.json,reports/build-summary.txt',
          body: """
          <html>
            <body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222;">
              <h2 style="margin:0 0 10px 0;">Build SUCCESS</h2>

              <table cellpadding="7" cellspacing="0" style="border-collapse:collapse; border:1px solid #ddd;">
                <tr><td style="border:1px solid #ddd;"><b>Job</b></td><td style="border:1px solid #ddd;">${env.JOB_NAME}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Build #</b></td><td style="border:1px solid #ddd;">${env.BUILD_NUMBER}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Commit</b></td><td style="border:1px solid #ddd;">${env.GIT_SHA}</td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Build URL</b></td><td style="border:1px solid #ddd;"><a href="${env.BUILD_URL}">${env.BUILD_URL}</a></td></tr>

                <tr><td style="border:1px solid #ddd;"><b>Images pushed</b></td>
                    <td style="border:1px solid #ddd;">
                      <div>${env.API_IMAGE}</div>
                      <div>${env.WEB_IMAGE}</div>
                    </td></tr>

                <tr><td style="border:1px solid #ddd;"><b>Artifacts</b></td><td style="border:1px solid #ddd;"><a href="${artifactsUrl}">${artifactsUrl}</a></td></tr>
                <tr><td style="border:1px solid #ddd;"><b>Reports (ZIP)</b></td><td style="border:1px solid #ddd;"><a href="${zipUrl}">${zipUrl}</a></td></tr>
                <tr><td style="border:1px solid #ddd;"><b>SonarCloud</b></td><td style="border:1px solid #ddd;"><a href="${env.SONAR_DASHBOARD}">${env.SONAR_DASHBOARD}</a></td></tr>

                <tr><td style="border:1px solid #ddd;"><b>Deployed endpoints</b></td>
                    <td style="border:1px solid #ddd;">
                      <div>Frontend: <a href="${env.FE_URL}">${env.FE_URL}</a></div>
                      <div>API /health: <a href="${env.API_HEALTH_URL}">${env.API_HEALTH_URL}</a></div>
                      <div>Prometheus: <a href="http://localhost:9090">http://localhost:9090</a></div>
                      <div>Grafana: <a href="http://localhost:3001">http://localhost:3001</a></div>
                    </td></tr>
              </table>

              <p style="margin-top:14px;">
                <b>Attachments:</b> security-reports.zip, Trivy JSON outputs, and build-summary.txt.
              </p>

              <p style="color:#666; margin-top:18px;">
                Generated by Jenkins • ${env.APP_NAME}
              </p>
            </body>
          </html>
          """
        )
      }
    }

    failure {
      script {
        def subject = "❌ FAILED | ${env.JOB_NAME} #${env.BUILD_NUMBER} | ${env.GIT_SHA ?: 'no-sha'}"
        emailext(
          to: "${env.EMAIL_TO}",
          subject: subject,
          mimeType: 'text/html',
          attachLog: true,
          attachmentsPattern: 'reports/**',
          body: """
          <html>
            <body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222;">
              <h2 style="margin:0 0 10px 0;">Build FAILED</h2>
              <p>
                <b>Job:</b> ${env.JOB_NAME}<br/>
                <b>Build #:</b> ${env.BUILD_NUMBER}<br/>
                <b>Build URL:</b> <a href="${env.BUILD_URL}">${env.BUILD_URL}</a>
              </p>
              <p>Build log attached (if enabled). Reports folder attached when available.</p>
            </body>
          </html>
          """
        )
      }
    }

    always {
      bat """
      @echo off
      echo ===== POST: DOCKER PS =====
      docker ps
      echo ===== POST: API LOG TAIL =====
      docker logs keyshield-api --tail 80 2>NUL || echo No keyshield-api logs
      """
    }
  }
}
