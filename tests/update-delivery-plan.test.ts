import {describe,it,expect} from 'vitest';
import {initialData} from '../src/domain/initialItems';
import {confirmed,status,forecast,updateDeliveryPlan,metrics} from '../src/domain/rules';
import {migrateFutureDeliveries} from '../server/deliveryMigration';
import {reportCsv} from '../src/services/export';
describe('Update Delivery Plan',()=>{
  it('moves future Actual only, preserves baseline/past Actual and retains audit history',()=>{
    const base=initialData();
    base.items[0].actual.deliveryDate='2026-11-27';base.items[0].baseline.deliveryDate='2026-12-22';
    base.items[0].revisedDeliveryDate='2026-11-26';
    base.items[1].actual.deliveryDate='2026-11-17';
    base.deliveryRecords.push({id:'future',itemId:'L-001',date:'2026-11-27'},{id:'past',itemId:'L-002',date:'2026-11-17'});
    const next=migrateFutureDeliveries(base,'2026-11-25');
    expect(next.items[0].actual.deliveryDate).toBeNull();
    expect(next.items[0].revisedDeliveryDate).toBe('2026-11-27');
    expect(next.items[0].baseline.deliveryDate).toBe('2026-12-22');
    expect(next.items[1].actual.deliveryDate).toBe('2026-11-17');
    expect(next.deliveryRecords.map(r=>r.id)).toEqual(['past']);
    expect(next.auditEvents[0].before).toContain('2026-11-26');
    expect(base.items[0].actual.deliveryDate).toBe('2026-11-27');
    expect(migrateFutureDeliveries(next,'2026-11-25')).toEqual(next);
  });
  it('never counts future Actual as Delivered, and Update Plan does not become Actual when its day arrives',()=>{
    const d=initialData(),i=d.items[0];i.actual.deliveryDate='2026-11-27';
    expect(confirmed(i,d,'2026-11-25')).toBe(false);
    expect(status(i,d,'2026-11-25')).not.toBe('Delivered');
    expect(metrics(d,[i],'2026-11-25').delivered).toBe(0);
    i.actual.deliveryDate=null;i.revisedDeliveryDate='2026-11-27';
    expect(status(i,d,'2026-11-28')).not.toBe('Delivered');
  });
  it('hides Update Plan after a genuine Actual, preserving its stored historical value',()=>{
    const d=initialData(),i=d.items[0];i.revisedDeliveryDate='2026-11-27';i.baseline.deliveryDate='2026-12-22';
    expect(updateDeliveryPlan(i,'2026-11-25')).toBe('2026-11-27');
    i.actual.deliveryDate='2026-11-24';
    expect(updateDeliveryPlan(i,'2026-11-25')).toBeNull();
    expect(forecast(i,'2026-11-25')).toBe('2026-12-22');
    expect(i.revisedDeliveryDate).toBe('2026-11-27');
    const csv=reportCsv(d,[i],'2026-11-25');
    expect(csv).toContain('"Delivery Plan","Update Delivery Plan","Delivery Actual"');
    expect(csv).toContain('"22/12/2026","—","24/11/2026"');
  });
});
