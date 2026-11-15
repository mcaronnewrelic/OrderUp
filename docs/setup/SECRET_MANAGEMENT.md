# Secret Management

How to handle API keys, license keys and database passwords in OrderUp, locally and in AWS.

## What is secret

| Value | Where it is used |
|---|---|
| `NEW_RELIC_LICENSE_KEY` | The APM agent, the browser agent and the infrastructure agent. |
| `NEW_RELIC_API_KEY` (a User key, `NRAK-...`) | Deployment markers, source map upload, dashboard deep links, the setup workflow. |
| `DB_PASSWORD` | The database, and the server connecting to it. |
| AWS access keys | The GitHub deployment workflow. |

Account IDs, entity GUIDs and the dashboard GUID are identifiers, not secrets. The full list of settings is in [Environment Variables](./ENVIRONMENT_VARIABLES.md).

## Local development

1. Create `.env` from the template and fill it in:
   ```bash
   npm run setup:env
   ```
2. Keep it out of git. `.gitignore` already excludes `.env` and `.env.local`, and `.dockerignore` keeps them out of image builds.
3. Restrict it to yourself: `chmod 600 .env`.

Docker passes `.env` to the containers when it **creates** them (`env_file`), so the values exist only in the container's environment at run time and never in an image layer. After you change `.env`, recreate the containers (`up -d --force-recreate`). For the full setup, see the [Docker Development Guide](../../DOCKER_DEVELOPMENT_GUIDE.md).

Check that `.env` exists and has no placeholders:

```bash
npm run validate:env
npm run security:validate     # scans Dockerfiles, scripts, compose files and source for committed secrets
```

## In AWS

- **GitHub Actions** keeps the secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DB_PASSWORD`, `NEW_RELIC_LICENSE_KEY`, `NEW_RELIC_API_KEY`) as repository or environment secrets. Identifiers are kept as variables. See the [Deployment Guide](../deployment/DEPLOYMENT_GUIDE.md#deploying-with-github-actions).
- **On the instance**, `install-orderup.sh` writes the values into `/opt/orderup/backend/.env`. Code deployments preserve that file and only add the identifier values.
- **The database password** is passed to `deploy-production.sh` as an argument, so it will appear in your shell history if you run the script by hand; the workflow reads it from the `DB_PASSWORD` secret instead.

For anything beyond a demo, move the values into AWS Secrets Manager or Parameter Store and have the instance read them from there.

## Do

- Use a separate set of keys for each environment, and rotate them regularly.
- Rotate a key at once if it appears anywhere it should not (a screenshot, a log, a chat).
- Keep `.env.example` free of real values.

## Don't

- Commit `.env`, or paste keys into source files, Dockerfiles or compose files.
- Pass secrets as build arguments (`ARG`, `--build-arg`): they stay in the image history.
- Share `docker logs` output without checking it. Some tools print their configuration; the earlier stand-in infrastructure agent printed the license key.

## Troubleshooting

- **A container does not see a new value:** it reads `.env` only at creation. `docker-compose ... up -d --force-recreate <service>`.
- **"Not starting without license key":** `NEW_RELIC_LICENSE_KEY` is missing or empty in the container's environment.
- **The database container exits:** `DB_PASSWORD` was not found. Check that `.env` is in the repository root and that you start through the npm scripts.

See [Security](../SECURITY.md) for what the security review found, including keys stored in plaintext in the local `.env`.
