pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
  }

  environment {
    // ---- Docker / Image Naming ----
    DOCKERHUB_USER   = 'YOUR_DOCKERHUB_USERNAME'   // change
    API_IMAGE        = "${DOCKERHUB_USER}/keyshield-api"
    FE_IMAGE         = "${DOCKERHUB_USER}/keyshield-frontend"
    IMAGE_TAG        = "${BUILD_NUMBER}"

    // ---- SonarCloud (optional) ----
    // Configure in Jenkins: Manage Jenkins -> Credentials
    // SONAR_TOKEN_ID  = 'sonarcloud-token'         // optional
    // SONAR_ORG       = 'your-org'                 // optional
    // SONAR_PROJECT   = 'your-project'             // optional

    // ---- Trivy (optional) ----
    TRIVY_CACHE_DIR  = "${WORKSPACE}\\.trivycache"

    // ---- Compose ----
    COMPOSE_FILE     = 'docker-compose.yml'
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        bat '''
          echo ===== GIT STATUS =====
          git --version
          git rev-parse --short HEAD
          git status
        '''
      }
    }

    stage('Preflight') {
      steps {
        bat '''
          echo ===== TOOL VERSIONS =====
          where node
          node -v
          npm -v
          where docker
          docker version
        '''
      }
    }

    stage('Install & Unit Tests - API') {
      steps {
        dir('api') {
          bat '''
            echo ===== API INSTALL =====
            if exist package-lock.json (
              npm ci
            ) else (
              npm install
            )

            echo ===== API TEST =====
            REM Run tests only if defined
            node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.test?0:1)" || (
              echo No test script in API package.json - skipping
              exit /b 0
            )
            npm test
          '''
        }
      }
    }

    stage('Install & Unit Tests - Frontend') {
      steps {
        // IMPORTANT: Angular app lives here
        dir('frontend\\app') {
          bat '''
            echo ===== FE INSTALL =====
            if exist package-lock.json (
              npm ci
            ) else (
              npm install
            )

            echo ===== FE TEST =====
            node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.test?0:1)" || (
              echo No test script in Frontend package.json - skipping
              exit /b 0
            )
            npm test
          '''
        }
      }
    }

    stage('Build - Frontend') {
      steps {
        dir('frontend\\app') {
          bat '''
            echo ===== FE BUILD =====
            node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.build?0:1)" || (
              echo No build script in Frontend package.json - skipping build
              exit /b 0
            )
            npm run build
          '''
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        bat """
          echo ===== DOCKER BUILD =====

          REM Build API image (Dockerfile in api/)
          docker build -t %API_IMAGE%:%IMAGE_TAG% -f api\\Dockerfile api

          REM Build Frontend image (Dockerfile in frontend/app/)
          docker build -t %FE_IMAGE%:%IMAGE_TAG% -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    // ---------------- OPTIONAL QUALITY: SonarCloud ----------------
    // Enable only if you have sonar-scanner installed/configured & token set.
    /*
    stage('Code Quality - SonarCloud') {
      steps {
        withCredentials([string(credentialsId: env.SONAR_TOKEN_ID, variable: 'SONAR_TOKEN')]) {
          bat """
            echo ===== SONARCLOUD SCAN =====
            sonar-scanner ^
              -Dsonar.organization=%SONAR_ORG% ^
              -Dsonar.projectKey=%SONAR_PROJECT% ^
              -Dsonar.sources=. ^
              -Dsonar.host.url=https://sonarcloud.io ^
              -Dsonar.login=%SONAR_TOKEN%
          """
        }
      }
    }
    */

    // ---------------- OPTIONAL SECURITY: Trivy ----------------
    stage('Security - Trivy FS Scan (vuln+misconfig)') {
      when { expression { return fileExists('docker-compose.yml') } }
      steps {
        bat '''
          echo ===== TRIVY FS SCAN =====
          if not exist "%TRIVY_CACHE_DIR%" mkdir "%TRIVY_CACHE_DIR%"

          trivy --version || (
            echo Trivy not found on agent. Skipping FS scan.
            exit /b 0
          )

          trivy fs --cache-dir "%TRIVY_CACHE_DIR%" --scanners vuln,misconfig --severity HIGH,CRITICAL --exit-code 0 .
        '''
      }
    }

    stage('Security - Trivy Image Scan') {
      steps {
        bat '''
          echo ===== TRIVY IMAGE SCAN =====
          trivy --version || (
            echo Trivy not found on agent. Skipping image scan.
            exit /b 0
          )

          trivy image --cache-dir "%TRIVY_CACHE_DIR%" --severity HIGH,CRITICAL --exit-code 0 %API_IMAGE%:%IMAGE_TAG%
          trivy image --cache-dir "%TRIVY_CACHE_DIR%" --severity HIGH,CRITICAL --exit-code 0 %FE_IMAGE%:%IMAGE_TAG%
        '''
      }
    }

    // ---------------- OPTIONAL PUSH: Docker Hub ----------------
    stage('Push Images (Docker Hub)') {
      when { expression { return env.DOCKERHUB_USER?.trim() } }
      steps {
        // Create Jenkins credential: usernamePassword, id: dockerhub-creds
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat '''
            echo ===== DOCKER LOGIN =====
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            echo ===== DOCKER PUSH =====
            docker push %API_IMAGE%:%IMAGE_TAG%
            docker push %FE_IMAGE%:%IMAGE_TAG%
          '''
        }
      }
    }

    // ---------------- DEPLOY: docker-compose ----------------
    stage('Deploy - Docker Compose') {
      when { expression { return fileExists(env.COMPOSE_FILE) } }
      steps {
        bat '''
          echo ===== DEPLOY COMPOSE =====
          docker compose version || (
            echo Docker Compose V2 not found. Trying docker-compose...
            docker-compose --version || exit /b 1
          )

          REM Pull (optional) and up
          docker compose -f "%COMPOSE_FILE%" up -d --build || docker-compose -f "%COMPOSE_FILE%" up -d --build
        '''
      }
    }

    stage('Smoke Check') {
      when { expression { return fileExists(env.COMPOSE_FILE) } }
      steps {
        bat '''
          echo ===== SMOKE CHECK =====
          REM Adjust URLs/ports to your app
          powershell -Command ^
            "try { ^
              $r = Invoke-WebRequest -UseBasicParsing http://localhost:4200 -TimeoutSec 20; ^
              Write-Host 'Frontend OK:' $r.StatusCode ^
            } catch { ^
              Write-Host 'Frontend smoke failed'; exit 1 ^
            }"
        '''
      }
    }
  }

  post {
    always {
      bat '''
        echo ===== POST: DOCKER PS =====
        docker ps
      '''
    }
    failure {
      echo 'Pipeline failed. Check stage logs for the root cause.'
    }
    success {
      echo 'Pipeline completed successfully.'
    }
  }
}
