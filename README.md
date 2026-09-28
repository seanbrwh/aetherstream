# AetherStream Core

A production-grade telemetry pipeline and monorepo architecture. AetherStream is designed to ingest, process, and visualize real-time sensor data from embedded microcontrollers like the ESP32, providing a strict, type-safe boundary from the database all the way to the client interface.

## 🏗 System Architecture & Reasoning

This project rejects the standard "quick start" boilerplate in favor of a highly defensible, production-ready architecture. Every layer has been chosen with skepticism toward hidden magic and a focus on absolute control.

### The Stack

- **Monorepo Engine:** Turborepo & pnpm workspaces
- **Database:** PostgreSQL (Strictly Dockerized)
- **ORM:** Prisma v7 (Utilizing the lightweight `@prisma/adapter-pg` driver)
- **Backend:** Node.js, Express.js, Helmet security middleware
- **Frontend:** React, Vite, TypeScript

### Architectural Trade-offs & Decisions

**1. The Package Manager (pnpm vs npm)**
Standard `npm` creates flat dependency trees that allow ghost dependencies to leak across projects. We enforce `pnpm` workspaces to maintain strict topological boundaries. The root `package.json` contains engine enforcement rules to actively reject any accidental `npm install` commands, preventing split-brain lockfile corruption.

**2. Database Isolation (Docker vs Local Install)**
Installing databases directly on the host OS pollutes the system and creates versioning conflicts for future projects. AetherStream relies exclusively on a Dockerized PostgreSQL instance mapped to port `5433`. If the database corrupts, the container and volume can be destroyed and rebuilt in seconds, guaranteeing a pristine development environment that matches production perfectly.

**3. The ORM Engine (Prisma 7 + pg Adapter)**
Writing raw SQL strings in Node destroys TypeScript boundaries. We utilize Prisma to generate a strictly-typed client. However, to avoid the massive memory footprint of Prisma's legacy Rust engine, we utilize the modern `@prisma/adapter-pg` driver. This keeps the execution lightweight and serverless-ready while maintaining strict type safety.

**4. Dual Routing Paradigm (Dev vs Prod)**

- **Development:** Vite runs a hot-reloading server on port `5173`, and Node runs the API on port `3030`. To bypass Same-Origin Policy blocks, Vite is configured with a network proxy to silently forward `/api/*` traffic to the Node backend.
- **Production:** The React application is compiled down to static HTML/JS/CSS. The Node API transforms into a static file server, handling `/api` requests dynamically while passing all unhandled routes back to the React Router catch-all mechanism.

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v24 or higher)
- **pnpm** (Required. `npm` and `yarn` are actively blocked by engine strictness)
- **Docker Desktop** or Docker Engine

### 1. Ignite the Database

Boot the PostgreSQL container in the background. It will automatically initialize the database and bind to port `5433` on your host machine.

```bash
docker compose up -d
```

### 2. Install Dependencies

Install all packages across the monorepo using pnpm.

```bash
pnpm install
```

### 3. Synchronize the Schema

Push the Prisma schema to the Docker container to build the tables and generate the TypeScript client. The API relies on a `.env` file located in `apps/api/.env` containing the `DATABASE_URL`.

```bash
cd apps/api
pnpm exec prisma migrate dev
cd ../..
```

### 4. Start the Development Servers

Run the Turborepo master command to boot the Vite frontend and Node API concurrently.

```bash
pnpm run dev
```

- **Frontend Dashboard:** `http://localhost:5173`
- **Backend API:** `http://localhost:3030/api/health`
- **Direct Database Access:** `127.0.0.1:5433` (User: `aether_admin`)

## 📁 Directory Structure

```text
aetherstream/
├── apps/
│   ├── api/                # Node.js / Express backend
│   │   ├── prisma/         # Database schema and migrations
│   │   ├── src/            # Express routing and logic
│   │   └── .env            # Private database connection string
│   └── web/                # React / Vite frontend
│       ├── src/            # React components and views
│       └── vite.config.ts  # Dev server and proxy configuration
├── packages/               # Shared monorepo packages
│   ├── eslint-config/      # Universal linting rules
│   ├── tsconfig/           # Universal TypeScript configurations
│   └── types/              # Shared TS interfaces (Sensor payloads)
├── docker-compose.yml      # Infrastructure blueprint
└── package.json            # Workspace definitions and engine locking
```

## 🛡 Security & Linting

This repository enforces strict pre-commit hooks via Husky.

- **Helmet** strips `X-Powered-By` headers from the Express server to obscure the stack from network scanners.
- **ESLint** actively rejects unused variables (such as swallowed database error objects) to prevent silent failures in production.
- Code must pass all formatting and linting checks before Git will allow a commit to execute.
