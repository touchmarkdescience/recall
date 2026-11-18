export type DailySummaryCounts={today_count:number;overdue_count:number;undated_count:number};
export const validSummaryTime=(value:unknown):value is string=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function dailySummaryMessage(counts:DailySummaryCounts){
 const parts=[counts.today_count?`${counts.today_count} today`:'',counts.overdue_count?`${counts.overdue_count} overdue`:'',counts.undated_count?`${counts.undated_count} without a date`:''].filter(Boolean);
 return {title:'Your daily follow-up list',body:parts.join(' · ')+'. Open Recall to plan your day.'};
}
