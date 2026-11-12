// Exposed software expectations, not an automatic semantic/scientific reviewer.
const lower=v=>String(v).replace(/\s+/gu,' ').trim().toLowerCase();
export function paperQualityChecks(extraction,expected){
 const checks=[],add=(name,passed)=>checks.push({name,passed:Boolean(passed)});
 if(expected.provenance)add('document provenance',extraction.provenance?.classification===expected.provenance);
 if(expected.experiment_count!==undefined)add('coherent experiment count',extraction.sections.experiment.length===expected.experiment_count);
 if(expected.claims){
  const claims=extraction.sections.validate.filter(i=>i.kind==='claim');
  add('distinct claim count (no table-arithmetic duplicate)',claims.length===expected.claims.length);
  for(const wanted of expected.claims){
   const found=claims.filter(c=>lower(c.label)===lower(wanted.label));
   add(`${wanted.label}: one claim and correct acceptance rule`,found.length===1&&found[0].criterion?.acceptance===wanted.acceptance&&(!wanted.metric_mentions||wanted.metric_mentions.some(t=>lower(found[0].criterion.metric+' '+found[0].criterion.comparison).includes(lower(t)))));
  }
 }
 if(expected.reported_attribution){
  const reported=extraction.sections.data.filter(i=>i.kind==='reported_result');
  add('reported results have explicit attribution',reported.length>0&&reported.every(i=>i.description.startsWith('The paper reports ')));
 }
 for(const wanted of expected.details??[]){
  const entries=wanted.section==='implementation_choices'?extraction.implementation_choices??[]:extraction.sections[wanted.section];
  const matches=entries.filter(i=>!wanted.kind||i.kind===wanted.kind).filter(i=>{
   const narrative=lower(JSON.stringify([i.description,i.specification,i.criterion,i.name,i.reason]));
   return (wanted.mentions??[]).every(alternatives=>alternatives.some(t=>narrative.includes(lower(t))));
  });
  add(`${wanted.name}: retained detail and supporting evidence`,matches.some(i=>{
   const citations=i.citations??[{quote:i.quote,page:i.page}],evidence=lower(citations.map(c=>c.quote).join(' '));
   return (wanted.evidence??[]).every(t=>evidence.includes(lower(t)))&&(wanted.pages??[]).every(p=>citations.some(c=>c.page===p));
  }));
 }
 return checks;
}

export function validatePaperExpectations(value){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v),string=v=>typeof v==='string'&&v.length>0&&v.length<=500;
 const strings=v=>Array.isArray(v)&&v.length<=100&&v.every(string);
 const sections=['access','experiment','data','validate'],kinds=['requirement','reported_result','claim','limitation','experiment_specification'];
 const only=(v,keys)=>Object.keys(v).every(k=>keys.includes(k));
 const fail=()=>{throw new Error('Invalid bounded paper-evaluation expectations.');};
 if(!object(value)||!only(value,['title','authors','required','quotes','forbidden','quality']))fail();
 if('title' in value&&value.title!==null&&!string(value.title)||'authors' in value&&!strings(value.authors)||'forbidden' in value&&!strings(value.forbidden)||'required' in value&&(!strings(value.required)||!value.required.every(s=>sections.includes(s))))fail();
 if(value.quotes&&(!object(value.quotes)||!only(value.quotes,sections)||!Object.values(value.quotes).every(strings)))fail();
 if('quality' in value){
  const q=value.quality;
  if(!object(q)||!only(q,['provenance','experiment_count','claims','reported_attribution','details'])||q.provenance!==undefined&&!['synthetic','simulated','reported_empirical','unspecified'].includes(q.provenance)||q.experiment_count!==undefined&&(!Number.isSafeInteger(q.experiment_count)||q.experiment_count<0||q.experiment_count>8)||q.reported_attribution!==undefined&&typeof q.reported_attribution!=='boolean')fail();
  if(q.claims!==undefined&&(!Array.isArray(q.claims)||q.claims.length>8||!q.claims.every(c=>object(c)&&only(c,['label','acceptance','metric_mentions'])&&string(c.label)&&['needs_definition','paper_defined'].includes(c.acceptance)&&(!c.metric_mentions||strings(c.metric_mentions)))))fail();
  if(q.details!==undefined&&(!Array.isArray(q.details)||q.details.length>40||!q.details.every(d=>object(d)&&only(d,['name','section','kind','mentions','evidence','pages'])&&string(d.name)&&[...sections,'implementation_choices'].includes(d.section)&&(!d.kind||kinds.includes(d.kind))&&(!d.mentions||Array.isArray(d.mentions)&&d.mentions.length<=20&&d.mentions.every(a=>strings(a)&&a.length>0))&&(!d.evidence||strings(d.evidence))&&(!d.pages||Array.isArray(d.pages)&&d.pages.length<=6&&d.pages.every(p=>Number.isSafeInteger(p)&&p>0&&p<=200)))))fail();
 }
 if(!Object.keys(value).length||value.quality&&!Object.keys(value.quality).length)fail();
 return value;
}
