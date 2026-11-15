# New Relic Infrastructure Agent Integration

## Overview
The EC2 deployment has been enhanced to include New Relic Infrastructure agent monitoring for comprehensive server and application monitoring.

## What's Included

### 1. New Relic Infrastructure Agent
- **Server Monitoring**: CPU, memory, disk, network metrics
- **Process Monitoring**: Application processes and resource usage
- **Custom Attributes**: Environment, application name, instance type, region
- **Display Name**: `orderup-{hostname}` (e.g., `orderup-ip-10-0-1-102`), tagged with `environment`

### 2. New Relic APM Integration
- **Application Performance Monitoring**: Node.js application metrics
- **App Name**: `OrderUp` (staging and production are told apart by the `environment` tag on the host)
- **Transaction Tracing**: Web transactions, database queries, external services
- **Error Tracking**: Application errors and exceptions

### 3. Nginx Integration
- **Web Server Metrics**: Request rates, response times, error rates
- **Status Endpoint**: `http://127.0.0.1:8080/nginx_status` for New Relic monitoring
- **Custom Labels**: Environment and role tagging

## Configuration

### Required Secrets
Add these to your GitHub repository secrets:

1. **NEW_RELIC_LICENSE_KEY** - Your New Relic license key for Infrastructure agent
2. **NEW_RELIC_API_KEY** - Your New Relic API key for deployment tracking (already configured)

### Environment Variables
The following environment variables are automatically set for the Node.js application:
- `NEW_RELIC_LICENSE_KEY`: Infrastructure monitoring license key
- `NEW_RELIC_APP_NAME`: Application name for APM (`OrderUp`)
- `NEW_RELIC_NO_CONFIG_FILE`: Uses environment variables instead of config file

## Monitoring Features

### Infrastructure Monitoring
- **System Metrics**: CPU usage, memory usage, disk space, network I/O
- **Process Monitoring**: Node.js processes, nginx processes
- **Log Monitoring**: Application logs, nginx access/error logs
- **Alert Conditions**: Configurable alerts for high CPU, memory, disk usage

### Application Performance Monitoring (APM)
- **Web Transactions**: API endpoint performance
- **Database Queries**: Database connection and query performance
- **External Services**: HTTP requests to external APIs
- **Error Tracking**: Application exceptions and errors
- **Custom Events**: Order tracking, user actions

### Nginx Web Server Monitoring
- **Request Metrics**: Requests per second, response codes
- **Performance**: Response times, throughput
- **Error Tracking**: 4xx and 5xx error rates
- **Upstream Monitoring**: Backend application health

## Setup Instructions

### 1. Get New Relic License Key
1. Log into your New Relic account
2. Go to Account Settings → License Key
3. Copy your license key

### 2. Add GitHub Secrets
1. Go to your GitHub repository
2. Navigate to Settings → Secrets and Variables → Actions
3. Add `NEW_RELIC_LICENSE_KEY` with your license key

### 3. Deploy
Run your GitHub Actions workflow. The New Relic Infrastructure agent will be automatically:
- Installed during EC2 instance setup
- Configured with your license key
- Started and enabled as a system service

## Verification

### Check Infrastructure Agent Status
SSH into your EC2 instance and run:
```bash
sudo systemctl status newrelic-infra
sudo journalctl -u newrelic-infra -f
```

### Verify in New Relic Dashboard
1. Log into New Relic One
2. Go to Infrastructure → Hosts
3. Look for your server: `orderup-<hostname>` (filter by the `environment` attribute)
4. Check APM & Services for your application: `OrderUp`

## Configuration Files

### Infrastructure Agent Config
Location: `/etc/newrelic-infra.yml`
```yaml
license_key: {YOUR_LICENSE_KEY}
display_name: orderup-<hostname>
custom_attributes:
  environment: {environment}
  application: orderup
  role: web-server
```

### Nginx Integration Config
Location: `/etc/newrelic-infra/integrations.d/nginx-config.yml`
```yaml
integrations:
  - name: nri-nginx
    env:
      STATUS_URL: http://127.0.0.1:8080/nginx_status
      METRICS: true
      INVENTORY: true
    labels:
      environment: {environment}
      role: web-server
      service: nginx
      application: orderup
```
The complete file is written by `cloudformation/install-orderup.sh`; [newrelic-integrations/](../newrelic-integrations/README.md) holds a reference copy.


## Troubleshooting

### Infrastructure Agent Not Reporting
1. Check service status: `sudo systemctl status newrelic-infra`
2. Check logs: `sudo journalctl -u newrelic-infra -n 50`
3. Verify license key in `/etc/newrelic-infra.yml`
4. Ensure network connectivity to New Relic endpoints

### APM Not Showing Data
1. Check application logs: `sudo -u ec2-user pm2 logs orderup-backend --nostream --lines 50`
2. Verify the environment variables in `/opt/orderup/backend/.env`
3. Check New Relic agent initialization in application startup logs

### Nginx Integration Issues
1. Verify nginx status endpoint: `curl http://127.0.0.1:8080/nginx_status`
2. Check nginx configuration: `/etc/nginx/conf.d/orderup.conf`
3. Restart nginx: `sudo systemctl restart nginx`

## Cost Considerations
- New Relic Infrastructure agent monitoring is included in most New Relic plans
- Check your New Relic pricing tier for any usage limits
- Infrastructure data retention varies by plan

## Security Notes
- License key is passed securely through GitHub Secrets
- The nginx status endpoint is only open to localhost and private address ranges
- All monitoring traffic is encrypted in transit
- No sensitive application data is transmitted to New Relic

## Running it locally (Docker)

`npm run docker:dev:full` starts the official `newrelic/infrastructure-bundle` image (3.6.3: agent 2.0.2 plus the nginx and PostgreSQL integrations) next to the app, nginx and PostgreSQL. The EC2 hosts run agent 2.0.1; the bundle has no 2.0.1 build to match.

1. Put your license key in `.env` as `NEW_RELIC_LICENSE_KEY`. The agent reads `NRIA_LICENSE_KEY` and falls back to that. If neither is set, or it is still the placeholder, the container exits with `invalid license`.
2. Start it: `npm run docker:dev:full`.
3. Check it: `docker logs orderup-infra` should show `connect got id`. In New Relic, look for the host named by `MONITORING_DISPLAY_NAME` (default `OrderUp-Infra-Docker-Local`) in `SystemSample` and `ContainerSample`.

What to expect:

- The agent runs with `privileged: true` and `pid: host`, and mounts `/` and the Docker socket read-only. On Docker Desktop the "host" it reports is the Docker VM (hostname `docker-desktop`), not your computer. It is on the compose network, not the host's, so it can reach `nginx` and `db`; network-interface metrics therefore describe the container.
- It reports host metrics, processes and Docker containers, and runs the nginx and PostgreSQL integrations (`NginxSample`, `PostgresqlInstanceSample`, `PostgresqlDatabaseSample`, `PostgresSlowQueries`), configured by `newrelic-integrations/docker/`. See [New Relic Integrations](./NEW_RELIC_INTEGRATIONS_SETUP.md).
- Its log has harmless errors about DMI data (`product_uuid`, `sys_vendor`) and `DBus`, because a Docker VM has neither.

Troubleshooting:

```bash
docker logs orderup-infra                     # license, connection, errors
grep NEW_RELIC_LICENSE_KEY .env               # is it set, and not the placeholder?
docker exec orderup-infra env | grep NRIA     # what the agent was given
```

Data from the browser can be blocked on your own machine by an ad blocker or DNS filter; see the [Docker Comprehensive Guide](./troubleshooting/DOCKER_COMPREHENSIVE_GUIDE.md#new-relic-in-the-containers).

## Environment Variables

```bash
# Required
NEW_RELIC_LICENSE_KEY=your_license_key_here

# Optional (for deployment tracking)
NEW_RELIC_API_KEY=your_api_key_here
```

## Support

If you encounter issues:

1. Check the logs: `docker compose logs newrelic-infra`
2. Verify your license key is valid
3. Ensure Docker has sufficient permissions
4. Test network connectivity between containers

For more information, see:
- [New Relic Infrastructure Agent Documentation](https://docs.newrelic.com/docs/infrastructure/install-infrastructure-agent/get-started/install-infrastructure-agent/)
- [New Relic Docker Monitoring](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/docker-monitoring-integration/)
