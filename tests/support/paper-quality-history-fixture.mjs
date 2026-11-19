export const cleanupFinding=()=>({id:'cleanup',severity:'blocking',location:'Owned-resource cleanup',explanation:'Remove owned namespaces on success and failure.',evidence:'The prior draft omitted final namespace cleanup.'});
export function historyCall(position,status='completed'){
 return{id:'private-call-'+position,position,kind:position%2?'review':'repair',status,created_at:`2026-11-18T12:0${position}:00.000Z`,updated_at:`2026-11-18T12:0${position}:30.000Z`};
}
export const reviseHistoryReview=()=>({decision:'revise',summary:'The cleanup path needs repair.',findings:[cleanupFinding()]});
export const passHistoryReview=()=>({decision:'pass',summary:'The repaired cleanup path preserves the requirements.',findings:[],resolutions:[{key:'review-1:cleanup',status:'resolved',evidence:'The final action removes owned namespaces on both success and handled failure.'}]});
export function historyEvent(position,review=reviseHistoryReview(),extra={}){
 return{call_id:'private-call-'+position,status:position%2?(review.decision==='pass'?'approved':'repair_pending'):'review_pending',review,check_findings:[],checks_passed:true,reason:null,...extra};
}
export function historyFixture(status='processing'){
 return{calls:[historyCall(1),historyCall(2),historyCall(3,status)],events:[historyEvent(3,passHistoryReview()),historyEvent(2),historyEvent(1)]};
}
