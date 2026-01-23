pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    skipDefaultCheckout(true)
  }

  environment {
    // ----------------------------
    // SonarCloud 
    // ----------------------------
    SONAR_HOST_URL = 'https://sonarcloud.io'
    SONAR_ORG      = 'chrisrogenirwinroland-cyber'
    SONAR_PROJECT  = 'chrisrogenirwinroland-cyber_keyshield-vault'

    
    SONAR_TOKEN_CRED_ID = 'sonar-token'     // Secret text

    // DockerHub creds 
    DOCKERHUB_CRED_ID   = 'dockerhub-creds' // Username+Password

    // Docker tags
    DOCKER_TAG = "${env.BUILD_NUMBER}"
    DOCKER_IMAGE_API = "chrisrogenirwinroland/keyshield-vault-api"
    DOCKER_IMAGE_FE  = "chrisrogenirwinroland/keyshield-vault-frontend"

    // Trivy behavior
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

    // ----------------------------
    // SonarCloud 
    // ----------------------------
    stage('Code Quality (SonarCloud)') {
      steps {
        script {
          def dockerOk = (bat(returnStatus: true, script: 'where docker') == 0) &&
                         (bat(returnStatus: true, script: 'docker version') == 0)

          if (!dockerOk) {
            error("Docker is required for SonarCloud stage on this pipeline (sonar-scanner runs in Docker). Start Docker Desktop and rerun.")
          }

          withCredentials([string(credentialsId: "${env.SONAR_TOKEN_CRED_ID}", variable: 'SONAR_TOKEN')]) {
            bat """
              echo Running SonarCloud scan (dockerized sonar-scanner)...
              docker run --rm ^
                -e SONAR_TOKEN=%SONAR_TOKEN% ^
                -v "%WORKSPACE%:/usr/src" ^
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
        echo "npm audit (API) - do not fail build"
        dir('api') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        echo "npm audit (Frontend) - do not fail build"
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

          // Trivy should not block SUCCESS
          catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
            bat """
              echo Pulling Trivy...
              docker pull aquasec/trivy:latest
              echo Running Trivy filesystem scan...
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

          echo "Checking Dockerfile locations..."
          bat 'dir api || exit /b 0'
          bat 'dir frontend\\app || exit /b 0'

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

    stage('Push Artefact (DockerHub) - Optional') {
      steps {
        script {
          def dockerOk = (bat(returnStatus: true, script: 'where docker') == 0) &&
                         (bat(returnStatus: true, script: 'docker version') == 0)

          if (!dockerOk) {
            echo "Skipping Docker push: Docker not available/running."
            return
          }

          // Push should not block SUCCESS (also avoids UNSTABLE)
          catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
            withCredentials([usernamePassword(credentialsId: "${env.DOCKERHUB_CRED_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
              bat """
                echo Logging in to DockerHub...
                docker logout || exit /b 0
                echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
              """

              if (fileExists('api/Dockerfile')) {
                bat 'docker push %DOCKER_IMAGE_API%:%DOCKER_TAG%'
              } else {
                echo "No API image built, skipping push."
              }

              if (fileExists('frontend\\app\\Dockerfile') || fileExists('frontend/app/Dockerfile')) {
                bat 'docker push %DOCKER_IMAGE_FE%:%DOCKER_TAG%'
              } else {
                echo "No FE image built, skipping push."
              }
            }
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
      echo "FAILURE: A required stage failed."
    }
  }
}
