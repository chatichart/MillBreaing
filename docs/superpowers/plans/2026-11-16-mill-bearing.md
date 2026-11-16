# Mill Bearing implementation plan

Spec: ../../../../Agent.md (preserved authoritative requirements).

Architecture: SPFx 1.24.1, React 18.3.1, TypeScript; single SharePoint JSON file, existing identity, no SQL or separate login. All work stays in the user-selected D:\AI\Mill Bearing. No reference schedules supplied: production seed is empty, preview is explicitly synthetic with no Actual dates.

- [x] Foundation: official generator, typed validated schema, isolated local preview and four routes.
- [x] Domain: tests first for confirmed delivery, baseline delay, pairing readiness, weekly/monthly cumulative scopes, imports and document rules.
- [x] Workflow: tracking filters, milestone edits, append-only follow-ups and audits, explicit pairing, protected baseline revisions.
- [x] Dashboard and planning: S-Curve, supplier summaries, W1-W5 board/list/drilldown, meeting actions and filtered CSV.
- [x] Persistence: SharePoint adapter, checkout serialization and post-lock snapshot comparison, conflict draft retention, permission checks, PDF revision upload.
- [x] Verification: domain/repository/import/UI tests, production SPFx package and preview build; document tenant-only acceptance checks and recovery.

Review focus: stale and concurrent edits; missing source dates; QC versus delivery contradictions; multiple pairing dependencies; unsafe filenames and CSV formula injection.

Execution: inline per user authorization. Do not overwrite Agent.md. Tenant checks must be reported as unverified until credentials/configuration are available.

## Latest user amendment

Drawing removed from all active stages, forms, table columns, imports and document choices because PO is already issued. Delivery is only Plan and Actual. Internal original baseline and lossless optional legacy data remain. Explicit Purchasing Actual date counts delivery; no confirmation-reference/dispatch/truck detail form.

## Environment-dependent acceptance still pending

- [ ] Obtain source PDF/XLSX schedules and verify initial quantities/dates.
- [ ] Provision SharePoint app catalog, site/library, versioning/checkout, ACL and paths.
- [ ] Complete tenant persistence, upload/read-only, multi-session lock and restore checklist before enabling writes.

Decisions: work in current D: workspace per user override; no duplicate OneDrive project. No fake production Actual. Keep single active writer rollout until serialization has been proven in tenant.
