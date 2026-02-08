pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    APP_NAME       = 'keyshield-vault'
    REPORT_DIR     = 'reports'

    // ✅ Your Jenkins credential IDs
    NVD_API_CRED   = 'nvd-api-key'          // Secret text
    SONAR_CRED     = 'sonar-token'          // Secret text (change if different)
    DOCKERHUB_CRED = 'dockerhub-creds'      // Username+Password (change if different)

    DOCKERHUB_USER = 'rogen7spark'
    IMAGE_API      = "${DOCKERHUB_USER}/keyshield-vault-api"
    IMAGE_WEB      = "${DOCKERHUB_USER}/keyshield-vault-web"

    GIT_SHA        = ''
    IMAGE_TAG      = ''
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        checkout scm
        script {
          // reliable SHA even on detached HEAD
          env.GIT_SHA = bat(returnStdout: true, script: 'git rev-parse --short=7 HEAD').trim()
          env.IMAGE_TAG = "${env.GIT_SHA}-${env.BUILD_NUMBER}"
        }
        bat """
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short=7 HEAD
          git log -1 --oneline
          echo GIT_SHA=%GIT_SHA%
          echo IMAGE_TAG=%IMAGE_TAG%
          git status --porcelain
        """
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
            npm audit --audit-level=high || exit /b 0
          '''
        }
      }
    }

    stage('Code Quality - ESLint/Prettier') {
      steps {
        powershell '''
          Write-Host "===== CODE QUALITY: ESLINT + PRETTIER ====="
          Write-Host "-- ESLint API"
          Push-Location "api"
          npx eslint . || exit 0
          Pop-Location

          Write-Host "-- ESLint Frontend"
          Push-Location "frontend/app"
          npx eslint . || exit 0
          Pop-Location

          Write-Host "-- Prettier check (repo)"
          npx prettier -c . || exit 0

          Write-Host "===== CODE QUALITY COMPLETE ====="
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
        withCredentials([string(credentialsId: "${SONAR_CRED}", variable: 'SONAR_TOKEN')]) {
          script {
            def scannerHome = tool 'SonarQubeScanner'
            withSonarQubeEnv('SonarCloud') {
              bat """
                echo ===== SONARCLOUD SCAN (MONOREPO) =====
                "${scannerHome}\\bin\\sonar-scanner.bat" ^
                  -Dsonar.login=%SONAR_TOKEN%
              """
            }
          }
        }
      }
    }

    stage('Security - Trivy FS Scan (vuln+misconfig)') {
      steps {
        bat """
          echo ===== TRIVY FILESYSTEM SCAN =====
          if not exist %REPORT_DIR%\\trivy mkdir %REPORT_DIR%\\trivy

          trivy fs --scanners vuln,misconfig --format json --output %REPORT_DIR%\\trivy\\trivy-fs-api.json api || exit /b 0
          trivy fs --scanners vuln,misconfig --format json --output %REPORT_DIR%\\trivy\\trivy-fs-frontend.json frontend/app || exit /b 0

          echo ===== TRIVY FS SCAN COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy/**'
        }
      }
    }

    stage('Security - Dependency-Check (SCA)') {
      options { timeout(time: 30, unit: 'MINUTES') }
      steps {
        withCredentials([string(credentialsId: "${NVD_API_CRED}", variable: 'NVD_API_KEY')]) {
          powershell '''
            Write-Host "===== OWASP DEPENDENCY-CHECK (SCA) ====="

            $root   = Join-Path $env:WORKSPACE $env:REPORT_DIR
            $outDir = Join-Path $root "dependency-check"
            New-Item -ItemType Directory -Force $outDir | Out-Null

            # Persistent cache under JENKINS_HOME
            $jenkinsHome = $env:JENKINS_HOME
            if (-not $jenkinsHome) { $jenkinsHome = "C:\\ProgramData\\Jenkins\\.jenkins" }
            $dcData = Join-Path $jenkinsHome "dependency-check-data"
            New-Item -ItemType Directory -Force $dcData | Out-Null

            # Update only once per 24h
            $dbFile = Join-Path $dcData "odc.mv.db"
            $needUpdate = $true
            if (Test-Path $dbFile) {
              $ageHours = (New-TimeSpan -Start (Get-Item $dbFile).LastWriteTime -End (Get-Date)).TotalHours
              if ($ageHours -lt 24) { $needUpdate = $false }
            }

            $srcMount  = "$($env:WORKSPACE):/src"
            $dataMount = "$($dcData):/usr/share/dependency-check/data"

            docker pull owasp/dependency-check:latest
            if ($LASTEXITCODE -ne 0) {
              Write-Host "Dependency-Check image pull failed (non-blocking)."
              exit 0
            }

            $cmd = @(
              "run","--rm",
              "-v",$srcMount,
              "-v",$dataMount,
              "-w","/src",
              "owasp/dependency-check:latest",
              "--project=$($env:APP_NAME)",
              "--scan=/src/api/package.json",
              "--scan=/src/api/package-lock.json",
              "--scan=/src/frontend/app/package.json",
              "--scan=/src/frontend/app/package-lock.json",
              "--format=HTML",
              "--format=JSON",
              "--out=/src/"+$env:REPORT_DIR+"/dependency-check",
              "--log=/src/"+$env:REPORT_DIR+"/dependency-check/dependency-check.log",
              "--nvdApiKey=$($env:NVD_API_KEY)",
              "--nvdApiDelay=2000",
              "--cveValidForHours=24",
              "--failOnCVSS=11"
            )

            if (-not $needUpdate) {
              Write-Host "Using cached DB (--noupdate)"
              $cmd += "--noupdate"
            } else {
              Write-Host "Updating NVD DB (first run may take time)"
            }

            & docker @cmd
            if ($LASTEXITCODE -ne 0) {
              Write-Host "Dependency-Check non-zero exit code (non-blocking)."
            }

            exit 0
          '''
        }
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/dependency-check/**'
        }
      }
    }

    stage('Security - Gitleaks (Secrets Scan)') {
      options { timeout(time: 10, unit: 'MINUTES') }
      steps {
        powershell '''
          Write-Host "===== GITLEAKS SECRETS SCAN ====="

          $root   = Join-Path $env:WORKSPACE $env:REPORT_DIR
          $outDir = Join-Path $root "gitleaks"
          New-Item -ItemType Directory -Force $outDir | Out-Null

          $repoMount = "$($env:WORKSPACE):/repo"
          $outMount  = "$($outDir):/out"

          # Use a dedicated /out mount so report writing never hits a permission wall
          docker pull zricethezav/gitleaks:latest
          if ($LASTEXITCODE -ne 0) { Write-Host "Gitleaks image pull failed (non-blocking)."; exit 0 }

          & docker run --rm `
            -v $repoMount `
            -v $outMount `
            -w /repo `
            zricethezav/gitleaks:latest detect `
              --source="/repo" `
              --report-format="json" `
              --report-path="/out/gitleaks-report.json" `
              --redact `
              --exit-code=0

          Write-Host "===== GITLEAKS COMPLETE ====="
          exit 0
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/gitleaks/**'
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        bat """
          echo ===== DOCKER BUILD =====
          echo Building %IMAGE_API%:%IMAGE_TAG%
          docker build -t %IMAGE_API%:%IMAGE_TAG% api
          echo Building %IMAGE_WEB%:%IMAGE_TAG%
          docker build -t %IMAGE_WEB%:%IMAGE_TAG% frontend/app
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
          echo ===== TRIVY IMAGE SCAN (TAR) =====
          if not exist %REPORT_DIR%\\trivy mkdir %REPORT_DIR%\\trivy

          docker save %IMAGE_API%:%IMAGE_TAG% -o %REPORT_DIR%\\trivy\\api.tar
          docker save %IMAGE_WEB%:%IMAGE_TAG% -o %REPORT_DIR%\\trivy\\web.tar

          trivy image --input %REPORT_DIR%\\trivy\\api.tar --format json --output %REPORT_DIR%\\trivy\\trivy-image-api.json || exit /b 0
          trivy image --input %REPORT_DIR%\\trivy\\web.tar --format json --output %REPORT_DIR%\\trivy\\trivy-image-web.json || exit /b 0

          echo ===== TRIVY IMAGE SCAN COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy/**'
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKERHUB_CRED}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            echo ===== DOCKER PUSH =====
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin
            docker push %IMAGE_API%:%IMAGE_TAG%
            docker push %IMAGE_WEB%:%IMAGE_TAG%
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
