pipeline {
  agent any

  options {
    timestamps()
  }

  environment {
    APP_NAME        = "keyshield-vault"
    DOCKERHUB_USER  = "rogen7spark"

    // Change these to your Jenkins credential IDs
    DH_USER_CRED_ID = "dockerhub-user"
    DH_PASS_CRED_ID = "dockerhub-pass"

    EMAIL_TO        = "s225493677@deakin.edu.au"

    // SonarCloud dashboard (keep yours)
    SONAR_DASHBOARD = "https://sonarcloud.io/dashboard?id=chrisrogenirwinroland-cyber_keyshield-vault"
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
          // If Jenkins adds extra tokens, keep only the last token
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
        echo ===== BUILD API =====
        docker build -t ${env.API_IMAGE} -f backend\\Dockerfile backend
        """
      }
    }

    stage('Build - Web Image') {
      steps {
        bat """
        echo ===== BUILD WEB =====
        docker build -t ${env.WEB_IMAGE} -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
        echo ===== TRIVY IMAGE SCAN (TAR) =====
        if not exist "reports" mkdir "reports"

        echo -- Saving images to TAR
        docker save -o "reports\\api-image.tar" ${env.API_IMAGE}
        docker save -o "reports\\web-image.tar" ${env.WEB_IMAGE}

        echo -- Trivy scan API
        trivy image --input "reports\\api-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-api-image.json"

        echo -- Trivy scan WEB
        trivy image --input "reports\\web-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-web-image.json"

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
        withCredentials([
          string(credentialsId: "${env.DH_USER_CRED_ID}", variable: 'DH_USER'),
          string(credentialsId: "${env.DH_PASS_CRED_ID}", variable: 'DH_PASS')
        ]) {
          bat """
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
          \$fe = Invoke-WebRequest http://localhost:4200 -UseBasicParsing -TimeoutSec 20
          Write-Host ('FE Status: ' + \$fe.StatusCode)

          \$api = Invoke-WebRequest http://localhost:3000/health -UseBasicParsing -TimeoutSec 20
          Write-Host ('API /health Status: ' + \$api.StatusCode)
        """
      }
    }

    stage('Monitoring - Validate (If Running)') {
      steps {
        powershell """
          Write-Host '===== MONITORING VALIDATION (SAFE) ====='
          \$url = 'http://localhost:9090/-/ready'
          \$ok = \$false

          for (\$i=1; \$i -le 5; \$i++) {
            try {
              \$r = Invoke-WebRequest \$url -UseBasicParsing -TimeoutSec 10
              if (\$r.StatusCode -eq 200) {
                Write-Host "Prometheus READY (200) on attempt \$i"
                \$ok = \$true
                break
              }
            } catch {
              Start-Sleep -Seconds 3
            }
          }

          if (-not \$ok) {
            Write-Host 'Prometheus not ready (continuing without failing build).'
          }
        """
      }
    }

    stage('Package Reports for Email') {
      steps {
        powershell """
          if (Test-Path 'reports') {
            if (Test-Path 'reports\\security-reports.zip') { Remove-Item 'reports\\security-reports.zip' -Force }
            Compress-Archive -Path 'reports\\*' -DestinationPath 'reports\\security-reports.zip' -Force
            Write-Host 'Packaged reports\\security-reports.zip'
          } else {
            Write-Host 'No reports folder found.'
          }
        """
      }
      post {
        always {
          archiveArtifacts artifacts: 'reports/security-reports.zip', allowEmptyArchive: true
        }
      }
    }
  }

  post {
    success {
      script {
        def subject = "✅ SUCCESS | ${env.JOB_NAME} #${env.BUILD_NUMBER} | ${env.GIT_SHA}"
        def artifactsUrl = "${env.BUILD_URL}artifact/"
        def reportZipUrl = "${env.BUILD_URL}artifact/reports/security-reports.zip"

        emailext(
          to: "${env.EMAIL_TO}",
          subject: subject,
          mimeType: 'text/html',
          attachmentsPattern: 'reports/security-reports.zip,reports/trivy-*.json',
          body: """
          <html>
            <body style="font-family:Segoe UI, Arial, sans-serif; font-size:14px; color:#222;">
              <h2 style="margin:0 0 8px 0;">Build SUCCESS</h2>

              <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
                <tr><td><b>Job</b></td><td>${env.JOB_NAME}</td></tr>
                <tr><td><b>Build #</b></td><td>${env.BUILD_NUMBER}</td></tr>
                <tr><td><b>Commit</b></td><td>${env.GIT_SHA}</td></tr>
                <tr><td><b>Build URL</b></td><td><a href="${env.BUILD_URL}">${env.BUILD_URL}</a></td></tr>
                <tr><td><b>Images pushed</b></td><td>
                  <div>${env.API_IMAGE}</div>
                  <div>${env.WEB_IMAGE}</div>
                </td></tr>
                <tr><td><b>Artifacts</b></td><td><a href="${artifactsUrl}">${artifactsUrl}</a></td></tr>
                <tr><td><b>Reports (ZIP)</b></td><td><a href="${reportZipUrl}">${reportZipUrl}</a></td></tr>
                <tr><td><b>SonarCloud</b></td><td><a href="${env.SONAR_DASHBOARD}">${env.SONAR_DASHBOARD}</a></td></tr>
                <tr><td><b>Deployed endpoints</b></td><td>
                  <div>Frontend: <a href="http://localhost:4200">http://localhost:4200</a></div>
                  <div>API Health: <a href="http://localhost:3000/health">http://localhost:3000/health</a></div>
                  <div>Prometheus: <a href="http://localhost:9090">http://localhost:9090</a></div>
                  <div>Grafana: <a href="http://localhost:3001">http://localhost:3001</a></div>
                </td></tr>
              </table>

              <p style="margin-top:14px;">
                <b>Attached:</b> security-reports.zip (Trivy JSON + pipeline outputs), and trivy-*.json files.
              </p>

              <p style="color:#666; margin-top:18px;">
                Generated by Jenkins (${env.APP_NAME}) • ${new Date()}
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
              <h2 style="margin:0 0 8px 0;">Build FAILED</h2>
              <p><b>Job:</b> ${env.JOB_NAME}<br/>
                 <b>Build #:</b> ${env.BUILD_NUMBER}<br/>
                 <b>Build URL:</b> <a href="${env.BUILD_URL}">${env.BUILD_URL}</a>
              </p>
              <p>Log attached (if enabled). Reports folder attached when available.</p>
            </body>
          </html>
          """
        )
      }
    }

    always {
      bat """
      echo ===== POST: DOCKER PS =====
      docker ps
      """
    }
  }
}
