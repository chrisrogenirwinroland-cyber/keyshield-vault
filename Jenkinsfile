pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    // Versioning
    GIT_SHA  = "${env.GIT_COMMIT}".take(7)
    VERSION  = "${env.BUILD_NUMBER}-${GIT_SHA}"

    // SonarCloud
    SONAR_HOST_URL = "https://sonarcloud.io"
    SONAR_ORG      = credentials('SONAR_ORG')       // Secret text
    SONAR_TOKEN    = credentials('SONAR_TOKEN')     // Secret text

    // Docker image names (must match compose build tags if you set them)
    API_IMAGE = "keyshield-vault-api"
    FE_IMAGE  = "keyshield-vault-frontend"

    // Report directory (archived + emailed)
    REPORT_DIR = "reports"

    // Email recipient(s)
    EMAIL_TO = "s225493677@deakin.edu.au"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        sh 'git rev-parse --short HEAD || true'
        sh 'mkdir -p ${REPORT_DIR}'
      }
    }

    stage('Build') {
      steps {
        echo "Building Docker images for VERSION=${VERSION}"
        sh 'docker compose version'
        sh 'docker compose build --no-cache'
        sh 'docker images | head -n 25'
      }
    }

    stage('Test') {
      steps {
        dir('api') {
          sh 'node -v'
          sh 'npm -v'
          sh 'npm ci'
          sh 'npm test'
        }
      }
      post {
        always {
          // Adjust if your junit output path differs
          junit allowEmptyResults: true, testResults: 'api/junit.xml'
        }
      }
    }

    stage('Code Quality') {
      steps {
        echo "Lint + SonarCloud scan"
        dir('api') {
          sh 'npm ci'
          sh 'npm run lint || true'
        }

        // SonarCloud scan (requires sonar-project.properties OR pass props via -D)
        // If you don't have sonar-project.properties, create it in repo root.
        sh """
          docker run --rm \
            -e SONAR_HOST_URL=${SONAR_HOST_URL} \
            -e SONAR_TOKEN=${SONAR_TOKEN} \
            -v "\$PWD:/usr/src" \
            sonarsource/sonar-scanner-cli:latest \
            -Dsonar.organization=${SONAR_ORG} \
            -Dsonar.projectKey=keyshield-vault \
            -Dsonar.sources=api \
            -Dsonar.host.url=${SONAR_HOST_URL}
        """
      }
    }

    stage('Security: Dependency + Container Scans') {
      steps {
        echo "Generating vulnerability reports (npm audit + Trivy)"
        sh 'mkdir -p ${REPORT_DIR}'

        // npm audit -> JSON report
        dir('api') {
          sh 'npm ci'
          // We keep non-blocking (|| true) so pipeline continues, but report is still produced
          sh 'npm audit --json > ../${REPORT_DIR}/npm-audit.json || true'
          // Also generate a readable summary
          sh 'npm audit --audit-level=high > ../${REPORT_DIR}/npm-audit.txt || true'
        }

        // Trivy scan -> HTML + JSON (using template)
        // Scans the latest built image. If your compose tags differ, change image ref.
        sh """
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            -v "\$PWD/${REPORT_DIR}:/out" \
            aquasec/trivy:latest image \
            --severity HIGH,CRITICAL \
            --format json \
            --output /out/trivy-image.json \
            ${API_IMAGE}:latest || true
        """

        // Optional: convert JSON to text for easy reading
        sh """
          echo "Trivy HIGH/CRITICAL results (raw JSON saved)"; \
          echo "See reports/trivy-image.json" > ${REPORT_DIR}/trivy-image.txt
        """
      }
    }

    stage('Deploy (Staging)') {
      steps {
        echo "Deploying app services via docker compose"
        sh 'docker compose up -d'
        sh 'sleep 5'

        // Health check – adjust endpoint if needed
        sh 'curl -sSf http://localhost:3000/health'
      }
    }

    stage('Monitoring + Alerts') {
      steps {
        echo "Starting monitoring stack (Prometheus + Alertmanager) and validating"
        // Bring up monitoring stack (separate compose file)
        // If you want it to share network with app, make sure compose configs align.
        sh 'docker compose -f docker-compose.monitoring.yml up -d'
        sh 'sleep 7'

        // Validate Prometheus is up
        sh 'curl -sSf http://localhost:9090/-/ready'
        // Validate Alertmanager is up
        sh 'curl -sSf http://localhost:9093/-/ready'

        // Validate app metrics endpoint exists (your API must expose /metrics)
        sh 'curl -sSf http://localhost:3000/metrics | head -n 30'

        // Save quick monitoring evidence as artifacts
        sh """
          curl -s http://localhost:9090/api/v1/status/config > ${REPORT_DIR}/prometheus-config.json || true
          curl -s http://localhost:9090/api/v1/alerts > ${REPORT_DIR}/prometheus-alerts.json || true
          curl -s http://localhost:9093/api/v2/status > ${REPORT_DIR}/alertmanager-status.json || true
        """

        echo "Monitoring OK: Prometheus + Alertmanager reachable; metrics endpoint reachable"
      }
    }

    stage('Release') {
      steps {
        echo "Tagging images for release VERSION=${VERSION}"
        sh "docker tag ${API_IMAGE}:latest ${API_IMAGE}:${VERSION}"
        sh "docker tag ${FE_IMAGE}:latest ${FE_IMAGE}:${VERSION}"

        // Optional Git tag (only works if Jenkins has push rights)
        sh """
          git tag -a v${VERSION} -m "Release v${VERSION}" || true
          git tag --list | tail -n 10
        """
      }
    }

    stage('Archive Reports') {
      steps {
        echo "Archiving scan + monitoring artifacts"
        archiveArtifacts artifacts: 'reports/**/*', fingerprint: true, allowEmptyArchive: true
      }
    }

    stage('Email Vulnerability Scan Report') {
      steps {
        script {
          def buildStatus = currentBuild.currentResult ?: 'UNKNOWN'
          def subjectLine = "KeyShield Vault | Build #${env.BUILD_NUMBER} | ${buildStatus} | Vulnerability & Monitoring Report"

          // Professional HTML template email body
          def bodyHtml = """
            <div style="font-family: Arial, sans-serif; font-size: 13px; color: #111;">
              <p>Hello,</p>

              <p>Please find attached the automated pipeline reports for <b>KeyShield Vault</b>.</p>

              <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><b>Project</b></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${env.JOB_NAME}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><b>Build</b></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">#${env.BUILD_NUMBER}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><b>Commit</b></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${env.GIT_SHA}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><b>Version</b></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${env.VERSION}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><b>Status</b></td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${buildStatus}</td>
                </tr>
              </table>

              <p style="margin-top: 14px;"><b>Attached artifacts</b>:</p>
              <ul>
                <li><b>npm-audit.json</b> and <b>npm-audit.txt</b> (dependency vulnerabilities)</li>
                <li><b>trivy-image.json</b> (container image scan, HIGH/CRITICAL)</li>
                <li><b>prometheus-alerts.json</b>, <b>alertmanager-status.json</b> (monitoring evidence)</li>
              </ul>

              <p>
                Regards,<br/>
                Jenkins CI/CD<br/>
                <i>${env.JENKINS_URL ?: ''}</i>
              </p>
            </div>
          """

          emailext(
            to: "${env.EMAIL_TO}",
            subject: subjectLine,
            mimeType: 'text/html',
            body: bodyHtml,
            attachmentsPattern: 'reports/**/*',
            attachLog: true,
            compressLog: true
          )
        }
      }
    }
  }

  post {
    always {
      echo "Post: docker compose ps"
      sh 'docker compose ps || true'
      sh 'docker compose logs --no-color --tail=120 || true'
      sh 'docker compose -f docker-compose.monitoring.yml ps || true'
      sh 'docker compose -f docker-compose.monitoring.yml logs --no-color --tail=80 || true'
    }
    cleanup {
      // Keep environment clean for re-runs
      sh 'docker compose down --remove-orphans || true'
      sh 'docker compose -f docker-compose.monitoring.yml down --remove-orphans || true'
    }
  }
}
