// Run: npm exec --yes --package=tsx -- tsx scripts/generate-initial-data.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { initialData } from '../src/domain/initialItems.ts';
import { dataSchema } from '../src/models/schema.ts';
const folder=new URL('../docs/fixtures/',import.meta.url);mkdirSync(folder,{recursive:true});
const data=dataSchema.parse(initialData());
writeFileSync(new URL('data.initial-100.json',folder),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const rows=['id,itemType,description,supplierId,castingDate,finishingDate,qcDate,deliveryDate',...data.items.map(i=>[i.id,i.itemType,i.description,i.supplierId,'','','',''].join(','))];
writeFileSync(new URL('initial-items-100.csv',folder),'\uFEFF'+rows.join('\r\n')+'\r\n',{flag:'wx'});
console.log('Created initial JSON and import CSV: 100 items; no dates, Actual, or pairings.');
