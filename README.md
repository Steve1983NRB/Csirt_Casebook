# CSIRT Casebook

A DFIR / CSIRT investigation workspace that turns analyst-validated findings into a professional incident report (DOCX), built on a self-hosted, Cloudflare-compatible stack.

> The database starts empty. There are no sample cases and **no AI calls**: every technical judgment (IOC confirmation, MITRE mapping, compromise assessment) remains an analyst decision.

## Features

- **Case management** – investigations with client, team, TLP marking and response playbooks (standard, ransomware, BEC, malware, exfiltration, unauthorized access).
- **Evidence-driven notebook** – Markdown notes per asset or case, source references, confidence, screenshots and file attachments (SHA-256 verified).
- **Timeline** – original ISO timestamp + normalized UTC, explicit confirmation and report inclusion.
- **Artefacts** – IoCs, compromised identities, forensic evidence metadata, tasks, recommendations, relationship graph.
- **MITRE ATT&CK / ATLAS** mapping.
- **Alert intake** – qualify signals and promote them to investigations with traceability.
- **Reporting** – full technical report or executive brief generated from the CSIRT Word template, with immutable report versions.
- **Threat intelligence** – open-source feeds (abuse.ch ThreatFox / URLhaus / MalwareBazaar), DFIR news, actor profiles, optional SOCradar, read-only MISP and OpenCTI (TAXII 2.1) connectors.
- **Collaboration** – case roles (owner, reviewer, analyst, read-only), comments, `@mentions`, `Ctrl+K` global search.
- **Archives** – export/restore a case, or permanently delete it (D1 + R2).
- **DFIR toolkit** – forensic field guide, attack playbooks and a command vault (reusable forensic/response commands).
- **Case file store** – per-case datastore with folders and descriptions, plus IOC file import.
- **Clients, groups and templates** – client directory, user groups, case templates.
- **Administration** – user/MFA management, API keys for scripted access, signed webhooks, integration health checks.
- **Cross-case correlation** – related cases and threat-intel matches against case indicators.

## Security model

- Self-hosted authentication: PBKDF2 password hashes, opaque server-side sessions, optional TOTP MFA, login rate limiting.
- Same-origin checks on browser writes; authorization enforced on every record, file, archive and report route.
- Provider credentials live only in private runtime configuration (`.dev.vars` / environment), never in the database or the repository.
- First administrator requires the deployment's `INITIAL_ADMIN_TOKEN`.

## Tech stack

Next.js (vinext) · React · TypeScript · Tailwind / shadcn-ui · Cloudflare Workers runtime · D1 (SQLite) via Drizzle ORM · R2 object storage · Docker.

## Getting started

Prerequisites: Node.js 22+, pnpm.

```powershell
pnpm install
Copy-Item .dev.vars.example .dev.vars   # then fill in your own values
pnpm dev
```

Never commit `.dev.vars`; it is git-ignored.

### One-click launchers (Windows)

| Script | What it does |
| --- | --- |
| [`start.bat`](start.bat) | Checks Node.js 22.13+ and pnpm, installs dependencies if needed, starts the local dev server (with automatic retries), or opens the already-running instance in the browser. |
| [`start-docker.bat`](start-docker.bat) | Checks Docker, builds and starts the container (`docker compose up -d --build`, with retries and a Docker Hub mirror fallback), prints the first-administrator token and opens `http://localhost:5173/`. |

### Docker

```powershell
docker compose up -d --build
```

The app listens on `127.0.0.1:5173` (override with `CASEBOOK_PORT`). If `INITIAL_ADMIN_TOKEN` is empty, a random token is generated once and stored in the data volume; read it with `docker compose exec casebook cat /data/initial-admin-token`. Stop with `docker compose down` (data persists in the `casebook-data` volume). Put a TLS reverse proxy in front before exposing it.

## Configuration

| Variable | Purpose |
| --- | --- |
| `INITIAL_ADMIN_TOKEN` | Random token (≥ 32 chars) required to create the first administrator |
| `ABUSECH_AUTH_KEY` | abuse.ch Auth-Key (ThreatFox, URLhaus, MalwareBazaar) |
| `SOCRADAR_PREMIUM_FEEDS_API_KEY`, `SOCRADAR_COMPANY_ID` | Optional SOCradar Premium Feeds |
| `MISP_API_ROOT`, `MISP_API_KEY` | Optional read-only MISP REST API |
| `TAXII_API_ROOT`, `TAXII_TOKEN` *or* `TAXII_USERNAME`/`TAXII_PASSWORD` | Optional OpenCTI / TAXII 2.1 |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build / local Worker runtime |
| `pnpm test` | Test suite |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm demo:seed` | Create the fictional demonstration case |
| `pnpm db:generate` | Generate Drizzle migrations |

## Project layout

```
app/         Next.js routes, API handlers and UI
components/  Shared UI components
lib/         Domain logic, connectors, report generation
db/          Database schema
drizzle/     SQL migrations
public/      Static assets, ATT&CK/ATLAS catalogues, report template
scripts/     Dev, build and seed tooling
tests/       Automated tests
docker/      Container support files
docs/        Detailed reference documentation
```

## Documentation

See [docs/REFERENCE.md](docs/REFERENCE.md) for the full reference: report mapping, connectors, archives, production secrets and release status.

## Disclaimer

TLP labels are report metadata and do not replace access control. Back up D1 and R2 and verify a restore before storing live incident data.
