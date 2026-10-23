import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDay,formatDateTime,timestampDate,validTimeZone } from '../lib/date-time.ts';
import { filterReportJobs } from '../lib/real-world-reports.ts';

test('time-zone display uses the same instant and respects DST including the repeated fall hour',()=>{
 assert.match(formatDateTime('2026-03-08T06:30:00Z','America/New_York'),/1:30:00 AM EST/);
 assert.match(formatDateTime('2026-03-08T07:30:00Z','America/New_York'),/3:30:00 AM EDT/);
 assert.match(formatDateTime('2026-11-01T05:30:00Z','America/New_York'),/1:30:00 AM EDT/);
 assert.match(formatDateTime('2026-11-01T06:30:00Z','America/New_York'),/1:30:00 AM EST/);
 assert.equal(formatDateTime('2026-10-23T18:00:00Z','Asia/Kolkata'),formatDateTime('2026-10-23T23:30:00+05:30','Asia/Kolkata'));
 assert.equal(calendarDay('2026-10-23T01:00:00Z','America/Los_Angeles'),'2026-10-22');
 assert.equal(calendarDay('2026-10-23T23:00:00Z','Asia/Tokyo'),'2026-10-24');
});
test('missing and invalid dates stay missing while a recorded zero is a real instant',()=>{
 for(const value of [null,undefined,'','invalid','2026-10-23T18:00:00',NaN,Infinity])assert.equal(timestampDate(value),null);
 assert.equal(timestampDate(0).toISOString(),'1970-01-01T00:00:00.000Z');
 assert.equal(formatDateTime(null,'America/New_York'),'Time unavailable');
 assert.equal(validTimeZone('not/a-zone'),null);assert.equal(validTimeZone(''),null);assert.equal(validTimeZone('UTC'),'UTC');
});
test('date filters use the preferred calendar day across a 23-hour DST day',()=>{
 const times=['2026-03-08T04:59:59Z','2026-03-08T05:00:00Z','2026-03-09T03:59:59Z','2026-03-09T04:00:00Z'];
 const jobs=times.map((v,i)=>({job_id:String(i),created_at:Date.parse(v)/1000,config:{notes:'',cca:'cubic'}}));
 const filters={search:'',cca:'',status:'',region:'',from:'2026-03-08',to:'2026-03-08'};
 assert.deepEqual(filterReportJobs(jobs,filters,epoch=>calendarDay(epoch*1000,'America/New_York')).map(x=>x.job_id),['1','2']);
});
