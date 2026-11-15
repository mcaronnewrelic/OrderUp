# OrderUp CloudFormation Deployment

How OrderUp is deployed to AWS, and what each file in this folder is for.

## Use these

| File | What it is |
|---|---|
| `orderup-production-stack.yaml` | **The template.** VPC, subnets, security group, Application Load Balancer, the EC2 instance and its IAM role. It is the only template the GitHub workflow deploys. |
| `deploy-production.sh` | **Creates or updates the stack** from that template. The workflow's `stack` action runs it. |
| `deploy-code.sh` | **Updates the code on the running instance** through AWS Systems Manager (no SSH key). The workflow's `code` action runs it. It restarts the backend with PM2. |
| `install-orderup.sh` | **Runs on the instance at first boot.** Installs Node 24, nginx, PostgreSQL 16, PM2 and the New Relic infrastructure agent with the nginx and PostgreSQL integrations; builds the app and starts it. |

Everything else here supports those four.

## Deploying

**From GitHub (recommended).** Run the **deploy-cloudformation** workflow from the Actions tab: `stack` to create or update the infrastructure, `code` to update the running instance, `delete-stack` to remove it. A push to `main` that changes `server/` or `angular-app/` deploys the code to staging by itself. The secrets and variables it needs are listed in the [Deployment Guide](../docs/deployment/DEPLOYMENT_GUIDE.md#deploying-with-github-actions).

**From your machine.**

```bash
cd cloudformation
./deploy-production.sh staging t3.medium my-keypair 'a-strong-db-password'   # create or update the stack
./deploy-code.sh -e staging                                                  # update the code only
```

`deploy-production.sh` takes the environment, instance type, key pair name and database password, and an optional fifth argument for the New Relic license key (otherwise it reads `NEW_RELIC_LICENSE_KEY` from `.env`). It names the stack `orderup-<environment>`. The stack's `AllowedSshCidr` parameter limits SSH to one address and defaults to a fixed value; the scripts do not pass it, so change the default in the template or pass the parameter yourself. See [Security](../docs/SECURITY.md), finding 12.

`deploy-code.sh` options: `--frontend-only`, `--backend-only`, `--no-restart`, `--logs` and `--diagnose` (read-only checks). See the [Code Deployment Guide](../docs/deployment/CODE_DEPLOYMENT_GUIDE.md).

## Checking and diagnosing

| Script | Use it to |
|---|---|
| `validate-deployment.sh -e <env>` | Check the stack, instance, SSM connectivity, endpoints and load balancer targets before deploying code. |
| `validate-monitoring.sh -e <env>` | Check that the PostgreSQL and nginx New Relic integrations are working. |
| `diagnose-postgresql-monitoring.sh`, `diagnose-nginx-monitoring.sh` | Dig into why one of those integrations is not reporting. |
| `test-postgres-monitoring.sh` | A quick PostgreSQL monitoring test. |

## Older files

The earlier template, deploy scripts and load test scripts are in [archive/](./archive/README.md): `foodme-stack.yaml` (the original template, with the ECS load test), `deploy-stack.sh`, `deploy-simple.sh`, `build-loadtest-image.sh`, `manage-loadtest.sh`, and the older `validate-monitoring-new.sh` and `validate-monitoring-old.sh`. Nothing in the workflow uses them.

## What the instance looks like

Nginx listens on ports 80 and 8080 (8080 also serves the `/nginx_status` page New Relic reads) and forwards `/api/` and `/health` to the Node app on port 3000; the Node app serves the Angular build itself. PM2 runs the backend as `orderup-backend` under `ec2-user`. Files live under `/opt/orderup/` (`backend/`, `angular-app/`, `dist/`, `logs/`, `database/`). New Relic's infrastructure agent runs as the `newrelic-infra` systemd service with the display name `orderup-<hostname>`. The first-boot log is `/var/log/user-data.log`. [EC2 Troubleshooting](../docs/troubleshooting/EC2_TROUBLESHOOTING.md) covers what to check when something is wrong.
