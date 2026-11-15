# Archived CloudFormation files

Retired files, kept for reference. Nothing in the GitHub workflow or the maintained scripts uses them, and they are **not maintained**. Most of them find their sibling files through their own folder, so they will not run from here unless you copy them back next to the files they expect.

| File | What it was |
|---|---|
| `foodme-stack.yaml` | The original template. It also defined an ECS Fargate load test that ran every 4 hours (documented in [Load Testing from CloudFormation](../../docs/LOAD_TESTING_CLOUDFORMATION.md)). The maintained template is `../orderup-production-stack.yaml`. |
| `build-loadtest-image.sh`, `manage-loadtest.sh` | Built and managed that ECS load test. |
| `deploy-stack.sh` | An earlier deploy script. It deployed the production template and also built the load test image. Use `../deploy-production.sh`. |
| `deploy-simple.sh` | A troubleshooting variant that deployed a `monitoring-stack.yaml` that no longer exists. |
| `validate-monitoring-new.sh`, `validate-monitoring-old.sh` | Earlier versions of `../validate-monitoring.sh`. |

Scripts moved from `scripts/` are in [../../scripts/archive/](../../scripts/archive/): `deploy-simple.sh` (it pointed at a template that no longer exists) and `deploy-staging.sh` (a code deployment with a hardcoded AWS profile; `../deploy-code.sh` replaces it).
