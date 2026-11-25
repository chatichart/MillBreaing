// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { initialData } from '../src/domain/initialItems';
import { validateChange } from '../server/policy';
import { readConfig } from '../server/config';

describe('standalone server safety', () => {
  it('rejects future delivery Actual and directs editor to Update Delivery Plan',()=>{
    const base=initialData(),next=structuredClone(base);next.items[0].actual.deliveryDate='2099-11-27';
    expect(()=>validateChange(base,next,'editor')).toThrow(/Update Delivery Plan/);
  });
  it('fails closed without production identity and session configuration', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow();
  });
  it('keeps 100 initial items with no Plan or Actual', () => {
    const data = initialData();
    expect(data.items).toHaveLength(100);
    expect(data.items.every(i => Object.values(i.actual).every(v => v === null))).toBe(true);
    expect(data.items.every(i => Object.values(i.baseline).every(v => v === null))).toBe(true);
  });
  it('rejects supplier mutation and tampered audit history', () => {
    const base = initialData();
    const next = structuredClone(base);
    next.items[0].supplierId = 'SUP-002';
    expect(() => validateChange(base, next, 'editor')).toThrow(/Supplier/);
    base.auditEvents.push({id:'old',at:'now',by:'a',entityId:'L-001',action:'test',before:'',after:''});
    expect(() => validateChange(base, initialData(), 'editor')).toThrow(/audit/i);
  });
  it('rejects Viewer writes and accepts valid baseline editing', () => {
    const base = initialData();
    const next = structuredClone(base);
    next.items[0].baseline.castingDate = '2026-11-16';
    expect(() => validateChange(base, next, 'viewer')).toThrow(/Editor/);
    expect(validateChange(base, next, 'editor').items[0].baseline.castingDate).toBe('2026-11-16');
  });
});
