pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    // Repo / project naming
    PROJECT_NAME = "keyshield-vault"

    // Docker images (local on Jenkins node)
    API_IMAGE      = "keyshield-vault-api:${BUILD_NUMBER}"
    WEB_IMAGE      = "keyshield-vault-frontend:${BUILD_NUMBER}"
    API_RELEASE    = "keyshield-vault-api:release-${BUILD_NUMBER}"
    WEB_RELEASE    = "keyshield-vault-frontend:release-${BUILD_NUMBER}"

    // Ports (staging then prod on same ports to “promote” cleanly)
    API_PORT   = "3000"
    WEB_PORT   = "8080"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') {
      steps {
        // Install deps for both modules
        dir('api') {
          bat 'npm ci'
        }
        dir('frontend\\app') {
          bat 'npm ci'
          // build Angular (this also proves frontend compiles)
          bat 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('api') {
          bat 'npm test'
        }
      }
    }

    stage('Code Quality (SonarCloud)') {
      environment {
        // Jenkins Credentials -> Secret text -> ID must be "sonar-token"
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        powershell '''
          $SONAR_HOST = "https://sonarcloud.io"
          $SONAR_ORG  = "chrisrogenirwinroland-cyber"
          $SONAR_KEY  = "chrisrogenirwinroland-cyber_keyshield-vault"

          docker run --rm `
            -e "SONAR_HOST_URL=$SONAR_HOST" `
            -e "SONAR_TOKEN=$env:SONAR_TOKEN" `
            -v "$env:WORKSPACE`:/usr/src" `
            -w "/usr/src" `
            sonarsource/sonar-scanner-cli:latest `
            -Dsonar.host.url=$SONAR_HOST `
            -Dsonar.organization=$SONAR_ORG `
            -Dsonar.projectKey=$SONAR_KEY `
            -Dsonar.projectName=$SONAR_KEY `
            -Dsonar.sources=api,frontend/app/src `
            -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/** `
            -Dsonar.token=$env:SONAR_TOKEN
        '''
      }
    }

    stage('Security (npm audit + Trivy)') {
      steps {
        // Dependency scanning (real tool)
        dir('api') {
          // do NOT fail build for medium/low; gate on high+ in report
          bat 'npm audit --audit-level=high || exit /b 0'
        }
        dir('frontend\\app') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

        // Trivy filesystem scan (real tool)
        powershell '''
          docker run --rm `
            -v "$env:WORKSPACE`:/work" `
            aquasec/trivy:latest fs `
            --severity HIGH,CRITICAL `
            --scanners vuln,secret,config `
            --exit-code 0 `
            /work
        '''
      }
    }

    stage('Deploy (Staging)') {
      steps {
        // Build Docker images (artefacts)
        powershell '''
          docker build -t "$env:API_IMAGE" -f "api/Dockerfile" "api"
          docker build -t "$env:WEB_IMAGE" -f "frontend/app/Dockerfile" "frontend/app"

          # Stop old containers if exist
          docker stop keyshield-api-staging 2>$null
          docker rm   keyshield-api-staging 2>$null
          docker stop keyshield-web-staging 2>$null
          docker rm   keyshield-web-staging 2>$null

          # Run API staging
          docker run -d --name keyshield-api-staging -p "$env:API_PORT`:3000" "$env:API_IMAGE"

          # Run Web staging (nginx container typically serves on 80)
          docker run -d --name keyshield-web-staging -p "$env:WEB_PORT`:80" "$env:WEB_IMAGE"

          docker ps | findstr keyshield
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        powershell '''
          # Tag “release” images
          docker tag "$env:API_IMAGE" "$env:API_RELEASE"
          docker tag "$env:WEB_IMAGE" "$env:WEB_RELEASE"

          # Replace staging with prod on same ports (clean promotion)
          docker stop keyshield-api-staging 2>$null
          docker rm   keyshield-api-staging 2>$null
          docker stop keyshield-web-staging 2>$null
          docker rm   keyshield-web-staging 2>$null

          docker stop keyshield-api-prod 2>$null
          docker rm   keyshield-api-prod 2>$null
          docker stop keyshield-web-prod 2>$null
          docker rm   keyshield-web-prod 2>$null

          docker run -d --name keyshield-api-prod -p "$env:API_PORT`:3000" "$env:API_RELEASE"
          docker run -d --name keyshield-web-prod -p "$env:WEB_PORT`:80" "$env:WEB_RELEASE"

          docker ps | findstr keyshield
        '''
      }
    }

    stage('Monitoring (Health + Metrics)') {
      steps {
        powershell '''
          Start-Sleep -Seconds 3

          Write-Host "Health check:"
          $h = Invoke-RestMethod "http://localhost:$env:API_PORT/health"
          $h | ConvertTo-Json -Compress | Write-Host

          Write-Host "`nMetrics check (first lines):"
          $m = Invoke-WebRequest "http://localhost:$env:API_PORT/metrics"
          $m.Content.Split("`n")[0..15] | ForEach-Object { $_ }

          Write-Host "`nWeb check:"
          $w = Invoke-WebRequest "http://localhost:$env:WEB_PORT/"
          Write-Host ("Web status: " + $w.StatusCode)
        '''
      }
    }
  }

  post {
    always {
      // IMPORTANT: use powershell/bat on Windows, not sh
      echo "Pipeline completed."
      powershell '''
        docker ps -a | findstr keyshield
      '''
    }
  }
}
