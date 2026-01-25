pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    ansiColor('xterm')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  triggers {
    // Example: every 30 mins
    pollSCM('H/2 * * * *')
  }

  environment {
    // ---------------------------
    // Repo / Docker / App settings
    // ---------------------------
    APP_NAME              = "keyshield-vault"
    DOCKERHUB_NAMESPACE   = "chrisrogenirwinroland"
    API_IMAGE             = "${DOCKERHUB_NAMESPACE}/keyshield-vault-api"
    FE_IMAGE              = "${DOCKERHUB_NAMESPACE}/keyshield-vault-frontend"

    // Use Jenkins build number for tag. You can also use Git SHA if you prefer.
    IMAGE_TAG             = "${BUILD_NUMBER}"

    // ---------------------------
    // Paths inside your repo (adjust!)
    // ---------------------------
    API_DIR               = "api"        // folder containing API package.json and Dockerfile
    FE_DIR                = "frontend"   // folder containing Frontend package.json and Dockerfile
    COMPOSE_FILE          = "docker-compose.yml"

    // ---------------------------
    // SonarCloud (optional)
    // ---------------------------
    // Create in Jenkins: Credentials -> "sonarcloud-token" (Secret text)
    SONARCLOUD_TOKEN_CRED = "sonarcloud-token"
    SONAR_ORG             = "YOUR_SONARCLOUD_ORG"         // e.g. hardhat-enterprises
    SONAR_PROJECT_KEY     = "YOUR_SONAR_PROJECT_KEY"      // e.g. keyshield-vault

    // ---------------------------
    // Docker Hub credentials (optional push)
    // ---------------------------
    // Create in Jenkins: Credentials -> "dockerhub-creds" (Username + Password)
    DOCKERHUB_CRED        = "dockerhub-creds"

    // Trivy settings
    TRIVY_IMAGE           = "aquasec/trivy:latest"
    TRIVY_TIMEOUT         = "20m"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        bat """
          echo ===== GIT STATUS =====
          git --version
          git rev-parse --short HEAD
          git status
        """
      }
    }

    stage('Preflight') {
      steps {
        bat """
          echo ===== TOOL VERSIONS =====
          where node
          node -v
          npm -v
          docker -v
          docker info
        """
      }
    }

    stage('Install & Unit Tests - API') {
      steps {
        dir("${API_DIR}") {
          bat """
            echo ===== API INSTALL =====
            npm ci
            echo ===== API TEST =====
            npm test
          """
        }
      }
    }

    stage('Install & Unit Tests - Frontend') {
      steps {
        dir("${FE_DIR}") {
          bat """
            echo ===== FE INSTALL =====
            npm ci
            echo ===== FE TEST =====
            npm test
          """
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        bat """
          echo ===== BUILD API IMAGE =====
          docker build -t %API_IMAGE%:%IMAGE_TAG% -f %API_DIR%\\Dockerfile %API_DIR%

          echo ===== BUILD FE IMAGE =====
          docker build -t %FE_IMAGE%:%IMAGE_TAG% -f %FE_DIR%\\Dockerfile %FE_DIR%

          echo ===== LIST IMAGES =====
          docker images | findstr /I "%DOCKERHUB_NAMESPACE%/keyshield-vault"
        """
      }
    }

    stage('Code Quality - SonarCloud') {
      when {
        expression { return env.SONAR_ORG?.trim() && env.SONAR_PROJECT_KEY?.trim() }
      }
      steps {
        withCredentials([string(credentialsId: "${SONARCLOUD_TOKEN_CRED}", variable: 'SONAR_TOKEN')]) {
          // Requires sonar-scanner installed on agent, or use npx sonar-scanner in JS projects.
          // If you don't have sonar-scanner installed, switch to "npx sonar-scanner" approach.
          bat """
            echo ===== SONARCLOUD SCAN =====
            echo Make sure sonar-scanner is available on PATH.
            sonar-scanner ^
              -Dsonar.organization=%SONAR_ORG% ^
              -Dsonar.projectKey=%SONAR_PROJECT_KEY% ^
              -Dsonar.sources=. ^
              -Dsonar.host.url=https://sonarcloud.io ^
              -Dsonar.login=%SONAR_TOKEN%
          """
        }
      }
    }

    stage('Security - Trivy FS Scan (vuln+misconfig)') {
      steps {
        // Mount workspace into /work and scan filesystem.
        // --exit-code 0 keeps pipeline green while still producing findings for evidence.
        bat """
          echo ===== TRIVY FS SCAN =====
          docker run --rm -v "%CD%:/work" %TRIVY_IMAGE% ^
            fs /work ^
            --scanners vuln,misconfig ^
            --timeout %TRIVY_TIMEOUT% ^
            --exit-code 0
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        // This avoids Docker daemon socket problems: save images -> scan via --input tar
        bat """
          echo ===== DOCKER SAVE (TAR) =====
          docker save -o api_%IMAGE_TAG%.tar %API_IMAGE%:%IMAGE_TAG%
          docker save -o fe_%IMAGE_TAG%.tar %FE_IMAGE%:%IMAGE_TAG%

          echo ===== TRIVY IMAGE SCAN (API TAR) =====
          docker run --rm -v "%CD%:/work" %TRIVY_IMAGE% ^
            image --input /work/api_%IMAGE_TAG%.tar ^
            --timeout %TRIVY_TIMEOUT% ^
            --exit-code 0

          echo ===== TRIVY IMAGE SCAN (FE TAR) =====
          docker run --rm -v "%CD%:/work" %TRIVY_IMAGE% ^
            image --input /work/fe_%IMAGE_TAG%.tar ^
            --timeout %TRIVY_TIMEOUT% ^
            --exit-code 0
        """
      }
      post {
        always {
          // Keep scan artifacts if you want (tar files). Optional cleanup:
          bat """
            echo ===== CLEAN TAR (OPTIONAL) =====
            del /Q api_%IMAGE_TAG%.tar 2>nul
            del /Q fe_%IMAGE_TAG%.tar 2>nul
          """
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      when {
        expression { return env.DOCKERHUB_NAMESPACE?.trim() }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKERHUB_CRED}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo ===== DOCKER LOGIN =====
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            echo ===== PUSH API =====
            docker push %API_IMAGE%:%IMAGE_TAG%

            echo ===== PUSH FE =====
            docker push %FE_IMAGE%:%IMAGE_TAG%

            echo ===== DOCKER LOGOUT =====
            docker logout
          """
        }
      }
    }

    stage('Deploy - Docker Compose') {
      steps {
        // If your compose file references fixed tags, update it to use ${IMAGE_TAG},
        // OR overwrite env vars at runtime (recommended).
        bat """
          echo ===== DEPLOY WITH DOCKER COMPOSE =====
          if not exist "%COMPOSE_FILE%" (
            echo ERROR: %COMPOSE_FILE% not found in repo root.
            exit /b 1
          )

          REM Pass image tags via environment variables used in docker-compose.yml
          set API_IMAGE=%API_IMAGE%
          set FE_IMAGE=%FE_IMAGE%
          set IMAGE_TAG=%IMAGE_TAG%

          docker compose -f %COMPOSE_FILE% down
          docker compose -f %COMPOSE_FILE% up -d

          echo ===== CONTAINER STATUS =====
          docker ps
        """
      }
    }

    stage('Smoke Check') {
      steps {
        // Adjust ports/endpoints to match your app.
        // This is a basic local check; replace with your real health endpoints.
        bat """
          echo ===== SMOKE CHECK (EDIT URLS) =====
          REM Example:
          REM powershell -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:3000/health).StatusCode } catch { exit 1 }"
          echo Update this stage to hit your /health endpoints.
        """
      }
    }
  }

  post {
    always {
      bat """
        echo ===== POST: DOCKER PS =====
        docker ps
      """
    }
    success {
      echo "Pipeline completed successfully."
    }
    failure {
      echo "Pipeline failed. Check stage logs for the root cause."
    }
  }
}
