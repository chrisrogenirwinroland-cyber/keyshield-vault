# KeyShield Vault – DevSecOps CI/CD Pipeline

**Author:** Chris Rogen Irwin Roland

---

## Project Overview
**KeyShield Vault** is a containerised web application with a **Front-end** and an **API service**, delivered via a **DevSecOps Jenkins pipeline**.  
The pipeline automates **build, test, code-quality checks, security scanning, image publishing, Docker Compose deployment, and monitoring/alerting**.

---

## Technologies Used (as evidenced in Jenkins stages and outputs)
- **Jenkins Pipeline (Declarative)** – end-to-end CI/CD orchestration  
- **Git** – source control checkout and traceability  
- **Docker + Docker Compose** – image build, deployment, service composition  
- **Front-end:** Angular *(explicitly shown in stage name)*  
- **Code quality:** ESLint, Prettier *(pipeline stages)*  
- **Static analysis:** SonarCloud *(stage + console output link)*  
- **Security scanning:** Trivy FS scan, Trivy Image scan *(pipeline stages)*  
- **SCA:** OWASP Dependency-Check *(pipeline stage)*  
- **Monitoring & alerting:** Prometheus, Alertmanager, Grafana, Node Exporter, cAdvisor *(docker ps output)*  
- **Email notifications:** Jenkins Email Extension (`emailext`) *(console output)*  

---

## High-Level Runtime Architecture
Deployed services visible in the pipeline’s Docker runtime output:

### Application
- `keyshield-vault-frontend` — Web UI  
- `keyshield-vault-api` — Backend API  

### Monitoring / Observability
- `monitoring-prometheus`
- `monitoring-alertmanager`
- `grafana`
- `prometheus-node-exporter`
- `monitoring-cadvisor`

---

## Clone the Repository and Run Locally (PowerShell)
Copy/paste friendly:

```powershell
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
