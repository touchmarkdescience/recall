import { DateTime } from 'luxon';
import { z } from 'zod';
import { templateExtract,naturalExtract,localExtract,fastExtract,hasTimedIntent,type DraftAction,type Extraction } from './localExtract.ts';
export { templateExtract,naturalExtract,localExtract,fastExtract,parseIST,type DraftAction,type Extraction } from './localExtract.ts';
const zone='Asia/Kolkata';
const extractionOutput=z.object({contactName:z.string(),topic:z.string(),summary:z.string(),actions:z.array(z.object({kind:z.enum(['follow_up','reminder','meeting']),title:z.string(),dueAt:z.string().nullable(),timeSpecified:z.boolean(),timeChoices:z.array(z.string()).optional()})).max(10)});
async function aiExtract(transcript: string): Promise<Record<string, unknown>> {
  if (process.env.GEMINI_API_KEY) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_EXTRACTION_MODEL || 'gemini-3.5-flash-lite';
    const prompt = `Return only JSON: {"contactName":"","topic":"","summary":"","actions":[]}. Each explicit next step has kind (follow_up, reminder, meeting), short title, dueAt (UTC ISO string or null), timeSpecified (boolean), and timeChoices (UTC ISO array only for conflicting spoken times). A person's name is optional. Preserve names exactly as written in the transcript, including Tamil script; do not translate, anglicize or invent names. A follow-up is a task: a date is enough. Set timeSpecified:false for date-only tasks; never invent a clock time. Set timeSpecified:true only for an explicitly spoken clock time or relative hour/minute delay. Accurately recognize Indian names (e.g. Karthik, Murugan, Selvam, Venkatesh, Ananthi, Senthil), honorifics (sir, madam, ji), and bilingual English/Tamil/Hindi phrasing. Interpret relative dates in Asia/Kolkata; now is ${DateTime.now().setZone(zone).toISO()}. Limit actions to 10. Note: "${transcript}"`;
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json',responseJsonSchema:z.toJSONSchema(extractionOutput),temperature:0,maxOutputTokens:2200,httpOptions:{timeout:12000,retryOptions:{attempts:1}} }
    });
    return extractionOutput.parse(JSON.parse(res.text || '{}'));
  }
  if (process.env.OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        max_completion_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `Return only JSON: {"contactName":"","topic":"","summary":"","actions":[]}. Each explicit next step has kind (follow_up, reminder, meeting), short title, dueAt (UTC ISO or null), timeSpecified (boolean), and timeChoices (UTC ISO array only for conflicting spoken times). A person's name is optional. Preserve names exactly as written in the transcript, including Tamil script; do not translate, anglicize or invent names. A follow-up is a task: a date is enough. Set timeSpecified:false for date-only tasks; never invent a clock time. Set timeSpecified:true only for an explicitly spoken clock time or relative hour/minute delay. Extract it only from a person cue such as "meeting Sujay"; a topic after "about" is not a person. Use only stated facts. Do not invent a person, action, date, time, or duration. A discussion without an explicit next step has actions:[]. Keep the summary to one sentence. Interpret relative dates in Asia/Kolkata; now is ${DateTime.now().setZone(zone).toISO()}. For alternatives such as "1 pm or 4 pm", use dueAt:null and timeChoices with both times. Limit actions to 10.` },
          { role: 'user', content: transcript }
        ]
      })
    });
    if (!response.ok) throw new Error(`AI request failed (${response.status})`);
    const data = await response.json();
    return JSON.parse(data.choices?.[0]?.message?.content || '{}');
  }
  throw new Error('No AI provider configured');
}

export async function extract(transcript: string): Promise<Extraction> {
  const quick=fastExtract(transcript);if(quick)return quick;
  const templated=templateExtract(transcript);
  if(templated) return templated;
  const natural=naturalExtract(transcript);
  if(natural) return natural;
  if(!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return localExtract(transcript);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = await aiExtract(transcript);
  } catch {
    return localExtract(transcript);
  }
  const actions: DraftAction[] = Array.isArray(parsed.actions)
    ? (parsed.actions as Record<string, unknown>[]).slice(0, 10).filter(a => a && ['follow_up', 'reminder', 'meeting'].includes(String(a.kind)) && typeof a.title === 'string' && a.title.trim()).map(a => ({
        kind: a.kind as 'follow_up' | 'reminder' | 'meeting',
        title: String(a.title).trim().slice(0, 500),
        dueAt: a.dueAt && typeof a.dueAt === 'string' && DateTime.fromISO(a.dueAt).isValid ? a.dueAt : null,
        timeSpecified: typeof a.timeSpecified === 'boolean' ? a.timeSpecified : hasTimedIntent(String(a.title)) || ((parsed.actions as unknown[]).length===1&&hasTimedIntent(transcript)),
        timeChoices: Array.isArray(a.timeChoices) ? a.timeChoices.filter(x => typeof x === 'string' && DateTime.fromISO(x).isValid) : undefined
      }))
    : [];
  const result: Extraction = {
    contactName: String(parsed.contactName || '').slice(0, 120),
    topic: String(parsed.topic || '').slice(0, 200),
    summary: String(parsed.summary || transcript).slice(0, 1000),
    actions,
    mode: 'AI'
  };
  const guard=localExtract(transcript);
  if(guard.contactName)result.contactName=guard.contactName;
  if(guard.topic)result.topic=guard.topic;
  if(guard.actions.length===result.actions.length)result.actions=result.actions.map((action:DraftAction,i:number)=>hasTimedIntent(guard.actions[i].title)?{...action,dueAt:guard.actions[i].dueAt,timeSpecified:true}:action);
  if(result.contactName&&result.topic&&result.contactName.toLocaleLowerCase()===result.topic.toLocaleLowerCase())result.contactName='';
  if(guard.actions[0]?.timeChoices?.length){result.actions=result.actions.map((a:DraftAction)=>({...a,dueAt:null,timeChoices:guard.actions[0].timeChoices}));}
  return result;
}
