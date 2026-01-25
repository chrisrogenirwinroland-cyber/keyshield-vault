pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'DOCKERHUB_NAMESPACE', defaultValue: 'rogen7spark', description: 'DockerHub namespace/user')
    booleanParam(name: 'RUN_SONAR', defaultValue: true, description: 'Run SonarCloud analysis (optional)')
    booleanParam(name: 'RUN_DEP_AUDIT', defaultValue: true, description: 'Run npm audit (optional)')
    booleanParam(name: 'RUN_TRIVY', defaultValue: true, description: 'Run Trivy image scan (optional)')
    booleanParam(name: 'PUSH_IMAGES', defaultValue: true, description: 'Push images to DockerHub (optional)')
    booleanParam(name: 'DEPLOY_STAGING', defaultValue: true, description: 'Deploy via docker-compose (staging)')
  }

  environment {
    // Repo structure assumptions based on your logs
    API_DIR      = "api"
    FE_DIR       = "frontend\\app"

    // SonarCloud (keep your existing key/org)
    SONAR_PROJECT_KEY = "chrisrogenirwinroland-cyber_keyshield-vault"
    SONAR_ORG         = "chrisrogenirwinroland-cyber"
    SONAR_HOST_URL    = "https://sonarcloud.io"

    // Docker compose project name and container names (as seen in your logs)
    COMPOSE_PROJECT = "keyshield-staging"
    API_CONTAINER   = "keyshield-api"
    FE_CONTAINER    = "keyshield-frontend"
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
        bat 'node -v  || exit /b 0'
        bat 'npm -v   || exit /b 0'
      }
    }

    stage('Build (Docker Images)') {
      steps {
        script {
          def tag = "${env.BUILD_NUMBER}"

          env.API_IMAGE = "${params.DOCKERHUB_NAMESPACE}/keyshield-vault-api:${tag}"
          env.FE_IMAGE  = "${params.DOCKERHUB_NAMESPACE}/keyshield-vault-web:${tag}"

          echo "Building API image: ${env.API_IMAGE}"
          bat """
            docker build ^
              -t ${env.API_IMAGE} ^
              -t ${params.DOCKERHUB_NAMESPACE}/keyshield-vault-api:latest ^
              -f ${env.API_DIR}\\Dockerfile ${env.API_DIR}
          """

          echo "Building Frontend image: ${env.FE_IMAGE}"
          bat """
            docker build ^
              -t ${env.FE_IMAGE} ^
              -t ${params.DOCKERHUB_NAMESPACE}/keyshield-vault-web:latest ^
              -f ${env.FE_DIR}\\Dockerfile ${env.FE_DIR}
          """
        }
      }
    }

    stage('Test (API Unit Tests)') {
      steps {
        dir("${env.API_DIR}") {
          bat 'npm ci'
          bat 'npm test'
        }
      }
    }

    stage('Code Quality (Sonar) - OPTIONAL') {
      when { expression { return params.RUN_SONAR } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          script {
            // IMPORTANT:
            // In Jenkins: Manage Jenkins -> Global Tool Configuration -> SonarScanner
            // Add a SonarScanner installation with name EXACTLY "SonarScanner"
            def scannerHome = tool 'SonarScanner'

            withSonarQubeEnv('SonarCloud') {
              withCredentials([string(credentialsId: 'sonarcloud-token', variable: 'SONAR_TOKEN')]) {
                echo "Running SonarCloud analysis using configured SonarScanner tool..."

                // Use the tool path rather than relying on PATH
                bat """
                  "${scannerHome}\\bin\\sonar-scanner.bat" ^
                    -Dsonar.host.url=${env.SONAR_HOST_URL} ^
                    -Dsonar.login=%SONAR_TOKEN% ^
                    -Dsonar.projectKey=${env.SONAR_PROJECT_KEY} ^
                    -Dsonar.organization=${env.SONAR_ORG} ^
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
      when { expression { return params.RUN_DEP_AUDIT } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          dir("${env.API_DIR}") {
            bat 'npm audit --audit-level=high || exit /b 0'
          }
          dir("${env.FE_DIR}") {
            bat 'npm audit --audit-level=high || exit /b 0'
          }
        }
      }
    }

    stage('Security (Trivy Image Scan) - OPTIONAL') {
      when { expression { return params.RUN_TRIVY } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          script {
            // Only run Trivy if it exists
            def trivyCheck = bat(returnStatus: true, script: 'where trivy >nul 2>nul')
            if (trivyCheck != 0) {
              echo "Trivy not installed on this agent. Skipping image scan."
              return
            }

            bat "trivy image --severity HIGH,CRITICAL --no-progress ${env.API_IMAGE} || exit /b 0"
            bat "trivy image --severity HIGH,CRITICAL --no-progress ${env.FE_IMAGE}  || exit /b 0"
          }
        }
      }
    }

    stage('DockerHub Push - OPTIONAL') {
      when { expression { return params.PUSH_IMAGES } }
      steps {
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
            bat 'docker logout || exit /b 0'
            bat 'echo %DH_PASS% | docker login -u %DH_USER% --password-stdin'

            bat "docker push ${env.API_IMAGE}"
            bat "docker push ${params.DOCKERHUB_NAMESPACE}/keyshield-vault-api:latest"
            bat "docker push ${env.FE_IMAGE}"
            bat "docker push ${params.DOCKERHUB_NAMESPACE}/keyshield-vault-web:latest"

            bat 'docker logout || exit /b 0'
          }
        }
      }
    }

    stage('Deploy (Staging)') {
      when { expression { return params.DEPLOY_STAGING } }
      steps {
        bat 'echo Starting staging deployment...'
        bat "docker compose -p ${env.COMPOSE_PROJECT} -f docker-compose.yml up -d --build"
        bat 'docker ps'
      }
    }

    stage('Continuous Monitoring Validation') {
      when { expression { return params.DEPLOY_STAGING } }
      steps {
        script {
          // Small warm-up
          powershell 'Start-Sleep -Seconds 10'

          def status = bat(returnStdout: true, script: "docker inspect -f \"{{.State.Status}}\" ${env.API_CONTAINER}").trim()
          def restarts = bat(returnStdout: true, script: "docker inspect -f \"{{.RestartCount}}\" ${env.API_CONTAINER}").trim()

          echo "API container status: ${status}"
          echo "API restart count: ${restarts}"

          if (status != "running") {
            echo "API is not running. Showing last 200 log lines:"
            bat "docker logs ${env.API_CONTAINER} --tail 200"
            error "Monitoring failed: API container is not running (status=${status})."
          }

          // Optional guardrail: too many restarts even if 'running'
          try {
            int rc = restarts.toInteger()
            if (rc >= 3) {
              echo "API restart count is high (${rc}). Showing logs:"
              bat "docker logs ${env.API_CONTAINER} --tail 200"
              error "Monitoring failed: API restart count too high (${rc})."
            }
          } catch (Exception e) {
            echo "Could not parse restart count. Raw value: ${restarts}"
          }
        }
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
      echo "FAILED: A mandatory stage failed. Review logs above."
    }
    unstable {
      echo "UNSTABLE: One or more OPTIONAL stages failed (Sonar/Trivy/Audit/Push)."
    }
  }
}
