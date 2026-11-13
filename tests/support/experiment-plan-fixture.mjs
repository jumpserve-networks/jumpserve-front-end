export function breakdownFixture() {
  return {version:'paper-breakdown-v1',status:'ready',source_id:'source',text_artifact_id:'text',text_sha256:'a'.repeat(64),policy_sha256:'b'.repeat(64),extraction_version:'paper-intake-one-pass-v1',cursor:1,total_chunks:1,total_pages:1,missing_text_pages:[],limitation:'Synthetic software fixture.',reason:null,
    sections:Object.fromEntries(['access','experiment','data','validate'].map(section=>[section,[{id:section+'-original',description:'Confirmed '+section+' detail',quote:'Original '+section+' quote',page:1}]]))};
}
export function planFixture() {return {experiments:[{title:'Synthetic paired throughput experiment',experiment_refs:['experiment-1'],steps:[{title:'Retain throughput measurements',instructions:'Record the confirmed throughput measurement with the run configuration and provenance in Supabase.',basis:'paper',source_refs:['experiment-1','data-1']},{title:'Proposed implementation scaffold',instructions:'Proposed: build a measurement adapter after resolving the missing platform.',basis:'proposed',source_refs:[]}],open_questions:['Which experiment platform should be used?']}]};}

export function hierarchicalPlanFixture() {
 const flat=planFixture().experiments[0];
 const {steps,...experiment}=flat;
 return {experiments:[{...experiment,stages:[
  {title:'Prepare the implementation',steps:[{...steps[1],validation_ref:null}]},
  {title:'Collect measurements',steps:[{...steps[0],validation_ref:null}]},
 ]}]};
}

// Frozen pre-hierarchy request shape for migration and historical-call tests.
// This fixture is never submitted to a provider.
export function legacyPlanRequestFixture(input,structured=false) {
 const string={type:'string'},strings={type:'array',items:string};
 const action={type:'object',additionalProperties:false,required:['title','instructions','basis','source_refs',...(structured?['validation_ref']:[])],properties:{title:{...string,maxLength:160},instructions:{...string,maxLength:1200},basis:{type:'string',enum:['paper','proposed']},source_refs:{...strings,maxItems:32},...(structured?{validation_ref:{type:['string','null'],enum:[...input.sections.validate.filter(s=>s.kind==='claim').map(s=>s.ref),null]}}:{})}};
 return {model:'gpt-5.4-mini-2026-03-17',instructions:'Frozen legacy experiment planning fixture; no inference is performed.',input:JSON.stringify(input),background:true,store:true,reasoning:{effort:'none'},max_output_tokens:16000,text:{format:{type:'json_schema',name:structured?'paper_experiment_steps_v2':'paper_experiment_steps_v1',strict:true,schema:{type:'object',additionalProperties:false,required:['experiments'],properties:{experiments:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['title','experiment_refs','steps','open_questions'],properties:{title:{...string,maxLength:200},experiment_refs:{...strings,minItems:1,maxItems:8},steps:{type:'array',minItems:1,maxItems:12,items:action},open_questions:{type:'array',maxItems:12,items:{...string,maxLength:400}}}}}}}}}};
}
