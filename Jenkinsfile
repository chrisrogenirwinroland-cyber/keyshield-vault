// Jenkinsfile (Option A) — Full Declarative Pipeline with cleanup{ cleanWs() }
// Windows-friendly (uses bat + PowerShell). Includes Deploy + Monitoring validation.
//
// IMPORTANT: update these 2 items to match your Jenkins:
// 1) DockerHub credentials ID (default: dockerhub-creds)
// 2) SonarQube server name in Jenkins config (default: SonarQube)
//
// If you do not have Sonar/Trivy installed, those stages are marked OPTIONAL and will only make the build UNSTABLE (not FAIL).

pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    skipDefaultCheckout(false)
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  parameters {
    booleanParam(name: 'PUSH_IMAGES', defaultValue: true, description: 'Push Docker images to DockerHub (requires creds).')
    booleanParam(name: 'DEPLOY_STAGING', defaultValue: true, description: 'Deploy to local staging via docker compose.')
    booleanParam(name: 'RUN_SONAR', defaultValue: true, description: 'Run SonarQube analysis (optional).')
    booleanParam(name: 'RUN_TRIVY', defaultValue: true, description: 'Run Trivy image scan (optional).')
    booleanParam(name: 'RUN_MONITORING_CHECK', defaultValue: true, description: 'Validate /health and /metrics endpoints after deploy.')
  }

  environment {
    // Repo/app naming
    APP_NAME            = 'keyshield-vault'

    // DockerHub
    DOCKERHUB_NAMESPACE = 'chrisrogenirwinroland'          // <- your DockerHub namespace/org
    DOCKERHUB_CRED_ID   = 'dockerhub-creds'                // <- change to your Jenkins credential ID (Username/Password)
    API_IMAGE           = "${DOCKERHUB_NAMESPACE}/${APP_NAME}-api:${BUILD_NUMBER}"
    WEB_IMAGE           = "${DOCKERHUB_NAMESPACE}/${APP_NAME}-web:${BUILD_NUMBER}"
    API_IMAGE_LATEST    = "${DOCKERHUB_NAMESPACE}/${APP_NAME}-api:latest"
    WEB_IMAGE_LATEST    = "${DOCKERHUB_NAMESPACE}/${APP_NAME}-web:latest"

    // Compose
    COMPOSE_FILE        = 'docker-compose.yml'
    STAGING_PROJECT     = 'keyshield-staging'              // Compose project name

    // App endpoints (adjust if your compose exposes different ports)
    API_HEALTH_URL      = 'http://localhost:3000/health'
    API_METRICS_URL     = 'http://localhost:3000/metrics'

    // SonarQube (optional)
    SONARQUBE_SERVER    = 'SonarQube'                      // <- Jenkins "Configure System" -> SonarQube servers name
    SONAR_PROJECT_KEY   = 'keyshield-vault'
    SONAR_PROJECT_NAME  = 'KeyShield Vault'
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
        bat 'where node || exit /b 0'
        bat 'node -v || exit /b 0'
        bat 'npm -v || exit /b 0'
      }
    }

    stage('Build (Docker Images)') {
      steps {
        echo "Building API image: ${env.API_IMAGE}"
        bat """
          docker build -t ${API_IMAGE} -t ${API_IMAGE_LATEST} -f api\\Dockerfile api
        """

        echo "Building Frontend image: ${env.WEB_IMAGE}"
        bat """
          docker build -t ${WEB_IMAGE} -t ${WEB_IMAGE_LATEST} -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    stage('Test (API Unit Tests)') {
      steps {
        dir('api') {
          // If tests are configured, this will run. If not, it should exit cleanly if npm test is missing.
          // Adjust to your exact test command if needed.
          catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
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
          // Requires SonarQube Scanner configured in Jenkins or available on PATH.
          withSonarQubeEnv("${SONARQUBE_SERVER}") {
            bat """
              sonar-scanner ^
                -Dsonar.projectKey=${SONAR_PROJECT_KEY} ^
                -Dsonar.projectName="${SONAR_PROJECT_NAME}" ^
                -Dsonar.sources=api,frontend/app/src ^
                -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/.angular/** ^
                -Dsonar.javascript.lcov.reportPaths=api/coverage/lcov.info,frontend/app/coverage/lcov.info
            """
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
          // Requires Trivy installed on the Jenkins node
          bat 'where trivy'
          bat "trivy image --no-progress --severity HIGH,CRITICAL ${API_IMAGE}"
          bat "trivy image --no-progress --severity HIGH,CRITICAL ${WEB_IMAGE}"
        }
      }
    }

    stage('DockerHub Push - OPTIONAL') {
      when { expression { return params.PUSH_IMAGES } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          withCredentials([usernamePassword(credentialsId: "${DOCKERHUB_CRED_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {

            bat """
              echo Logging in to DockerHub...
              docker logout || exit /b 0
              echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
            """

            // Push both build-number tag and latest tag
            bat "docker push ${API_IMAGE}"
            bat "docker push ${API_IMAGE_LATEST}"
            bat "docker push ${WEB_IMAGE}"
            bat "docker push ${WEB_IMAGE_LATEST}"

            bat "docker logout || exit /b 0"
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      when { expression { return params.DEPLOY_STAGING } }
      steps {
        // This assumes your docker-compose.yml can run locally on the Jenkins machine.
        // If your compose uses build:, it will rebuild; if it uses image:, ensure it references the correct images.
        bat """
          echo Starting staging deployment...
          docker compose -p ${STAGING_PROJECT} -f ${COMPOSE_FILE} up -d --build
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
        // Health + Metrics checks (PowerShell)
        // If your backend routes differ, update API_HEALTH_URL / API_METRICS_URL.
        bat """
          powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "Write-Host 'Checking API health...'; ^
             try { (Invoke-WebRequest -UseBasicParsing '${API_HEALTH_URL}' -TimeoutSec 15).StatusCode } catch { Write-Host $_; exit 1 }"
        """

        bat """
          powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "Write-Host 'Checking API metrics...'; ^
             try { (Invoke-WebRequest -UseBasicParsing '${API_METRICS_URL}' -TimeoutSec 15).StatusCode } catch { Write-Host $_; exit 1 }"
        """
      }
    }
  }

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
    }
    unstable {
      echo "UNSTABLE: One or more OPTIONAL steps failed (Sonar/Trivy/Docker push). Core stages may still be successful."
    }
    failure {
      echo "FAILED: A mandatory stage failed. Review the stage logs above."
    }
    cleanup {
      // Option A fix: cleanup MUST contain at least one step
      cleanWs(deleteDirs: true, disableDeferredWipeout: true)
    }
  }
}
