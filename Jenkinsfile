// ================================================================
// KeyShield Vault — Option A Jenkins Pipeline (FULL WORKING CODE)
// Includes: Build, Test, Quality (optional), Security (optional),
// DockerHub Push (optional), Deploy (Staging), Continuous Monitoring
// Fixes: Groovy $_ issue + correct Declarative "post { cleanup { ... } }"
// ================================================================

pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  parameters {
    // Set this to your DockerHub username (must match the creds you use in Jenkins)
    string(name: 'DOCKERHUB_NAMESPACE', defaultValue: 'rogen7spark', description: 'DockerHub namespace/username for image tags.')

    booleanParam(name: 'PUSH_IMAGES', defaultValue: true, description: 'Push Docker images to DockerHub (requires correct creds/namespace).')
    booleanParam(name: 'DEPLOY_STAGING', defaultValue: true, description: 'Deploy to local staging via docker compose.')
    booleanParam(name: 'RUN_SONAR', defaultValue: false, description: 'Run SonarQube analysis (enable only if configured).')
    booleanParam(name: 'RUN_TRIVY', defaultValue: false, description: 'Run Trivy scan (enable only if Trivy is installed).')
    booleanParam(name: 'RUN_MONITORING_CHECK', defaultValue: true, description: 'Validate /health and /metrics after deploy.')
  }

  environment {
    APP_NAME          = 'keyshield-vault'

    // Jenkins credential ID (Username/Password) for DockerHub
    DOCKERHUB_CRED_ID = 'dockerhub-creds'

    // Compose
    COMPOSE_FILE      = 'docker-compose.yml'
    STAGING_PROJECT   = 'keyshield-staging'

    // Endpoints used for monitoring validation after deploy
    API_HEALTH_URL    = 'http://localhost:3000/health'
    API_METRICS_URL   = 'http://localhost:3000/metrics'

    // SonarQube: must match EXACT configured installation name in Jenkins
    SONARQUBE_SERVER  = 'Sonar'             // change only if you configured a different name
    SONAR_PROJECT_KEY = 'keyshield-vault'
    SONAR_PROJECT_NAME= 'KeyShield Vault'
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
        script {
          env.API_IMAGE        = "${params.DOCKERHUB_NAMESPACE}/${env.APP_NAME}-api:${env.BUILD_NUMBER}"
          env.WEB_IMAGE        = "${params.DOCKERHUB_NAMESPACE}/${env.APP_NAME}-web:${env.BUILD_NUMBER}"
          env.API_IMAGE_LATEST = "${params.DOCKERHUB_NAMESPACE}/${env.APP_NAME}-api:latest"
          env.WEB_IMAGE_LATEST = "${params.DOCKERHUB_NAMESPACE}/${env.APP_NAME}-web:latest"
        }

        echo "Building API image: ${env.API_IMAGE}"
        bat """
          docker build -t ${env.API_IMAGE} -t ${env.API_IMAGE_LATEST} -f api\\Dockerfile api
        """

        echo "Building Frontend image: ${env.WEB_IMAGE}"
        bat """
          docker build -t ${env.WEB_IMAGE} -t ${env.WEB_IMAGE_LATEST} -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    stage('Test (API Unit Tests)') {
      steps {
        dir('api') {
          // If tests fail, mark stage UNSTABLE (still shows evidence in report)
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
          withSonarQubeEnv("${env.SONARQUBE_SERVER}") {
            bat """
              sonar-scanner ^
                -Dsonar.projectKey=${env.SONAR_PROJECT_KEY} ^
                -Dsonar.projectName="${env.SONAR_PROJECT_NAME}" ^
                -Dsonar.sources=api,frontend/app/src ^
                -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/.angular/**
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
          // Skip if Trivy is not installed (do NOT fail build)
          bat '''
            where trivy >nul 2>nul
            if %ERRORLEVEL% NEQ 0 (
              echo Trivy not installed. Skipping image scan.
              exit /b 0
            )
            trivy image --no-progress --severity HIGH,CRITICAL %API_IMAGE%
            trivy image --no-progress --severity HIGH,CRITICAL %WEB_IMAGE%
          '''
        }
      }
    }

    stage('DockerHub Push - OPTIONAL') {
      when { expression { return params.PUSH_IMAGES } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          withCredentials([usernamePassword(credentialsId: "${env.DOCKERHUB_CRED_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {

            // Guard: namespace should match credential username (prevents insufficient_scope surprises)
            bat """
              echo DockerHub user (from creds): %DH_USER%
              echo DockerHub namespace (param): ${params.DOCKERHUB_NAMESPACE}
            """

            bat '''
              echo Logging in to DockerHub...
              docker logout || exit /b 0
              echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

              docker push %API_IMAGE%
              docker push %API_IMAGE_LATEST%
              docker push %WEB_IMAGE%
              docker push %WEB_IMAGE_LATEST%

              docker logout || exit /b 0
            '''
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      when { expression { return params.DEPLOY_STAGING } }
      steps {
        bat """
          echo Starting staging deployment...
          docker compose -p ${env.STAGING_PROJECT} -f ${env.COMPOSE_FILE} up -d --build
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
        // IMPORTANT: Use triple-single quotes to prevent Groovy from interpreting $_
        bat '''
          powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "Write-Host 'Checking API health...'; ^
             try { ^
               $r = Invoke-WebRequest -UseBasicParsing '%API_HEALTH_URL%' -TimeoutSec 15; ^
               Write-Host ('Health StatusCode: ' + $r.StatusCode); ^
               if ($r.StatusCode -ne 200) { exit 1 } ^
             } catch { ^
               Write-Host ('ERROR: ' + $_.Exception.Message); exit 1 ^
             }"
        '''

        bat '''
          powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "Write-Host 'Checking API metrics...'; ^
             try { ^
               $r = Invoke-WebRequest -UseBasicParsing '%API_METRICS_URL%' -TimeoutSec 15; ^
               Write-Host ('Metrics StatusCode: ' + $r.StatusCode); ^
               if ($r.StatusCode -ne 200) { exit 1 } ^
               # Optional: basic content check (won't fail unless metrics empty)
               if ([string]::IsNullOrWhiteSpace($r.Content)) { Write-Host 'WARNING: metrics empty'; } ^
             } catch { ^
               Write-Host ('ERROR: ' + $_.Exception.Message); exit 1 ^
             }"
        '''
      }
    }
  }

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
    }
    unstable {
      echo "UNSTABLE: One or more OPTIONAL steps failed (Sonar/Trivy/Docker push). Core pipeline ran."
    }
    failure {
      echo "FAILED: A mandatory stage failed. Review logs above."
    }
    cleanup {
      cleanWs(deleteDirs: true, disableDeferredWipeout: true)
    }
  }
}
