pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    booleanParam(name: 'RUN_SONAR', defaultValue: false, description: 'Run SonarQube scan (optional)')
    booleanParam(name: 'RUN_TRIVY', defaultValue: false, description: 'Run Trivy image scan (optional)')
    booleanParam(name: 'PUSH_DOCKERHUB', defaultValue: true, description: 'Push images to DockerHub (optional)')
    booleanParam(name: 'DEPLOY_STAGING', defaultValue: true, description: 'Deploy to local staging via docker compose')
    booleanParam(name: 'RUN_MONITORING_CHECK', defaultValue: true, description: 'Run health/metrics checks after staging deploy')
  }

  environment {
    // =========================
    // CONFIG (edit as needed)
    // =========================

    // DockerHub repo/namespace
    DOCKERHUB_NAMESPACE = 'rogen7spark'

    // Image names
    API_IMAGE_NAME = 'keyshield-vault-api'
    WEB_IMAGE_NAME = 'keyshield-vault-web'

    // Tags: build number + latest
    API_IMAGE_TAG = "${BUILD_NUMBER}"
    WEB_IMAGE_TAG = "${BUILD_NUMBER}"

    // Local staging compose
    COMPOSE_PROJECT = 'keyshield-staging'
    COMPOSE_FILE    = 'docker-compose.yml'

    // Health & metrics endpoints (must match your API)
    API_HEALTH_URL   = 'http://localhost:3000/health'
    API_METRICS_URL  = 'http://localhost:3000/metrics'

    // Optional SonarQube installation name in Jenkins global config
    // If your Jenkins has a different name, update this.
    SONARQUBE_SERVER = 'Sonar'
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        bat 'git --version'
        bat 'git rev-parse --short HEAD'
      }
    }

    stage('Validate Tooling') {
      steps {
        bat 'where docker'
        bat 'docker version'
        bat 'docker compose version'

        // Keep these non-fatal in case Node isn't installed (your log shows it is)
        bat 'where node   || exit /b 0'
        bat 'node -v      || exit /b 0'
        bat 'npm -v       || exit /b 0'
      }
    }

    stage('Build (Docker Images)') {
      steps {
        script {
          def apiImage = "${env.DOCKERHUB_NAMESPACE}/${env.API_IMAGE_NAME}:${env.API_IMAGE_TAG}"
          def webImage = "${env.DOCKERHUB_NAMESPACE}/${env.WEB_IMAGE_NAME}:${env.WEB_IMAGE_TAG}"

          echo "Building API image: ${apiImage}"
          bat """
            docker build ^
              -t ${apiImage} ^
              -t ${env.DOCKERHUB_NAMESPACE}/${env.API_IMAGE_NAME}:latest ^
              -f api\\Dockerfile api
          """

          echo "Building Frontend image: ${webImage}"
          bat """
            docker build ^
              -t ${webImage} ^
              -t ${env.DOCKERHUB_NAMESPACE}/${env.WEB_IMAGE_NAME}:latest ^
              -f frontend\\app\\Dockerfile frontend\\app
          """
        }
      }
    }

    stage('Test (API Unit Tests)') {
      steps {
        dir('api') {
          // Make tests not kill the entire build if you want.
          // If you want tests to be mandatory, remove catchError wrapper.
          catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            bat 'npm ci'
            bat 'npm test'
          }
        }
      }
    }

    stage('Code Quality (SonarQube) - OPTIONAL') {
      when { expression { return params.RUN_SONAR } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          script {
            // NOTE: This fails if SONARQUBE_SERVER name doesn't match Jenkins config.
            withSonarQubeEnv("${env.SONARQUBE_SERVER}") {
              // Use your preferred scanner approach here.
              // If you use SonarScanner CLI, call it. Example:
              // bat 'sonar-scanner -Dsonar.projectKey=keyshield-vault -Dsonar.sources=.'
              echo "SonarQube environment configured: ${env.SONARQUBE_SERVER}"
              echo "Add sonar-scanner command here if installed."
            }
          }
        }
      }
    }

    stage('Security (Dependency Audit) - OPTIONAL') {
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          dir('api') {
            bat 'npm audit --audit-level=high || exit /b 0'
          }
          dir('frontend/app') {
            bat 'npm audit --audit-level=high || exit /b 0'
          }
        }
      }
    }

    stage('Security (Trivy Image Scan) - OPTIONAL') {
      when { expression { return params.RUN_TRIVY } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          bat '''
            where trivy 1>nul 2>nul
            if %ERRORLEVEL% NEQ 0 (
              echo Trivy not installed. Skipping image scan.
              exit /b 0
            )
          '''
          bat """
            trivy image ${env.DOCKERHUB_NAMESPACE}/${env.API_IMAGE_NAME}:${env.API_IMAGE_TAG} || exit /b 0
            trivy image ${env.DOCKERHUB_NAMESPACE}/${env.WEB_IMAGE_NAME}:${env.WEB_IMAGE_TAG} || exit /b 0
          """
        }
      }
    }

    stage('DockerHub Push - OPTIONAL') {
      when { expression { return params.PUSH_DOCKERHUB } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          withCredentials([usernamePassword(
            credentialsId: 'dockerhub-creds',
            usernameVariable: 'DH_USER',
            passwordVariable: 'DH_PASS'
          )]) {

            bat """
              echo DockerHub user (from creds): %DH_USER%
              echo DockerHub namespace (param): ${env.DOCKERHUB_NAMESPACE}

              echo Logging in to DockerHub...
              docker logout || exit /b 0
              echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
              if %ERRORLEVEL% NEQ 0 exit /b 1

              docker push ${env.DOCKERHUB_NAMESPACE}/${env.API_IMAGE_NAME}:${env.API_IMAGE_TAG}
              if %ERRORLEVEL% NEQ 0 exit /b 1
              docker push ${env.DOCKERHUB_NAMESPACE}/${env.API_IMAGE_NAME}:latest
              if %ERRORLEVEL% NEQ 0 exit /b 1

              docker push ${env.DOCKERHUB_NAMESPACE}/${env.WEB_IMAGE_NAME}:${env.WEB_IMAGE_TAG}
              if %ERRORLEVEL% NEQ 0 exit /b 1
              docker push ${env.DOCKERHUB_NAMESPACE}/${env.WEB_IMAGE_NAME}:latest
              if %ERRORLEVEL% NEQ 0 exit /b 1

              docker logout || exit /b 0
            """
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      when { expression { return params.DEPLOY_STAGING } }
      steps {
        bat "echo Starting staging deployment..."
        bat """
          docker compose -p ${env.COMPOSE_PROJECT} -f ${env.COMPOSE_FILE} up -d --build
          if %ERRORLEVEL% NEQ 0 exit /b 1
        """
      }
    }

    stage('Continuous Monitoring Validation') {
      when {
        allOf {
          expression { return params.DEPLOY_STAGING }
          expression { return params.RUN_MONITORING_CHECK }
        }
      }
      steps {
        // If you want this to be MANDATORY, remove catchError wrapper.
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          // IMPORTANT: single PowerShell block; no stray '^' inside PS
          bat """
            powershell -NoProfile -ExecutionPolicy Bypass -Command ^
              "& {
                Write-Host 'Checking API health...'
                try {
                  \$r = Invoke-WebRequest -UseBasicParsing '${env.API_HEALTH_URL}' -TimeoutSec 15
                  Write-Host ('Health StatusCode: ' + \$r.StatusCode)
                  if (\$r.StatusCode -ne 200) { exit 1 }
                } catch {
                  Write-Host ('ERROR: ' + \$_.Exception.Message)
                  exit 1
                }

                Write-Host 'Checking API metrics...'
                try {
                  \$m = Invoke-WebRequest -UseBasicParsing '${env.API_METRICS_URL}' -TimeoutSec 15
                  Write-Host ('Metrics StatusCode: ' + \$m.StatusCode)
                  if (\$m.StatusCode -ne 200) { exit 1 }
                } catch {
                  Write-Host ('ERROR: ' + \$_.Exception.Message)
                  exit 1
                }
              }"
          """
        }
      }
    }
  }

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
    }
    failure {
      echo "FAILED: A mandatory stage failed. Review logs above."
    }
    success {
      echo "SUCCESS: Build, test, and staging deployment completed."
    }
    cleanup {
      cleanWs()
    }
  }
}
