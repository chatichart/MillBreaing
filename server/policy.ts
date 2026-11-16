import { isDeepStrictEqual } from 'node:util';
import { AppData, dataSchema, supplierFor } from '../src/models/schema';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function validateChange(base: AppData, input: unknown, role: string): AppData {
  if (role !== 'editor') throw new HttpError(403, 'Editor permission required');
  const next = dataSchema.parse(input);
  if (!isDeepStrictEqual(next.auditEvents.slice(0, base.auditEvents.length), base.auditEvents))
    throw new HttpError(400, 'Historical audit cannot be changed');
  for (const item of next.items) {
    const old = base.items.find(i => i.id === item.id);
    if ((old && (old.supplierId !== item.supplierId || old.itemType !== item.itemType)) ||
      (!old && item.supplierId !== supplierFor(item.itemType)))
      throw new HttpError(400, 'Supplier and existing item type cannot be changed');
  }
  for (const old of base.items)
    if (!next.items.some(i => i.id === old.id)) throw new HttpError(400, 'Existing items cannot be removed');
  for (const old of base.documentMetadata)
    if (!next.documentMetadata.some(m => isDeepStrictEqual(m, old))) throw new HttpError(400, 'Existing documents cannot be rewritten');
  return next;
}
