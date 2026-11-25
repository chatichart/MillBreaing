# Update Delivery Plan — 25 November 2026

User approved separating updated delivery promises from confirmed receipts. The existing `revisedDeliveryDate` field is now presented explicitly as **Update Delivery Plan**. Original delivery baseline is preserved. An actual receipt hides the updated-plan display without deleting its historical stored value. The weekly board uses the updated plan until receipt and Actual afterward; timing comparisons are shown only for confirmed receipts. A date reaching its planned day never creates an Actual automatically.

Future Actual entries are rejected on the server and by Item Detail with a message to use Update Delivery Plan. Delivered/KPI/S-Curve checks use the Bangkok date and cannot count future receipts.

On startup, the active PostgreSQL project table is locked and backed up to `mb_delivery_migration_backups` before future Actual dates move to `revisedDeliveryDate`. The migration clears only the moved Actual fields and their matching delivery-record entries; it retains original plans, actual receipts through today, other data and all audit history. Before/after migration audit records are appended and the project revision increments to invalidate stale editors. The full SQL backup retains any replaced previous updated plan and removed future delivery records. Restarting without new future Actual is a no-op.

Pre-deployment authenticated snapshot revision42 was backed up locally under ignored `var/backups/` (never committed). Four candidate items on 27/11/2026: L-002, A-001, A-002, U-001. L-001 Actual17/11/2026 is preserved. The actual deployment rechecks locked current data rather than overwriting from the earlier local snapshot.
