import assert from 'node:assert/strict';
import test from 'node:test';
import {caseSchema,schemas} from '../lib/model';
import {playbookActions,playbookIds,playbooks} from '../lib/playbooks';

test('every response playbook creates valid, actionable tasks',()=>{
 for(const id of playbookIds){
  assert.ok(playbooks[id].label);
  const actions=playbookActions(id);
  assert.ok(actions.length>=6,`${id} should provide a complete initial checklist`);
  for(const action of actions)assert.doesNotThrow(()=>schemas.action.parse(action));
 }
});

test('legacy cases default to the standard response playbook',()=>{
 const value=caseSchema.parse({title:'Incident',reference:'IR-1',client:'Client',date:'2026-09-18'});
 assert.equal(value.playbook,'standard');
});