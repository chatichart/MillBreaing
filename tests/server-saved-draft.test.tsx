// @vitest-environment jsdom
import * as React from 'react';
import {it,expect} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import App from '../src/components/App';
import {initialData} from '../src/domain/initialItems';
import {Repository,Snapshot} from '../src/repositories/types';
it('can edit and save Item Detail again after server canonicalizes item timestamps',async()=>{
  const data=initialData();const snapshot:Snapshot={data,token:'0'};let saves=0;
  const repo:Repository={mode:'postgres',load:async()=>snapshot,canWrite:async()=>true,upload:async()=>'',
    save:async(_base,next)=>{saves++;const result=structuredClone(next);result.items[0].updatedAt=`2026-11-17T00:00:0${saves}.000Z`;return {data:result,token:String(saves)};}};
  render(<App repository={repo} user="Editor"/>);
  await screen.findByText('100 ITEMS • REV 0');
  fireEvent.click(screen.getByRole('button',{name:/Item Detail/}));
  fireEvent.change(screen.getByLabelText('เลือกรายการ'),{target:{value:'L-001'}});
  fireEvent.change(screen.getByLabelText('Purchasing Remark'),{target:{value:'first'}});
  fireEvent.click(screen.getByRole('button',{name:'Save Update'}));
  await waitFor(()=>expect(saves).toBe(1));
  fireEvent.change(screen.getByLabelText('Purchasing Remark'),{target:{value:'second'}});
  await waitFor(()=>expect((screen.getByRole('button',{name:'Save Update'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Save Update'}));
  await waitFor(()=>expect(saves).toBe(2));cleanup();
});
