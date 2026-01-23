pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    // ---- Container names ----
    API_STAGING_NAME   = "keyshield-api-staging"
    API_PROD_NAME      = "keyshield-api-prod"

    WEB_STAGING_NAME   = "keyshield-web-staging"
    WEB_PROD_NAME      = "keyshield-web-prod"

    // ---- Ports on Jenkins host ----
    API_STAGING_PORT   = "3000"
    API_PROD_PORT      = "3001"

    WEB_STAGING_PORT   = "4200"
    WEB_PROD_PORT      = "4201"

    // ---- Ports inside containers ----
    API_CONTAINER_PORT = "3000"
    WEB_CONTAINER_PORT = "80"

    // ---- Docker image tags ----
    API_IMAGE_BUILD    = "keyshield-vault-api:${BUILD_NUMBER}"
    API_IMAGE_RELEASE  = "keyshield-vault-api:release-${BUILD_NUMBER}"

    WEB_IMAGE_BUILD    = "keyshield-vault-frontend:${BUILD_NUMBER}"
    WEB_IMAGE_RELEASE  = "keyshield-vault-frontend:release-${BUILD_NUMBER}"

    // SonarQube URL (local SonarQube)
    // If you run SonarQube in Docker on the same machine: http://host.docker.internal:9000 works on Windows.
    SONAR_HOST_URL     = "http://host.docker.internal:9000"
    SONAR_PROJECT_KEY  = "KeyShield-Vault"
    SONAR_PROJECT_NAME = "KeyShield-Vault"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    // ----------------------------
    // BUILD
    // ----------------------------
    stage('Build (Dependencies)') {
      steps {
        dir('api') {
          bat 'npm ci'
        }
        dir('frontend\\app') {
          bat 'npm ci'
        }
      }
    }

    // ----------------------------
    // TEST
    // ----------------------------
    stage('Test (Jest)') {
      steps {
        dir('api') {
          bat 'npm test'
        }
      }
    }

    // ----------------------------
    // CODE QUALITY (SonarQube via Docker scanner)
    // ----------------------------
    stage('Code Quality (SonarQube Scan - Docker)') {
      environment {
        // Create Jenkins credential (Secret text) with id: sonar-token
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        powershell '''
          $args = @(
            "run","--rm",
            "-e","SONAR_HOST_URL=$env:SONAR_HOST_URL",
            "-e","SONAR_TOKEN=$env:SONAR_TOKEN",
            "-v","$env:WORKSPACE`:/usr/src",
            "-w","/usr/src",
            "sonarsource/sonar-scanner-cli:latest",
            "-Dsonar.projectKey=$env:SONAR_PROJECT_KEY",
            "-Dsonar.projectName=$env:SONAR_PROJECT_NAME",
            "-Dsonar.sources=api,frontend/app/src",
            "-Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**",
            "-Dsonar.login=$env:SONAR_TOKEN"
          )
          & docker @args
        '''
      }
    }

    // ----------------------------
    // SECURITY
    // ----------------------------
    stage('Security (npm audit + Trivy)') {
      steps {
        dir('api') {
          // Don’t fail the whole build if audit finds issues; you will explain in report
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        // Trivy image scan after image build stage will be more meaningful,
        // but we can also do FS scan now if you want.
      }
    }

    // ----------------------------
    // BUILD ARTEFACTS (Docker Images)
    // ----------------------------
    stage('Build Artefact (Docker Images)') {
      steps {
        // API image
        powershell '''
          docker build -t $env:API_IMAGE_BUILD -f api\\Dockerfile api
          docker images | Select-String keyshield-vault-api
        '''

        // Frontend image
        powershell '''
          docker build -t $env:WEB_IMAGE_BUILD -f frontend\\app\\Dockerfile frontend\\app
          docker images | Select-String keyshield-vault-frontend
        '''

        // Optional: Trivy scan the built images (real security tool)
        powershell '''
          docker run --rm aquasec/trivy:latest image $env:API_IMAGE_BUILD  | Out-Host
          docker run --rm aquasec/trivy:latest image $env:WEB_IMAGE_BUILD  | Out-Host
        '''
      }
    }

    // ----------------------------
    // DEPLOY (STAGING)
    // ----------------------------
    stage('Deploy (Staging)') {
      steps {
        powershell '''
          # API staging
          docker stop $env:API_STAGING_NAME 2>$null
          docker rm   $env:API_STAGING_NAME 2>$null
          docker run -d --name $env:API_STAGING_NAME -p "$env:API_STAGING_PORT`:$env:API_CONTAINER_PORT" $env:API_IMAGE_BUILD
          docker ps | Select-String $env:API_STAGING_NAME

          # Web staging
          docker stop $env:WEB_STAGING_NAME 2>$null
          docker rm   $env:WEB_STAGING_NAME 2>$null
          docker run -d --name $env:WEB_STAGING_NAME -p "$env:WEB_STAGING_PORT`:$env:WEB_CONTAINER_PORT" $env:WEB_IMAGE_BUILD
          docker ps | Select-String $env:WEB_STAGING_NAME
        '''
      }
    }

    // ----------------------------
    // MONITORING (STAGING)
    // ----------------------------
    stage('Monitoring (Staging Health + Metrics)') {
      steps {
        powershell '''
          Start-Sleep -Seconds 3

          Write-Host "STAGING API /health"
          $resp = Invoke-RestMethod http://localhost:$env:API_STAGING_PORT/health
          $resp | ConvertTo-Json -Compress | Write-Host

          Write-Host "STAGING API /metrics (first 10 lines)"
          $m = Invoke-WebRequest http://localhost:$env:API_STAGING_PORT/metrics
          ($m.Content -split "`n" | Select-Object -First 10) | ForEach-Object { Write-Host $_ }
        '''
      }
    }

    // ----------------------------
    // RELEASE (PROMOTE TO PROD)
    // ----------------------------
    stage('Release (Promote to Prod)') {
      steps {
        powershell '''
          docker tag $env:API_IMAGE_BUILD $env:API_IMAGE_RELEASE
          docker tag $env:WEB_IMAGE_BUILD $env:WEB_IMAGE_RELEASE

          # API prod
          docker stop $env:API_PROD_NAME 2>$null
          docker rm   $env:API_PROD_NAME 2>$null
          docker run -d --name $env:API_PROD_NAME -p "$env:API_PROD_PORT`:$env:API_CONTAINER_PORT" $env:API_IMAGE_RELEASE
          docker ps | Select-String $env:API_PROD_NAME

          # Web prod
          docker stop $env:WEB_PROD_NAME 2>$null
          docker rm   $env:WEB_PROD_NAME 2>$null
          docker run -d --name $env:WEB_PROD_NAME -p "$env:WEB_PROD_PORT`:$env:WEB_CONTAINER_PORT" $env:WEB_IMAGE_RELEASE
          docker ps | Select-String $env:WEB_PROD_NAME
        '''
      }
    }

    // ----------------------------
    // MONITORING (PROD)
    // ----------------------------
    stage('Monitoring (Prod Health Check)') {
      steps {
        powershell '''
          Start-Sleep -Seconds 3
          try {
            Write-Host "PROD API /health"
            $resp = Invoke-RestMethod http://localhost:$env:API_PROD_PORT/health
            $resp | ConvertTo-Json -Compress | Write-Host

            Write-Host "PROD API /metrics (first 10 lines)"
            $m = Invoke-WebRequest http://localhost:$env:API_PROD_PORT/metrics
            ($m.Content -split "`n" | Select-Object -First 10) | ForEach-Object { Write-Host $_ }
          } catch {
            Write-Host "ALERT: PROD health/metrics check FAILED"
            exit 1
          }
        '''
      }
    }
  }

  post {
    always {
      echo "Pipeline completed."

      // Avoid the MissingContextVariableException by NOT calling sh/bat here unless workspace exists
      script {
        if (env.WORKSPACE) {
          echo "Workspace OK: ${env.WORKSPACE}"
        } else {
          echo "No workspace context in post; skipping shell cleanup."
        }
      }
    }
  }
}
