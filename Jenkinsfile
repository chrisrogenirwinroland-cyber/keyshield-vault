// Jenkinsfile — KeyShield Vault (Windows + Docker Desktop)
// Full CI/CD pipeline with Build, Test, Quality, Security, Push, Deploy, Monitoring validation

pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    choice(name: 'DEPLOY_ENV', choices: ['none', 'staging', 'prod'], description: 'Deploy using Docker Compose')
    booleanParam(name: 'PUSH_DOCKERHUB', defaultValue: true, description: 'Push images to DockerHub (requires credentials)')
    booleanParam(name: 'RUN_SONAR', defaultValue: true, description: 'Run SonarQube scan (requires scanner + token)')
    booleanParam(name: 'RUN_SNYK', defaultValue: false, description: 'Run Snyk scan (requires snyk + token)')
    booleanParam(name: 'RUN_TRIVY', defaultValue: true, description: 'Run Trivy image scan (requires trivy installed)')
  }

  environment {
    // Repo structure
    API_DIR = "api"
    FE_DIR  = "frontend\\app"

    // Compose file (adjust if you have separate staging/prod compose files)
    COMPOSE_FILE = "docker-compose.yml"

    // Docker repo names (namespace will be derived from authenticated DockerHub user)
    DOCKER_REPO_API = "keyshield-vault-api"
    DOCKER_REPO_FE  = "keyshield-vault-frontend"

    // Image tag
    DOCKER_TAG = "${BUILD_NUMBER}"

    // Jenkins Credentials IDs (create these in Jenkins > Manage Credentials)
    DOCKERHUB_CRED_ID = "dockerhub-creds"      // usernamePassword
    SONAR_TOKEN_CRED  = "sonar-token"          // secret text
    SNYK_TOKEN_CRED   = "snyk-token"           // secret text

    // Sonar settings (set SONAR_HOST_URL in Jenkins global env OR hardcode here)
    SONAR_HOST_URL = "http://localhost:9000"   // change to your SonarQube URL
    SONAR_PROJECT_KEY = "keyshield-vault"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        bat 'git --version'
        bat 'echo Workspace: %CD%'
      }
    }

    stage('Preflight (Tooling)') {
      steps {
        script {
          def dockerFound = (bat(returnStatus: true, script: 'where docker') == 0)
          def dockerOk    = (bat(returnStatus: true, script: 'docker version') == 0)
          if (!dockerFound || !dockerOk) {
            error("Docker is not available or Docker Desktop is not running on this Jenkins agent.")
          }

          // Prefer docker compose (v2)
          def composeOk = (bat(returnStatus: true, script: 'docker compose version') == 0)
          if (!composeOk) {
            error("docker compose is not available. Ensure Docker Desktop Compose v2 is installed.")
          }

          bat 'node --version'
          bat 'npm --version'
        }
      }
    }

    stage('Install Dependencies (API)') {
      steps {
        dir("${env.API_DIR}") {
          bat 'npm ci'
        }
      }
    }

    stage('Install Dependencies (Frontend)') {
      steps {
        dir("${env.FE_DIR}") {
          bat 'npm ci'
        }
      }
    }

    stage('Unit Tests (API)') {
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
            dir("${env.API_DIR}") {
              // If your package.json uses jest: "test": "jest"
              bat 'npm test'
            }
          }
        }
      }
    }

    stage('Unit Tests (Frontend)') {
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
            dir("${env.FE_DIR}") {
              // Angular common: ng test --watch=false --browsers=ChromeHeadless
              // This assumes Angular CLI exists in node_modules
              bat 'npx ng test --watch=false --browsers=ChromeHeadless'
            }
          }
        }
      }
    }

    stage('Code Quality (SonarQube) - Optional') {
      when { expression { return params.RUN_SONAR } }
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {

            // Requires sonar-scanner to be installed on agent OR accessible in PATH
            def scannerOk = (bat(returnStatus: true, script: 'where sonar-scanner') == 0)
            if (!scannerOk) {
              error("sonar-scanner not found in PATH. Install SonarScanner on the Jenkins agent.")
            }

            withCredentials([string(credentialsId: "${env.SONAR_TOKEN_CRED}", variable: 'SONAR_TOKEN')]) {
              // Minimal scan; adjust sources/exclusions as needed
              bat """
                sonar-scanner ^
                  -Dsonar.host.url=%SONAR_HOST_URL% ^
                  -Dsonar.login=%SONAR_TOKEN% ^
                  -Dsonar.projectKey=%SONAR_PROJECT_KEY% ^
                  -Dsonar.projectName=KeyShield-Vault ^
                  -Dsonar.sources=api,frontend ^
                  -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/.angular/** ^
                  -Dsonar.sourceEncoding=UTF-8
              """
            }
          }
        }
      }
    }

    stage('Security (Dependencies) - npm audit') {
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {
            dir("${env.API_DIR}") {
              bat 'npm audit --audit-level=high'
            }
          }
        }
      }
    }

    stage('Security (Snyk) - Optional') {
      when { expression { return params.RUN_SNYK } }
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {

            def snykOk = (bat(returnStatus: true, script: 'where snyk') == 0)
            if (!snykOk) {
              error("Snyk CLI not found in PATH. Install snyk on the Jenkins agent.")
            }

            withCredentials([string(credentialsId: "${env.SNYK_TOKEN_CRED}", variable: 'SNYK_TOKEN')]) {
              // Authenticate and scan both projects
              bat 'snyk auth %SNYK_TOKEN%'
              dir("${env.API_DIR}") { bat 'snyk test --severity-threshold=high' }
              dir("${env.FE_DIR}")  { bat 'snyk test --severity-threshold=high' }
            }
          }
        }
      }
    }

    stage('Build Artefacts (Docker Images)') {
      steps {
        script {
          // Build locally-tagged images; re-tag later for DockerHub namespace
          bat """
            echo Building API image...
            docker build -t %DOCKER_REPO_API%:%DOCKER_TAG% -f %API_DIR%\\Dockerfile %API_DIR%
          """
          bat """
            echo Building Frontend image...
            docker build -t %DOCKER_REPO_FE%:%DOCKER_TAG% -f %FE_DIR%\\Dockerfile %FE_DIR%
          """
        }
      }
    }

    stage('Security (Trivy Image Scan) - Optional') {
      when { expression { return params.RUN_TRIVY } }
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {

            def trivyOk = (bat(returnStatus: true, script: 'where trivy') == 0)
            if (!trivyOk) {
              error("Trivy not found in PATH. Install trivy on the Jenkins agent.")
            }

            // Scan local images; fail stage on HIGH/CRITICAL
            bat """
              echo Trivy scan API image...
              trivy image --exit-code 1 --severity HIGH,CRITICAL %DOCKER_REPO_API%:%DOCKER_TAG%
            """
            bat """
              echo Trivy scan Frontend image...
              trivy image --exit-code 1 --severity HIGH,CRITICAL %DOCKER_REPO_FE%:%DOCKER_TAG%
            """
          }
        }
      }
    }

    stage('Push Artefacts (DockerHub) - Optional') {
      when { expression { return params.PUSH_DOCKERHUB } }
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {

            withCredentials([usernamePassword(credentialsId: "${env.DOCKERHUB_CRED_ID}",
              usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {

              bat """
                echo Logging in to DockerHub...
                docker logout || exit /b 0
                echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
              """

              // Retag into authenticated namespace to avoid insufficient_scope
              bat """
                echo Tagging images under DockerHub namespace %DH_USER%...
                docker tag %DOCKER_REPO_API%:%DOCKER_TAG% %DH_USER%/%DOCKER_REPO_API%:%DOCKER_TAG%
                docker tag %DOCKER_REPO_FE%:%DOCKER_TAG%  %DH_USER%/%DOCKER_REPO_FE%:%DOCKER_TAG%
              """

              // Push build tag
              bat """
                echo Pushing API...
                docker push %DH_USER%/%DOCKER_REPO_API%:%DOCKER_TAG%
              """
              bat """
                echo Pushing Frontend...
                docker push %DH_USER%/%DOCKER_REPO_FE%:%DOCKER_TAG%
              """

              // Optional: also push latest on main branch builds
              if (env.BRANCH_NAME == null || env.BRANCH_NAME.toLowerCase() == 'main') {
                bat """
                  echo Tagging latest...
                  docker tag %DH_USER%/%DOCKER_REPO_API%:%DOCKER_TAG% %DH_USER%/%DOCKER_REPO_API%:latest
                  docker tag %DH_USER%/%DOCKER_REPO_FE%:%DOCKER_TAG%  %DH_USER%/%DOCKER_REPO_FE%:latest
                  docker push %DH_USER%/%DOCKER_REPO_API%:latest
                  docker push %DH_USER%/%DOCKER_REPO_FE%:latest
                """
              }
            }
          }
        }
      }
    }

    stage('Deploy (Docker Compose) - Optional') {
      when { expression { return params.DEPLOY_ENV != 'none' } }
      steps {
        script {
          // Uses local compose file; expects services wired to your images or build contexts
          // If your compose uses build: it will rebuild; if it uses image: it will pull/launch.
          // Keep it deterministic by using the just-built local images if compose uses build contexts.

          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {

            bat """
              echo Deploying environment: ${params.DEPLOY_ENV}
              echo Using compose file: %COMPOSE_FILE%

              docker compose -f %COMPOSE_FILE% down --remove-orphans || exit /b 0
              docker compose -f %COMPOSE_FILE% up -d --build
              docker compose -f %COMPOSE_FILE% ps
            """
          }
        }
      }
    }

    stage('Continuous Monitoring Validation - Optional') {
      when { expression { return params.DEPLOY_ENV != 'none' } }
      steps {
        script {
          catchError(buildResult: 'UNSTABLE', stageResult: 'FAILURE') {

            // Adjust ports/URLs to match your compose mapping
            def healthUrl  = "http://localhost:3000/health"
            def metricsUrl = "http://localhost:3000/metrics"

            // Robust retry with PowerShell (no external deps)
            bat """
              powershell -NoProfile -ExecutionPolicy Bypass -Command ^
                "$ErrorActionPreference='Stop'; ^
                 $health='${healthUrl}'; ^
                 $metrics='${metricsUrl}'; ^
                 for($i=1;$i -le 12;$i++){ ^
                   try{ ^
                     Write-Host ('Checking health attempt ' + $i); ^
                     $r = Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 5; ^
                     if($r.StatusCode -eq 200){ Write-Host 'Health OK'; break } ^
                   } catch { Start-Sleep -Seconds 5 } ^
                   if($i -eq 12){ throw 'Health endpoint not responding' } ^
                 }; ^
                 Write-Host 'Checking metrics...'; ^
                 $m = Invoke-WebRequest -UseBasicParsing -Uri $metrics -TimeoutSec 5; ^
                 if($m.StatusCode -ne 200){ throw 'Metrics endpoint not responding' } ^
                 Write-Host 'Metrics OK';"
            """

            // Show container status for evidence
            bat 'docker ps'
          }
        }
      }
    }

  } // stages

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
    }
    unstable {
      echo "UNSTABLE: One or more optional quality/security/deploy steps failed. Core pipeline stages may still be successful."
    }
    failure {
      echo "FAILED: A mandatory stage failed (preflight/build). Review stage logs."
    }
    cleanup {
      // Keep off by default if you need evidence; uncomment if desired:
      // cleanWs()
    }
  }
}
