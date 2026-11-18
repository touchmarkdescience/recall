import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { localExtract, naturalExtract, parseIST, templateExtract } from '../src/lib/extract.ts';
import { appendTranscript } from '../src/lib/transcription.ts';

const now = new Date('2026-11-03T18:30:00Z'); // 4 Nov 2026, 00:00 IST
const day = text => DateTime.fromISO(parseIST(text, now)).setZone('Asia/Kolkata').toISODate();

assert.equal(day('17th November'), '2026-11-17');
assert.equal(day('17 November'), '2026-11-17');
assert.equal(day('November 17'), '2026-11-17');
assert.equal(day('on 3rd Dec'), '2026-12-03');
assert.equal(day('on 3rd Oct'), '2026-10-03'); // preserve a past date
assert.equal(parseIST('No date was mentioned', now), null);
assert.equal(localExtract('Follow up with Dr. Sri pratap about the proposal').actions[0].dueAt, null);

for (const honorific of ['Dr Sri pratap', 'Dr. Sri pratap']) {
  const note = `I have a follow up with ${honorific} on 17th November`;
  const result = localExtract(note);
  assert.equal(result.contactName, 'Dr Sri pratap');
  assert.equal(result.actions.length, 1);
  assert.match(result.actions[0].title, /Sri pratap on 17th November/);
}

const split = localExtract('Call Dr. Sri pratap on 17th November. Remind me to send slides tomorrow');
assert.equal(split.actions.length, 2);
assert.match(split.actions[0].title, /Dr\. Sri pratap/);
assert.equal(appendTranscript('Call Dr.', 'Sri pratap on 17th November'), 'Call Dr. Sri pratap on 17th November');
const ambiguous=localExtract('Tomorrow I am meeting Sujay for a demo about startup product; remind me at 1:00 p.m. — or the meeting is at 4:00 p.m.');
assert.equal(ambiguous.contactName,'Sujay');
assert.equal(ambiguous.topic,'startup product');
assert.equal(ambiguous.actions[0].timeChoices?.length,2);

const guided=templateExtract('Name Sujay. Action send the demo proposal about startup product. Type follow-up. When tomorrow at 2 PM.',now);
assert.equal(guided.contactName,'Sujay');
assert.equal(guided.topic,'startup product');
assert.equal(guided.actions[0].kind,'follow_up');
assert.equal(DateTime.fromISO(guided.actions[0].dueAt).setZone('Asia/Kolkata').toFormat('d LLL h:mm a'),'5 Nov 2:00 PM');
const guest=templateExtract('Action send the team an update. Type reminder. When tomorrow at 9 AM.',now);
assert.equal(guest.contactName,'');
assert.equal(guest.actions[0].title,'send the team an update');
const conflicting=templateExtract('Name Guest. Action prepare for the meeting. Type reminder. When tomorrow at 1 PM or 4 PM.',now);
assert.equal(conflicting.actions[0].dueAt,null);
assert.equal(conflicting.actions[0].timeChoices.length,2);
assert.equal(templateExtract('Name Sujay action present the demo type meeting when tomorrow at 4 PM',now).contactName,'Sujay');
assert.equal(templateExtract('Name is Sujay. Action send the proposal. Type follow-up. When tomorrow at 2 PM.',now).contactName,'Sujay');

const afterCall=naturalExtract('I just spoke with Arjun. We’ll discuss the PPT tomorrow at 6 PM. Remind me one hour before.',now);
assert.equal(afterCall.contactName,'Arjun');
assert.equal(afterCall.actions.length,1);
assert.equal(afterCall.actions[0].kind,'meeting');
assert.equal(afterCall.actions[0].reminderMinutes,60);
assert.equal(DateTime.fromISO(afterCall.actions[0].dueAt).setZone('Asia/Kolkata').toFormat('d LLL h:mm a'),'5 Nov 6:00 PM');
const mobileTranscript=localExtract('I spoke with Arjun. We will discuss the PPT tomorrow at 6 PM. Remain me one hour before.',now);
assert.equal(mobileTranscript.contactName,'Arjun');
assert.equal(mobileTranscript.actions.length,1);
assert.equal(mobileTranscript.actions[0].kind,'meeting');
assert.equal(mobileTranscript.actions[0].reminderMinutes,60);
assert.equal(DateTime.fromISO(mobileTranscript.actions[0].dueAt).setZone('Asia/Kolkata').toFormat('d LLL h:mm a'),'5 Nov 6:00 PM');
assert.equal(localExtract('I spoke with Arjun. We will discuss the PPT tomorrow at 6 PM.',now).actions.length,1);
assert.equal(localExtract('I discussed the PPT with Arjun yesterday.',now).actions.length,0);
assert.equal(localExtract('We had a discussion about the PPT.',now).actions.length,0);
const callBack=naturalExtract('Remind me to call Mr. R. Mugam on Saturday at 4 PM.',now);
assert.equal(callBack.contactName,'Mr. R. Mugam');
assert.equal(callBack.actions[0].kind,'reminder');
assert.equal(DateTime.fromISO(callBack.actions[0].dueAt).setZone('Asia/Kolkata').toFormat('d LLL h:mm a'),'7 Nov 4:00 PM');
const investor=naturalExtract('I have an investor meeting with Arjun on Thursday at 3 PM. Remind me one day before.',now);
assert.equal(investor.contactName,'Arjun');
assert.equal(investor.actions[0].reminderMinutes,1440);
const prepare=naturalExtract('Remind me tomorrow at 8 AM to prepare a PPT for the team meeting.',now);
assert.equal(prepare.contactName,'');
assert.equal(prepare.actions[0].kind,'reminder');
assert.equal(DateTime.fromISO(prepare.actions[0].dueAt).setZone('Asia/Kolkata').toFormat('h:mm a'),'8:00 AM');
assert.equal(localExtract('Hey, I just called Arjun. We decided to have a PPT discussion by tomorrow at 6 PM. Remind me.',now).actions[0].reminderMinutes,0);

console.log('Extraction and segment tests passed');

// Spoken clock times survive punctuation and retain explicit-time metadata.
for (const [phrase,hour,minute,date] of [
  ['call Kartikeyan by 12:30 p.m.',12,30,'2026-11-04'],
  ['1:00 p.m. tomorrow',13,0,'2026-11-05'],
  ['5 pm',17,0,'2026-11-04'],
  ['9 a.m. on 17th November',9,0,'2026-11-17'],
  ['tomorrow',9,0,'2026-11-05'],
  ['call Kartikeyan next Monday at 5 pm',17,0,'2026-11-09'],
  ['12:30',12,30,'2026-11-04'],
  ['12.30',12,30,'2026-11-04'],
  ['by 12:30',12,30,'2026-11-04'],
  ['12:30 am',0,30,'2026-11-04'],
]) {
  const parsed=DateTime.fromISO(parseIST(phrase,now)).setZone('Asia/Kolkata');
  assert.equal(parsed.toISODate(),date,phrase);assert.equal(parsed.hour,hour,phrase);assert.equal(parsed.minute,minute,phrase);
}
for(const clock of ['12:30 p.m.','12:30 pm','12:30','12.30']){
  const draft=localExtract(`remind me to call Kartikeyan by ${clock}`,now);
  assert.equal(draft.contactName,'Kartikeyan');assert.equal(draft.actions.length,1);
  assert.equal(draft.actions[0].timeSpecified,true);assert.equal(DateTime.fromISO(draft.actions[0].dueAt).setZone('Asia/Kolkata').toFormat('HH:mm'),'12:30');
}
assert.equal(localExtract('call Kartikeyan tomorrow',now).actions[0].timeSpecified,false);
assert.equal(localExtract('call Kartikeyan by 25:99',now).actions[0].dueAt,null);
assert.equal(localExtract('call Kartikeyan by 25:99',now).actions[0].timeSpecified,true);
assert.equal(localExtract('Call Priya at 5 pm. Send slides tomorrow',now).actions.length,2);
console.log('Clock-time regression tests passed');

const {reminderAt,validReminder}=await import('../src/lib/reminders.ts');
assert.equal(DateTime.fromISO(reminderAt(afterCall.actions[0].dueAt,true,afterCall.actions[0].reminderMinutes)).setZone('Asia/Kolkata').toFormat('d LLL h:mm a'),'5 Nov 5:00 PM');
const noMeetingTime=naturalExtract('Name Arjun. We have scheduled an investor meeting on Thursday. Remind me one day before.',now);
assert.equal(noMeetingTime.actions[0].timeSpecified,false);
assert.equal(reminderAt(noMeetingTime.actions[0].dueAt,false,noMeetingTime.actions[0].reminderMinutes),null);
const due='2026-11-17T07:00:00.000Z'; // 12:30 PM IST
for(const offset of [0,10,30,60,1440]){
  assert.equal(validReminder(offset),true);
  assert.equal(Date.parse(reminderAt(due,true,offset)),Date.parse(due)-offset*60000);
}
assert.equal(DateTime.fromISO(reminderAt(due,true,30)).setZone('Asia/Kolkata').toFormat('h:mm a'),'12:00 PM');
assert.equal(reminderAt(null,true,30),null);
assert.equal(reminderAt(due,false,30),null);
assert.equal(reminderAt('invalid',true,0),null);
assert.equal(validReminder(15),false);
assert.equal(validReminder('30'),false);
assert.equal(reminderAt('2026-11-18T07:00:00.000Z',true,30),'2026-11-18T06:30:00.000Z');
console.log('Reminder offset tests passed');

// Relative reminder regression: these exact mobile phrases must be timed.
for (const [phrase,minutes] of [
  ['In another 3 minutes I need a reminder to check the code for mobile',3],
  ['remind me for checking code in another 15 minutes',15],
  ['Remind me in three minutes',3],
  ['Call Arjun after fifteen minutes',15],
  ['Meeting in 2 hours',120],
]) {
  const action=localExtract(phrase,now).actions[0];
  assert.ok(action,phrase);assert.equal(action.timeSpecified,true,phrase);
  assert.equal(DateTime.fromISO(action.dueAt).toMillis(),now.getTime()+minutes*60000,phrase);
}
assert.equal(parseIST('Remind me in 3 minutes or in 15 minutes',now),null);
console.log('Relative reminder timing regression tests passed');

const noonIST = new Date('2026-11-09T07:30:00.000Z');
const reported = 'today I met Anand from SS TPL he wanted me to call him tomorrow with the proposal document so remind me tonight 6:00 p.m.';
const explicitAlert = naturalExtract(reported, noonIST);
assert.equal(explicitAlert.contactName,'Anand');
assert.equal(explicitAlert.actions.length,2);
assert.equal(explicitAlert.actions[0].dueAt,'2026-11-10T03:30:00.000Z'); // date-only task retains tomorrow
assert.equal(explicitAlert.actions[0].timeSpecified,false);
assert.equal(explicitAlert.actions[1].kind,'reminder');
assert.equal(explicitAlert.actions[1].dueAt,'2026-11-09T12:30:00.000Z');
assert.equal(explicitAlert.actions[1].timeSpecified,true);
assert.match(explicitAlert.actions[1].title,/remind me tonight 6:00 p\.m\./);
const separate = naturalExtract('I spoke with Arjun. We will discuss the PPT tomorrow at 6 PM. Remind me tonight at 5 PM.', noonIST);
assert.equal(separate.actions.length,2);
assert.equal(separate.actions[0].dueAt,'2026-11-10T12:30:00.000Z');
assert.equal(separate.actions[1].dueAt,'2026-11-09T11:30:00.000Z');
const sameDay = naturalExtract('I spoke with Arjun. We will discuss the PPT tomorrow at 6 PM. Remind me tomorrow at 5 PM.', noonIST);
assert.equal(sameDay.actions.length,1);
assert.equal(sameDay.actions[0].reminderMinutes,60);
console.log('Explicit alert day/time regression tests passed');

const tonight = naturalExtract('Today I met Anand sir regarding his cricket match he wants a meeting tomorrow afternoon for lunch you set a reminder for tonight 8:00 p.m. to check and confirm my availability',noonIST);
assert.equal(tonight.contactName,'Anand');
assert.equal(tonight.actions.length,2);
assert.equal(tonight.actions[0].dueAt,'2026-11-10T03:30:00.000Z');
assert.equal(tonight.actions[1].dueAt,'2026-11-09T14:30:00.000Z');
const prep = naturalExtract('Today I had discussion with Mr arayapan regarding the product demo prepare the PPT today evening 5:00 p.m. our meeting is scheduled tomorrow morning 9:00 a.m.',noonIST);
assert.equal(prep.actions.length,2);
assert.equal(prep.actions[0].dueAt,'2026-11-09T11:30:00.000Z');
assert.equal(prep.actions[1].dueAt,'2026-11-10T03:30:00.000Z');
console.log('Independent preparation/meeting regression tests passed');

const cms = naturalExtract('remind me to prepare for call with CMS Placement Officer at 2:45 today',noonIST);
assert.equal(cms.contactName,'CMS Placement Officer');
assert.equal(cms.actions[0].dueAt,'2026-11-09T09:15:00.000Z');
assert.equal(parseIST('Call at 2:45 today',new Date('2026-11-09T15:00:00Z')),null);
assert.equal(parseIST('Call at 2:45 AM today',noonIST),'2026-11-08T21:15:00.000Z');
const advance15 = naturalExtract('remind me to prepare for call with CMS Placement Officer at 2:45 today. Remind me fifteen minutes before.',noonIST);
assert.equal(advance15.actions.length,2);
assert.equal(advance15.actions[1].dueAt,'2026-11-09T09:00:00.000Z');
console.log('Casual future clock, contact, and fifteen-minute advance tests passed');

const {fastExtract,createReviewDraft}=await import('../src/lib/localExtract.ts');
const evening=new Date('2026-11-18T12:30:00Z');
const arumugam=fastExtract('Set a reminder for 5:00 a.m. to prepare presentation with Arumugam',evening);
assert.equal(arumugam.contactName,'Arumugam');assert.equal(arumugam.actions[0].dueAt,'2026-11-18T23:30:00.000Z');
assert.equal(arumugam.actions[0].timeSpecified,true);
const friday=fastExtract('Follow up with Richard next Friday about the property',evening);
assert.equal(friday.contactName,'Richard');assert.equal(friday.actions[0].timeSpecified,false);
const meeting=fastExtract('Meet Richard next Friday at 11:00 AM',evening);assert.equal(meeting.contactName,'Richard');assert.equal(meeting.actions[0].timeSpecified,true);
const tamilWords='நாளைக்கு மோகன்கிட்ட இந்த ப்ராப்பர்ட்டி சம்பந்தமா பேசணும்';
const manual=createReviewDraft(tamilWords,evening);assert.equal(manual.summary,tamilWords);assert.equal(manual.actions[0].title,tamilWords);assert.equal(manual.actions[0].dueAt,'2026-11-19T03:30:00.000Z');assert.equal(manual.actions[0].timeSpecified,false);assert.equal(manual.contactName,'மோகன்');
console.log('Literal name, next-occurrence clock, date-only task and Tamil manual-draft checks passed');

const mobileMeeting=createReviewDraft('Tomorrow I have meeting with Karthikeyan sir, set me a call at 2:00 PM.',evening);
assert.equal(mobileMeeting.contactName,'Karthikeyan');assert.equal(mobileMeeting.actions[0].kind,'meeting');assert.equal(mobileMeeting.actions[0].dueAt,'2026-11-19T08:30:00.000Z');assert.equal(mobileMeeting.actions[0].timeSpecified,true);
const tamilMeeting=createReviewDraft('நாளைக்கு 3 மணிக்கு ஆரியப்பன் கூட ஒரு மீட்டிங் இருக்கு ஸ்கெடியூல் பண்ண',evening);
assert.equal(tamilMeeting.contactName,'ஆரியப்பன்');assert.equal(tamilMeeting.actions[0].kind,'meeting');assert.equal(tamilMeeting.actions[0].timeAmbiguity,'period');assert.equal(tamilMeeting.actions[0].dueAt,null);assert.deepEqual(tamilMeeting.actions[0].timeChoices,['2026-11-18T21:30:00.000Z','2026-11-19T09:30:00.000Z']);
for(const text of ['நாளைக்கு மதியம் 3 மணிக்கு ஆரியப்பன் கூட மீட்டிங்','நாளைக்கு மதியம் மூன்று மணிக்கு ஆரியப்பன் கூட ஒரு மீட்டிங் இருக்கு','நாளைக்கு 3 PM ஆரியப்பன் கூட meeting']){const r=createReviewDraft(text,evening);assert.equal(r.actions[0].kind,'meeting');assert.equal(r.actions[0].dueAt,'2026-11-19T09:30:00.000Z');assert.equal(r.actions[0].timeSpecified,true)}
const noClock=createReviewDraft('Tomorrow meeting with Aria Pan',evening);assert.equal(noClock.actions[0].kind,'meeting');assert.equal(noClock.actions[0].timeSpecified,false);assert.equal(noClock.actions[0].dueAt,'2026-11-19T03:30:00.000Z');
const unknown=createReviewDraft('இந்த விவரத்தை நினைவில் வைத்துக்கொள்ள வேண்டும்',evening);assert.equal(unknown.needsManualReview,true);assert.equal(unknown.actions[0].dueAt,null);
const spelling=createReviewDraft('Set a reminder for 5:00 AM to prepare presentation with Aarmugam.',evening);assert.equal(spelling.contactName,'Aarmugam');assert.equal(spelling.summary,'Set a reminder for 5:00 AM to prepare presentation with Aarmugam.');
console.log('Phone-reported English/Tamil meetings, AM/PM choices, number words and literal-name checks passed');

const eleven=createReviewDraft('நாளைக்கு காலை பதினொன்று மணிக்கு ஆரியப்பன் கூட மீட்டிங்',evening);assert.equal(eleven.actions[0].dueAt,'2026-11-19T05:30:00.000Z');
const complexTamil=createReviewDraft('நாளைக்கு 3 மணிக்கு ஆரியப்பன் கூட மீட்டிங் எனக்கு 5 PM ரிமைண்டர்',evening);assert.equal(complexTamil.needsManualReview,true);

const englishBare=createReviewDraft('Tomorrow I have a meeting with Karthikeyan at 3',evening);assert.equal(englishBare.actions[0].timeAmbiguity,'period');assert(englishBare.actions[0].timeChoices.includes('2026-11-19T09:30:00.000Z'));
const englishAfternoon=createReviewDraft('Tomorrow I have a meeting with Karthikeyan at 3 in the afternoon',evening);assert.equal(englishAfternoon.actions[0].dueAt,'2026-11-19T09:30:00.000Z');
