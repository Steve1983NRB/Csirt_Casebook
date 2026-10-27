import {test} from 'node:test';
import assert from 'node:assert/strict';
import {caseSchema,schemas} from '../lib/model';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('case tags are bounded, normalized and searchable metadata',()=>{
 const parsed=caseSchema.parse({title:'Campaign case',reference:'CASE-1',client:'Client',date:'2026-09-21',tags:['QakBot','Wave 4'],requireDualReview:true});
 assert.deepEqual(parsed.tags,['QakBot','Wave 4']);assert.equal(parsed.requireDualReview,true);
 assert.equal(caseSchema.safeParse({...parsed,tags:Array.from({length:21},(_,i)=>'tag-'+i)}).success,false);
});

test('timeline events retain a typed evidence relationship',()=>{
 const parsed=schemas.event.parse({title:'Observed execution',evidenceId:id(1),occurredAt:'2026-09-21T10:00:00Z',originalTimestamp:'2026-09-21T10:00:00Z',source:'Disk image'});
 assert.equal(parsed.evidenceId,id(1));
});
