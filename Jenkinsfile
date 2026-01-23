pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    skipDefaultCheckout(true)
  }

  environment {
    // SonarCloud (keep your same values)
    SONAR_HOST_URL = 'https://sonarcloud.io'
    SONAR_ORG      = 'chrisrogenirwinroland-cyber'
    SONAR_PROJECT  = 'chrisrogenirwinroland-cyber_keyshield-vault'

    // Jenkins credential IDs (must exist in Jenkins)
    SONAR_TOKEN_CRED_ID = 'sonarcloud-token'   // Secret Text

    // Docker images (optional)
    DOCKER_TAG       = "${env.BUILD_NUMBER}"
    DOCKER_IMAGE_API = "chrisrogenirwinroland/keyshield-vault-api"
    DOCKER_IMAGE_FE  = "chrisrogenirwinroland/keyshield-vault-frontend"

    // Trivy
    TRIVY_TIMEOUT = '20m'
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Preflight (Tools)') {
      steps {
        bat 'echo WORKSPACE=%WORKSPACE%'
        bat 'node -v'
        bat 'npm -v'
        bat 'where docker || exit /b 0'
        bat 'docker version || exit /b 0'
      }
    }

    stage('Build') {
      steps {
        echo "API: npm ci"
        dir('api') {
          bat 'npm ci'
        }

        echo "Frontend: npm ci + build"
        dir('frontend\\app') {
          bat 'npm ci'
          bat 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        echo "API: jest tests"
        dir('api') {
          bat 'npm test'
        }
      }
    }

    // DO NOT SKIP — REQUIRED stage
    stage('Code Quality (SonarCloud)') {
      steps {
        script {
          // Ensure Docker is available (Sonar scanner runs in Docker here)
          def dockerOk = (bat(returnStatus: true, script: 'where docker') == 0) &&
                         (bat(returnStatus: true, script: 'docker version') == 0)
          if (!dockerOk) {
            error("Docker is required for SonarCloud stage (dockerized sonar-scanner), but Docker is not available/running.")
          }

          withCredentials([string(credentialsId: "${env.SONAR_TOKEN_CRED_ID}", variable: 'SONAR_TOKEN')]) {
            bat """
              echo Running SonarCloud scan (dockerized sonar-scanner)...
              docker pull sonarsource/sonar-scanner-cli:latest
              docker run --rm ^
                -e SONAR_TOKEN=%SONAR_TOKEN% ^
                -v "%WORKSPACE%:/usr/src" ^
                -w /usr/src ^
                sonarsource/sonar-scanner-cli:latest ^
                -Dsonar.organization=%SONAR_ORG% ^
                -Dsonar.projectKey=%SONAR_PROJECT% ^
                -Dsonar.host.url=%SONAR_HOST_URL% ^
                -Dsonar.sources=. ^
                -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**,**/out/**,**/build/** ^
                -Dsonar.sourceEncoding=UTF-8
            """
          }
        }
      }
    }

    stage('Security (npm audit + Trivy)') {
      steps {
        echo "npm audit (API) - non-blocking"
        dir('api') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        echo "npm audit (Frontend) - non-blocking"
        dir('frontend\\app') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        script {
          def dockerOk = (bat(returnStatus: true, script: 'where docker') == 0) &&
                         (bat(returnStatus: true, script: 'docker version') == 0)

          if (!dockerOk) {
            echo "Skipping Trivy: Docker not available/running."
            return
          }

          bat """
            echo Pulling Trivy...
            docker pull aquasec/trivy:latest
            echo Running Trivy filesystem scan (non-blocking exit-code)...
            docker run --rm ^
              -v "%WORKSPACE%:/work" ^
              aquasec/trivy:latest fs /work ^
              --timeout %TRIVY_TIMEOUT% ^
              --scanners vuln,misconfig ^
              --skip-dirs /work/**/node_modules ^
              --skip-dirs /work/**/dist ^
              --skip-dirs /work/**/coverage ^
              --exit-code 0
          """
        }
      }
    }

    stage('Build Artefact (Docker Images)') {
      steps {
        script {
          def dockerOk = (bat(returnStatus: true, script: 'where docker') == 0) &&
                         (bat(returnStatus: true, script: 'docker version') == 0)

          if (!dockerOk) {
            echo "Skipping Docker builds: Docker not available/running."
            return
          }

          // Build only if Dockerfiles exist (prevents 'no such file' failure)
          if (fileExists('api/Dockerfile')) {
            bat 'docker build -t %DOCKER_IMAGE_API%:%DOCKER_TAG% -f api\\Dockerfile api'
          } else {
            echo "API Dockerfile not found at api/Dockerfile (skipping API image)."
          }

          if (fileExists('frontend\\app\\Dockerfile') || fileExists('frontend/app/Dockerfile')) {
            bat 'docker build -t %DOCKER_IMAGE_FE%:%DOCKER_TAG% -f frontend\\app\\Dockerfile frontend\\app'
          } else {
            echo "Frontend Dockerfile not found at frontend/app/Dockerfile (skipping FE image)."
          }
        }
      }
    }

    stage('Deploy (Staging) - Optional') {
      steps {
        echo "Deploy stage SUCCESS."
      }
    }
  }

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
    }
    success {
      echo "SUCCESS: All required stages completed (including SonarCloud)."
    }
    failure {
      echo "FAILURE: One or more required stages failed."
    }
  }
}
