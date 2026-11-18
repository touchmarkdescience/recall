import 'server-only';
import webpush from 'web-push';
import {cloud,dataOrThrow} from './cloud';
import {dailySummaryMessage,type DailySummaryCounts} from './dailySummary';
type Claim=DailySummaryCounts&{user_id:string;summary_date:string;claim_token:string};
export async function dispatchDailySummaries(){
 const claims=dataOrThrow(await cloud().rpc('recall_claim_daily_summaries',{p_limit:50})) as Claim[];
 let sent=0,failed=0;
 for(const claim of claims){
  let delivered=false;
  try{
   const subs=dataOrThrow(await cloud().from('recall_push_subscriptions').select('id,subscription_json').eq('user_id',claim.user_id));
   for(const sub of subs){
    try{
     await webpush.sendNotification(sub.subscription_json,JSON.stringify({...dailySummaryMessage(claim),url:'/app#home',tag:`daily-followups-${claim.summary_date}`}),{TTL:86400,timeout:5000});
     sent++;delivered=true;
    }catch(error){
     const status=(error as {statusCode?:number}).statusCode;
     if(status===404||status===410)dataOrThrow(await cloud().from('recall_push_subscriptions').delete().eq('id',sub.id).select('id'));
    }
   }
  }finally{
   dataOrThrow(await cloud().rpc('recall_finish_daily_summary',{p_user_id:claim.user_id,p_summary_date:claim.summary_date,p_claim_token:claim.claim_token,p_delivered:delivered}));
  }
  if(!delivered)failed++;
 }
 return {claimed:claims.length,sent,failed};
}
