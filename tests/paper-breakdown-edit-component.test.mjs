import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import React,{useEffect,useState} from 'react';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {PaperBreakdownPanel} from '../app/components/research-workflow/paper-breakdown.tsx';
import {reviewedSections} from '../lib/paper-experiment-plan.ts';
import {breakdownFixture} from './support/experiment-plan-fixture.mjs';
import {dependencyBreakdown} from './support/paper-dependency-fixture.mjs';

let changes,original,latest;
beforeEach(()=>{changes=[];original=breakdownFixture();});afterEach(cleanup);
function Review({busy=false}){
 const [review,setReview]=useState(()=>reviewedSections(original));useEffect(()=>{latest=review;},[review]);
 return React.createElement(PaperBreakdownPanel,{version:original.version,value:original,preparing:false,busy,review,onReviewChange(section,id,description){
  changes.push({section,id,description});setReview(previous=>({...previous,[section]:description===null?previous[section].filter(item=>item.id!==id):previous[section].some(item=>item.id===id)?previous[section].map(item=>item.id===id?{id,description}:item):[...previous[section],{id,description}]}));
 }});
}
const click=async name=>{await act(async()=>{fireEvent.click(screen.getByRole('button',{name,exact:true}));});};
const change=text=>fireEvent.change(screen.getByRole('textbox',{name:'Access detail 1 description'}),{target:{value:text}});
const toggle=async()=>{await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name:'Include Access detail 1'}));});};

test('details start as text with their inclusion checkbox before the text and no active textarea',()=>{
 render(React.createElement(Review));const text=screen.getByText(original.sections.access[0].description),checkbox=screen.getByRole('checkbox',{name:'Include Access detail 1'});
 assert.ok(checkbox.compareDocumentPosition(text)&Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(checkbox.getAttribute('aria-checked'),'true');assert.equal(screen.queryByRole('textbox'),null);assert.ok(screen.getByRole('button',{name:'Edit Access detail 1'}));
});
test('the four sections contain numbered nested details with source evidence beneath its own detail',()=>{
 render(React.createElement(Review));const sections=screen.getByRole('list',{name:'Paper sections'});
 assert.equal(sections.tagName,'OL');assert.equal(sections.children.length,4);
 for(const [index,title] of ['Access','Experiment','Data','Validate'].entries()){
  const section=sections.children[index],region=within(section).getByRole('region',{name:title});
  assert.ok(within(section).getByText(`${index+1}.`));
  const details=within(region).getByRole('list',{name:`${title} details`});assert.equal(details.tagName,'OL');assert.equal(details.children.length,1);
  const detail=details.children[0];assert.ok(within(detail).getByText(`${index+1}.1`));assert.ok(within(detail).getByText(original.sections[title.toLowerCase()][0].description));
  assert.ok(within(detail).getByText(original.sections[title.toLowerCase()][0].quote));assert.ok(within(detail).getByRole('checkbox',{name:`Include ${title} detail 1`}));
 }
 assert.deepEqual(changes,[]);
});
test('collapsing sections preserves unsaved drafts, saved descriptions and inclusion choices',async()=>{
 render(React.createElement(Review));const section=screen.getByRole('heading',{name:'Access'}).closest('details'),summary=section.querySelector('summary');
 assert.equal(section.open,true);await click('Edit Access detail 1');change('Keep this draft through collapsing');
 fireEvent.click(summary);assert.equal(section.open,false);
 fireEvent.click(summary);assert.equal(section.open,true);assert.equal(screen.getByRole('textbox',{name:'Access detail 1 description'}).value,'Keep this draft through collapsing');assert.deepEqual(changes,[]);
 await click('Save Access detail 1');await toggle();fireEvent.click(summary);fireEvent.click(summary);
 assert.ok(screen.getByText('Keep this draft through collapsing'));assert.equal(screen.getByRole('checkbox',{name:'Include Access detail 1'}).getAttribute('aria-checked'),'false');assert.equal(changes.length,2);
});
test('showing more details extends the outline numbering without changing recorded identities or review choices',async()=>{
 const first=original.sections.access[0];original.sections.access=Array.from({length:10},(_,index)=>({...first,id:`access-${index+1}`,description:`Access requirement ${index+1}`}));
 render(React.createElement(Review));const details=screen.getByRole('list',{name:'Access details'});assert.equal(details.children.length,8);assert.ok(within(details.children[7]).getByText('1.8'));
 await click('Show more access details');assert.equal(details.children.length,10);assert.ok(within(details.children[8]).getByText('1.9'));assert.ok(within(details.children[9]).getByText('1.10'));assert.equal(screen.queryByRole('button',{name:'Show more access details'}),null);
 assert.deepEqual(changes,[]);assert.deepEqual(latest.access.map(item=>item.id),original.sections.access.map(item=>item.id));
});
test('Edit focuses a draft and only Save applies its text while the source evidence stays unchanged',async()=>{
 const source=structuredClone(original);render(React.createElement(Review));await click('Edit Access detail 1');const textarea=screen.getByRole('textbox',{name:'Access detail 1 description'});
 assert.equal(document.activeElement,textarea);change('  Corrected access requirement  ');assert.deepEqual(changes,[]);assert.equal(latest.access[0].description,source.sections.access[0].description);
 await click('Save Access detail 1');assert.equal(screen.queryByRole('textbox'),null);assert.ok(screen.getByText('Corrected access requirement'));assert.equal(latest.access[0].description,'Corrected access requirement');assert.deepEqual(original,source);
});
test('Cancel discards the current draft and restores the last saved description',async()=>{
 render(React.createElement(Review));await click('Edit Access detail 1');change('First saved requirement');await click('Save Access detail 1');await click('Edit Access detail 1');change('Discarded requirement');await click('Cancel editing Access detail 1');
 assert.ok(screen.getByText('First saved requirement'));assert.equal(screen.queryByText('Discarded requirement'),null);assert.equal(changes.length,1);assert.equal(latest.access[0].description,'First saved requirement');
});
test('excluding and reincluding a detail preserves its saved edit instead of restoring extracted text',async()=>{
 render(React.createElement(Review));await click('Edit Access detail 1');change('Retained edited requirement');await click('Save Access detail 1');await toggle();
 assert.equal(latest.access.length,0);assert.ok(screen.getByText('Retained edited requirement'));assert.equal(screen.getByRole('button',{name:'Edit Access detail 1'}).disabled,true);
 await toggle();assert.equal(latest.access[0].description,'Retained edited requirement');await click('Edit Access detail 1');assert.equal(screen.getByRole('textbox',{name:'Access detail 1 description'}).value,'Retained edited requirement');
});
test('blank edits cannot save and another editor cannot replace an unsaved draft',async()=>{
 render(React.createElement(Review));await click('Edit Access detail 1');change('   ');assert.equal(screen.getByRole('button',{name:'Save Access detail 1'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Edit Data detail 1'}).disabled,true);
 assert.equal(screen.getByRole('checkbox',{name:'Include Access detail 1'}).getAttribute('aria-disabled'),'true');await click('Cancel editing Access detail 1');assert.deepEqual(changes,[]);assert.equal(screen.getByRole('button',{name:'Edit Data detail 1'}).disabled,false);
});
test('busy or confirmed sections do not expose a writable editor',()=>{
 const view=render(React.createElement(Review,{busy:true}));assert.equal(screen.getByRole('button',{name:'Edit Access detail 1'}).disabled,true);assert.equal(screen.queryByRole('textbox'),null);
 view.unmount();render(React.createElement(PaperBreakdownPanel,{version:original.version,value:original,preparing:false,busy:false}));assert.equal(screen.queryByRole('button',{name:'Edit Access detail 1'}),null);assert.equal(screen.queryByRole('textbox'),null);
});
test('dependent items nest beneath their prerequisite in every section and keep additional dependency references',()=>{
 original=dependencyBreakdown();render(React.createElement(Review));
 for(const [index,title] of ['Access','Experiment','Data','Validate'].entries()){
  const section=screen.getByRole('list',{name:`${title} details`});assert.equal(section.children.length,2);
  const children=within(section.children[0]).getByRole('list',{name:`Details depending on ${index+1}.1`});assert.equal(children.children.length,1);
  const leaves=within(children.children[0]).getByRole('list',{name:`Details depending on ${index+1}.1.1`});assert.equal(leaves.children.length,1);
  assert.ok(within(leaves).getByText(`${index+1}.1.1.1`));assert.ok(within(leaves).getByText(`Also depends on ${index+1}.2.`));assert.ok(within(leaves).getByRole('checkbox',{name:`Include ${title} detail 4`}));
 }
 assert.deepEqual(changes,[]);
});
test('excluding a prerequisite removes dependents and including a child restores all prerequisites and saved edits',async()=>{
 original=dependencyBreakdown();render(React.createElement(Review));
 await click('Edit Access detail 4');fireEvent.change(screen.getByRole('textbox',{name:'Access detail 4 description'}),{target:{value:'Saved dependent detail'}});await click('Save Access detail 4');
 assert.equal(latest.access.length,4);await toggle();assert.deepEqual(latest.access.map(item=>item.id),['access-other']);
 await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name:'Include Access detail 4'}));});
 assert.equal(latest.access.length,4);assert.equal(latest.access.find(item=>item.id==='access-leaf').description,'Saved dependent detail');
 await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name:'Include Access detail 2'}));});
 assert.deepEqual(new Set(latest.access.map(item=>item.id)),new Set(['access-root','access-child']));
});
test('prerequisites cannot exclude an actively edited descendant',async()=>{
 original=dependencyBreakdown();render(React.createElement(Review));await click('Edit Access detail 4');
 for(const position of [1,2,3,4])assert.equal(screen.getByRole('checkbox',{name:`Include Access detail ${position}`}).getAttribute('aria-disabled'),'true');
 assert.notEqual(screen.getByRole('checkbox',{name:'Include Data detail 1'}).getAttribute('aria-disabled'),'true');
 await click('Cancel editing Access detail 4');assert.notEqual(screen.getByRole('checkbox',{name:'Include Access detail 1'}).getAttribute('aria-disabled'),'true');
});
test('pagination traverses parents before children even when the saved items are in reverse dependency order',async()=>{
 const item=original.sections.access[0];original.sections.access=Array.from({length:10},(_,index)=>({...item,id:`node-${index}`,description:`Dependency level ${index+1}`,depends_on:index?[`node-${index-1}`]:[]})).reverse();
 render(React.createElement(Review));const access=screen.getByRole('list',{name:'Access details'});assert.equal(access.children.length,1);assert.equal(within(access).getAllByRole('checkbox').length,8);
 assert.ok(screen.getByText('Dependency level 1'));assert.ok(screen.getByText('Dependency level 8'));assert.equal(screen.queryByText('Dependency level 9'),null);
 await click('Show more access details');assert.equal(within(access).getAllByRole('checkbox').length,10);assert.ok(screen.getByText('Dependency level 10'));assert.deepEqual(changes,[]);
});
