
pipeline {
  agent any

  options {
    timestamps()
    skipDefaultCheckout(true)
    buildDiscarder(logRotator(numToKeepStr: '10'))
    disableConcurrentBuilds()
  }

  parameters {
    booleanParam(name: 'RUN_SONAR', defaultValue: false, description: 'Run SonarCloud (requires sonarcloud-token credential)')
    booleanParam(name: 'RUN_TRIVY', defaultValue: true,  description: 'Run Trivy filesystem scan (pulls aquasec/trivy)')
    booleanParam(name: 'BUILD_DOCKER', defaultValue: true, description: 'Build Docker images if Dockerfiles exist')
    booleanParam(name: 'PUSH_DOCKER', defaultValue: false, description: 'Push Docker images to DockerHub (requires dockerhub-creds)')
    booleanParam(name: 'DEPLOY_STAGING', defaultValue: false, description: 'Optional deploy stage (customize commands)')
  }

  environment {
    // Update these if you later enable SonarCloud
    SONAR_ORG  = 'YOUR_SONAR_ORG'
    SONAR_KEY  = 'YOUR_SONAR_PROJECT_KEY'

    // Docker image naming
    DOCKER_USER = 'rogen7spark'
    IMAGE_TAG   = "${env.BUILD_NUMBER}"
    API_IMAGE   = "${DOCKER_USER}/keyshield-vault-api:${env.BUILD_NUMBER}"
    FE_IMAGE    = "${DOCKER_USER}/keyshield-vault-frontend:${env.BUILD_NUMBER}"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        bat 'echo WORKSPACE=%CD%'
      }
    }

    stage('Preflight (Tools)') {
      steps {
        bat 'node -v'
        bat 'npm -v'
        bat 'where docker || exit /b 0'
        bat 'docker version || exit /b 0'
      }
    }

    stage('Build') {
      steps {
        echo 'API: npm ci'
        dir('api') {
          bat 'npm ci'
        }

        echo 'Frontend: npm ci + build'
        dir('frontend\\app') {
          bat 'npm ci'
          bat 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        echo 'API: jest tests'
        dir('api') {
          bat 'npm test'
        }
      }
    }

    stage('Code Quality (SonarCloud) - OPTIONAL') {
      when { expression { return params.RUN_SONAR } }
      steps {
        script {
          // Option A rule: NEVER make build UNSTABLE/FAIL if Sonar is missing
          try {
            withCredentials([string(credentialsId: 'sonarcloud-token', variable: 'SONAR_TOKEN')]) {
              // If you have sonar-scanner installed globally, you can call sonar-scanner directly.
              // This uses npx to avoid requiring a global install.
              bat """
                echo Running SonarCloud scan...
                npx -y sonar-scanner ^
                  -Dsonar.organization=%SONAR_ORG% ^
                  -Dsonar.projectKey=%SONAR_KEY% ^
                  -Dsonar.sources=. ^
                  -Dsonar.host.url=https://sonarcloud.io ^
                  -Dsonar.login=%SONAR_TOKEN%
              """
            }
          } catch (e) {
            echo "Skipping SonarCloud: credential 'sonarcloud-token' not configured or scan failed."
          }
        }
      }
    }

    stage('Security (npm audit + Trivy) - OPTIONAL') {
      steps {
        echo 'npm audit (API) - do not fail build'
        dir('api') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        echo 'npm audit (Frontend) - do not fail build'
        dir('frontend\\app') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        script {
          if (!params.RUN_TRIVY) {
            echo 'Trivy disabled by parameter.'
            return
          }

          // Option A rule: Trivy must never fail the build
          try {
            bat 'echo Pulling Trivy...'
            bat 'docker pull aquasec/trivy:latest'

            bat """
              echo Running Trivy filesystem scan...
              docker run --rm ^
                -v "%CD%:/work" ^
                aquasec/trivy:latest fs /work ^
                --timeout 20m ^
                --scanners vuln,misconfig ^
                --skip-dirs /work/**/node_modules ^
                --skip-dirs /work/**/dist ^
                --skip-dirs /work/**/coverage ^
                --exit-code 0
            """
          } catch (e) {
            echo 'Trivy step skipped/failed but build remains SUCCESS (Option A).'
          }
        }
      }
    }

    stage('Build Artefact (Docker Images) - OPTIONAL') {
      when { expression { return params.BUILD_DOCKER } }
      steps {
        script {
          // This matches your repo reality: there is NO api/Dockerfile and NO frontend/app/Dockerfile in your logs.
          // We only build if Dockerfiles exist.
          echo 'Checking Dockerfile locations...'
          bat 'dir api || exit /b 0'
          bat 'dir frontend\\app || exit /b 0'

          def apiDockerfile = 'api/Dockerfile'
          def feDockerfile  = 'frontend/app/Dockerfile'

          if (fileExists(apiDockerfile)) {
            echo "Building API image: ${env.API_IMAGE}"
            bat "docker build -t ${env.API_IMAGE} -f ${apiDockerfile} api"
          } else {
            echo "API Dockerfile not found at ${apiDockerfile} (skipping API image)."
          }

          if (fileExists(feDockerfile)) {
            echo "Building Frontend image: ${env.FE_IMAGE}"
            bat "docker build -t ${env.FE_IMAGE} -f ${feDockerfile} frontend\\app"
          } else {
            echo "Frontend Dockerfile not found at ${feDockerfile} (skipping FE image)."
          }
        }
      }
    }

    stage('Push Artefact (DockerHub) - OPTIONAL') {
      when { expression { return params.PUSH_DOCKER } }
      steps {
        script {
          // Option A rule: push must never mark build unstable/fail
          try {
            withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
              bat """
                echo Logging in to DockerHub...
                docker logout || exit /b 0
                echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
              """

              if (params.BUILD_DOCKER && fileExists('api/Dockerfile')) {
                bat "docker push ${env.API_IMAGE}"
              } else {
                echo 'No API image built, skipping push.'
              }

              if (params.BUILD_DOCKER && fileExists('frontend/app/Dockerfile')) {
                bat "docker push ${env.FE_IMAGE}"
              } else {
                echo 'No FE image built, skipping push.'
              }
            }
          } catch (e) {
            echo "Skipping Docker push: credential 'dockerhub-creds' not configured or push failed."
          }
        }
      }
    }

    stage('Deploy (Staging) - OPTIONAL') {
      when { expression { return params.DEPLOY_STAGING } }
      steps {
        script {
          // Customize this to your environment (docker compose, kubectl, etc.)
          // Option A rule: deployment should not break your build if it's only a demo run.
          try {
            echo 'Deploying to staging (placeholder)...'
            // Example (if you add docker-compose.yml later):
            // bat 'docker compose up -d --build'
          } catch (e) {
            echo 'Deploy failed/skipped but build remains SUCCESS (Option A).'
          }
        }
      }
    }
  }

  post {
    always {
      echo "Pipeline completed. Workspace: ${env.WORKSPACE}"
      bat 'docker ps || exit /b 0'
    }
    success {
      echo 'SUCCESS: Core stages (build + test) completed.'
    }
    failure {
      echo 'FAILURE: A required stage failed (Build/Test/Checkout).'
    }
  }
}
