import {randomUUID} from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const sql=value=>"'"+String(value).replaceAll("'","''")+"'";

/** One compare-and-swap transaction using existing audited intake operations. */
export function paperIntakeRevalidationSQL(row,payload){
 if(!uuid(row.study_id)||!uuid(row.owner_id)||!Number.isSafeInteger(row.revision)||row.revision<1||row.status!=='failed'||row.reason!=='Document provenance or implementation choices are invalid.'||row.response?.status!=='completed'||row.response.id!==row.provider_response_id||payload.response_id!==row.provider_response_id||JSON.stringify(payload.response)!==JSON.stringify(row.response)||payload.breakdown?.source_id!==row.source_id||payload.breakdown?.text_artifact_id!==row.text_artifact_id)throw new Error('An unchanged completed response and validated recovery payload are required.');
 const original=JSON.stringify(row),body=JSON.stringify(payload);
 if(Buffer.byteLength(original)+Buffer.byteLength(body)>1_500_000)throw new Error('Retained revalidation exceeds the bounded operator payload.');
 const id=sql(row.study_id)+'::uuid',owner=sql(row.owner_id)+'::uuid',marker=sql('Revalidating retained completed response '+randomUUID()+'; no new model call.');
 return `begin;
 select pg_advisory_xact_lock(hashtextextended('research-autonomy-v1',0));
 update public.research_paper_intakes i set status='processing',reason=${marker}
 where i.study_id=${id} and i.owner_id=${owner} and to_jsonb(i)=${sql(original)}::jsonb
 and exists(select 1 from public.research_studies s where s.id=i.study_id and s.deleted_at is null)
 and not exists(select 1 from public.research_experiment_plans p where p.study_id=i.study_id)
 and exists(select 1 from auth.users u join auth.identities a on a.user_id=u.id where u.id=i.owner_id and not coalesce(u.is_anonymous,true) and a.provider='google');
 insert into public.research_audit_events(study_id,actor_id,action,details)
 select study_id,owner_id,'revalidate-paper-intake',jsonb_build_object('method','retained-response-revalidation','original_revision',${Number(row.revision)},'original_error',${sql(row.reason)},'provider_response_id',provider_response_id,'new_model_calls',0,'limits_preserved',true)
 from public.research_paper_intakes where study_id=${id} and owner_id=${owner} and status='processing' and reason=${marker};
 select case when i.status='processing' then public.research_paper_intake('finish',${owner},${id},${sql(body)}::jsonb) else to_jsonb(i) end as intake
 from public.research_paper_intakes i where i.study_id=${id} and i.owner_id=${owner} and
 ((i.status='processing' and i.reason=${marker}) or (i.status='ready' and i.response=${sql(JSON.stringify(row.response))}::jsonb and i.request=${sql(JSON.stringify(row.request))}::jsonb and i.breakdown=${sql(JSON.stringify(payload.breakdown))}::jsonb));
 commit;`;
}
