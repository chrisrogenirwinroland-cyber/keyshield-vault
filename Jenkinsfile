pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    // DockerHub
    string(name: 'DOCKERHUB_NAMESPACE', defaultValue: 'rogen7spark', description: 'DockerHub namespace/user (e.g., rogen7spark)')
    booleanParam(name: 'PUSH_TO_DOCKERHUB', defaultValue: true, description: 'Push images to DockerHub')
    string(name: 'DOCKERHUB_CREDS_ID', defaultValue: 'dockerhub-creds', description: 'Jenkins Credentials ID for DockerHub username/password')

    // Sonar (OPTIONAL)
    booleanParam(name: 'RUN_SONAR', defaultValue: true, description: 'Run Sonar analysis (optional)')
    string(name: 'SONAR_SERVER_NAME', defaultValue: 'SonarCloud', description: 'Name of SonarQube server in Jenkins: Manage Jenkins → Configure System → SonarQube servers')
    string(name: 'SONAR_TOKEN_CRED_ID', defaultValue: 'sonar-token', description: 'Jenkins credential ID (Secret text) for Sonar token')
    string(name: 'SONAR_PROJECT_KEY', defaultValue: 'chrisrogenirwinroland-cyber_keyshield-vault', description: 'SonarCloud project key')
    string(name: 'SONAR_ORG', defaultValue: 'chrisrogenirwinroland-cyber', description: 'SonarCloud organization (if applicable)')

    // Security scans (OPTIONAL)
    booleanParam(name: 'RUN_NPM_AUDIT', defaultValue: true, description: 'Run npm audit (optional)')
    booleanParam(name: 'RUN_TRIVY', defaultValue: false, description: 'Run Trivy image scan (optional; requires Trivy installed)')

    // Deploy / health checks
    string(name: 'COMPOSE_PROJECT', defaultValue: 'keyshield-staging', description: 'docker compose project name')
    string(name: 'FRONTEND_URL', defaultValue: 'http://localhost:4200/', description: 'Frontend URL for synthetic check')
    string(name: 'API_URL', defaultValue: 'http://localhost:3000/health', description: 'API health URL for synthetic check (update if different)')
    string(name: 'API_CONTAINER', defaultValue: 'keyshield-api', description: 'API container name from docker ps')
    string(name: 'FRONTEND_CONTAINER', defaultValue: 'keyshield-frontend', description: 'Frontend container name from docker ps')

    // Tagging
    string(name: 'IMAGE_TAG', defaultValue: '', description: 'Optional override tag. Leave blank to use BUILD_NUMBER.')
  }

  environment {
    // Auto-tag if user didn't supply one
    BUILD_TAGGED = "${params.IMAGE_TAG?.trim() ? params.IMAGE_TAG.trim() : env.BUILD_NUMBER}"

    // Image names (DockerHub)
    API_IMAGE  = "${params.DOCKERHUB_NAMESPACE}/keyshield-vault-api"
    WEB_IMAGE  = "${params.DOCKERHUB_NAMESPACE}/keyshield-vault-web"

    // Local compose file
    COMPOSE_FILE = "docker-compose.yml"
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
        bat 'npm -v  || exit /b 0'
      }
    }

    stage('Build (Docker Images)') {
      steps {
        script {
          echo "Building API image: ${env.API_IMAGE}:${env.BUILD_TAGGED}"
          bat """
            docker build ^
              -t ${env.API_IMAGE}:${env.BUILD_TAGGED} ^
              -t ${env.API_IMAGE}:latest ^
              -f api\\Dockerfile api
          """

          echo "Building Frontend image: ${env.WEB_IMAGE}:${env.BUILD_TAGGED}"
          bat """
            docker build ^
              -t ${env.WEB_IMAGE}:${env.BUILD_TAGGED} ^
              -t ${env.WEB_IMAGE}:latest ^
              -f frontend\\app\\Dockerfile frontend\\app
          """
        }
      }
    }

    stage('Test (API Unit Tests)') {
      steps {
        dir('api') {
          // Fail build if tests fail. If you want optional, wrap in catchError.
          bat 'npm ci'
          bat 'npm test'
        }
      }
    }

    stage('Code Quality (Sonar) - OPTIONAL') {
      when { expression { return params.RUN_SONAR } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          script {
            // Uses the Sonar server name you configured in Jenkins.
            withSonarQubeEnv("${params.SONAR_SERVER_NAME}") {
              withCredentials([string(credentialsId: "${params.SONAR_TOKEN_CRED_ID}", variable: 'SONAR_TOKEN')]) {

                // If you have sonar-scanner installed in PATH, this will work directly.
                // Otherwise install "SonarScanner" tool in Jenkins and call it via tool().
                bat """
                  echo Running Sonar analysis...
                  sonar-scanner ^
                    -Dsonar.host.url=%SONAR_HOST_URL% ^
                    -Dsonar.login=%SONAR_TOKEN% ^
                    -Dsonar.projectKey=${params.SONAR_PROJECT_KEY} ^
                    -Dsonar.organization=${params.SONAR_ORG} ^
                    -Dsonar.sources=api,frontend ^
                    -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/coverage/** ^
                    -Dsonar.javascript.lcov.reportPaths=api/coverage/lcov.info,frontend/app/coverage/lcov.info
                """
              }
            }
          }
        }
      }
    }

    stage('Security (Dependency Audit) - OPTIONAL') {
      when { expression { return params.RUN_NPM_AUDIT } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
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
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          bat 'where trivy 1>nul 2>nul || (echo Trivy not installed. Skipping. & exit /b 0)'
          bat "trivy image --severity HIGH,CRITICAL --no-progress ${env.API_IMAGE}:${env.BUILD_TAGGED} || exit /b 0"
          bat "trivy image --severity HIGH,CRITICAL --no-progress ${env.WEB_IMAGE}:${env.BUILD_TAGGED} || exit /b 0"
        }
      }
    }

    stage('DockerHub Push - OPTIONAL') {
      when { expression { return params.PUSH_TO_DOCKERHUB } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
          withCredentials([usernamePassword(credentialsId: "${params.DOCKERHUB_CREDS_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
            bat 'echo DockerHub user (from creds): %DH_USER%'
            bat "echo DockerHub namespace (param): ${params.DOCKERHUB_NAMESPACE}"
            bat 'docker logout || exit /b 0'
            bat 'echo %DH_PASS% | docker login -u %DH_USER% --password-stdin'

            bat "docker push ${env.API_IMAGE}:${env.BUILD_TAGGED}"
            bat "docker push ${env.API_IMAGE}:latest"
            bat "docker push ${env.WEB_IMAGE}:${env.BUILD_TAGGED}"
            bat "docker push ${env.WEB_IMAGE}:latest"

            bat 'docker logout || exit /b 0'
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      steps {
        bat 'echo Starting staging deployment...'
        // Use --build if you want local images rebuilt; otherwise omit.
        bat "docker compose -p ${params.COMPOSE_PROJECT} -f ${env.COMPOSE_FILE} up -d --build"
        bat 'docker ps'
      }
    }

    stage('Continuous Monitoring Validation') {
      steps {
        script {
          // Wait a bit for containers to stabilize
          powershell 'Start-Sleep -Seconds 10'

          // Validate containers exist and are running
          def apiStatus = bat(script: "docker inspect -f \"{{.State.Status}}\" ${params.API_CONTAINER}", returnStdout: true).trim()
          def apiRestarts = bat(script: "docker inspect -f \"{{.RestartCount}}\" ${params.API_CONTAINER}", returnStdout: true).trim()

          echo "API container status: ${apiStatus} (restartCount=${apiRestarts})"

          if (apiStatus != 'running') {
            bat "docker logs ${params.API_CONTAINER} --tail 200"
            error("Monitoring failed: API container is not running (status=${apiStatus}).")
          }

          // Synthetic HTTP checks
          powershell """
            \$ErrorActionPreference = 'Stop'
            Write-Host 'Checking Frontend URL: ${params.FRONTEND_URL}'
            Invoke-WebRequest '${params.FRONTEND_URL}' -UseBasicParsing -TimeoutSec 10 | Out-Null

            Write-Host 'Checking API URL: ${params.API_URL}'
            Invoke-WebRequest '${params.API_URL}' -UseBasicParsing -TimeoutSec 10 | Out-Null

            Write-Host 'Continuous Monitoring Validation PASSED'
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
    cleanup {
      cleanWs()
    }
  }
}
