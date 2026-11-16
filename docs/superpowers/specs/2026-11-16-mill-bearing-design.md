# Design decisions

Use the supplied SPFx architecture; the generic Node/PostgreSQL guidance is superseded by the detailed app specification. User expressly selects the current D: workspace over the older OneDrive path. Existing reference file is preserved.

Exactly four main pages share a typed domain and repository. Dashboard measures confirmed individual delivery against original baseline; revised dates are forecasts only. Pair readiness checks every explicitly connected dependency. Actual dates start null. Preview data is labelled synthetic and never used to initialize production.

SharePoint stores all records in data/data.json, PDFs separately. All writes acquire checkout, reread and compare the loaded snapshot, validate, write and check in. Conflicts preserve local drafts and require reload/reapplication. A same-identity browser Web Lock further serializes tabs; SharePoint deployment requires cross-user and same-user lock verification. Fail closed on missing permissions or configuration.

No source PDFs or XLSX supplied, so provide a reusable import preview instead of fabricated plans. Tenant app catalog, configured library with versioning/checkout, permissions and a multi-session concurrency test remain deployment prerequisites.

Latest amendment (user): remove Drawing, start at Casting; Delivery UI and exports have only Plan and Actual. Purchasing entering Actual is confirmation, no extra POD input. Original baseline stays internal and audited.
