pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    skipDefaultCheckout(true)
  }

  environment {
    // SonarCloud
    SONAR_HOST_URL = 'https://sonarcloud.io'
    SONAR_ORG      = 'chrisrogenirwinroland-cyber'
    SONAR_PROJECT  = 'chrisrogenirwinroland-cyber_keyshield-vault'
    SONAR_TOKEN_CRED_ID = 'sonar-token'   // Jenkins Secret Text credential id

    // DockerHub
    DOCKERHUB_CRED_ID = 'dockerhub-creds' // Jenkins Username/Password credential id

    // Image tags
    DOCKER_TAG = "${env.BUILD_NUMBER}"
    DOCKER_IMAGE_API = "chrisrogenirwinroland/keyshield-vault-api"
    DOCKER_IMAGE_FE  = "chrisrogenirwinroland/keyshield-vault-frontend"

    // Containers (must match what Monitoring checks)
    API_CONTAINER_NAME = "keyshield-api"
    FE_CONTAINER_NAME  = "keyshield-frontend"

    // Ports (adjust to your app)
    API_PORT_HOST = "3000"
    API_PORT_CONT = "3000"
    FE_PORT_HOST  = "8080"
    FE_PORT_CONT  = "80"

    // Trivy
    TRIVY_TIMEOUT = "20m"
  }

  stages {

    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Preflight (Tools Required)') {
      steps {
        bat 'echo WORKSPACE=%WORKSPACE%'
        bat 'node -v'
        bat 'npm -v'
        bat 'where docker'
        bat 'docker version'
        bat 'docker info'
      }
    }

    stage('Build (Node)') {
      steps {
        dir('api') {
          bat 'npm ci'
        }
        dir('frontend\\app') {
          bat 'npm ci'
          bat 'npm run build'
        }
      }
    }

    stage('Test (API)') {
      steps {
        dir('api') {
          bat 'npm test'
        }
      }
    }

    stage('Code Quality (SonarCloud)') {
      steps {
        withCredentials([string(credentialsId: "${env.SONAR_TOKEN_CRED_ID}", variable: 'SONAR_TOKEN')]) {
          bat """
            echo Running SonarCloud scan (Dockerized sonar-scanner)...
            docker run --rm ^
              -e SONAR_TOKEN=%SONAR_TOKEN% ^
              -v "%WORKSPACE%:/usr/src" ^
              -w /usr/src ^
              sonarsource/sonar-scanner-cli:latest ^
              -Dsonar.organization=%SONAR_ORG% ^
              -Dsonar.projectKey=%SONAR_PROJECT% ^
              -Dsonar.host.url=%SONAR_HOST_URL% ^
              -Dsonar.projectBaseDir=/usr/src ^
              -Dsonar.sources=api,frontend/app ^
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**,**/out/**,**/build/** ^
              -Dsonar.sourceEncoding=UTF-8
          """
        }
      }
    }

    stage('Security (Dependency Audit)') {
      steps {
        // Produce reports but do not break the pipeline for demo/submission
        dir('api') {
          bat 'cmd /c "npm audit --audit-level=high --json > ..\\audit_api.json || exit /b 0"'
        }
        dir('frontend\\app') {
          bat 'cmd /c "npm audit --audit-level=high --json > ..\\..\\audit_frontend.json || exit /b 0"'
        }

        bat 'echo Dependency audit reports generated: audit_api.json, audit_frontend.json'
      }
    }

    stage('Build Artefact (Docker Images)') {
      steps {
        bat 'dir api'
        bat 'dir frontend\\app'

        bat 'docker build -t %DOCKER_IMAGE_API%:%DOCKER_TAG% -f api\\Dockerfile api'
        bat 'docker build -t %DOCKER_IMAGE_FE%:%DOCKER_TAG% -f frontend\\app\\Dockerfile frontend\\app'
      }
    }

    stage('Security (Trivy Scan)') {
      steps {
        bat """
          echo Pulling Trivy...
          docker pull aquasec/trivy:latest

          echo Trivy filesystem scan...
          docker run --rm ^
            -v "%WORKSPACE%:/work" ^
            aquasec/trivy:latest fs /work ^
            --timeout %TRIVY_TIMEOUT% ^
            --scanners vuln,misconfig ^
            --skip-dirs /work/**/node_modules ^
            --skip-dirs /work/**/dist ^
            --skip-dirs /work/**/coverage ^
            --exit-code 0

          echo Trivy image scan (API)...
          docker run --rm aquasec/trivy:latest image %DOCKER_IMAGE_API%:%DOCKER_TAG% --timeout %TRIVY_TIMEOUT% --exit-code 0

          echo Trivy image scan (Frontend)...
          docker run --rm aquasec/trivy:latest image %DOCKER_IMAGE_FE%:%DOCKER_TAG% --timeout %TRIVY_TIMEOUT% --exit-code 0
        """
      }
    }

    stage('Push Artefact (DockerHub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${env.DOCKERHUB_CRED_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo Logging in to DockerHub...
            docker logout || exit /b 0
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
          """
        }

        bat 'docker push %DOCKER_IMAGE_API%:%DOCKER_TAG%'
        bat 'docker push %DOCKER_IMAGE_FE%:%DOCKER_TAG%'
      }
    }

    stage('Deploy (Staging)') {
      steps {
        // Stop/remove existing containers to avoid conflicts
        bat """
          docker rm -f %API_CONTAINER_NAME% || exit /b 0
          docker rm -f %FE_CONTAINER_NAME% || exit /b 0
        """

        // Start API container (ADD REQUIRED ENV VARS HERE IF YOUR API NEEDS THEM)
        bat """
          docker run -d --name %API_CONTAINER_NAME% ^
            -p %API_PORT_HOST%:%API_PORT_CONT% ^
            --restart unless-stopped ^
            %DOCKER_IMAGE_API%:%DOCKER_TAG%
        """

        // Start Frontend container
        bat """
          docker run -d --name %FE_CONTAINER_NAME% ^
            -p %FE_PORT_HOST%:%FE_PORT_CONT% ^
            --restart unless-stopped ^
            %DOCKER_IMAGE_FE%:%DOCKER_TAG%
        """
      }
    }

    stage('Continuous Monitoring Validation') {
      steps {
        // Wait a bit for startup
        powershell 'Start-Sleep -Seconds 10'

        // Container state checks
        bat 'docker inspect -f "{{.State.Status}}" %API_CONTAINER_NAME%'
        bat 'docker inspect -f "{{.RestartCount}}" %API_CONTAINER_NAME%'

        // Fail fast if not running and print logs
        script {
          def status = bat(returnStdout: true, script: 'docker inspect -f "{{.State.Status}}" %API_CONTAINER_NAME%').trim()
          if (!status.equalsIgnoreCase('running')) {
            bat 'echo API is not running. Showing last 200 log lines:'
            bat 'docker logs %API_CONTAINER_NAME% --tail 200'
            error("Monitoring failed: API container is not running (status=${status}).")
          }
        }

        // HTTP health check (adjust URL/endpoint to your API)
        powershell """
          try {
            \$resp = Invoke-WebRequest -UseBasicParsing http://localhost:%API_PORT_HOST%/health -TimeoutSec 10
            Write-Host "Health check status:" \$resp.StatusCode
          } catch {
            Write-Host "Health check failed. Showing last 200 logs..."
            cmd /c "docker logs %API_CONTAINER_NAME% --tail 200"
            throw
          }
        """
      }
    }
  }

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps'
    }
    success {
      echo "SUCCESS: All stages completed (including SonarCloud + monitoring)."
    }
    failure {
      echo "FAILURE: At least one required stage failed."
    }
  }
}
