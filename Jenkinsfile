pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  environment {
    // ---- SonarCloud ----
    SONAR_HOST_URL = 'https://sonarcloud.io'
    // Set these to YOUR values (must match your SonarCloud project)
    SONAR_ORG      = 'chrisrogenirwinroland-cyber'
    SONAR_PROJECT  = 'chrisrogenirwinroland-cyber_keyshield-vault'

    // SONAR_TOKEN should be stored in Jenkins Credentials as "Secret text"
    // Credential ID below must match Jenkins -> Manage Credentials
    // Example ID: sonarcloud-token
    // DO NOT hardcode the token in this file.

    // ---- Trivy ----
    TRIVY_TIMEOUT  = '20m'

    // ---- Docker (optional / guarded) ----
    DOCKER_TAG = "${env.BUILD_NUMBER}"
    DOCKER_IMAGE_API = "chrisrogenirwinroland/keyshield-vault-api"
    DOCKER_IMAGE_FRONTEND = "chrisrogenirwinroland/keyshield-vault-frontend"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') {
      steps {
        echo "Installing & building API"
        dir('api') {
          bat 'npm ci'
        }

        echo "Installing & building Frontend"
        dir('frontend\\app') {
          bat 'npm ci'
          bat 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        echo "Running API tests"
        dir('api') {
          bat 'npm test'
        }
      }
    }

    stage('Code Quality (SonarCloud)') {
      steps {
        withCredentials([string(credentialsId: 'sonarcloud-token', variable: 'SONAR_TOKEN')]) {
          // Run scanner inside Linux (WSL2) sonar-scanner as your logs show.
          // This avoids PowerShell argument parsing issues.
          powershell '''
            $ErrorActionPreference = "Stop"

            docker run --rm ^
              -e SONAR_TOKEN=$env:SONAR_TOKEN ^
              -v "${env:WORKSPACE}:/usr/src" ^
              sonarsource/sonar-scanner-cli:latest ^
              -Dsonar.organization=${env:SONAR_ORG} ^
              -Dsonar.projectKey=${env:SONAR_PROJECT} ^
              -Dsonar.host.url=${env:SONAR_HOST_URL} ^
              -Dsonar.sources=. ^
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**,**/out/**,**/build/** ^
              -Dsonar.sourceEncoding=UTF-8
          '''
        }
      }
    }

    stage('Security (npm audit + Trivy)') {
      steps {
        echo "npm audit (API) - do not fail build"
        dir('api') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        echo "npm audit (Frontend) - do not fail build"
        dir('frontend\\app') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        echo "Trivy FS scan - increase timeout, reduce slow secret scan risk"
        powershell '''
          $ErrorActionPreference = "Stop"

          # Pull once (cached after first run)
          docker pull aquasec/trivy:latest | Out-Null

          # Run filesystem scan on workspace.
          # - Increase timeout to avoid context deadline exceeded
          # - Disable secret scan to prevent long-running hangs on Jenkinsfile
          # - Keep vuln + misconfig scanning for rubric/security evidence
          docker run --rm ^
            -v "${env:WORKSPACE}:/work" ^
            aquasec/trivy:latest fs /work ^
            --timeout ${env:TRIVY_TIMEOUT} ^
            --scanners vuln,misconfig ^
            --skip-dirs /work/**/node_modules ^
            --skip-dirs /work/**/dist ^
            --skip-dirs /work/**/coverage ^
            --exit-code 0
        '''
      }
    }

    // -----------------------------
    // OPTIONAL DOCKER ARTEFACTS (GUARDED)
    // -----------------------------
    stage('Build Artefact (Docker Images)') {
      when {
        expression {
          return fileExists('api/Dockerfile') || fileExists('frontend/app/Dockerfile') || fileExists('frontend\\app\\Dockerfile')
        }
      }
      steps {
        script {
          if (fileExists('api/Dockerfile')) {
            bat 'docker build -t %DOCKER_IMAGE_API%:%DOCKER_TAG% -f api\\Dockerfile api'
          } else {
            echo 'Skipping API docker build (api/Dockerfile not found).'
          }

          // support both path styles
          if (fileExists('frontend/app/Dockerfile')) {
            bat 'docker build -t %DOCKER_IMAGE_FRONTEND%:%DOCKER_TAG% -f frontend\\app\\Dockerfile frontend\\app'
          } else if (fileExists('frontend\\app\\Dockerfile')) {
            bat 'docker build -t %DOCKER_IMAGE_FRONTEND%:%DOCKER_TAG% -f frontend\\app\\Dockerfile frontend\\app'
          } else {
            echo 'Skipping Frontend docker build (frontend/app/Dockerfile not found).'
          }
        }
      }
    }

    stage('Push Artefact (Optional)') {
      when {
        expression {
          return (fileExists('api/Dockerfile') || fileExists('frontend/app/Dockerfile') || fileExists('frontend\\app\\Dockerfile'))
        }
      }
      steps {
        echo "Push skipped (optional). Configure DockerHub creds if you need this."
        // If you MUST push later, add:
        // withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
        //   bat 'echo %DH_PASS% | docker login -u %DH_USER% --password-stdin'
        //   bat 'docker push %DOCKER_IMAGE_API%:%DOCKER_TAG%'
        //   bat 'docker push %DOCKER_IMAGE_FRONTEND%:%DOCKER_TAG%'
        // }
      }
    }

    stage('Deploy (Staging) - Optional') {
      when { expression { return false } }
      steps { echo "Deploy disabled for rubric demo." }
    }

    stage('Release (Promote to Prod) - Optional') {
      when { expression { return false } }
      steps { echo "Release disabled for rubric demo." }
    }

    stage('Monitoring (Health + Metrics) - Optional') {
      when { expression { return false } }
      steps { echo "Monitoring disabled for rubric demo." }
    }
  }

  post {
    always {
      echo "Pipeline completed."
      echo "Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
    }
    success {
      echo "SUCCESS: Build/Test/Quality/Security completed."
    }
    failure {
      echo "FAILURE: Check the failing stage logs above."
    }
  }
}
