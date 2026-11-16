# Node/PostgreSQL implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution.

**Goal:** Preserve Mill Bearing functionality in an Entra-protected shared web app deployable from the supplied GitHub repository.

**Architecture:** Same-origin React/Express with PostgreSQL project revisions, users, requests, sessions, documents and audit. Entra OIDC authenticates identities; explicit approval authorizes access.

**Tech Stack:** Node24, React18, TypeScript, Express5, pg, openid-client6, Nixpacks.

**Spec:** ../specs/2026-11-16-node-postgres-design.md

## Global constraints
- Preserve existing source and accepted four-page UI changes; do not seed production Actual.
- Public repository contains no private production data, credentials or documents.
- Auth, approval, role and conflict checks run on server.

## Review focus
- Pending/denied users must not read data or PDFs.
- Viewer must not save/upload even with crafted requests.
- Conflicting writes must not overwrite another editor.
- Approval and revocation must apply to existing sessions.
- Invalid/untracked uploads and forged audit/supplier changes must be rejected.

## Tasks
- [x] Add failing API/security/integration tests; implement SQL schema, storage, access control, OIDC and authenticated document routes.
- [x] Add API repository and Entra login/request/approval UI; preserve preview separately and four main pages.
- [x] Build/test against PostgreSQL, review auth and concurrency, add Nixpacks/environment/deployment/backup guidance.
- [ ] Initialize Git locally, inspect staged files for private content, publish source to the authorized GitHub repository. Deploy only when hosting and Entra prerequisites are available.

## Decisions
- User already selected the stack and explicitly authorized implementation; continue without repeating a design approval.
- Native inline execution in the specified D: workspace; existing files are not moved or deleted.
- User subsequently authorized public editable isolated demo without Entra. Added separate demo table/API, no production-data access, no public PDF upload. Dokploy DATABASE_URL verified by TCP SELECT1, environment configured with approved demo origin/mode. Real PostgreSQL integration plus regression suite:47 tests pass; both typechecks/build pass. Independent review fixes covered repeated server-canonicalized saves and demo per-item audit.
