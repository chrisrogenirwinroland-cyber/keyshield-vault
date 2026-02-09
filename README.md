KeyShield Vault – DevSecOps CI/CD Pipeline
Author: Chris Rogen Irwin Roland

Project Overview
KeyShield Vault is a containerised web application with a front-end and an API service, delivered via a DevSecOps Jenkins pipeline. The pipeline automates build, test, code quality checks, security scanning, container image publishing, deployment via Docker Compose, and operational monitoring and alerting.
Technologies Used (as evidenced in Jenkins stages and outputs)
•	Jenkins Pipeline (declarative) – orchestration of end-to-end CI/CD stages.
•	Git – source control checkout and traceability.
•	Docker + Docker Compose – image build, deployment, and service composition.
•	Front-end build: Angular (explicitly shown in pipeline stage name).
•	Code quality: ESLint + Prettier (pipeline stages).
•	Static analysis: SonarCloud scan (pipeline stage and console output).
•	Security scanning: Trivy filesystem scan and Trivy image scan (pipeline stages).
•	Software Composition Analysis (SCA): Dependency-Check (pipeline stage).
•	Monitoring and alerting stack: Prometheus, Alertmanager, Grafana, Node Exporter, and cAdvisor (shown in docker ps output).
•	Email notifications: Jenkins Email Extension (emailext) – build notification email sent on success (console output).
High-Level Architecture (runtime)
Deployed services visible from the pipeline’s Docker runtime output include:
•	Application: keyshield-vault-frontend (web UI) and keyshield-vault-api (backend API).
•	Monitoring: monitoring-prometheus, monitoring-alertmanager, grafana, prometheus-node-exporter, monitoring-cadvisor.
Clone the Repository and Run Locally (PowerShell)
Use the following PowerShell commands to clone the repository and start the stack. These commands are written to be copy-paste friendly.
PowerShell commands:
# 1) Clone the repository
git clone <PASTE_GITHUB_REPO_CLONE_URL_HERE>

# 2) Enter the project folder
cd keyshield-vault

# 3) (Optional) Pull latest changes later
git pull

# 4) Start the application stack (Docker Compose)
docker compose up -d --build

# 5) View running containers
docker ps

# 6) Follow logs (optional)
docker compose logs -f

# 7) Stop the stack
docker compose down

If your repository includes environment variables (for example, an .env file), copy and edit them as per your repo instructions. Do not commit secrets to GitHub.
Jenkins Pipeline Setup (high-level)
This section describes how to connect the GitHub repository to Jenkins and run the pipeline. The screenshots and stages in this document reflect the pipeline run shown in the Jenkins UI.
1.	Create a new Jenkins Pipeline job (or Multibranch Pipeline) and point it to your GitHub repository.
2.	Ensure the Jenkins job has access permissions for BOTH the Marker and the Unit Chair (as required by the assessment).
3.	Configure required credentials in Jenkins (examples used by the pipeline include a Sonar token for SonarCloud scan and email credentials for build notifications).
4.	Run the job and use the Pipeline Overview plus Console Output to verify every stage completes successfully.
Pipeline Stages Implemented
Total stages implemented: 17 (as shown in the Jenkins Pipeline Overview screenshot).
Stage	What it does	Tools/Frameworks	Outputs / Evidence
Checkout & Traceability	Checks out the repository and establishes build traceability.	Jenkins SCM / Git	Workspace populated
Preflight (Checkout Verification)	Pre-check validations before build steps begin.	Jenkins pipeline steps	Early fail-fast if misconfigured
Install & Unit Tests - API	Installs API dependencies and runs API unit tests.	Project test tooling (per repo) via Jenkins	Test output in console / reports
Install & Unit Tests - Frontend	Installs frontend dependencies and runs frontend unit tests.	Angular tooling (per repo) via Jenkins	Test output in console / reports
Code Quality - ESLint/Prettier	Runs linting and formatting checks.	ESLint, Prettier	ESLint/Prettier check reports
Build - Frontend (Angular)	Builds the Angular frontend artifacts.	Angular build tooling	Frontend build artifacts
Code Quality - SonarCloud	Runs static analysis and uploads results to SonarCloud.	SonarScanner / SonarCloud	SonarCloud dashboard updated
Security - Trivy FS Scan	Filesystem vulnerability/misconfiguration scan of workspace.	Trivy	Findings recorded / summarised
Security - Dependency-Check (SCA)	Software Composition Analysis to detect vulnerable dependencies.	Dependency-Check	Dependency check notes/report
Build Docker Images	Builds Docker images for services.	Docker build	Local images created
Security - Trivy Image Scan	Scans built container images for vulnerabilities.	Trivy image scan	Image scan results
Security - Vulnerability Summary	Consolidates security results into a summary artifact.	Pipeline scripting + report generation	reports/vuln-summary.txt
Push Images Docker Hub	Publishes images to a container registry.	Docker push	Images pushed successfully
Deploy - Docker Compose (Staging)	Deploys the stack using Docker Compose.	Docker Compose	Containers started
Release - Smoke / Health Validation	Performs basic smoke/health checks post-deployment.	Pipeline scripts / curl checks (per repo)	reports/smoke-test.txt
Monitoring - Deploy Stack	Deploys monitoring components.	Prometheus, Alertmanager, Grafana, exporters	Monitoring containers running
Alerts - Validate Prometheus/Alertmanager	Validates alerting configuration and readiness.	Prometheus/Alertmanager validation logic	reports/alerts-validation.txt
Evidence Screenshots (from Jenkins / Sonar)
The following screenshots can be used in the assessment template to evidence the pipeline execution:

Sonar Dashboard Highlight (security hotspot)
In the Sonar dashboard, a Security Hotspot is raised for a potentially hard-coded password in the frontend code. During the demo, open the dashboard link from Jenkins console output and navigate to Security Hotspots to show the finding and explain why hard-coded secrets are risky.
Monitoring and Alerts (demo talking points)
The pipeline deploys a monitoring stack. Evidence from the docker ps output includes Prometheus, Alertmanager, Grafana, Node Exporter, and cAdvisor. In the demo, you can show the monitoring UI, explain the scrape targets, and then demonstrate alerting by deliberately stopping the frontend container to trigger an alert email.
Common Troubleshooting
•	If Docker containers fail to start: run `docker compose logs` and confirm required ports are not already in use.
•	If SonarCloud scan fails: verify the SONAR token and the projectKey/organisation values configured in Jenkins.
•	If emails are not received: confirm SMTP settings and Jenkins Email Extension configuration.
•	If alerts do not fire: check Prometheus targets and Alertmanager route configuration in the monitoring stack.
Assessment Submission Notes
Remember to paste the demo video link and GitHub repository link into the assessment template. Also verify that both the Marker and Unit Chair have access to the repository (private repo access if applicable).
