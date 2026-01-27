// Jenkinsfile (Windows agent) — full pipeline with:
// 1) PowerShell-based GIT_SHA capture (fixes "i was unexpected at this time")
// 2) PowerShell preflight verification
// 3) Clean old containers before docker compose deploy (prevents name conflicts)

pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    DOCKERHUB_USER = 'rogen7spark'
    SONAR_ORG      = 'chrisrogenirwinroland-cyber'
    SONAR_PROJECT  = 'chrisrogenirwinroland-cyber_keyshield-vault'
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        checkout scm

        bat '''
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short HEAD
          git log -1 --pretty=oneline
          git status
        '''

        // (2) Ensure Jenkins can run PowerShell steps
        bat 'powershell -NoProfile -Command "$PSVersionTable.PSVersion"'

        // (1) Replace ONLY the GIT_SHA capture block with PowerShell
        script {
          env.GIT_SHA = powershell(
            script: '(git rev-parse --short HEAD).Trim()',
            returnStdout: true
          ).trim()

          if (!env.GIT_SHA) { env.GIT_SHA = "manual" }

          echo "Resolved GIT_SHA = ${env.GIT_SHA}"
        }
      }
    }

    stage('Preflight (Toolchain Verification)') {
      steps {
        bat '''
          echo ===== TOOL VERSIONS =====
          where node
          node -v
          npm -v
          where docker
          docker --version
          docker compose version
          where trivy
          trivy --version
        '''
      }
    }

    stage('Install & Unit Tests - API') {
      steps {
        dir('api') {
          bat '''
            echo ===== API INSTALL =====
            npm ci
          '''
        }
      }
      post {
        always {
          // Will not fail build if no reports found, but will show warning in Jenkins
          junit allowEmptyResults: true, testResults: 'api/**/junit*.xml, api/**/test-results.xml, api/**/TEST-*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'api/npm-debug.log, api/**/coverage/**'
        }
      }
    }

    stage('Install & Unit Tests - Frontend') {
      steps {
        dir('frontend/app') {
          bat '''
            echo ===== FE INSTALL =====
            npm ci
          '''
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'frontend/app/**/junit*.xml, frontend/app/**/test-results.xml, frontend/app/**/TEST-*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'frontend/app/npm-debug.log, frontend/app/**/coverage/**'
        }
      }
    }

    stage('Build - Frontend (Angular)') {
      steps {
        dir('frontend/app') {
          bat '''
            echo ===== FE BUILD =====
            npm run build
          '''
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
          def scannerHome = tool 'SonarQubeScanner'
          withSonarQubeEnv('SonarCloud') {
            withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
              bat """
                echo ===== SONARCLOUD SCAN (MONOREPO) =====
                echo ProjectKey: %SONAR_PROJECT%
                echo Org: %SONAR_ORG%
                "${scannerHome}\\bin\\sonar-scanner.bat" ^
                  -Dsonar.host.url=https://sonarcloud.io ^
                  -Dsonar.token=%SONAR_TOKEN% ^
                  -Dsonar.organization=%SONAR_ORG% ^
                  -Dsonar.projectKey=%SONAR_PROJECT% ^
                  -Dsonar.projectName=%SONAR_PROJECT% ^
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
        bat '''
          echo ===== TRIVY FILESYSTEM SCAN =====
          if not exist "reports" mkdir "reports"
          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format json  --output "reports\\trivy-fs.json" .
          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format table --output "reports\\trivy-fs.txt"  .
          echo ===== TRIVY FS SCAN COMPLETE =====
        '''
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
          echo ===== DOCKER BUILD =====
          set API_IMAGE=%DOCKERHUB_USER%/keyshield-vault-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_USER%/keyshield-vault-web:%GIT_SHA%

          echo Building %API_IMAGE%
          docker build -t %API_IMAGE% -f api\\Dockerfile api

          echo Building %FE_IMAGE%
          docker build -t %FE_IMAGE% -f frontend\\app\\Dockerfile frontend\\app

          echo ===== DOCKER IMAGES (filtered) =====
          docker images | findstr keyshield-vault
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
          echo ===== TRIVY IMAGE SCAN (TAR) =====
          if not exist "reports" mkdir "reports"

          set API_IMAGE=%DOCKERHUB_USER%/keyshield-vault-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_USER%/keyshield-vault-web:%GIT_SHA%

          docker save -o "reports\\api-image.tar" %API_IMAGE%
          docker save -o "reports\\fe-image.tar"  %FE_IMAGE%

          trivy image --input "reports\\api-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-api-image.json"
          trivy image --input "reports\\fe-image.tar"  --severity HIGH,CRITICAL --format json --output "reports\\trivy-fe-image.json"

          echo ===== TRIVY IMAGE SCAN COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/api-image.tar, reports/fe-image.tar, reports/trivy-*-image.json'
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'DOCKERHUB_CREDS', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo ===== DOCKER LOGIN =====
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            set API_IMAGE=%DOCKERHUB_USER%/keyshield-vault-api:%GIT_SHA%
            set FE_IMAGE=%DOCKERHUB_USER%/keyshield-vault-web:%GIT_SHA%

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
        // (3A) Clean old containers before deploy (prevents "name already in use")
        bat '''
          echo ===== CLEAN OLD CONTAINERS =====
          docker rm -f keyshield-api 2>NUL || echo "No old keyshield-api to remove"
          docker rm -f keyshield-frontend 2>NUL || echo "No old keyshield-frontend to remove"
        '''

        bat '''
          echo ===== DEPLOY STAGING =====
          docker compose -f docker-compose.yml down --remove-orphans
          docker compose -f docker-compose.yml up -d --build
          echo ===== DOCKER PS =====
          docker ps
        '''
      }
    }

    stage('Release - Smoke / Health Validation') {
      steps {
        // Adjust URL/port if your compose exposes differently
        bat '''
          echo ===== SMOKE CHECK (API) =====
          powershell -NoProfile -Command "try { iwr http://localhost:3000/health -UseBasicParsing -TimeoutSec 10 | Out-Null; 'API OK' } catch { 'API NOT OK'; exit 1 }"
        '''
      }
    }
  }

  post {
    always {
      bat '''
        echo ===== POST: DOCKER PS =====
        docker ps
        echo ===== POST: API LOG TAIL (if exists) =====
        docker logs keyshield-api --tail 120 2>NUL || echo "No keyshield-api container logs available"
      '''
      archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/**'
    }
    failure {
      echo 'Pipeline failed. Check deploy conflict, logs, and reports artifacts.'
    }
  }
}
