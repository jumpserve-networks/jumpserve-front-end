import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React,{useState} from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
globalThis.__placementReact=React;
const replacements={
 '@/lib/real-world-api':'export const realWorldRequest=(...args)=>globalThis.__placementRead(...args);',
 '@/app/components/aws-region-map':"export function AwsRegionMap(props){globalThis.__placementMap=props;return globalThis.__placementReact.createElement('section',{'aria-label':props.label});}",
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {RealWorldPlacement}=await import('../app/components/real-world-placement.tsx');hooks.deregister();
const regions=[{region:'us-east-1',enabled:true},{region:'us-west-2',enabled:true},{region:'af-south-1',enabled:false}];
const zone=(id,types=['t3.medium'])=>({zone_id:id,name:id+'-name',available:true,instance_types:types});
let reader,requests;
beforeEach(()=>{requests=[];globalThis.__placementDefer=false;globalThis.__placementUpdates=[];reader=async()=>({zones:[zone('zone-a'),zone('zone-b')]});globalThis.__placementRead=(...args)=>{requests.push(args);return reader(...args);};});afterEach(cleanup);
function Harness({initial={region:'',zone_id:'',instance_type:'t3.medium'},disabled=false}){const[value,setValue]=useState(initial);globalThis.__placementCurrent={value,setValue};return React.createElement(RealWorldPlacement,{label:'Server',value,onChange:update=>{if(globalThis.__placementDefer)globalThis.__placementUpdates.push(update);else setValue(update);},regions,disabled});}
const show=async props=>{let view;await act(async()=>{view=render(React.createElement(Harness,props));});return view;};
const click=async target=>act(async()=>fireEvent.click(typeof target==='string'?screen.getByRole('button',{name:target,exact:true}):target));
async function choose(label,name){await click(screen.getByRole('combobox',{name:label,exact:true}));await act(async()=>{const option=screen.getByRole('option',{name,exact:true});fireEvent.pointerDown(option,{pointerType:'mouse',button:0});fireEvent.click(option);});}
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

test('placement controls fetch only after selecting a Region and select a currently offered zone',async t=>{
 t.mock.method(Math,'random',()=>0.75);await show();assert.equal(requests.length,0);await choose('Server Region','us-east-1');assert.equal(requests[0][0],'/locations?region=us-east-1');assert.equal(globalThis.__placementCurrent.value.zone_id,'zone-b');assert.equal(globalThis.__placementMap.value,'us-east-1');await choose('Server Availability Zone','zone-a-name (zone-a)');assert.equal(globalThis.__placementCurrent.value.zone_id,'zone-a');assert.equal(globalThis.__placementCurrent.value.instance_type,'t3.medium');
});
test('manual zones and instance types survive valid location refreshes and maps synchronize Region changes',async()=>{
 reader=async()=>({zones:[zone('valid',['t3.medium','t3.large'])]});await show({initial:{region:'us-east-1',zone_id:'valid',instance_type:'t3.large'}});assert.equal(globalThis.__placementCurrent.value.zone_id,'valid');await act(async()=>globalThis.__placementMap.onChange('us-west-2'));assert.equal(globalThis.__placementCurrent.value.region,'us-west-2');assert.equal(globalThis.__placementCurrent.value.instance_type,'t3.large');assert.equal(globalThis.__placementMap.value,'us-west-2');await choose('Server instance type','t3.medium · 2 vCPUs · 4 GiB RAM');assert.equal(globalThis.__placementCurrent.value.zone_id,'valid');
});
test('unavailable offerings stay empty and failed location reads offer retry without inventing zones',async()=>{
 reader=async()=>{throw new Error('Synthetic location read failed');};await show({initial:{region:'us-east-1',zone_id:'',instance_type:'t3.large'}});assert.match(screen.getByRole('alert').textContent,/Synthetic location read failed/);reader=async()=>({zones:[zone('medium-only')]});await click('Retry locations');assert.ok(screen.getByText('No zones offering t3.large are currently available in this Region.'));assert.equal(globalThis.__placementCurrent.value.zone_id,'');assert.equal(screen.getByRole('combobox',{name:'Server Availability Zone'}).disabled,true);
});
test('old Region replies cannot overwrite a newer machine placement and unmount cancels pending reads',async()=>{
 const east=defer(),west=defer();reader=path=>path.includes('us-east-1')?east.promise:west.promise;const view=await show({initial:{region:'us-east-1',zone_id:'',instance_type:'t3.large'}});assert.ok(screen.getByText('Loading AWS zones…'));await act(async()=>globalThis.__placementMap.onChange('us-west-2'));assert.equal(requests[0][1].signal.aborted,true);await act(async()=>east.resolve({zones:[zone('wrong',['t3.large'])]}));assert.equal(globalThis.__placementCurrent.value.region,'us-west-2');assert.equal(globalThis.__placementCurrent.value.zone_id,'');view.unmount();assert.equal(requests.at(-1)[1].signal.aborted,true);await act(async()=>west.reject(new Error('Late stale region failure')));assert.equal(screen.queryByRole('alert'),null);
});
test('disabled placements cannot change through map callbacks or asynchronous zone selection',async()=>{
 await show({initial:{region:'us-east-1',zone_id:'',instance_type:'t3.medium'},disabled:true});await act(async()=>globalThis.__placementMap.onChange('us-west-2'));assert.equal(globalThis.__placementCurrent.value.region,'us-east-1');assert.equal(globalThis.__placementCurrent.value.zone_id,'');
});
test('deferred zone and instance updates cannot apply an earlier Region catalogue to a newer placement',async()=>{
 await show({initial:{region:'us-east-1',zone_id:'zone-a',instance_type:'t3.medium'}});globalThis.__placementDefer=true;await choose('Server Availability Zone','zone-b-name (zone-b)');await choose('Server instance type','t3.large · 2 vCPUs · 8 GiB RAM');const [zoneUpdate,typeUpdate]=globalThis.__placementUpdates;reader=async()=>({zones:[zone('west-manual')]});await act(async()=>globalThis.__placementCurrent.setValue({region:'us-west-2',zone_id:'west-manual',instance_type:'t3.medium'}));const current=globalThis.__placementCurrent.value;assert.equal(zoneUpdate(current),current);const changed=typeUpdate(current);assert.equal(changed.region,'us-west-2');assert.equal(changed.instance_type,'t3.large');assert.equal(changed.zone_id,'');
});
