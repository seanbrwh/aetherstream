# AetherStream Master Cheat Sheet

This is your operational command reference for the entire stack.

## 1. Monorepo & Package Management (pnpm & Turborepo)

_Run these commands from the root `aetherstream` directory._

- **Install all dependencies:** `pnpm install`
- **Start the full stack:** `pnpm run dev`
- **Start the stack and bypass Turbo's cache:** `pnpm run dev --force`
- **Install a package to a specific app:** `pnpm --filter api add [package-name]`
- **Install a dev package to a specific app:** `pnpm --filter web add -D [package-name]`
- **Run a specific script in one app:** `pnpm --filter api run [script-name]`

## 2. Database Infrastructure (Docker)

_Run these commands from the root `aetherstream` directory._

- **Start the database container in the background:** `docker compose up -d`
- **View real-time database logs:** `docker compose logs -f db`
- **Stop the database container:** `docker compose down`
- **Nuke the database and wipe all data:** `docker compose down -v`

## 3. Database ORM (Prisma)

_Run these commands from inside the `apps/api` directory._

- **Apply schema changes to the database:** `pnpm exec prisma migrate dev --name [descriptive_name]`
- **Regenerate the TypeScript client:** `pnpm exec prisma generate` (Use this if you pull someone else's changes or the types get out of sync).
- **Open the visual database editor in your browser:** `pnpm exec prisma studio`
- **Pull an existing database structure into your schema:** `pnpm exec prisma db pull` (Useful if you manually altered a table in TablePlus).

## 4. Frontend & Proxy (Vite & React)

_Run these commands from inside the `apps/web` directory._

- **Manually start just the frontend:** `pnpm run dev`
- **Build the static files for production:** `pnpm run build`
- **Preview the production build locally:** `pnpm run preview`
- **Clear the Vite cache:** Restart the server with `pnpm run dev --force` (Fixes stubborn dependency resolution issues).

## 5. Security & Git Guardrails (Husky & ESLint)

_Run these commands from the root `aetherstream` directory._

- **Manually format all code:** `pnpm exec prettier --write .`
- **Commit code bypassing Husky checks:** `git commit -m "message" --no-verify` (Use only in absolute emergencies when you need to save broken work).
- **Fix automatic linting errors:** `pnpm --filter api exec eslint src/ --fix`

## 6. Execution & Debugging (Node & TypeScript)

_Run these commands from inside the `apps/api` directory._

- **Run a single TypeScript file directly without compiling:** `pnpm exec tsx src/[filename].ts`
- **Verify TypeScript compilation without emitting files:** `pnpm exec tsc --noEmit` (Finds type errors before you attempt to build).
