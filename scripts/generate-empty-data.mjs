import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emptyData, dataSchema } from '../src/models/schema.ts';
const destination=new URL('../docs/fixtures/',import.meta.url);
mkdirSync(destination,{recursive:true});
const data=dataSchema.parse(emptyData());
writeFileSync(new URL('data.empty.json',destination),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
console.log(`Created empty production seed: ${fileURLToPath(new URL('data.empty.json',destination))}`);
