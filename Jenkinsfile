pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    PROJECT_NAME = "keyshield-vault"

    API_IMAGE   = "keyshield-vault-api:${BUILD_NUMBER}"
    WEB_IMAGE   = "keyshield-vault-frontend:${BUILD_NUMBER}"
    API_RELEASE = "keyshield-vault-api:release-${BUILD_NUMBER}"
    WEB_RELEASE = "keyshield-vault-frontend:release-${BUILD_NUMBER}"

    API_PORT = "3000"
    WEB_PORT = "8080"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') {
      steps {
        dir('api') {
          bat 'npm ci'
        }
        dir('frontend\\app') {
          bat 'npm ci'
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
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        powershell '''
          $SONAR_HOST = "https://sonarcloud.io"
          $SONAR_ORG  = "chrisrogenirwinroland-cyber"
          $SONAR_KEY  = "chrisrogenirwinroland-cyber_keyshield-vault"

          # Build docker args safely (no PowerShell parsing issues)
          $args = @(
            "run","--rm",
            "-e","SONAR_HOST_URL=$SONAR_HOST",
            "-e","SONAR_TOKEN=$env:SONAR_TOKEN",
            "-v","$env:WORKSPACE`:/usr/src",
            "-w","/usr/src",
            "sonarsource/sonar-scanner-cli:latest",
            "-Dsonar.host.url=$SONAR_HOST",
            "-Dsonar.organization=$SONAR_ORG",
            "-Dsonar.projectKey=$SONAR_KEY",
            "-Dsonar.projectName=$SONAR_KEY",
            "-Dsonar.sources=api,frontend/app/src",
            "-Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**",
            "-Dsonar.token=$env:SONAR_TOKEN"
          )

          & docker @args
        '''
      }
    }

    stage('Security (npm audit + Trivy)') {
      steps {
        dir('api') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }
        dir('frontend\\app') {
          bat 'npm audit --audit-level=high || exit /b 0'
        }

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
        powershell '''
          docker build -t "$env:API_IMAGE" -f "api/Dockerfile" "api"
          docker build -t "$env:WEB_IMAGE" -f "frontend/app/Dockerfile" "frontend/app"

          docker stop keyshield-api-staging 2>$null
          docker rm   keyshield-api-staging 2>$null
          docker stop keyshield-web-staging 2>$null
          docker rm   keyshield-web-staging 2>$null

          docker run -d --name keyshield-api-staging -p "$env:API_PORT`:3000" "$env:API_IMAGE"
          docker run -d --name keyshield-web-staging -p "$env:WEB_PORT`:80" "$env:WEB_IMAGE"

          docker ps | Select-String keyshield
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        powershell '''
          docker tag "$env:API_IMAGE" "$env:API_RELEASE"
          docker tag "$env:WEB_IMAGE" "$env:WEB_RELEASE"

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

          docker ps | Select-String keyshield
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
      echo "Pipeline completed."

      // IMPORTANT: never fail in post if no matches
      powershell '''
        docker ps -a | Out-String | Write-Host
        exit 0
      '''
    }
  }
}
