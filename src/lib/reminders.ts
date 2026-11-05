export const reminderOptions=[0,10,30,60,1440] as const;
export function validReminder(value:unknown):value is number{return typeof value==='number'&&(reminderOptions as readonly number[]).includes(value)}
export function reminderAt(dueAt:string|null,timed:boolean,minutes=0):string|null{
  if(!dueAt||!timed||!validReminder(minutes))return null;
  const ms=Date.parse(dueAt)-minutes*60000;
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
