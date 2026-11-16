# Mill Bearing — Realsoluplus Purchasing

Node.js + React + PostgreSQL web application deployed with Nixpacks on Dokploy/Hostinger.

Current trial URL: https://millbearing.realsoluplus.com

The authorized trial uses `DEMO_MODE=editor`: anyone with the link can edit the isolated trial dataset. Do not enter real/confidential data. PDF uploads and access administration are disabled in public trial mode. Entra ID sign-in with request/approval-based Viewer/Editor access is implemented as a separate mode and still requires tenant configuration and live acceptance testing.

Four pages: Dashboard, Supplier Tracking, Item Detail (Form/Table), Planning Coordination. Drawing is removed; Delivery uses Plan/Actual. Product filters, editable Original dates, dd/mm/yyyy dates and table actions above the table are preserved.

Initial quantities: Load50 / Bottom10 / AL Cover20 / Unload20. Production and demo seeds never invent Plan dates, Actual dates or item pairings. Existing data is not overwritten at startup.

## Development

- `npm ci`
- `npm test` (includes disposable real PostgreSQL integration tests)
- `npm run typecheck`
- `npm run typecheck:server`
- `npm run build`
- Set environment variables using `.env.example` as reference. Then `npm start`.
- Browser-only preview: `npm run preview` opens `/preview.html` and uses isolated localStorage.

See [deployment and Entra setup](docs/DOKPLOY.md). Runtime requires Node24, PostgreSQL, HTTPS and same-origin API. `nixpacks.toml` defines production build/start. Use a persistent upload volume before enabling Entra-mode document uploads and configure database/volume backups.

Legacy SPFx files and SharePoint instructions are preserved; they are not the active deployment path. See [legacy README](docs/README-SharePoint-legacy.md).
