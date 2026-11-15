# Deployment Quick Reference

This quick reference shows all the ways to deploy and manage the OrderUp application using the shared `.env` file.

## Deploying with GitHub Actions

The **deploy-cloudformation** workflow deploys to AWS with CloudFormation. Run it from the Actions tab, or let it run by itself.

| Action | What it does | When it runs |
|---|---|---|
| `code` | Updates the running instance with the current server and Angular code, through AWS Systems Manager (no SSH). Builds Angular on the runner first, so a broken build stops before anything on the instance changes. Then it records a New Relic deployment marker. | By itself on a push to `main` that changes `server/` or `angular-app/` (staging). Or by hand. |
| `stack` | Creates or updates the CloudFormation stack `orderup-<environment>`: network, load balancer, EC2 instance, IAM role. | By hand only. A template change can interrupt the instance, so someone should choose it. |
| `delete-stack` | Deletes the stack. You must type `DELETE`. | By hand only. |

Pull requests that change `cloudformation/` get template and script checks only (`cfn-lint` and a syntax check). Nothing is deployed.

**Secrets** (Settings → Secrets and variables → Actions → Secrets): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DB_PASSWORD`, `NEW_RELIC_LICENSE_KEY` and `NEW_RELIC_API_KEY`.

**Variables** (the Variables tab beside it; the workflow reads these as `vars.`, so setting them as secrets has no effect):

| Variable | Needed for |
|---|---|
| `EC2_KEY_NAME` | The name of an existing EC2 key pair in the region (the `stack` action), exactly as EC2 lists it under Key Pairs: `nru`, not the `nru.pem` file name. A `.pem` suffix fails with "parameter value ... for parameter name KeyPairName does not exist". Key pairs are per region, so it must exist in `AWS_REGION`. |
| `NEW_RELIC_APP_ID` | The APM entity GUID, for the deployment marker after a `code` deploy. |
| `AWS_REGION` | Optional. Defaults to `us-west-2`. |
| `CERTIFICATE_ARN` | Optional. An ACM certificate for the load balancer's HTTPS listener. |
| `NEW_RELIC_ACCOUNT_ID`, `NEW_RELIC_BROWSER_ENTITY_GUID` | Optional. When set, a `code` deploy writes them into the instance's `.env`, where they power `/api/nr-config` (the "Behind the scenes" buttons). |

Secrets and variables can be set for the whole repository, or per GitHub environment (`staging`, `production`), which also lets you require approval before a deployment runs. The workflow no longer needs an SSH private key.

The separate **New Relic setup** workflow (dashboards, service levels, alerts, workload) uses the `NEW_RELIC_API_KEY` secret and the `NEW_RELIC_ACCOUNT_ID` and `NEW_RELIC_ALERT_EMAIL` variables. See [newrelic/README.md](../../newrelic/README.md).

The same scripts run from your machine: `cloudformation/deploy-production.sh` for the stack and `cloudformation/deploy-code.sh -e staging` for the code. See [cloudformation/README.md](../../cloudformation/README.md).

## Removing a deployment

Use the `delete-stack` action, or:

```bash
aws cloudformation delete-stack --stack-name orderup-staging
aws cloudformation wait stack-delete-complete --stack-name orderup-staging
```

That removes everything the stack created. Two things stay behind, because the deployment script creates them outside the stack: the S3 bucket `orderup-deployments-<account>-<region>` with the deployment packages, and the EC2 key pair. Delete them yourself if you no longer need them. If a stack will not delete, `aws cloudformation describe-stack-events --stack-name orderup-staging` shows the resource that is blocking it. The older Terraform cleanup guide is in [archive/terraform](../../archive/terraform/CLEANUP_GUIDE.md).

## Node.js version

OrderUp runs on **Node.js 24**. Amazon Linux 2023 packages it as `nodejs24` and `nodejs24-npm`, so `cloudformation/install-orderup.sh` installs it from Amazon's own repository, not from NodeSource.

**New instances** get Node 24 from that script. The instance downloads it from the deployment S3 bucket at first boot, and the `stack` action uploads the current copy.

**An existing instance keeps the version it was built with.** The install script runs once, at first boot, so changing it does not touch a running instance. The staging instance built on 2026-10-31 is on Node 22. You have two ways to move it:

1. **Replace it (recommended).** Run `delete-stack`, then `stack`. It builds the same instance from scratch on Node 24 in a few minutes. The database is rebuilt from the initialization scripts, so anything stored only on the old instance is lost.
2. **Upgrade it in place.** This has not been tested on a running instance, so if anything looks wrong, use option 1.
   ```bash
   sudo dnf install -y nodejs24 nodejs24-npm
   sudo alternatives --set node /usr/bin/node-24
   node -v                                                   # v24.x
   sudo npm install -g pm2                                   # PM2 was installed under Node 22
   cd /opt/orderup/backend && sudo -u ec2-user npm install --omit=dev
   sudo -u ec2-user pm2 kill
   sudo -u ec2-user pm2 start ecosystem.config.js && sudo -u ec2-user pm2 save
   curl -s http://localhost:3000/health
   ```
   To go back: `sudo alternatives --set node /usr/bin/node-22`, then restart PM2 the same way.

## Deploying from your machine

| Command | What it does |
|---------|--------------|
| `cloudformation/deploy-production.sh <env> <instance-type> <key-pair> <db-password> [license-key]` | Creates or updates the stack. Reads `NEW_RELIC_LICENSE_KEY` from `.env` when the fifth argument is left out. |
| `cloudformation/deploy-code.sh -e <env>` | Updates the running instance's code through SSM. Options: `--frontend-only`, `--backend-only`, `--no-restart`, `--logs`, `--diagnose`. See the [Code Deployment Guide](./CODE_DEPLOYMENT_GUIDE.md). |
| `./scripts/deploy.sh [-b \| -m \| -s \| -l]` | Local helper: build only, send a New Relic deployment marker only, start the app, or run load tests. `-h` shows the help. |

The same script runs from npm: `npm run deploy` (build, marker, start), `deploy:build`, `deploy:marker`, `deploy:start` and `deploy:test`. Run it from the repository root: it reads `.env` from the current folder. The marker needs `ENTITY_GUID` (the APM entity's GUID) and `NEW_RELIC_API_KEY` in `.env`.

## Environment setup

| Command | Description |
|---------|-------------|
| `npm run setup:env` | Create `.env` from the template |
| `npm run validate:env` | Check that `.env` exists |

## Docker for local development

See the [Docker Development Guide](../../DOCKER_DEVELOPMENT_GUIDE.md): `npm run docker:dev:simple` or `npm run docker:dev:full`. The Docker Compose files that earlier versions of this page described (`docker-compose.yml`, a `with-secrets` service) are in `docker/archive/` and are not maintained. For handling keys and passwords, see [Secret Management](../setup/SECRET_MANAGEMENT.md).

## Environment variables in .env

```bash
# Deployment markers
NEW_RELIC_API_KEY="NRAK-..."        # User API key from New Relic
ENTITY_GUID="MTM1MjgxMX..."         # The APM entity's GUID (scripts/deploy.sh -m)
NEW_RELIC_APP_NAME="OrderUp"        # The entity's name, for npm run newrelic:deployment, which looks it up by name

# APM agent
NEW_RELIC_LICENSE_KEY="..."         # Account license key
```

See `.env.example` for the full list.

## Common workflows

### First time setup
```bash
npm run setup:env       # Create .env
# Edit .env with actual values
npm run validate:env    # Verify setup
```

### Development
```bash
npm run build:angular   # Build the website
npm start               # Start locally (needs .env and a database, or falls back to JSON data)
```

### Deploy to AWS
Run the **deploy-cloudformation** workflow with `stack` once, then let pushes to `main` deploy the code.

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| `.env not found` | `npm run setup:env` |
| `placeholder values` | Edit .env with real credentials |
| `permission denied` | `chmod +x scripts/deploy.sh` |
| `deployment marker fails` | Check `NEW_RELIC_API_KEY` and `ENTITY_GUID` in `.env` |

## 🌟 Best Practices

- ✅ Use `.env` file for all environments
- ✅ Keep `.env.example` updated
- ✅ Never commit `.env` to git
- ✅ Use different credentials per environment
- ✅ Rotate API keys regularly
- ✅ Use runtime secrets, not build-time arguments
- ❌ Never use `ARG` for sensitive data in Dockerfiles
- ❌ Avoid build-time arguments for secrets (visible in image history)
