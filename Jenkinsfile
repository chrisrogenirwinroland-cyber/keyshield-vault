pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
    skipDefaultCheckout(true)
  }

  environment {
    APP_NAME  = "keyshield-vault"
    GIT_SHA   = "unknown"

    DOCKERHUB_NAMESPACE = "rogen7spark"
    DOCKERHUB_CREDS_ID  = "dockerhub-creds"

    SONAR_SERVER_NAME   = "SonarCloud"
    SONAR_SCANNER_TOOL  = "SonarQubeScanner"
    SONAR_TOKEN_ID      = "sonar-token"
    SONAR_ORG           = "chrisrogenirwinroland-cyber"
    SONAR_PROJECT_KEY   = "chrisrogenirwinroland-cyber_keyshield-vault"

    ALERT_TO = "s225493677@deakin.edu.au"

    FE_URL  = "http://localhost:4200"
    API_URL = "http://localhost:3000"

    PROM_READY_URL = "http://localhost:9090/-/ready"
    ALERTMGR_URL   = "http://localhost:9093"
    GRAFANA_URL    = "http://localhost:3001"

    REPORT_DIR = "reports"

    // ✅ Your Jenkins Secret Text credential id
    NVD_API_KEY_CRED_ID = "nvd-api-key"

    // ✅ Use DockerHub public image (no GHCR auth headaches)
    GITLEAKS_IMAGE = "zricethezav/gitleaks:latest"
  }

  stages {

    stage('Checkout & Traceability') {
      steps {
        checkout scm
        script {
          def shaOut = bat(returnStdout: true, script: '@echo off\r\ngit rev-parse --short HEAD\r\n').trim()
          def lines = shaOut.readLines().collect { it.trim() }.findAll { it }
          env.GIT_SHA = (lines ? lines[-1] : "manual")
          echo "Resolved GIT_SHA = ${env.GIT_SHA}"
        }
        bat """
          @echo off
          echo ===== GIT TRACEABILITY =====
          git --version
          git rev-parse --short HEAD
          git log -1 --pretty=oneline
          git status
        """
      }
    }

    stage('Preflight (Toolchain Verification)') {
      steps {
        bat """
          @echo off
          echo ===== TOOL VERSIONS =====
          where node
          node -v
          npm -v

          echo ===== DOCKER =====
          where docker
          docker version

          echo ===== TRIVY =====
          where trivy
          trivy --version
        """
        bat 'powershell -NoProfile -Command "$PSVersionTable.PSVersion"'
        bat """
          @echo off
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"
          echo Preflight complete > "%REPORT_DIR%\\preflight.txt"
        """
      }
    }

    stage('Install & Unit Tests - API') {
      steps {
        dir('api') {
          bat """
            @echo off
            echo ===== API INSTALL =====
            npm ci

            echo ===== API TEST =====
            npm test
          """
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'api/**/junit*.xml, api/**/TEST-*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'api/npm-debug.log, api/**/coverage/**'
        }
      }
    }

    stage('Install & Unit Tests - Frontend') {
      steps {
        dir('frontend/app') {
          bat """
            @echo off
            echo ===== FE INSTALL =====
            npm ci

            echo ===== FE TEST =====
            npm test
          """
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'frontend/app/**/junit*.xml, frontend/app/**/TEST-*.xml'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'frontend/app/npm-debug.log, frontend/app/**/coverage/**'
        }
      }
    }

    stage('Code Quality - ESLint/Prettier') {
      steps {
        powershell '''
          Write-Host "===== CODE QUALITY: ESLINT + PRETTIER ====="
          $ErrorActionPreference = "Continue"

          $root = Join-Path $env:WORKSPACE $env:REPORT_DIR
          $eslintDir   = Join-Path $root "eslint"
          $prettierDir = Join-Path $root "prettier"
          New-Item -ItemType Directory -Force $eslintDir   | Out-Null
          New-Item -ItemType Directory -Force $prettierDir | Out-Null

          function Run-And-Capture([string]$workDir, [string]$cmd, [string]$outFile) {
            Push-Location $workDir
            try {
              cmd /c $cmd 2>&1 | Out-File -FilePath $outFile -Encoding UTF8
              $rc = $LASTEXITCODE
            } finally {
              Pop-Location
            }
            return $rc
          }

          Write-Host "-- ESLint API"
          $apiOut = Join-Path $eslintDir "eslint-api.txt"
          $rc = Run-And-Capture (Join-Path $env:WORKSPACE "api") "npm run lint --silent" $apiOut
          if ($rc -ne 0) { Add-Content $apiOut "`r`nESLint API issues OR lint script missing (NON-BLOCKING)." }

          Write-Host "-- ESLint Frontend"
          $feOut = Join-Path $eslintDir "eslint-fe.txt"
          $rc = Run-And-Capture (Join-Path $env:WORKSPACE "frontend\\app") "npm run lint --silent" $feOut
          if ($rc -ne 0) { Add-Content $feOut "`r`nESLint Frontend issues OR lint script missing (NON-BLOCKING)." }

          Write-Host "-- Prettier check (repo)"
          $preOut = Join-Path $prettierDir "prettier-check.txt"
          cmd /c "npx --yes prettier -c ." 2>&1 | Out-File -FilePath $preOut -Encoding UTF8
          if ($LASTEXITCODE -ne 0) {
            Add-Content $preOut "`r`nPrettier differences OR Prettier not configured (NON-BLOCKING)."
          } else {
            Add-Content $preOut "`r`nPrettier: formatting OK."
          }

          Write-Host "===== CODE QUALITY COMPLETE ====="
          exit 0
        '''
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/eslint/**, reports/prettier/**'
        }
      }
    }

    stage('Build - Frontend (Angular)') {
      steps {
        dir('frontend/app') {
          bat """
            @echo off
            echo ===== FE BUILD =====
            npm run build
          """
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
          def scannerHome = tool("${SONAR_SCANNER_TOOL}")
          withSonarQubeEnv("${SONAR_SERVER_NAME}") {
            withCredentials([string(credentialsId: "${SONAR_TOKEN_ID}", variable: 'SONAR_TOKEN')]) {
              bat """
                @echo off
                echo ===== SONARCLOUD SCAN (MONOREPO) =====
                "${scannerHome}\\bin\\sonar-scanner.bat" ^
                  -Dsonar.host.url=https://sonarcloud.io ^
                  -Dsonar.token=%SONAR_TOKEN% ^
                  -Dsonar.organization=%SONAR_ORG% ^
                  -Dsonar.projectKey=%SONAR_PROJECT_KEY% ^
                  -Dsonar.projectName=%SONAR_PROJECT_KEY% ^
                  -Dsonar.sources=api,frontend/app/src ^
                  -Dsonar.exclusions=**/node_modules/**,**/dist/**,**/.angular/**,**/coverage/** ^
                  -Dsonar.javascript.lcov.reportPaths=api/coverage/lcov.info,frontend/app/coverage/lcov.info
              """
            }
          }
        }
      }
    }

    stage('Security - Trivy FS Scan (vuln+misconfig)') {
      steps {
        bat """
          @echo off
          echo ===== TRIVY FILESYSTEM SCAN =====
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"

          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format json  --output "%REPORT_DIR%\\trivy-fs.json" .
          trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL --format table --output "%REPORT_DIR%\\trivy-fs.txt"  .

          echo ===== TRIVY FS SCAN COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-fs.json, reports/trivy-fs.txt'
        }
      }
    }

    // ✅ FIXED: PowerShell mount string uses $($dcData) so ':' doesn't break parsing
    stage('Security - Dependency-Check (SCA)') {
      steps {
        withCredentials([string(credentialsId: "${NVD_API_KEY_CRED_ID}", variable: 'NVD_API_KEY')]) {
          powershell '''
            Write-Host "===== OWASP DEPENDENCY-CHECK (SCA) ====="
            $ErrorActionPreference = "Continue"

            $root = Join-Path $env:WORKSPACE $env:REPORT_DIR
            $outDir = Join-Path $root "dependency-check"
            New-Item -ItemType Directory -Force $outDir | Out-Null

            # Persistent cache under Jenkins Home to reduce updates
            $jenkinsHome = $env:JENKINS_HOME
            if (-not $jenkinsHome) { $jenkinsHome = "C:\\ProgramData\\Jenkins\\.jenkins" }

            $dcData = Join-Path $jenkinsHome "dependency-check-data"
            New-Item -ItemType Directory -Force $dcData | Out-Null

            # ✅ IMPORTANT: use $() to stop PowerShell reading "$dcData:" as a scoped variable
            $srcMount  = "$($env:WORKSPACE):/src"
            $dataMount = "$($dcData):/usr/share/dependency-check/data"

            try { docker pull owasp/dependency-check:latest | Out-Null } catch {}

            function Run-DC([switch]$NoUpdate) {
              $args = @(
                "run","--rm",
                "-v",$srcMount,
                "-v",$dataMount,
                "-w","/src",
                "owasp/dependency-check:latest",
                "--project",$env:APP_NAME,
                "--scan","/src/api/package.json",
                "--scan","/src/api/package-lock.json",
                "--scan","/src/frontend/app/package.json",
                "--scan","/src/frontend/app/package-lock.json",
                "--format","HTML",
                "--format","JSON",
                "--out","/src/"+$env:REPORT_DIR+"/dependency-check",
                "--nvdApiKey",$env:NVD_API_KEY,
                "--failOnCVSS","11"
              )
              if ($NoUpdate) { $args += "--noupdate" }

              & docker @args
              return $LASTEXITCODE
            }

            $rc = Run-DC
            if ($rc -ne 0) {
              Write-Host "Dependency-Check failed (rc=$rc). Retrying with --noupdate (use cached DB)..."
              $rc2 = Run-DC -NoUpdate
              Write-Host "Retry rc=$rc2 (pipeline continues)."
            } else {
              Write-Host "Dependency-Check completed."
            }

            "Dependency-Check finished (non-blocking). See reports/dependency-check/." |
              Set-Content -Path (Join-Path $outDir "dependency-check-note.txt") -Encoding UTF8

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
      steps {
        powershell '''
          Write-Host "===== GITLEAKS SECRETS SCAN ====="
          $ErrorActionPreference = "Continue"

          $root = Join-Path $env:WORKSPACE $env:REPORT_DIR
          $outDir = Join-Path $root "gitleaks"
          New-Item -ItemType Directory -Force $outDir | Out-Null

          $reportHost = Join-Path $outDir "gitleaks-report.json"
          $noteHost   = Join-Path $outDir "gitleaks-note.txt"
          "[]" | Set-Content -Path $reportHost -Encoding UTF8

          $srcMount = "$($env:WORKSPACE):/src"

          try { docker pull $env:GITLEAKS_IMAGE | Out-Null } catch {
            "Skipped: Unable to pull $($env:GITLEAKS_IMAGE). (Pipeline continues)" |
              Set-Content -Path $noteHost -Encoding UTF8
            exit 0
          }

          docker run --rm -v $srcMount $env:GITLEAKS_IMAGE detect `
            --source=/src `
            --report-format json `
            --report-path ("/src/" + $env:REPORT_DIR + "/gitleaks/gitleaks-report.json") `
            --redact

          $rc = $LASTEXITCODE
          if ($rc -ne 0) {
            "Potential secrets detected OR gitleaks exit=$rc. Review gitleaks-report.json. (Pipeline continues)" |
              Set-Content -Path $noteHost -Encoding UTF8
          } else {
            "No secrets detected by Gitleaks." |
              Set-Content -Path $noteHost -Encoding UTF8
          }

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
          @echo off
          echo ===== DOCKER BUILD =====
          set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

          echo Building %API_IMAGE%
          docker build -t %API_IMAGE% -f api\\Dockerfile api

          echo Building %FE_IMAGE%
          docker build -t %FE_IMAGE% -f frontend\\app\\Dockerfile frontend\\app
        """
      }
    }

    stage('Security - Trivy Image Scan (TAR input, Windows-safe)') {
      steps {
        bat """
          @echo off
          echo ===== TRIVY IMAGE SCAN (TAR) =====
          if not exist "%REPORT_DIR%" mkdir "%REPORT_DIR%"

          set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
          set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

          docker save -o "%REPORT_DIR%\\api-image.tar" %API_IMAGE%
          docker save -o "%REPORT_DIR%\\fe-image.tar"  %FE_IMAGE%

          trivy image --input "%REPORT_DIR%\\api-image.tar" --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-api-image.json"
          trivy image --input "%REPORT_DIR%\\fe-image.tar"  --severity HIGH,CRITICAL --format json --output "%REPORT_DIR%\\trivy-fe-image.json"

          echo ===== TRIVY IMAGE SCAN COMPLETE =====
        """
      }
      post {
        always {
          archiveArtifacts allowEmptyArchive: true, artifacts: 'reports/trivy-api-image.json, reports/trivy-fe-image.json, reports/*.tar'
        }
      }
    }

    stage('Push Images (Docker Hub)') {
      steps {
        withCredentials([usernamePassword(credentialsId: "${DOCKERHUB_CREDS_ID}", usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          bat """
            @echo off
            echo %DH_PASS% | docker login -u %DH_USER% --password-stdin

            set API_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-api:%GIT_SHA%
            set FE_IMAGE=%DOCKERHUB_NAMESPACE%/%APP_NAME%-web:%GIT_SHA%

            docker push %API_IMAGE%
            docker push %FE_IMAGE%

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
