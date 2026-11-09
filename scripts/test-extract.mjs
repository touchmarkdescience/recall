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
assert.equal(explicitAlert.actions.length,1);
assert.equal(explicitAlert.actions[0].kind,'reminder');
assert.equal(explicitAlert.actions[0].dueAt,'2026-11-09T12:30:00.000Z');
assert.equal(explicitAlert.actions[0].timeSpecified,true);
assert.match(explicitAlert.actions[0].title,/remind me tonight 6:00 p\.m\./);
const separate = naturalExtract('I spoke with Arjun. We will discuss the PPT tomorrow at 6 PM. Remind me tonight at 5 PM.', noonIST);
assert.equal(separate.actions.length,2);
assert.equal(separate.actions[0].dueAt,'2026-11-10T12:30:00.000Z');
assert.equal(separate.actions[1].dueAt,'2026-11-09T11:30:00.000Z');
const sameDay = naturalExtract('I spoke with Arjun. We will discuss the PPT tomorrow at 6 PM. Remind me tomorrow at 5 PM.', noonIST);
assert.equal(sameDay.actions.length,1);
assert.equal(sameDay.actions[0].reminderMinutes,60);
console.log('Explicit alert day/time regression tests passed');
