# Deploy Mill Bearing on Dokploy

The standalone web app uses Node24 + React + PostgreSQL. SPFx sources and older SharePoint documents remain for preservation only. They are not required for this deployment.

## Public trial currently authorized

- Repository: https://github.com/chatichart/MillBreaing, branch main, build path `/`.
- Build Type: Nixpacks. `nixpacks.toml` sets install/build/start.
- Commands: `npm ci --include=dev`, `npm run build`, `npm start`.
- Domain: https://millbearing.realsoluplus.com, container port3000, HTTPS.
- Environment: `DATABASE_URL` (exact uppercase spelling), `APP_ORIGIN=https://millbearing.realsoluplus.com`, `DEMO_MODE=editor`, `NODE_ENV=production`, `PORT=3000`.
- The database hostname is internal Docker DNS. App and PostgreSQL must join the same Dokploy network. Do not expose PostgreSQL to the internet merely to make this app work.
- Demo startup creates only `mb_demo_projects`, seeded on first creation with 100 items and no Plan/Actual. It does not seed or read production project/user/document tables.
- Every person with the link can read/edit this trial dataset. Do not put real or confidential data in it. PDF uploads and administration are disabled in public trial mode.
- `/healthz` checks PostgreSQL connectivity. Trial data survives application redeploys because it is stored in PostgreSQL, not container memory or browser localStorage.
- Version conflicts return409 and keep the losing editor's draft; refresh/reconcile before saving again.

## Enable Entra and approval-based access later

1. Create a single-tenant Microsoft Entra App Registration. Set **Web** redirect URI exactly `https://millbearing.realsoluplus.com/auth/callback`. No SPA redirect and no implicit grants are needed.
2. Set `DEMO_MODE=off`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and server-side `ENTRA_CLIENT_SECRET`. Generate a random `SESSION_SECRET` with at least32 characters. Keep secrets only in Dokploy; never commit them or paste them into chat.
3. Set `ENTRA_ADMIN_OBJECT_IDS` to comma-separated Entra **user Object IDs** of authorized approvers (not email addresses or application IDs). Their tenant must match `ENTRA_TENANT_ID`. Approvers manage requests but still need project Viewer/Editor approval themselves to see/edit project data.
4. Set `UPLOAD_DIR=/data/uploads`; mount a persistent named volume there before enabling uploads. Back up that volume and PostgreSQL together. Keep database internal, use a dedicated least-privilege DB user. Set `DATABASE_SSL=true` only where PostgreSQL TLS is configured with a trusted CA; certificate verification is not disabled.
5. Redeploy. Startup creates the production schema and seeds a separate initial100 project only if missing. It **does not import public demo data**. No default accounts/passwords are created.
6. New Entra users select Viewer or Editor and submit a request. Only configured approvers can approve, deny, change or revoke. The server checks current access for every read/write/download; changes apply to existing sessions on their next request.
7. Verify real tenant sign-in, failed callback/state, request approval, Viewer read-only, Editor save/PDF, revocation, session expiry and restart on the deployed origin before calling this production-ready. Automated integration tests use a test identity provider, not live Entra credentials.

## Backups and recovery

Enable Dokploy scheduled PostgreSQL backups and verify a restore into a separate database. Retain the original database and upload volume during a rollback. Never point tests at production. SQL schema creation is additive and guarded with a startup advisory lock. Do not use destructive reset commands to fix deployment errors.

Public trial uses `mb_demo_projects`; production uses `mb_projects`, `mb_users`, `mb_sessions`, `mb_documents`, `mb_audit`. Project domain records are validated JSONB with revision locking; users, requests/decisions, sessions, upload metadata and authoritative audit are SQL records. Server audit overwrites untrusted client audit additions. Uploads use unique filenames, authenticated downloads and max20MB PDF checks. Unattached uploads remain private to their uploader/approver until metadata is reconciled.

## Local verification

`npm test`, `npm run typecheck`, `npm run typecheck:server`, `npm run build`.

Integration tests start a disposable PostgreSQL18 process on localhost55439 and write only a temporary test directory. They test real SQL transactions, simultaneous writes, authorization, CSRF, approval/revocation and document access. Local preview is separate: `npm run preview` opens `/preview.html` and never connects to production.

References: [Dokploy build types](https://docs.dokploy.com/docs/core/applications/build-type), [Dokploy databases](https://docs.dokploy.com/docs/core/databases), [Microsoft Entra OIDC](https://learn.microsoft.com/entra/identity-platform/v2-protocols-oidc).
