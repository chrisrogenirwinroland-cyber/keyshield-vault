pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    skipDefaultCheckout(true)
  }

  environment {
    // ---- Adjust to your naming ----
    DOCKERHUB_USER     = 'rogen7spark'
    API_IMAGE          = 'rogen7spark/keyshield-vault-api'
    WEB_IMAGE          = 'rogen7spark/keyshield-vault-web'

    // Sonar identifiers (from your logs)
    SONAR_ORG          = 'chrisrogenirwinroland-cyber'
    SONAR_PROJECT_KEY  = 'chrisrogenirwinroland-cyber_keyshield-vault'

    // Local report folder
    REPORTS_DIR        = 'reports'
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        checkout scm

        script {
          env.GIT_SHA = bat(returnStdout: true, script: 'git rev-parse --short=7 HEAD').trim()
          env.IMAGE_TAG = env.GIT_SHA
          echo "Resolved GIT_SHA=${env.GIT_SHA}"
          echo "Resolved IMAGE_TAG=${env.IMAGE_TAG}"
        }

        bat '''
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short=7 HEAD
          git log -1 --oneline
          git status --porcelain
        '''
      }
    }

    stage('Preflight (Toolchain Verification)') {
      steps {
        bat '''
          echo ===== TOOL VERSIONS =====
          where node
          node -v
          npm -v
        '''
        bat 'powershell -NoProfile -Command "$PSVersionTable.PSVersion"'
      }
    }

    stage('Install - API') {
      steps {
        dir('api') {
          bat '''
            echo ===== API INSTALL =====
            npm ci
          '''
        }
      }
    }

    stage('Install - Frontend') {
      steps {
        dir('frontend/app') {
          bat '''
            echo ===== FE INSTALL =====
            npm ci
          '''
        }
      }
    }

    stage('Unit Tests (optional)') {
      steps {
        // Runs only if test script exists; won’t fail build if absent
        dir('api') {
          bat 'npm run test --if-present'
        }
        dir('frontend/app') {
          bat 'npm run test --if-present'
        }
      }
      post {
        always {
          // keep permissive, because your logs show "No test report files were found"
          junit allowEmptyResults: true, testResults: '**/TEST-*.xml, **/junit*.xml, **/reports/junit/**/*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: '**/coverage/**, **/npm-debug.log'
        }
      }
    }

    stage('Code Quality - ESLint/Prettier') {
      steps {
        // ✅ FIX: remove invalid '||' and keep PowerShell-compatible logic
        powershell '''
          Write-Host "===== CODE QUALITY: ESLINT + PRETTIER ====="

          Write-Host "-- ESLint API"
          Push-Location "api"
          & npx eslint .
          if ($LASTEXITCODE -ne 0) { Write-Warning "ESLint API findings (non-blocking)"; $global:LASTEXITCODE = 0 }
          Pop-Location

          Write-Host "-- ESLint Frontend"
          Push-Location "frontend/app"
          & npx eslint .
          if ($LASTEXITCODE -ne 0) { Write-Warning "ESLint Frontend findings (non-blocking)"; $global:LASTEXITCODE = 0 }
          Pop-Location

          Write-Host "-- Prettier check (repo)"
          & npx prettier -c .
          if ($LASTEXITCODE -ne 0) { Write-Warning "Prettier findings (non-blocking)"; $global:LASTEXITCODE = 0 }

          Write-Host "===== CODE QUALITY COMPLETE ====="
          exit 0
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/**'
        }
      }
    }

    stage('Build - Frontend (Angular)') {
      steps {
        dir('frontend/app') {
          bat '''
            echo ===== FE BUILD =====
            npm run build
          '''
        }
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'frontend/app/dist/**'
        }
      }
    }

    stage('Code Quality - SonarCloud') {
      steps {
        script {
          def scannerHome = tool 'SonarQubeScanner'  // must match your Jenkins tool name
          withSonarQubeEnv('SonarCloud') {          // must match your Jenkins Sonar config name
            withCredentials([string(credentialsId: 'sonarcloud-token', variable: 'SONAR_TOKEN')]) {
              bat """
                echo ===== SONARCLOUD SCAN (MONOREPO) =====
                "${scannerHome}\\\\bin\\\\sonar-scanner.bat" ^
                  -Dsonar.organization=${SONAR_ORG} ^
                  -Dsonar.projectKey=${SONAR_PROJECT_KEY} ^
                  -Dsonar.sources=. ^
                  -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/.angular/**,**/coverage/** ^
                  -Dsonar.javascript.lcov.reportPaths=api/coverage/lcov.info,frontend/app/coverage/lcov.info ^
                  -Dsonar.login=%SONAR_TOKEN%
              """
            }
          }
        }
      }
    }

    stage('Security - Trivy FS Scan (vuln+misconfig)') {
      steps {
        bat '''
          echo ===== TRIVY FILESYSTEM SCAN =====
          if not exist reports mkdir reports
          trivy fs --scanners vuln,misconfig --format json -o reports\\trivy-fs.json .
          echo ===== TRIVY FS SCAN COMPLETE =====
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-fs.json'
        }
      }
    }

    stage('Security - Dependency-Check (SCA)') {
      steps {
        withCredentials([string(credentialsId: 'nvd-api-key', variable: 'NVD_API_KEY')]) {
          bat '''
            echo ===== OWASP DEPENDENCY-CHECK (SCA) =====
            if not exist reports mkdir reports

            REM Prefer cached DB to avoid huge updates on every run
            docker run --rm ^
              -e NVD_API_KEY=%NVD_API_KEY% ^
              -v "%WORKSPACE%:/src:rw" ^
              owasp/dependency-check:latest ^
              --scan /src ^
              --format "HTML" --format "JSON" ^
              --out /src/reports ^
              --noupdate
          '''
        }
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/dependency-check-report.*'
        }
      }
    }

    stage('Security - Gitleaks (Secrets Scan)') {
      steps {
        bat '''
          echo ===== GITLEAKS SECRETS SCAN =====
          if not exist reports\\gitleaks mkdir reports\\gitleaks

          REM Run as root and write inside mounted workspace (fixes /src permission denied)
          docker run --rm -u 0 ^
            -v "%WORKSPACE%:/src:rw" -w /src ^
            zricethezav/gitleaks:8.18.1 ^
            detect --source=/src ^
              --report-format json ^
              --report-path /src/reports/gitleaks/gitleaks-report.json ^
              --redact --exit-code 0
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/gitleaks/gitleaks-report.json'
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        bat """
          echo ===== DOCKER BUILD =====
          echo Building %API_IMAGE%:%IMAGE_TAG%
          cd api
          docker build -t %API_IMAGE%:%IMAGE_TAG% .
          cd ..

          echo Building %WEB_IMAGE%:%IMAGE_TAG%
          cd frontend\\app
          docker build -t %WEB_IMAGE%:%IMAGE_TAG% .
          cd ..\\..
        """
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo ===== DOCKER PUSH =====
            echo %DH_PASS%| docker login -u %DH_USER% --password-stdin

            docker push %API_IMAGE%:%IMAGE_TAG%
            docker push %WEB_IMAGE%:%IMAGE_TAG%

            docker logout
          """
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/**'
    }
  }
}
