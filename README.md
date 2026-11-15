# 🍕 OrderUp - Restaurant Ordering Application

[![Node.js](https://img.shields.io/badge/Node.js-24-green.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-22-red.svg)](https://angular.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Security](https://img.shields.io/badge/Security-Validated-brightgreen.svg)](#-security-features)
[![New Relic APM](https://img.shields.io/badge/New%20Relic%20APM-14.10.0-purple.svg)](https://newrelic.com/)
[![New Relic Infrastructure](https://img.shields.io/badge/New%20Relic%20Infrastructure-2.0.1-purple.svg)](https://newrelic.com/)

A modern, full-stack restaurant ordering application built with Angular 22 frontend and Node.js backend, featuring comprehensive monitoring, security, and deployment automation.

## 📋 Table of Contents

- [🎯 Project Overview](#-project-overview)
- [🎓 The Missions (Behind the Scenes)](#-the-missions-behind-the-scenes)
- [🚀 Quick Start](#-quick-start)
- [🏗️ Architecture](#️-architecture)
- [� Project Structure](#-project-structure)
- [�📚 Documentation](#-documentation)
- [🛠️ Development](#️-development)
- [🔧 Configuration](#-configuration)
- [🧪 Testing & Quality](#-testing--quality)
- [📊 Monitoring](#-monitoring)
- [🔒 Security Features](#-security-features)
- [🤝 Contributing](#-contributing)

## 🎯 Project Overview

OrderUp is a demonstration application that showcases modern web development practices, security implementations, and operational excellence. Originally designed as an educational workshop application, it has evolved into a production-ready example of:

- **Modern Frontend**: Angular 22 with TypeScript, responsive design, and component-based architecture
- **Robust Backend**: Node.js/Express server with RESTful APIs and structured data handling
- **Monitoring Integration**: New Relic APM for performance monitoring and observability
- **Security First**: Comprehensive secret management and security validation
- **DevOps Ready**: Docker containerization, automated deployment, and load testing

## ✨ Key Features

### User Experience
- 🍽️ **Restaurant Discovery**: Browse and filter from multiple restaurant options
- 📱 **Responsive Design**: Seamless experience across desktop, tablet, and mobile
- 🛒 **Shopping Cart**: Add, remove, and modify orders with real-time updates
- 💳 **Checkout Process**: Streamlined ordering with customer information collection
- ✅ **Order Confirmation**: Clear confirmation and thank you experience
- 📍 **Live Order Tracking**: A stage-by-stage tracker (received, preparing, out for delivery, delivered) fed by a WebSocket, on the thank-you page and on My Orders

### Technical Features
- ⚡ **Real-time Performance**: Optimized Angular components with efficient rendering
- 🔍 **Search & Filter**: Dynamic restaurant and menu item filtering
- 📊 **Analytics Ready**: The ordering funnel (browse, menu, cart, checkout, order) is reported as browser events, so drop-off can be charted in New Relic
- 🛡️ **Security Hardened**: OWASP compliant with comprehensive secret management
- 🚀 **Production Ready**: Full CI/CD pipeline with automated testing and deployment

### Developer Experience
- 🐳 **Containerized**: Full Docker support with dev containers
- 🧪 **Load Testing**: Built-in performance testing with realistic user scenarios
- 📋 **Documentation**: Comprehensive guides for setup, deployment, and maintenance
- 🔐 **Security Validation**: Automated security scanning and compliance checks
- 📈 **Monitoring**: Integrated observability with New Relic APM

## 🎓 The Missions (Behind the Scenes)

OrderUp is a teaching app. Turn on **Behind the scenes** (or visit any page with `?callouts=1`) and the ordinary ordering flow becomes a five-mission observability exercise — on every page a callout runs the same loop: **Try** an action, **Learn** what data it created, **Find** that data in New Relic with one click, **Check** yourself with a question only the data can answer. A progress strip tracks the five stops; the journey recap lives on the Missions page.

| # | Mission | Page | The lesson |
|---|---------|------|------------|
| 1 | Say who you are | Customer | Your name becomes `enduser.id`, and a session code (`OU-XXXX`) is stamped on everything |
| 2 | Find a menu in the data | Restaurants → Menu | Every menu load is a transaction — and filtering creates no request at all |
| 3 | Place the order, keep the receipt | Checkout → Thank You | One order, three records, stitched together by its `requestId` |
| 4 | Find it again later | Orders | Lookup with no email: `requestId` and your code are the join keys |
| 5 | Break it on purpose | How It Works | Read a simulated error's shape — then hunt a planted failure to its exact message |

The missions are self-explanatory for students in the app. Instructors and maintainers get the map, the answer keys and the plumbing in **[The Missions guide](./docs/MISSIONS.md)**; the full design record is the **[Try / Learn / Find / Check spec](./docs/try-learn-find-spec.md)**.

## 🚀 Quick Start

### Option 1: Simple Docker Development (Recommended for Mac)

Perfect for new developers - get up and running in minutes:

```bash
# 1. Setup environment
npm run setup:env
# Edit .env with your values (copy from .env.example)

# 2. Build the website (the containers serve it from dist/)
npm run build:angular

# 3. Start simple development environment
npm run docker:dev:simple

# 4. Access your app
# Main app: http://localhost  (or http://localhost:3000, the Node app directly)
# Health check: http://localhost/health
# API: http://localhost/api/restaurant
```

**Need more features?** Try the full production simulation: the same app plus the real New Relic infrastructure agent and a PostgreSQL with monitoring extensions. Here only nginx is published, so use http://localhost (port 3000 is not reachable from your machine):
```bash
npm run docker:dev:full
```

📖 **For complete Docker guide**: [DOCKER_DEVELOPMENT_GUIDE.md](./DOCKER_DEVELOPMENT_GUIDE.md)

### Option 2: GitHub Actions Deployment

Deploy to AWS EC2 with the **deploy-cloudformation** workflow:

1. **Fork this repository**
2. **Configure GitHub Secrets** (Settings → Secrets and variables → Actions → Secrets):
   ```
   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
   DB_PASSWORD
   NEW_RELIC_LICENSE_KEY, NEW_RELIC_API_KEY
   ```
3. **Configure GitHub Variables** (the Variables tab next to Secrets):
   ```
   EC2_KEY_NAME        an existing EC2 key pair in the region, by name (nru), not the .pem file name
   NEW_RELIC_APP_ID    the APM entity GUID, for deployment markers
   AWS_REGION          optional, defaults to us-west-2
   ```
   The full list, including the optional ones, is in the [Deployment Guide](./docs/deployment/DEPLOYMENT_GUIDE.md#deploying-with-github-actions).
4. **Run the workflow with `stack`** (Actions tab) to create the infrastructure. After that, a push to `main` that changes `server/` or `angular-app/` deploys the code to staging by itself.
5. **Access your application** at the load balancer address in the stack outputs

### Option 3: Local Development (Non-Docker)

```bash
# Setup environment
npm run setup:env
# Edit .env with your configuration

# Install dependencies
npm run install:all

# Start development server
npm run dev
```

> 📚 **For detailed setup instructions**, see [SETUP_GUIDE.md](./docs/setup/SETUP_GUIDE.md)  
> 🗄️ **For database setup**, see [DATABASE_GUIDE.md](./docs/setup/DATABASE_GUIDE.md)

## 🏗️ Architecture

### Frontend (Angular 22)
- **Components**: Modular UI components for restaurants, menu, checkout, order tracking and customer management
- **Services**: Data management for cart, customer and restaurant operations, the live order status channel (`OrderStatusService`) and the ordering funnel events (`FunnelService`)
- **Responsive Design**: Mobile-first approach with modern CSS
- **TypeScript**: Type-safe development with strict compilation

### Backend (Node.js)
- **Express Server**: RESTful API with structured routing
- **Data Management**: PostgreSQL in Docker and on EC2, with an in-memory JSON fallback when no database is available
- **Live Order Status**: A WebSocket at `/api/orders/stream`, fed by the order-status worker
- **Monitoring**: Integrated New Relic APM agent with custom attributes, events and metrics
- **Security**: Environment-based configuration and header protection

### Infrastructure
- **Docker**: Multi-stage builds with production optimization
- **Deployment**: Automated scripts with validation and monitoring
- **Load Testing**: Locust-based performance testing
- **Security**: Comprehensive validation and compliance checks

## � Project Structure

The OrderUp project is organized for clarity and ease of development:

```
orderup/
├── README.md                    # 👈 Project overview and quick start
├── DOCKER_DEVELOPMENT_GUIDE.md # 🐳 Complete Docker development guide
├── package.json                # 📦 Main project dependencies and scripts
│
├── angular-app/                # 🅰️ Angular frontend application
├── server/                     # 🌐 Node.js backend server
├── docker/                     # 🐳 Docker configurations (simple and full)
├── docs/                       # 📚 Organized documentation
│   ├── setup/                 # 🛠️ Setup and configuration guides
│   ├── deployment/            # 🚀 Deployment documentation
│   └── troubleshooting/       # 🔧 Problem-solving guides
└── scripts/                    # 🔧 Deployment and utility scripts
```

**📖 For complete project structure details**: [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)

**🎯 New Developer Path:**
1. This README for overview
2. [DOCKER_DEVELOPMENT_GUIDE.md](./DOCKER_DEVELOPMENT_GUIDE.md) for quick start
3. [docs/README.md](./docs/README.md) for specific documentation

## �📚 Documentation

### � Essential Reading
- **[Docker Development Guide](./DOCKER_DEVELOPMENT_GUIDE.md)** - 🐳 **START HERE** for local development
- **[Project Structure](./PROJECT_STRUCTURE.md)** - 📁 Understanding the organized codebase
- **[Documentation Index](./docs/README.md)** - 📚 Which document to read for what

### 🎯 Quick Access by Topic

#### �️ Setup & Configuration
- **[Setup Guide](./docs/setup/SETUP_GUIDE.md)** - The optional HTTPS development environment (uses an archived script)
- **[Database Guide](./docs/setup/DATABASE_GUIDE.md)** - PostgreSQL configuration and management
- **[Environment Variables](./docs/setup/ENVIRONMENT_VARIABLES.md)** - Configuration and secrets
- **[DevContainer Setup](./docs/setup/DEVCONTAINER_SETUP.md)** - VS Code development containers

#### 🚀 Deployment & Operations  
- **[Deployment Guide](./docs/deployment/DEPLOYMENT_GUIDE.md)** - Production deployment workflows
- **[CloudFormation Templates](./cloudformation/README.md)** - AWS infrastructure deployment
- **[GitHub Actions deployment](./docs/deployment/DEPLOYMENT_GUIDE.md#deploying-with-github-actions)** - The deploy-cloudformation workflow: code, stack and cleanup

#### 📊 Monitoring & Testing
- **[New Relic Demo Features](./docs/NEW_RELIC_DEMO.md)** - "Behind the scenes" callouts, planned failures and source maps
- **[The Missions](./docs/MISSIONS.md)** - The five-mission teaching path: map, answer keys and plumbing
- **[Try / Learn / Find / Check Spec](./docs/try-learn-find-spec.md)** - The design record for the missions and callouts
- **[New Relic Setup Scripts](./newrelic/README.md)** - Dashboard, service levels, alerts and workload
- **[New Relic Infrastructure Setup](./docs/NEW_RELIC_INFRA_SETUP.md)** - Host and database monitoring
- **[Load Testing](./docs/LOAD_TESTING.md)** - Performance testing with Locust
- **[Testing the front end](./angular-app/TESTING.md)** - What to test, and how the Angular specs are built
- **[Security](./docs/SECURITY.md)** - Practices, checks and the open findings from the security review

#### 🔧 Troubleshooting
- **[EC2 Troubleshooting](./docs/troubleshooting/EC2_TROUBLESHOOTING.md)** - Stack problems and a site that is not working on EC2
- **[Docker Comprehensive Guide](./docs/troubleshooting/DOCKER_COMPREHENSIVE_GUIDE.md)** - Docker services, commands and fixes for common problems

### 💡 Quick Reference for New Developers
1. **[README.md](./README.md)** - This file, project overview
2. **[DOCKER_DEVELOPMENT_GUIDE.md](./DOCKER_DEVELOPMENT_GUIDE.md)** - Get coding in 3 steps
3. **[docs/README.md](./docs/README.md)** - Find any specific documentation
- **DevContainer Setup**: Use [DEVCONTAINER_SETUP.md](./docs/setup/DEVCONTAINER_SETUP.md) for dev container configurations
- **Database Setup**: Use [DATABASE_GUIDE.md](./docs/setup/DATABASE_GUIDE.md) for PostgreSQL initialization  
- **AWS Deployment**: Use the **deploy-cloudformation** workflow (Actions tab). A push to `main` that changes `server/` or `angular-app/` deploys the code to staging. See [Deployment Guide](./docs/deployment/DEPLOYMENT_GUIDE.md#deploying-with-github-actions)
- **Security Validation**: Run `npm run security:validate` for comprehensive security checks
- **Load Testing**: Execute `npm run loadtest` for performance testing
- **Deployment helper**: `./scripts/deploy.sh -h` lists the options (build, deployment marker, start, load test)
- **Environment Setup**: Copy `.env.example` to `.env` and configure your settings
- **AWS Cleanup**: See [Removing a deployment](./docs/deployment/DEPLOYMENT_GUIDE.md#removing-a-deployment)

## 🛠️ Development

### Prerequisites
- Node.js 24+ (or use the included dev container)
- Docker and Docker Compose
- Python 3.11+ (for load testing)

### Project Structure
```
orderup/
├── angular-app/          # Angular 22 frontend application
│   ├── src/app/         # Application components and services
│   └── public/          # Static assets and icons
├── server/              # Node.js/Express backend
│   ├── data/           # JSON data files
│   └── views/          # Handlebars templates
├── .devcontainer/      # VS Code dev container configuration
└── docs/               # Documentation files (*.md)
```

### Available Scripts

#### Development
```bash
npm run dev              # Start development server
npm run build           # Build Angular app and server
npm run start           # Production start with New Relic
```

#### Docker Operations
```bash
npm run docker:dev:simple    # App, PostgreSQL and nginx
npm run docker:dev:full      # Plus the New Relic infrastructure agent and database monitoring
npm run docker:status        # What is running
npm run docker:logs          # Follow the logs
npm run docker:stop          # Stop everything
npm run docker:clean         # Stop and delete containers and volumes (the database is lost)
```

#### Deployment & Testing
```bash
./scripts/deploy.sh -h       # Build, mark a deployment in New Relic, start (-b, -m, -s, -l)
npm run loadtest             # Run load tests with Locust
npm run security:validate    # Run security validation
cd angular-app && npm run test:ci   # Angular unit tests (see angular-app/TESTING.md)
node --test server/          # Server tests
```

## 🔧 Configuration

### Environment Variables
Copy `.env.example` to `.env` and configure:

```bash
# New Relic Configuration
NEW_RELIC_LICENSE_KEY=your_license_key
NEW_RELIC_API_KEY=your_api_key

# Application Settings
NODE_ENV=production
PORT=3000
```

### Docker Configuration
- **Multi-stage builds** for optimized production images
- **Non-root user** execution for security
- **Environment variable injection** for configuration
- **.dockerignore** for build context optimization

### Docker Compose Configurations

Two compose files in `docker/` are maintained. Both read `.env` from the repository root; the npm scripts pass it with `--env-file .env`, which Compose needs to fill in values such as `DB_PASSWORD`.

| File | Start it with | Runs |
|---|---|---|
| `docker-compose.dev-simple.yml` | `npm run docker:dev:simple` | The app (`orderup`), PostgreSQL 16 (`db`) and nginx. Ports 80 and 3000. |
| `docker-compose.arm64.yml` | `npm run docker:dev:full` | The same, plus PostgreSQL with the monitoring extensions and the real New Relic infrastructure agent (`newrelic-infra`, pinned to the version the EC2 hosts use). Only nginx is published (80 and 443). |

The infrastructure agent in the full setup (the `newrelic/infrastructure-bundle` image) runs privileged, with the host's PID namespace, and mounts the host filesystem and Docker socket read-only. On Docker Desktop the host it reports is the Docker VM, not your computer. It also runs the nginx and PostgreSQL integrations against the `nginx` and `db` containers, configured by `newrelic-integrations/docker/`. Slow queries, individual queries, execution plans, wait events and blocking sessions are all reported: the database image is built with Percona's `pg_stat_monitor` and `pg_wait_sampling`, and an instructor-armed generator creates the waits (see [New Relic Integrations](./docs/NEW_RELIC_INTEGRATIONS_SETUP.md)).

The earlier compose files (`docker-compose.yml`, the dev and dev-container overrides, the load test setup) are kept in `docker/archive/` and are not maintained. To work in a VS Code dev container, see [DevContainer Setup](./docs/setup/DEVCONTAINER_SETUP.md).

## 🧪 Testing & Quality

### Unit Tests
```bash
cd angular-app && npm run test:ci    # Angular components and services (Karma + Jasmine, headless Chrome)
node --test server/                  # Server routes, worker and WebSocket stream
```
[angular-app/TESTING.md](./angular-app/TESTING.md) explains what is worth testing here and how the specs are put together.

### Load Testing
Built-in Locust configuration for performance testing:
```bash
npm run loadtest        # Interactive load testing
npm run loadtest:headless   # Automated performance tests
```

### Security Validation
Comprehensive security checks:
```bash
npm run security:validate   # Full security audit
npm run security:docker     # Dockerfile security scanning
```

## 📊 Monitoring

### New Relic Integration
- **APM Monitoring**: Application performance and error tracking
- **Browser Monitoring**: Real user monitoring and page load times
- **Custom Metrics**: Business-specific monitoring and alerting
- **Deployment Tracking**: Automated deployment markers

### What the App Reports
| Source | Data |
|---|---|
| Browser agent | `PageView`, `AjaxRequest`, `BrowserInteraction`, `JavaScriptError` and `WebSocket` events; session replay is off by default |
| Funnel `PageAction`s | `restaurants_viewed`, `menu_viewed`, `add_to_cart`, `checkout_started`, `order_placed`, plus `restaurant_filter_applied` and `cart_item_removed` |
| Tracker `PageAction`s | `order_tracker_status` and `order_tracker_connection`: each status shown, and drops, retries and fallback to polling |
| APM | Transactions with custom attributes (`orderId`, `restaurant`, `demoCode` and more), errors, distributed traces |
| Custom events | `ItemsOrdered`, `OrderPipelineSample` (order-status worker), `OrderStreamSample` and `OrderStreamPush` (the WebSocket) |
| Custom metrics | `Custom/total` and `Custom/<restaurant>/total` |

[New Relic Demo Features](./docs/NEW_RELIC_DEMO.md) explains each of these and the queries behind the "Behind the scenes" callouts.

### Key Metrics
- Response times and throughput
- Error rates and exceptions  
- Database query performance
- User experience metrics

## 🔒 Security Features

- **Secret Management**: Environment-based configuration with no hardcoded credentials
- **Container Security**: Non-root execution and minimal attack surface
- **Header Protection**: Security headers and sensitive data filtering
- **Validation Pipeline**: Automated security checks in CI/CD
- **Compliance**: OWASP security guidelines and best practices

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Maintain test coverage
- Update documentation
- Run security validation before commits

## 📄 License

This project is part of the New Relic University workshop series and is provided for educational purposes.

## 🆘 Support & Resources

- **Workshop Materials**: Part of New Relic University curriculum
- **Documentation**: Comprehensive guides in the `/docs` folder
- **Issues**: Report bugs and feature requests via GitHub Issues
- **New Relic**: [Official Documentation](https://docs.newrelic.com/)

---

**Built with ❤️ for learning modern web development, security, and observability practices.**





