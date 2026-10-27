# CSIRT Investigate

An English-language DFIR investigation workspace that turns analyst-selected findings into the supplied CSIRT Word incident report. The database starts empty: there are no sample cases, and no AI calls. A fictional demonstration case can be created on request (see [Demonstration case](#demonstration-case)); it never writes indicators or actors into the shared threat-intel library. DFIR News reads real publisher feeds, the Threat intel section synchronises real open-source indicator feeds and actor profiles, optional SOCradar and read-only MISP connectors import indicators, and an optional TAXII 2.1 client can read a configured OpenCTI endpoint.

**Navigation:** Dashboard, Investigations, Operations, Clients, Alert intake, ATT&CK / ATLAS, DFIR News, Threat intel, Integrations, API keys and (administrators) Accounts & access. Inside a case: Overview, Notebook, Timeline, Evidence, Intelligence, Enrichment, Action plan, Relationships, Linked cases, Files, Discussion, Report, Activity and Access.

## Implemented workflow

1. Qualify incoming signals in Alert intake, then promote confirmed alerts to investigations while retaining source traceability.
2. Create an investigation with reference, client, team, notification date, TLP marking and a response playbook. Standard, ransomware, BEC, malware, exfiltration and unauthorized-access playbooks create editable initial action plans.
3. Add Windows, Linux, macOS, cloud, network or other assets.
4. Keep Markdown investigation notes per asset or at case level. Record source references, confidence and linked forensic evidence.
5. Group notes into analyst-named notebook folders. Folders are labels on notes, so they can be renamed or removed without migrating files or changing case permissions.
6. Discuss a case with its authorized members, add comments to individual records, and mention teammates by their registered `@email`. Mentions are checked against case membership; no email is sent.
7. Save PNG/JPEG screenshots with a note, including clipboard paste. Attach arbitrary files to an IOC, too; the server computes SHA-256 and serves them as downloads, never inline. Word export verifies screenshot hashes before embedding.
8. Promote a finding to a timeline event; retain its original ISO timestamp with offset, normalized UTC timestamp and source. Confirmation and report inclusion are explicit choices.
9. Track forensic evidence metadata, IoCs, compromised identities, MITRE mappings, tasks and client recommendations. Use the Relationships graph to navigate links between these artefacts.
10. Maintain a client directory with contact details, engagement notes and a linked investigation history. New investigations create a client profile when needed.
11. Search every accessible case and artefact from the `Ctrl+K` command palette. Search results enforce the same case membership policy as direct API access.
12. Choose a full technical report or a concise executive brief. Both are DOCX files generated from the original template with its original artwork, headers and footers preserved.
13. Assign case members as reviewers, analysts or read-only users. Authorization applies to every record, comment, file, archive and report route.
14. Export and restore investigation archives, retain immutable report versions, or permanently delete a case and all related D1/R2 objects after exact-reference confirmation.

Draft notes and unconfirmed timeline events never enter the Word export even if marked for inclusion. Validating a note requires a source reference or linked evidence. Technical judgments, IOC confirmation and MITRE mappings remain analyst decisions. There is no automatic inference of compromise or exfiltration.

## Storage and access

This distribution runs on the private Sites hosting platform, using a Cloudflare Worker, D1 (SQLite) for structured records, and R2 for binary file contents. The local Worker runtime stores both services under `.wrangler/state`; the Docker runtime stores them under `/data/state` on the persistent `casebook-data` volume. Authentication is self-hosted with PBKDF2 password hashes, opaque server-side sessions and optional TOTP MFA. Password and MFA verification attempts are limited to 10 per 15 minutes per client/account pair. Same-origin checks protect browser writes. The first workspace administrator must present the deployment's `INITIAL_ADMIN_TOKEN`; subsequent accounts are created by workspace administrators, and case owners separately grant reviewer, analyst or read-only access.

Authoritative data is server-side, never localStorage. D1 stores cases and case records (including assets, notes, evidence, events, IOCs, identities, tasks and mappings), alerts, clients, memberships/groups, comments, audit events, account/session metadata, API-key hashes, templates, custom-field definitions, webhooks/delivery metadata and webhook signing secrets, TAXII import provenance, and the shared indicator/actor library with feed status/cache. Notes, case metadata and records use explicit saves and optimistic version checks. A stale update is rejected with HTTP 409. Updates and their before/after audit events execute in a single D1 batch transaction. Data entered in failed forms is retained in the editor. Only the latest 200 audit entries are displayed; the case archive exports the complete audit history.

R2 stores the bytes for screenshots, IOC attachments, case datastore files, generated DOCX reports and report source snapshots; D1 keeps their IDs, names, MIME types, sizes, SHA-256 hashes and relationships. Static ATT&CK/ATLAS catalogues and bundled actor profiles are application files under `public/`, not D1 rows. External provider credentials/configuration (including abuse.ch, MISP, SOCradar and TAXII credentials) belong in private runtime configuration and are not persisted in D1/R2. App-managed webhook signing secrets are stored in D1 as part of the webhook configuration. Original disk images and other large forensic acquisitions remain in the organization's evidence store; the app records their metadata/references, not their payloads.

This workspace's local D1 SQLite file was checked read-only: `PRAGMA integrity_check` returned `ok`, and the application schema was present (28 SQLite tables including one Miniflare internal table). This verifies the current local file's integrity/schema only; it does not verify the production D1/R2 bindings, available disk/quota, or future growth. Production capacity depends on the Cloudflare plan and R2 usage; no realistic high-volume storage/load test has been performed. Keep both D1 and R2 backups and verify a restore before storing live incident data.

Case ownership uses the stable local account ID. A verified email is used once to bind legacy cases that predate the owner-ID migration. Other users must be explicitly assigned to the case by its owner after an administrator creates their workspace account. Assigning a case role sends no invitation and does not change the workspace audience. TLP labels are report metadata; they do not replace authorization controls.

| Role | Case content | Review and Word generation | Membership and case archive |
| --- | --- | --- | --- |
| Owner | Read and write | Allowed | Allowed |
| Reviewer | Read and write | Allowed | Denied |
| Analyst | Read and write | Cannot approve findings, confirmed compromise or report indicators | Denied |
| Read-only | Read, including existing report downloads | Denied | Denied |

Editing a reviewed finding as an analyst returns it to draft/unconfirmed or clears its report approval. Adding a screenshot as an analyst returns the note to draft and increments its revision. The reviewer role does not enforce a separate second person: owners and reviewers can validate their own work. Summary text, scope, evidence metadata and actions remain editable by analysts; Word generation always requires a reviewer or owner. This is a review workflow, not an independent four-eyes approval system.

Screenshots are limited to PNG/JPEG, 8 MB each. Report screenshot payloads are limited to 10 MB and uploaded DOCX files to 16 MB. Interactive case archives are limited to 16 MB compressed, 32 MB expanded, a 4 MB manifest, 2,000 records and 500 screenshots. Export runs the same integrity and size validator used by restoration, so an oversized case fails explicitly rather than producing an unrestorable archive. Large forensic images stay in their original evidence store; the application records their references and analyst-supplied hashes. It does not acquire disks or recompute hashes of external E01 files.

## Case archives and report history

Export from the case Activity tab, then use Restore archive on the investigations page. The restore dialog checks the archive before submission; the server repeats all checks. ZIP entry size, screenshot signatures and SHA-256, IDs, record links, event timestamps and validated-note sources are verified before case data is inserted. Restoration creates a new owner-only open case. It never overwrites the original or imports memberships. Imported audit entries are explicitly marked as historical claims from the archive, not independently authenticated activity.

Restore database writes run in one transaction. If that transaction fails, staged screenshot objects are removed on a best-effort basis. Screenshot and report object storage cannot participate in the database transaction, so infrastructure failure during cleanup can leave unreferenced objects for operational reconciliation.

The archive includes investigation records, evidence metadata, screenshots, IOC file attachments, discussion comments and audit history. Restored comments are explicitly labelled as claims from the archive; their original authors and mentions are not re-authenticated. The archive excludes large original forensic acquisitions, archived Word report files and permissions. Download archived Word files and their source snapshots separately. Scheduled backup of both D1 and R2, retention policies and infrastructure recovery remain deployment responsibilities; the interactive archive is not a complete disaster-recovery backup.

Every generated Word file is archived under a new immutable application ID, with the generating user's identity, timestamp, content hash and source revision. The server checks the source revision again before accepting the generated file. Later case changes do not rewrite that Word file or its JSON source snapshot. The client produces the DOCX; the server records the submitted bytes and source snapshot, not a cryptographic attestation of the report's factual correctness. R2 objects are protected by application access controls, not WORM retention.

## Report mapping

| Report section | Source |
| --- | --- |
| Cover, header, footer | Case client, reference, date, team, classification, version |
| Executive Summary | Analyst summary + selected validated finding titles + completed selected actions |
| Scope | Analyst scope + asset inventory |
| Analysis | Validated selected notes grouped by asset and category, with sources and screenshots |
| Recommendations | Selected actions marked as recommendations |
| Conclusions | Analyst conclusion and impact/priority assessment |
| MITRE / IoCs / Identities | Explicitly selected records |
| Compromised Devices | Assets explicitly marked confirmed compromised |
| Action Plan | Selected actions with owner, due date and status |
| Timeline | Confirmed selected events, ordered in UTC, with original timestamp and source |
| Forensic Evidences | Selected evidence metadata and included screenshot hashes |

The template is `public/CSIRT_Template_Report.docx`. The exporter checks its section anchors and refuses incompatible templates. It edits OOXML parts and preserves original media bytes. The original sample incident, example hashes, sample IOCs and instructional placeholders are removed from generated reports. Missing content is stated as not documented. Refresh the table of contents in Word if pagination is needed.

## MITRE ATT&CK and evidence mapping

The ATT&CK / ATLAS Matrix is available in the workspace navigation and in each case under Intelligence. It includes the complete official ATT&CK 19.2 Enterprise, Mobile and ICS catalogues: 918 active techniques/sub-techniques across the three domains, plus 348 revoked/deprecated entries available through Show retired. Every current technique retains its tactic associations and every sub-technique retains its parent. Enterprise 19.2 has 15 tactics; the interface uses the catalogue rather than a hard-coded historical 14-column model.

The AI threat view includes MITRE ATLAS 2026.09: all 16 tactics, 208 techniques/sub-techniques, 40 mitigations and 73 case studies, with maturity, platform and technique relationships preserved. Selecting an ATLAS technique shows related mitigations and case-study evidence; mappings use the same case-scoped review, source-link and report controls as ATT&CK. Navigator exports use ATLAS's `atlas-atlas` domain. Source data and required MITRE attribution are included under `public/attack/`.

Filter by domain, platform, text or mapped status. Open a technique to inspect its official description and map it to case assets, notes and evidence, with a rationale and confidence. The server validates the ID/domain and supplies canonical names and tactics. Approved report mappings require a rationale and supporting case records. Analyst edits clear approval. The report's existing MITRE section receives the reviewed mappings. A Navigator layer can be downloaded for the current domain; its colors represent mapping review state, not detection coverage.

Versioned source URLs, retrieval dates and full-source SHA-256 values are embedded in `public/attack/*.json`. The bundled MITRE license is at `public/attack/LICENSE.txt`. `python3 scripts/sync-attack.py` refreshes the catalogues and server index from MITRE's release index; review the changes and update the pinned release assertions before publishing a new ATT&CK version. Runtime browsing does not depend on MITRE availability.

## DFIR News

DFIR News reads RSS/Atom feeds from The DFIR Report, SANS Internet Storm Center, Magnet Forensics, Cyber Triage, DFIR.ch, DFIR Diva, This Week in 4n6 and Forensic Focus. SANS uses its full-content feed so publisher images and useful excerpts can be extracted. The eight publisher feeds were fetched and parsed in local checks. The parser extracts source links, dates, short text excerpts and available publisher images; feeds without images use a labeled source cover. Images load directly from publisher/CDN URLs with no referrer. The application does not copy full articles into its cache.

The server caches feeds for 15 minutes. The page refreshes on entry and every 15 minutes while visible; manual refresh is rate-limited to one fetch per source per minute. Source failures are retried after one minute and retain clearly labeled cached articles and their last-success time. Unavailable sources automatically expand the source-health panel. An aggregate failure returns HTTP 502 with per-source errors instead of silently returning an empty success. Cache read/write failures do not discard successful live results. The Worker transport uses manual redirects, following at most three redirects within the same approved publisher hostname (with or without `www`) and rejecting other hosts or insecure URLs. Fixed HTTPS feed URLs, bounded responses, rejected XML DTD/entity declarations and plain-text extraction constrain untrusted content. There is no arbitrary URL-fetch endpoint. News content never automatically enters an investigation or validates a finding.

## OpenCTI / TAXII 2.1

The Integrations tab contains an implemented TAXII 2.1 **pull client**. Configure the exact OpenCTI API root supplied by the server and one authentication method as server environment variables, then redeploy:

| Variable | Meaning |
| --- | --- |
| `TAXII_API_ROOT` | Exact publicly reachable HTTPS API root, DNS hostname, port 443, trailing slash, no query string |
| `TAXII_TOKEN` | Read-only OpenCTI service-account bearer token |
| `TAXII_USERNAME` / `TAXII_PASSWORD` | Alternative Basic credentials; do not combine with bearer authentication |

Credentials never enter browser state, API responses, source control or audit entries. Connection endpoints are configured by the deployment administrator; users cannot make the server fetch arbitrary endpoints. Redirects are refused so credentials cannot follow an unexpected location. A private OpenCTI deployment requires a separately approved network route; this release does not configure tunnels or bypass certificate checks.

Open a case as its owner, return to Integrations, choose Test & list collections, select a collection and Preview objects. Requests negotiate TAXII 2.1, preserve opaque pagination tokens, request latest object versions and support an Added after UTC filter. Preview objects are staged server-side, scoped to the requesting owner and case, and expire after one hour. Expired rows are physically removed on the next preview request.

Import up to 20 selected objects at a time. Simple supported STIX indicators become unconfirmed IoCs; recognized ATT&CK attack patterns become draft technique mappings. Compound patterns remain intact in draft intelligence notes. STIX IDs, versions, marking references and complete bounded source objects remain attached to imported records. The normal editing API cannot invent or rewrite connector provenance. Re-importing the same source/collection/object/version in the same case is idempotent; a newer STIX version is a separate draft so analyst work is not overwritten. No automatic synchronization or outbound case-data publication is enabled.

Review STIX markings before importing into the destination case. Marking references are preserved and visible, but custom OpenCTI markings are not translated automatically into CSIRT Investigate membership/TLP rules. Relationship and marking-definition objects are inspectable reference data, not automatically treated as case observations. Limits are 2 MB per upstream response, 900 KB per staged page, 80 KB per importable object. Case archives retain imported record provenance, but do not restore temporary previews, connection credentials or connector deduplication state.

Protocol and import behavior are covered by local contract/API tests with controlled server responses. **No real OpenCTI instance or token was supplied, so authenticated interoperability with the user's instance has not been verified.** See the official [OpenCTI feed documentation](https://docs.opencti.io/latest/usage/feeds/) and [OASIS TAXII 2.1 specification](https://docs.oasis-open.org/cti/taxii/v2.1/os/taxii-v2.1-os.html).

## SOCradar Premium Feeds configuration

The local Cloudflare Workers configuration template is [`.dev.vars.example`](./.dev.vars.example). Copy it to `.dev.vars`, then replace `SOCRADAR_PREMIUM_FEEDS_API_KEY` with the key from SOCradar's **Premium Feeds API**. Do not commit `.dev.vars` or expose this key to browser code.

For a deployed Worker, store the same value as a Cloudflare secret:

```text
wrangler secret put SOCRADAR_PREMIUM_FEEDS_API_KEY
```

`SOCRADAR_COMPANY_ID` is required as well (see `.dev.vars.example`); `SOCRADAR_API_ROOT` is optional and must be HTTPS. The key is a server-side configuration value. The Integrations tab uses it to list available feeds (accounts with up to 3,000 feeds are supported; use the filter box to search by name, category or description) and synchronize up to 500 indicators per operation into the selected case. The original SOCradar item is kept as read-only provenance on each imported IOC. Existing matching IOC records are enriched; new records remain unconfirmed drafts until an analyst validates them. Premium Feeds requests use the non-credit-based feed API and are rate-limited by SOCradar's account policy.

Use **Test all connections** at the top of Integrations to run read-only checks against configured SOCradar, MISP, OpenCTI/TAXII and abuse.ch/ThreatFox endpoints. The result reports each provider separately and never returns credentials. On Windows, `pnpm dev` exports the trusted Local Machine and Current User root certificates to a private local bundle and supplies it to Node as `NODE_EXTRA_CA_CERTS`; this supports enterprise TLS inspection while keeping certificate verification enabled. No TLS verification bypass is used.

## MISP REST API (read-only)

The Integrations tab includes a server-side, read-only MISP connector. Configure a dedicated MISP API key with read-only event/attribute permissions and the canonical MISP base URL:

| Variable | Meaning |
| --- | --- |
| `MISP_API_ROOT` | Publicly reachable HTTPS base URL on port 443, for example `https://misp.example.org/` |
| `MISP_API_KEY` | Dedicated MISP API key with read permissions only |

For local development, copy `.dev.vars.example` to the ignored `.dev.vars` and set both variables there. For Docker, set them in an untracked `.env` beside `compose.yaml` or in the process environment; Compose forwards them into the container's private runtime `.dev.vars`. For a deployed Worker, use `wrangler secret put MISP_API_ROOT` and `wrangler secret put MISP_API_KEY`. Never commit the key, expose it to browser code, or use an API key that can create/update/delete MISP data.

The case owner can test the connection and list published events from the last 30 days (maximum 50 per request), preview one event, and select up to 50 supported attributes for import. IPs, domains, hostnames, URLs, filenames, MD5, SHA-1 and SHA-256 are supported when values pass validation. Imported indicators are unconfirmed drafts (`include=false`), carry the event/attribute UUIDs and bounded raw attribute as provenance, and are deduplicated when the same MISP attribute is imported again into that case. Importing is always an explicit analyst action; no investigation data is sent to MISP and the connector never calls write endpoints.

The API key is sent only in the server-side `Authorization` header. The configured endpoint is fixed by the administrator; credentials are not forwarded across redirects, and IP-literal endpoints, non-HTTPS URLs and hostnames ending in local/test/internal-only suffixes are refused. The runtime must resolve and reach the configured public DNS endpoint; provide an approved network route if needed. This workspace has no MISP instance or credential configured for interoperability testing; validate the API key permissions and connection against your own MISP deployment before operational use.

## Initial administrator and production secrets

Before first sign-in, set `INITIAL_ADMIN_TOKEN` in the private hosting platform's secret store to a randomly generated value of at least 32 characters. For local development, set it in the untracked `.dev.vars` file; the checked-in example is only a placeholder. The first account registration requires this token and becomes the global administrator. Once an administrator exists, public registration is closed; do not reuse this bootstrap token for other credentials.

Apply every unapplied SQL migration in `drizzle/` to the production D1 database before deploying code that depends on it. In particular, migrations `0005_collaboration_clients_ioc_files.sql` and `0006_auth_login_limits.sql` create tables for collaboration/IOC files and authentication throttling. Confirm that the deployed Worker has the expected D1 binding, R2 bucket binding, and integration secrets without printing or sharing secret values. The app's local empty-D1 bootstrap is for development, not a substitute for production migrations.

## Future connector contracts

`lib/integrations.ts` defines source adapters and AI proposal contracts for IRIS, Splunk, Cortex XDR, Defender, Velociraptor and optional AI assistance. These additional adapters are **not implemented or connected**. They do not collect credentials or transfer investigation data. The separate TAXII and MISP implementations and RSS readers described above perform their documented read requests. Future adapters must preserve source IDs, timestamps, collection cursors and raw evidence references. AI output is a proposal and requires explicit review; unknown or missing source-record IDs are rejected by the proposal validator.

The interface also feature-detects WebMCP and exposes a read-only count summary of the selected investigation. It does not auto-create records, call an AI model or transfer the notebook contents. Live WebMCP validation was unavailable in this execution environment.

## Threat intel library

The **Threat intel** section holds a shared library of indicators and threat actor profiles, and each case has an **Enrichment** tab that compares the case's IOCs with it (exact value, plus the host of URLs) and suggests actors from technique overlap and names in notes. Hits and suggestions are leads, never proof or attribution.

- Feeds are fetched server-side only; no case or investigation data is sent to publishers. **Feodo Tracker** and the **DFIR Report Indicators** GitHub repository do not require a key. ThreatFox, URLhaus and MalwareBazaar require a free abuse.ch Auth-Key from [auth.abuse.ch](https://auth.abuse.ch/). For local `pnpm dev`, put `ABUSECH_AUTH_KEY=<your-key>` in the ignored `.dev.vars` file (copy `.dev.vars.example` first) and restart the server. For Docker, provide it in an untracked `.env` beside `compose.yaml` or the process environment; Compose forwards it to the container, which writes it to its private runtime `.dev.vars`. For a deployed Cloudflare Worker, configure it as a secret with `wrangler secret put ABUSECH_AUTH_KEY`. Never commit or expose the key in browser code.
- The feeds use the current authenticated abuse.ch endpoints: ThreatFox `get_iocs` for the last 7 days (up to 1,500 imported indicators per sync), URLhaus authenticated `recent.csv` (up to 1,000 imported URLs), and MalwareBazaar `get_recent` with `selector=100` (the latest 100 samples). The upstream sets may be larger; these application import limits intentionally bound each sync. Feodo Tracker currently publishes a small active list (5 entries observed during verification on 2026-10-26; the number can change).
- The DFIR Report loader reads the latest 100 dated Markdown reports from its public indicator repository, with a 25 MB aggregate response limit and a 20,000-indicator import limit. These are historical report leads, retain links to their source reports, and are not removed merely because a later sync omits them. Validate current activity before treating them as active indicators.
- Feed items and sync status are stored in D1 (`intel_items` and `external_cache`). Sync each feed individually from the Feeds tab; a 10-minute cooldown applies unless forced. If abuse.ch feeds fail, check that the key is present in the runtime, restart local/Docker services after configuration changes, then read the provider error shown on the feed card. A corporate TLS-inspecting proxy may also require its root CA in `docker/ca/` (Docker) or the Windows trust bundle used by `start.bat`; never disable certificate validation.
- **The DFIR Report** articles are available in DFIR News through the publisher RSS feed. The Threat intel section's **The DFIR Report** tab links to all seven public organization repositories. It does not copy or execute their rule, script, recipe or artifact contents. The DFIR-Artifacts repository explicitly prohibits incorporation into products or services without written permission; YARA/Sigma/Suricata rule licenses and reuse terms should also be checked before operational use. The Sigma-Rules repository says its public rules are now contributed to SigmaHQ; the tab links to that search.
- Actor profiles: `public/intel/actors.json`, generated by `python scripts/sync-actors.py` from MITRE ATT&CK (groups and technique usage, subject to MITRE's terms) and the MISP galaxy (CC0). Re-run it to refresh.
- Analysts can add indicators (single or pasted in bulk, defanged values accepted) and actors; only the author or an administrator can delete manual entries. Manual entries are labelled **Manual** (analyst-provided, not independently verified unless a reference link is supplied); feed entries show their source. The app never invents intelligence: the demonstration case does not add anything to this library.
- Actor profiles can reference MITRE ATLAS technique IDs (`AML.T…`) as well as ATT&CK IDs.
- Production: apply `drizzle/0007_threat_intel.sql` (the app also creates the table on first use). Synchronisation on Workers is bounded by CPU/time limits and has not been qualified on the production infrastructure.
- Rejected sources: ransomware.live (bot-protected), OpenPhish (unavailable). CISA KEV is a candidate for later.
- **Open cases** tab: every accessible, non-closed investigation is checked against the library (exact value, plus the host of URLs; defanged `hxxp`/`[.]` values are normalised) and against actor profiles. Actors are ranked by how much of their own technique set the case reproduces (16/16 for a specific profile, 9/33 for a broad one), so a generic overlap does not outrank a specific one. Everything is a lead to verify, never an attribution.

## Workspace features (migration 0008)

Apply `drizzle/0008_workspace_features.sql` in production (the local runtime creates the tables on first use).

- **API keys** (sidebar): personal Bearer tokens (`Authorization: Bearer kyk_…`), 1–365 days, shown once and stored only as a SHA-256 hash, revocable, at most 20 active. A key has exactly its owner's case access. It cannot manage keys, MFA, accounts, groups, webhooks or templates (these require an interactive sign-in). A bad Bearer header never falls back to a cookie session.
- **Linked cases**: explicit, symmetric links with a relation (related, duplicate, parent, child, same actor, same campaign) and a note. A link never reveals a case the viewer cannot open. Both cases get an audit entry.
- **Access groups**: administrators create groups and members; a case owner grants a group a role. A user's effective role is the highest of their direct and group roles (`case_access` view). A group can never confer the owner role.
- **Case files**: per-case file store in R2 (25 MB per file, 300 files and 500 MB per case), SHA-256 on upload, audited, always downloaded as an opaque attachment with a sandboxing CSP.
- **Custom fields and case templates** (administrators): typed fields (text, number, date, choice, yes/no, URL) validated server-side on every case save; templates prefill classification, scope, tags and playbook, and add extra tasks to new cases.
- **Webhooks** (administrators): HTTPS-only POSTs signed with HMAC-SHA256 (`X-CSIRT-Signature` over `timestamp.body`), redirects not followed, private/internal/IP-literal hosts refused, 4 s timeout, last 50 deliveries logged. By default only identifiers are sent; case details are opt-in per webhook. Events: case created/updated/linked, record created, report generated, alert created. Delivery is best effort and never fails the user's request. Workers cannot resolve DNS before connecting, so a public hostname that resolves to a private address is not detected: only point webhooks at endpoints you control.

## Demonstration case

`pnpm demo:seed` creates a fictional ransomware investigation (`DEMO-DLH-2026-001`) that fills every section: client, alert inbox (promoted to the case), assets, evidence, findings with screenshots, timeline, IOCs with a file attachment, identities, ATT&CK mappings, action plan, comments and both Word reports. Run it against a running local app with an existing account; if MFA is enabled, the script prompts for its current code:

```powershell
$env:DEMO_EMAIL='you@example.com'; $env:DEMO_PASSWORD='...'; pnpm demo:seed
```

Add `--reset` to delete and rebuild the demo case. Set `DEMO_URL` if the app is not on the URL in `.vinext/dev/lock.json` (for Docker use `DEMO_URL=http://localhost:5173`). All demo indicators use reserved or documentation ranges and exist only inside the demo case; screenshots are generated placeholders. The demo does not populate the shared Threat intel library, so real feed data is never mixed with fictional values. Do not use it in a workspace holding live client data.

## Docker alternative

`start-docker.bat` (or `docker compose up -d --build`) runs the app in a container with the same local Workers runtime as `start.bat`. Data (D1 database and R2 objects) lives in the `casebook-data` volume and survives `docker compose down`; `down -v` deletes it.

- URL: `http://localhost:5173/` (change with `CASEBOOK_PORT`). The port is bound to `127.0.0.1` only; put a TLS reverse proxy in front before exposing it.
- First administrator (step by step, on a fresh install such as a colleague's machine):
  1. Run `start-docker.bat` and wait for the build (3-5 minutes the first time). The browser opens `http://localhost:5173/` and shows **Create your account**.
  2. Get the **Administrator bootstrap token**. It is generated automatically on first start and stored in the data volume. In a terminal opened in the project folder, run `docker compose exec casebook cat /data/initial-admin-token` and copy the 64-character value. To choose your own token instead, set `INITIAL_ADMIN_TOKEN` (32+ characters) in an untracked `.env` beside `compose.yaml` before the first start.
  3. Fill in email, display name (optional), the token, and a password (12+ characters mixing upper/lower case, digits and symbols), then click **Create account**. This account becomes the global administrator.
  4. Once an administrator exists, registration is closed and the token is no longer needed. Further accounts are created by the administrator from inside the app.
- Accounts and cases are stored in the local `casebook-data` volume, not in the image or the project folder. A colleague who builds the project on their own machine gets an empty workspace and creates their own administrator with their own token; accounts created on another machine do not carry over. To share one workspace, have colleagues use the URL of the single machine that hosts the container (requires binding the port beyond `127.0.0.1`, a firewall rule and a TLS reverse proxy), and create their accounts from the administrator account.
- Before sending the project folder, leave out `.dev.vars`, `.env`, `.wrangler/`, `.sites-runtime/`, `node_modules/`, `dist/` and `.vinext/`: they hold local secrets, your database and large caches, and are not needed to build.
- If `docker compose` fails with a 503 while pulling the Node base image, `start-docker.bat` already retries and falls back between the `mirror.gcr.io` mirror and Docker Hub (override with `NODE_IMAGE`).
- Optional integration variables, forwarded into the container and written to its private `.dev.vars`: `ABUSECH_AUTH_KEY`, `MISP_API_ROOT`, `MISP_API_KEY`, `SOCRADAR_PREMIUM_FEEDS_API_KEY`, `SOCRADAR_COMPANY_ID`, `SOCRADAR_API_ROOT`, and the TAXII settings `TAXII_API_ROOT`, `TAXII_TOKEN` (or `TAXII_USERNAME` + `TAXII_PASSWORD`). Set them in the shell or in an untracked `.env` file next to `compose.yaml`; never commit secrets.
- The local runtime creates the complete application schema idempotently on first use, including threat-intel and workspace-feature tables. Production uses the numbered SQL migrations in `drizzle/`; apply every unapplied migration in order before deploying. The image also contains the ATT&CK/ATLAS datasets and actor profiles from `public/`.
- Demo data: with the container running, `DEMO_EMAIL=… DEMO_PASSWORD=… DEMO_URL=http://localhost:5173 pnpm demo:seed` creates the demonstration case.
- Behind a TLS-inspecting corporate proxy, threat-intel feeds fail with `self signed certificate`. Put the proxy root certificates as `*.pem` files in `docker/ca/` and restart; they are ignored by Git and the image build.
- The first build takes several minutes. This is a single-node local runtime, not a high-availability or backup solution: back up the volume yourself.

## Development and checks

Use Node.js 22.13 or newer and the package manager version declared in `package.json`.

- `pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm typecheck`
- `pnpm run db:generate` after changing `db/schema.ts`
- `pnpm run build`
- `python -m pip install PyYAML` and `python scripts/sync-atlas.py` to refresh the complete ATLAS dataset and index from MITRE

Production migrations are generated under `drizzle/`. Never rewrite an applied migration. Source tests use an isolated in-memory SQLite database and synthetic fixtures; they do not write into the deployed workspace. The API suite applies every migration to real SQLite and checks authentication, origin rejection, per-case isolation, grants/revocation, reviewer boundaries, stable-ID migration, screenshot review invalidation, archive restoration and tampering, failure rollback, archived report source revisions, cross-case references, timestamp consistency and optimistic concurrency. R2 is represented by a deterministic in-memory adapter; these are not tests against deployed Cloudflare infrastructure. The report suite checks original artwork, section mapping, omitted internal content, UTC sorting, sample-data removal and missing-image failures.

## Release status and remaining production qualification

This is an implemented, persistent release, not a demonstration data set. TypeScript, application build, API, report and intelligence tests and a rendered multi-asset Word export have been checked during development. A full browser end-to-end test, accessibility audit, external penetration test, realistic volume test and enterprise deployment qualification have not been performed.

Before using live CSIRT/client incident data, choose the approved hosting and retention model, validate the role policy with the team, validate organizational SSO, arrange scheduled database/object-store backups and demonstrate infrastructure restoration. The interactive case-archive restoration is tested in the local API suite; it does not restore every infrastructure object or establish disaster recovery. There is no automatic OneNote import, no live EDR/SIEM integration or verified customer OpenCTI connection, no collaborative simultaneous editor, no enforced independent reviewer sign-off, no legal-hold/WORM audit log and no on-premises high-availability package (a single-node Docker setup is provided) in this distribution. The audit is application-level history, not a tamper-proof chain of custody. These remain outstanding production requirements.

## Reference

The product model was informed by the official [DFIR-IRIS repository](https://github.com/dfir-iris/iris-web) and [IRIS documentation](https://docs.dfir-iris.org/latest/). This is an independent implementation using the user's CSIRT report template; no IRIS application source was copied.
