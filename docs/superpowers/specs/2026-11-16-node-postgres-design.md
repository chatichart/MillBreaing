# Mill Bearing standalone web application

The user approved replacing SharePoint hosting/storage with Node.js, PostgreSQL, Nixpacks and Dokploy on Hostinger, using chatichart/MillBreaing. Preserve existing four-page React UI and all accepted workflow changes. Preserve existing files. No generated production Actual or dates.

## Approach
SharePoint SPFx deployment was blocked by site installation permission. The user chose a standalone Node web application over running on an individual workstation. React assets and same-origin Express API run in one service. PostgreSQL stores the validated project snapshot as JSONB with an atomic revision, plus relational users, access decisions, sessions, documents and immutable server audit records. JSONB preserves the existing domain model and avoids a risky simultaneous UI rewrite; domain-specific relational reporting tables may be added later.

## Identity and authorization
Single-tenant Entra ID authorization-code OIDC with PKCE/state/nonce and confidential server client. Tokens never enter browser storage. Session cookies are HttpOnly, SameSite=Lax and Secure in production. PostgreSQL session storage supports restarts. Tenant and stable object ID identify users; email never grants privileges. New users have no project access. They explicitly request Viewer or Editor; configured Entra administrator object IDs approve, reject or revoke requests. Every API and PDF download checks current DB access. Viewer reads; Editor writes/uploads. Approver membership does not implicitly grant project editing access.

## Persistence and safety
Initial seed only on a missing project: LOAD50/BOTTOM10/AL_COVER20/UNLOAD20 with no Plan or Actual. Saves validate schema and use row locking/revision comparison so stale writes return 409 with current snapshot. Supplier changes are rejected for existing items. Server sets revision and audit actor/time; historical audit cannot be rewritten by a client. Documents are authenticated PDFs, max20MB, random filenames, stored on a persistent volume with SQL metadata and bound to item/kind/revision. Metadata saves can only reference known uploads. Orphan uploads remain private for reconciliation.

## Delivery

### Latest user-approved trial override
The user requested an online trial without Entra and explicitly chose public editing by anyone with the link. `DEMO_MODE=editor` runs a separate API using only `mb_demo_projects`. It neither reads nor initializes production data/users. It checks same-origin writes, schema and revision conflicts, keeps authoritative item audit, and disables public PDF uploads/admin routes. Entra remains the separate `DEMO_MODE=off` path; no secret is required for the isolated demo. Current origin is https://millbearing.realsoluplus.com, port3000.
GitHub contains source/config examples only. Dokploy uses Nixpacks npm ci, npm run build, npm start. PostgreSQL and upload volume require backups. Production fails closed without identity, session and database configuration. Deployment depends on Dokploy URL/domain, Entra Tenant/Client IDs, server-only secret and initial approver object IDs, which are not yet provided. Existing SPFx remains archived-compatible but is not the deployment path.
