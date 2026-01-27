pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
  }

  environment {
    // Repo / app identity
    ORG        = "chrisrogenirwinroland-cyber"
    PROJECTKEY = "chrisrogenirwinroland-cyber_keyshield-vault"
    PROJECTNAME= "chrisrogenirwinroland-cyber_keyshield-vault"

    // Docker Hub
    DOCKERHUB_USER = "rogen7spark"

    // App URLs for smoke test (adjust ports/paths if your compose differs)
    API_URL = "http://localhost:3000"
    FE_URL  = "http://localhost:4200"
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
        script {
          // Windows-safe capture of short SHA
          env.GIT_SHA = bat(
            script: '@for /f "delims=" %i in (\'git rev-parse --short HEAD\') do @echo %i',
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
          docker version
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
          // If you later add tests: npm test -- --ci
        }
      }
      post {
        always {
          // Do NOT fail build if no reports exist
          script {
            try { junit allowEmptyResults: true, testResults: 'api/**/junit*.xml, api/**/TEST-*.xml' }
            catch (e) { echo "JUnit publish skipped: ${e}" }
          }

          // Optional artifacts
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
          // If you later add tests: npm test -- --watch=false --code-coverage
        }
      }
      post {
        always {
          script {
            try { junit allowEmptyResults: true, testResults: 'frontend/app/**/junit*.xml, frontend/app/**/TEST-*.xml' }
            catch (e) { echo "JUnit publish skipped: ${e}" }
          }
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
                echo ProjectKey: ${env.PROJECTKEY}
                echo Org: ${env.ORG}

                "${scannerHome}\\bin\\sonar-scanner.bat" ^
                  -Dsonar.host.url=https://sonarcloud.io ^
                  -Dsonar.token=%SONAR_TOKEN% ^
                  -Dsonar.organization=${env.ORG} ^
                  -Dsonar.projectKey=${env.PROJECTKEY} ^
                  -Dsonar.projectName=${env.PROJECTNAME} ^
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
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-fs.*'
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        bat """
          echo ===== DOCKER BUILD =====
          set API_IMAGE=${env.DOCKERHUB_USER}/keyshield-vault-api:${env.GIT_SHA}
          set FE_IMAGE=${env.DOCKERHUB_USER}/keyshield-vault-web:${env.GIT_SHA}

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

          set API_IMAGE=${env.DOCKERHUB_USER}/keyshield-vault-api:${env.GIT_SHA}
          set FE_IMAGE=${env.DOCKERHUB_USER}/keyshield-vault-web:${env.GIT_SHA}

          docker save -o "reports\\api-image.tar" %API_IMAGE%
          docker save -o "reports\\fe-image.tar"  %FE_IMAGE%

          trivy image --input "reports\\api-image.tar" --severity HIGH,CRITICAL --format json --output "reports\\trivy-api-image.json"
          trivy image --input "reports\\fe-image.tar"  --severity HIGH,CRITICAL --format json --output "reports\\trivy-fe-image.json"

          echo ===== TRIVY IMAGE SCAN COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/*trivy*.*'
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'DOCKER_HUB', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo ===== DOCKER LOGIN =====
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            set API_IMAGE=${env.DOCKERHUB_USER}/keyshield-vault-api:${env.GIT_SHA}
            set FE_IMAGE=${env.DOCKERHUB_USER}/keyshield-vault-web:${env.GIT_SHA}

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
        bat """
          echo ===== DEPLOY STAGING =====

          REM Make deploy idempotent and avoid name conflicts seen in your log:
          docker rm -f keyshield-api 2>NUL || echo keyshield-api not present
          docker rm -f keyshield-frontend 2>NUL || echo keyshield-frontend not present

          docker compose -f docker-compose.yml down --remove-orphans
          docker compose -f docker-compose.yml up -d --build --force-recreate

          echo ===== DOCKER PS =====
          docker ps
        """
      }
    }

    stage('Release - Smoke / Health Validation') {
      steps {
        // FIXES your r1 error: we do NOT create Groovy-binding variables like r1/r2
        powershell """
          Write-Host '===== RELEASE SMOKE TEST ====='
          $ErrorActionPreference = 'Stop'

          Write-Host 'Checking Frontend...'
          Invoke-WebRequest '${env:FE_URL}' -UseBasicParsing -TimeoutSec 20 | Out-Null
          Write-Host 'Frontend OK'

          Write-Host 'Checking API...'
          try {
            Invoke-WebRequest '${env:API_URL}/health' -UseBasicParsing -TimeoutSec 20 | Out-Null
            Write-Host 'API /health OK'
          } catch {
            Write-Host 'No /health endpoint; trying API root...'
            Invoke-WebRequest '${env:API_URL}' -UseBasicParsing -TimeoutSec 20 | Out-Null
            Write-Host 'API root OK'
          }
        """
      }
    }
  }

  post {
    always {
      bat '''
        echo ===== POST: DOCKER PS =====
        docker ps
        echo ===== POST: API LOG TAIL (if exists) =====
        docker logs keyshield-api --tail 80 2>NUL || echo "No keyshield-api container logs available"
      '''
      archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/**, frontend/app/dist/**'
    }

    failure {
      echo "Pipeline failed. Check deploy conflict, logs, and reports artifacts."
    }
  }
}
