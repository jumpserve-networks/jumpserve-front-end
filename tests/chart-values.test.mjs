import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as chart from '../lib/emulated-chart-values.ts';
import * as aggregate from '../lib/aggregate-chart-values.ts';

test('axis formatting preserves sign small magnitudes recorded zero and documented display units',()=>{
 for(const [value,expected]of [[0,'0'],[100,'100'],[-125,'-125'],[10.5,'10.5'],[1.25,'1.25'],[0.125,'0.125'],[0.0001,'1e-4']])assert.equal(chart.formatScaleValue(value),expected);
 assert.equal(chart.trimTrailingZeros('100'),'100');assert.equal(chart.trimTrailingZeros('1.200'),'1.2');assert.equal(chart.formatSecondsValue(1.5),'1.50');assert.equal(chart.roundToHundredth(1.234),1.23);
 for(const [value,expected]of [[1000,'1 s'],[-2500,'-2.5 s'],[10.5,'10.5 ms'],[0,'0 ms'],[NaN,'n/a'],[Infinity,'n/a']])assert.equal(aggregate.formatFlowCompletionTimeLabel(value),expected);
 for(const [value,expected]of [[100,'100'],[10.5,'10.5'],[1.25,'1.25'],[0.125,'0.125']])assert.equal(aggregate.formatAxisValue(value),expected);
 assert.equal(aggregate.trimTrailingZeros('100'),'100');assert.equal(aggregate.roundToHundredth(1.234),1.23);assert.equal(aggregate.clamp(0,1,2),1);assert.equal(aggregate.clamp(3,1,2),2);
});
test('recorded metric conversions keep unavailable values distinct from zero and retain timestamp fallbacks',()=>{
 assert.equal(chart.formatClientSummary(null),'n/a');const run={congestionControlAlgorithmName:null,congestionControlAlgorithmId:null,delayAddedMs:null,clientStartDelayMs:null,clientFileSizeMegabytes:null};assert.equal(chart.formatClientSummary(run),'n/a, n/a, n/a start, n/a size');assert.equal(chart.formatClientSummary({...run,congestionControlAlgorithmId:4,delayAddedMs:0,clientStartDelayMs:0,clientFileSizeMegabytes:0}),'id 4, 0ms, 0ms start, 0MB');assert.match(chart.formatClientSummary({...run,congestionControlAlgorithmName:'bbr'}),/^bbr,/);
 for(const value of [null,NaN,Infinity])assert.equal(chart.convertCwndBytesToPackets(value),null);assert.equal(chart.convertCwndBytesToPackets(0),0);assert.equal(chart.convertCwndBytesToPackets(3000),2);
 assert.equal(chart.getPointXSeconds({elapsedSeconds:1.234,snapshotIndex:9},2),1.23);assert.equal(chart.getPointXSeconds({elapsedSeconds:Infinity,snapshotIndex:9},2),9);assert.equal(chart.getPointXSeconds({elapsedSeconds:null,snapshotIndex:null},2),2);
 const points=[{xValue:0,yValue:0},{xValue:2,yValue:5}];assert.equal(chart.getNearestPointByXValue([],1),null);assert.equal(chart.getNearestPointByXValue(points,1),points[0]);assert.equal(chart.getNearestPointByXValue(points,1.1),points[1]);
});
test('nice and fixed axes handle zero constant negative and unavailable domains without fabricated measurements',()=>{
 for(const value of [NaN,Infinity,0,-1])assert.equal(chart.getNiceStep(value),1);for(const [value,expected]of [[1,1],[1.5,2],[3,5],[6,10],[0.01,0.01]])assert.equal(chart.getNiceStep(value),expected);
 for(const domain of [[NaN,1],[0,Infinity]])assert.deepEqual(chart.buildNiceYTicks(...domain),{min:0,max:1,ticks:[0,1]});for(const domain of [[0,0],[5,5],[-5,-5],[0,10]]){const axis=chart.buildNiceYTicks(...domain);assert.ok(axis.min<=domain[0]);assert.ok(axis.max>=domain[1]);assert.ok(axis.ticks.every(Number.isFinite));assert.ok(axis.ticks.every((v,i,a)=>!i||v>a[i-1]));}
 assert.deepEqual(chart.buildNiceYTicks(0,10,1),{min:0,max:10,ticks:[0,10]});for(const value of [NaN,Infinity,0,-1]){assert.deepEqual(chart.buildReferenceXTicks(value),[0]);assert.deepEqual(chart.buildFixedRangeTicks(value),[0,1]);assert.equal(aggregate.addAxisHeadroom(value),1);}
 assert.deepEqual(chart.buildReferenceXTicks(8),[0,1,2,3,4,5,6,7,8]);assert.deepEqual(chart.buildReferenceXTicks(.001,3),[0]);assert.deepEqual(chart.buildFixedRangeTicks(8),[0,2,4,6,8]);assert.deepEqual(chart.buildFixedRangeTicks(8,1),[0]);assert.equal(aggregate.addAxisHeadroom(10),11);
 assert.deepEqual(aggregate.buildLinearTicks(10,3),[0,5,10]);assert.deepEqual(aggregate.buildLinearTicks(0),[0,.2,.4,.6,.8,1]);assert.deepEqual(aggregate.buildLinearTicksForDomain(5,5),[5]);assert.deepEqual(aggregate.buildLinearTicksForDomain(NaN,Infinity,3),[0,.5,1]);assert.deepEqual(aggregate.buildLinearTicksForDomain(-5,5,3),[-5,0,5]);
});
test('empirical chart quantiles interpolate ordered observations without inventing an extra sample',()=>{
 assert.equal(aggregate.quantile([],0.5),0);assert.equal(aggregate.quantile([7],0.5),7);assert.equal(aggregate.quantile([0,10,20],0.5),10);assert.equal(aggregate.quantile([0,10],0.25),2.5);
});
