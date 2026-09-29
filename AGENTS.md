# AGENT.md: AetherStream Context

**Target Audience:** AI Assistants joining this project. Read this file to understand the current architectural state, past decisions, and strict constraints of the AetherStream repository before suggesting changes.

## 1. Project Overview

**AetherStream** is a production-grade telemetry pipeline monorepo designed to ingest, process, and visualize real-time sensor data from embedded microcontrollers (e.g., ESP32-S3).

## 2. Architectural Stack & Hard Constraints

- **Monorepo:** Turborepo.
- **Package Manager:** `pnpm` exclusively. Root `package.json` uses `devEngines` to strictly block `npm` and `yarn`. Do not suggest `npm install` commands.
- **Database:** PostgreSQL, entirely isolated within Docker on port `5433`.
- **Backend:** Node.js (v24+) + Express on port `3030`.
- **Frontend:** React + Vite on port `5173`. Uses a Vite proxy to route `/api` requests to the backend.
- **ORM:** Prisma v7. **Critical Note:** Prisma 7 is configured using the `@prisma/adapter-pg` driver and `pg.Pool`. Legacy Prisma client instantiation will throw a `PrismaClientInitializationError`.
- **Linting/Security:** Husky pre-commit hooks enforce Prettier and strict ESLint rules. Swallowed errors in `catch` blocks will fail the commit.

## 3. Current State (As of Last Session)

The local development environment is a fully operational vertical slice:

1.  Docker container is active and holding persistent data.
2.  Prisma schema has been manually scaffolded (bypassing a Turborepo generator bug) and migrated to the database.
3.  Node backend successfully writes/reads `Device` telemetry data using Express routes.
4.  React frontend successfully fetches database records via the Vite proxy and maps them to an HTML table.
5.  Husky hooks are active and passing.

## 4. Next Logical Milestone

**Production Containerization.** The immediate next step is to author a multi-stage `Dockerfile` to:

1. Compile the React frontend into static assets.
2. Prune development dependencies.
3. Package the Express server to serve the static frontend and dynamic API routes from a single, production-ready container.
