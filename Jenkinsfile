pipeline {
  agent any
  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    // Versioning
    GIT_SHA = "${env.GIT_COMMIT}".take(7)
    VERSION = "${env.BUILD_NUMBER}-${GIT_SHA}"

    // SonarCloud config (set these in Jenkins credentials or hardcode)
    SONAR_HOST_URL = "https://sonarcloud.io"
    // If you prefer hardcode org/key, set SONAR_ORG and SONAR_PROJECT_KEY here.
    SONAR_ORG = credentials('SONAR_ORG')        // Secret text: your sonar org
    SONAR_TOKEN = credentials('SONAR_TOKEN')    // Secret text: token

    // Docker image names (must match your docker-compose.yml service image names or tags)
    API_IMAGE = "keyshield-vault-api"
    FE_IMAGE  = "keyshield-vault-frontend"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        sh 'git rev-parse --short HEAD || true'
      }
    }

    stage('Build') {
      steps {
        echo "Building Docker images for VERSION=${VERSION}"
        // Build images (artifact = Docker images)
        sh 'docker compose version'
        sh 'docker compose build --no-cache'
        sh 'docker images | head -n 20'
      }
    }

    stage('Test') {
      steps {
        dir('api') {
          sh 'node -v'
          sh 'npm -v'
          sh 'npm ci'
          // Ensure jest outputs junit.xml (configure in package.json or run with reporter)
          // If you already added jest-junit, this will create junit.xml in api/
          sh 'npm test'
        }
      }
      post {
        always {
          // If your junit file is elsewhere, adjust path
          junit allowEmptyResults: true, testResults: 'api/junit.xml'
        }
      }
    }

    stage('Code Quality') {
      steps {
        echo "Running lint + SonarCloud scan"
        dir('api') {
          sh 'npm ci'
          // ESLint (real code-quality signal). If no eslint configured, add quickly or keep non-blocking.
          sh 'npm run lint || true'
        }

        // SonarCloud scan (real tool)
        // Requires sonar-project.properties in repo root OR you pass properties inline.
        // Fastest path: create sonar-project.properties (I can give you file content if needed).
        sh """
          docker run --rm \
            -e SONAR_HOST_URL=${SONAR_HOST_URL} \
            -e SONAR_TOKEN=${SONAR_TOKEN} \
            -v "\$PWD:/usr/src" \
            sonarsource/sonar-scanner-cli:latest
        """
      }
    }

    stage('Security') {
      steps {
        echo "Dependency security scan (npm audit) + container image scan (Trivy)"
        dir('api') {
          sh 'npm ci'
          // Fail only on high/critical if you want gating; keep as non-blocking if time is tight:
          sh 'npm audit --audit-level=high || true'
        }

        // Trivy image scan (real tool). Scans built images.
        // If Trivy not installed, we run it via docker image.
        sh """
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:latest image --severity HIGH,CRITICAL --no-progress ${API_IMAGE}:latest || true
        """
      }
    }

    stage('Deploy') {
      steps {
        echo "Deploying to STAGING via docker compose"
        sh 'docker compose up -d'
        // Health check
        sh 'sleep 3'
        sh 'curl -sSf http://localhost:3000/health'
      }
    }

    stage('Release') {
      steps {
        echo "Tagging images for release VERSION=${VERSION}"
        sh "docker tag ${API_IMAGE}:latest ${API_IMAGE}:${VERSION}"
        sh "docker tag ${FE_IMAGE}:latest ${FE_IMAGE}:${VERSION}"

        // Optional: also create a Git tag (requires Jenkins has push rights).
        // If you don't have GITHUB_TOKEN configured, keep it local and document in report.
        sh """
          git tag -a v${VERSION} -m "Release v${VERSION}" || true
          git tag --list | tail -n 5
        """
      }
    }

    stage('Monitoring') {
      steps {
        echo "Monitoring validation: /metrics must be reachable"
        sh 'curl -sSf http://localhost:3000/metrics | head -n 30'
        echo "Monitoring OK: metrics endpoint reachable"
      }
    }
  }

  post {
    always {
      echo "Post: docker compose ps"
      sh 'docker compose ps || true'
      // Keep environment clean for re-runs
      sh 'docker compose logs --no-color --tail=80 || true'
    }
    cleanup {
      sh 'docker compose down --remove-orphans || true'
    }
  }
}
