// Invented software records for dependency validation and review controls.
import {breakdownFixture} from './experiment-plan-fixture.mjs';
export function dependencyBreakdown(){
 const breakdown=breakdownFixture();
 for(const section of Object.keys(breakdown.sections)){
  const item=breakdown.sections[section][0];
  breakdown.sections[section]=[
   {...item,id:`${section}-root`,description:`${section} prerequisite`,depends_on:[]},
   {...item,id:`${section}-other`,description:`${section} independent prerequisite`,depends_on:[]},
   {...item,id:`${section}-child`,description:`${section} dependent detail`,depends_on:[`${section}-root`]},
   {...item,id:`${section}-leaf`,description:`${section} detail needing both prerequisites`,depends_on:[`${section}-child`,`${section}-other`]},
  ];
 }
 return breakdown;
}
export function dependencyCases(){return [
 {name:'multiple prerequisites',valid:true,change:()=>{}},
 {name:'legacy details',valid:true,change:b=>{for(const items of Object.values(b.sections))for(const item of items)delete item.depends_on;}},
 {name:'missing parent',valid:false,change:b=>b.sections.access[2].depends_on=['unknown']},
 {name:'cross-section reference',valid:false,change:b=>b.sections.access[2].depends_on=['data-root']},
 {name:'self reference',valid:false,change:b=>b.sections.access[2].depends_on=['access-child']},
 {name:'duplicate prerequisite',valid:false,change:b=>b.sections.access[2].depends_on=['access-root','access-root']},
 {name:'cycle through primary parent',valid:false,change:b=>b.sections.access[0].depends_on=['access-child']},
 {name:'cycle through secondary prerequisite',valid:false,change:b=>b.sections.access[1].depends_on=['access-leaf']},
 {name:'null dependencies',valid:false,change:b=>b.sections.access[0].depends_on=null},
 {name:'non-array dependencies',valid:false,change:b=>b.sections.access[0].depends_on='access-other'},
 {name:'non-string dependency',valid:false,change:b=>b.sections.access[0].depends_on=[2]},
 {name:'excessive dependencies',valid:false,change:b=>b.sections.access[0].depends_on=Array(8).fill('access-other')},
 ].map(({change,...testCase})=>{const breakdown=dependencyBreakdown();change(breakdown);return{...testCase,breakdown};});}
