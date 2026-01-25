pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
  }

  parameters {
    string(name: 'DOCKERHUB_NAMESPACE', defaultValue: 'rogen7spark', description: 'DockerHub namespace / username')
    string(name: 'IMAGE_TAG', defaultValue: '', description: 'Optional tag (blank = BUILD_NUMBER)')
    booleanParam(name: 'PUSH_TO_DOCKERHUB', defaultValue: true, description: 'Push images to DockerHub')
    booleanParam(name: 'RUN_SONAR', defaultValue: false, description: 'Run SonarQube stage (requires Jenkins Sonar config)')
    booleanParam(name: 'RUN_TRIVY', defaultValue: false, description: 'Run Trivy image scan (requires Trivy installed on agent)')
  }

  environment {
    DOCKERHUB_CREDS_ID = 'dockerhub-creds'     // <-- you are using this
    PROJECT_NAME       = 'keyshield-vault'
    COMPOSE_PROJECT    = 'keyshield-staging'
    API_PORT           = '3000'
    WEB_PORT           = '4200'
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
        bat 'where node   || exit /b 0'
        bat 'node -v      || exit /b 0'
        bat 'npm -v       || exit /b 0'
      }
    }

    stage('Build (Docker Images)') {
      steps {
        script {
          env.EFFECTIVE_TAG = (params.IMAGE_TAG?.trim())
            ? params.IMAGE_TAG.trim()
            : env.BUILD_NUMBER

          env.API_IMAGE = "${params.DOCKERHUB_NAMESPACE}/${env.PROJECT_NAME}-api"
          env.WEB_IMAGE = "${params.DOCKERHUB_NAMESPACE}/${env.PROJECT_NAME}-web"
        }

        echo "Building API image: ${env.API_IMAGE}:${env.EFFECTIVE_TAG}"
        bat """
          docker build ^
            -t ${env.API_IMAGE}:${env.EFFECTIVE_TAG} ^
            -t ${env.API_IMAGE}:latest ^
            -f api\\Dockerfile api
        """

        echo "Building Frontend image: ${env.WEB_IMAGE}:${env.EFFECTIVE_TAG}"
        bat """
          docker build ^
            -t ${env.WEB_IMAGE}:${env.EFFECTIVE_TAG} ^
            -t ${env.WEB_IMAGE}:latest ^
            -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    stage('Test (API Unit Tests)') {
      steps {
        dir('api') {
          // If you want unit tests to fail the pipeline, remove catchError and let it fail normally.
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
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          // IMPORTANT:
          // The name below MUST match "Manage Jenkins > System > SonarQube servers > Name"
          // Example: withSonarQubeEnv('SonarQube-Server-1') { ... }
          withSonarQubeEnv('Sonar') {
            // Requires sonar-scanner available on PATH or configured tool
            // bat 'sonar-scanner -Dsonar.projectKey=... -Dsonar.sources=...'
            echo "SonarQube stage enabled, but scanner command is currently placeholder."
          }
        }
      }
    }

    stage('Security (Dependency Audit) - OPTIONAL') {
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          dir('api') {
            bat 'npm audit --audit-level=high || exit /b 0'
          }
          dir('frontend\\app') {
            bat 'npm audit --audit-level=high || exit /b 0'
          }
        }
      }
    }

    stage('Security (Trivy Image Scan) - OPTIONAL') {
      when { expression { return params.RUN_TRIVY } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          bat 'where trivy 1>nul 2>nul || (echo Trivy not installed. Skipping. & exit /b 0)'

          bat "trivy image --severity HIGH,CRITICAL --no-progress ${env.API_IMAGE}:${env.EFFECTIVE_TAG} || exit /b 0"
          bat "trivy image --severity HIGH,CRITICAL --no-progress ${env.WEB_IMAGE}:${env.EFFECTIVE_TAG} || exit /b 0"
        }
      }
    }

    stage('DockerHub Push - OPTIONAL') {
      when { expression { return params.PUSH_TO_DOCKERHUB } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          withCredentials([usernamePassword(
            credentialsId: env.DOCKERHUB_CREDS_ID,
            usernameVariable: 'DH_USER',
            passwordVariable: 'DH_PASS'
          )]) {
            bat 'echo DockerHub user (from creds): %DH_USER%'
            bat 'echo DockerHub namespace (param): ' + params.DOCKERHUB_NAMESPACE

            bat 'echo Logging in to DockerHub...'
            bat 'docker logout || exit /b 0'
            bat 'echo %DH_PASS% | docker login -u %DH_USER% --password-stdin'

            bat "docker push ${env.API_IMAGE}:${env.EFFECTIVE_TAG}"
            bat "docker push ${env.API_IMAGE}:latest"
            bat "docker push ${env.WEB_IMAGE}:${env.EFFECTIVE_TAG}"
            bat "docker push ${env.WEB_IMAGE}:latest"

            bat 'docker logout || exit /b 0'
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      steps {
        bat 'echo Starting staging deployment...'
        bat "docker compose -p ${env.COMPOSE_PROJECT} -f docker-compose.yml up -d --build"
      }
    }

    stage('Continuous Monitoring Validation') {
      steps {
        // FIXED: run the entire try/catch inside ONE PowerShell invocation (no stray CMD "try")
        bat """
          powershell -NoProfile -ExecutionPolicy Bypass -Command ^
          "Write-Host 'Checking API health...'; ^
           try { ^
             \\$r = Invoke-WebRequest -UseBasicParsing 'http://localhost:${env.API_PORT}/health' -TimeoutSec 15; ^
             Write-Host ('Health StatusCode: ' + \\$r.StatusCode); ^
             if (\\$r.StatusCode -ne 200) { exit 1 } ^
           } catch { ^
             Write-Host ('ERROR: ' + \\$_.Exception.Message); ^
             exit 1 ^
           }"
        """
      }
    }
  }

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
      cleanWs()
    }
    failure {
      echo 'FAILED: A mandatory stage failed. Review logs above.'
    }
  }
}
