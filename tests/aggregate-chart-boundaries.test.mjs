import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
globalThis.__chartBoundaryReact=React;
const hooks=registerHooks({resolve(specifier,context,next){return specifier==='next/link'?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent("export default function Link(props){return globalThis.__chartBoundaryReact.createElement('a',props);}")}:next(specifier,context);}});
const charts=await import('../app/components/aggregate-graphs-panel.tsx');hooks.deregister();afterEach(cleanup);
const h=React.createElement;
const point=(client=1,change={})=>({parentRunId:1,clientNumber:client,numberOfClients:2,delayAddedMs:10,flowCompletionTimeMs:1000,clientFileSizeMegabytes:100,queueBufferSizeKilobyte:125,bottleneckRateMegabit:80,congestionControlAlgorithmName:'bbr',clientStartDelayMs:0,runCount:1,...change});
const series=[{clientNumber:1,label:'Client 1',color:'blue'},{clientNumber:2,label:'Client 2',color:'orange'}];

test('chart boundary formatting preserves missing client details and empty ECDFs remain absent',()=>{
 assert.equal(charts.buildEcdfPath([]),null);assert.equal(charts.formatClientActualParameters({clientDetails:[]},1),'client 1: n/a');
});
test('axis defaults retain readable tick labels and empty parameter inventories stay explicitly unavailable',()=>{
 for(const name of ['renderYAxisTicksForDomain','renderXAxisTicksForDomain']){
  render(h('svg',null,charts[name](0,10,String)));assert.ok(document.querySelectorAll('svg text').length>1);assert.ok(document.querySelectorAll('svg line').length>1);cleanup();
 }
 const missing={parentRunId:1,numberOfClients:2,bottleneckRateMegabit:null,queueBufferSizeKilobyte:null,clientDetails:[]};
 assert.match(charts.formatGroupMatchedTestParameters(missing),/bottleneck n\/a.*client 1: n\/a.*client 2: n\/a/);
 assert.equal(charts.formatMultiSelectSummary([]),'');assert.equal(charts.formatCommaSeparatedValues([],String),'n/a');
 const group={client1Cca:'bbr',client2Cca:'cubic',queueBufferSizeKilobyte:125,bottleneckRateMegabit:80};assert.match(charts.formatGroupCriteria(group),/100 MB/);assert.equal(charts.aggregateTestMatchesGroup(missing,group),false);
});

test('scatter plots tolerate an independently supplied empty color inventory and an unpaired parent has no invented peer delay',()=>{
 render(h(charts.ScatterPlot,{points:[point()],series:[]}));assert.ok(screen.getByRole('img').querySelector('circle'));cleanup();
 render(h(charts.ParentRunConnectionChart,{points:[point()],series}));const svg=screen.getByRole('img');const dot=svg.querySelector('circle[tabindex="0"]');fireEvent.mouseEnter(dot);assert.match(svg.textContent,/n\/a/);fireEvent.focus(dot);assert.match(svg.textContent,/n\/a/);cleanup();
 render(h(charts.OtherClientDelayFlowChart,{points:[point(2),point(1)]}));assert.ok(screen.getByRole('img').querySelector('circle'));
});
test('individual charts preserve explicit empty states without plotting zeros for absent observations',()=>{
 for(const [name,message]of [['FacetGrid',/No points are available/],['ScatterPlot',/No run-level flow completion/],['ParentRunConnectionChart',/No run-level points/],['OtherClientDelayFlowChart',/No run-level points/],['RawBoxPlot',/No grouped data/],['EcdfChart',/No run-level data/],['PercentileHeatmap',/No grouped data/]]){render(h(charts[name],{points:[],series:[],rowValues:[],columnValues:[],percentileKey:'p50'}));assert.match(document.body.textContent,message);assert.equal(screen.queryByRole('img'),null);cleanup();}
 render(h(charts.FlowSummaryStrip,{points:[]}));assert.equal(document.body.textContent,'');
});
test('facets require both recorded dimensions and box plots do not invent cells for an unmeasured client',()=>{
 for(const [rows,columns]of [[[],[125]],[[100],[]]]){render(h(charts.FacetGrid,{points:[point()],rowValues:rows,columnValues:columns}));assert.match(document.body.textContent,/Need workload and queue values/);cleanup();}
 render(h(charts.RawBoxPlot,{points:[point()],series:[series[1]]}));assert.match(document.body.textContent,/No grouped data/);cleanup();render(h(charts.RawBoxPlot,{points:[point()],series}));assert.ok(screen.getByRole('img'));assert.doesNotMatch(document.querySelector('svg').innerHTML,/NaN|Infinity/);
});
test('other-client charts reject unpaired and ambiguous parents and clear hovered measurements on leave',async()=>{
 for(const points of [[point()],[point(1,{numberOfClients:3}),point(2,{numberOfClients:3})],[point(1),point(1)]]){render(h(charts.OtherClientDelayFlowChart,{points}));assert.match(document.body.textContent,/No selected two-client tests/);cleanup();}
 render(h(charts.OtherClientDelayFlowChart,{points:[point(1),point(2)]}));const svg=screen.getByRole('img');const dot=svg.querySelector('circle[tabindex="0"]');fireEvent.mouseEnter(dot);assert.ok(svg.querySelector('rect'));await act(async()=>fireEvent.mouseLeave(svg));assert.equal(svg.querySelector('rect[pointer-events="none"]'),null);
});
test('string filter chips preserve their original option values and support explicit empty inventories',async()=>{
 let next;const view=render(h(charts.StringFilterChips,{label:'Original options',options:[],selectedValues:[],onSelectedValuesChange:value=>{next=value;}}));assert.equal(document.body.textContent,'');view.rerender(h(charts.StringFilterChips,{label:'Original options',options:['Original A','Original B'],selectedValues:['Original A'],onSelectedValuesChange:value=>{next=value;}}));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Original B'})));assert.deepEqual(next,['Original A','Original B']);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Original A'})));assert.deepEqual(next,[]);
});
