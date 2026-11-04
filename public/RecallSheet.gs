/**
 * Bind this script to one salesperson's Google Sheet.
 * Script Properties required: RECALL_SECRET (16+ random characters), DIGEST_EMAIL.
 * Project time zone: Asia/Kolkata. Deploy as Web app: execute as me, access anyone.
 */
const TZ = 'Asia/Kolkata';
const NOTES_HEADERS = ['Event ID','Interaction ID','Contact','Transcript','Summary','Recorded UTC','Recorded IST'];
const ACTION_HEADERS = ['Action ID','Interaction ID','Contact','Type','Task','Recorded IST','Due IST','Status','Updated IST'];

function sheet_(name, headers) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const tab = book.getSheetByName(name) || book.insertSheet(name);
  if (tab.getLastRow() === 0) {
    tab.appendRow(headers);
    tab.setFrozenRows(1);
    tab.getRange(1,1,1,headers.length).setBackground('#174c43').setFontColor('#ffffff').setFontWeight('bold');
    tab.autoResizeColumns(1,headers.length);
  }
  return tab;
}

function setupRecall() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('RECALL_SECRET') || props.getProperty('RECALL_SECRET').length < 16) throw new Error('Set a random RECALL_SECRET of at least 16 characters in Script Properties.');
  if (!props.getProperty('DIGEST_EMAIL')) throw new Error('Set DIGEST_EMAIL in Script Properties.');
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(TZ);
  sheet_('Conversations', NOTES_HEADERS);
  sheet_('Actions', ACTION_HEADERS);
  sheet_('Processed Events', ['Event ID','Received IST']);
  for (const trigger of ScriptApp.getProjectTriggers()) if (trigger.getHandlerFunction() === 'sendMorningDigest') ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger('sendMorningDigest').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
}

function reply_(object) { return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON); }
function format_(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM-dd HH:mm') : ''; }
function findRow_(tab, id) {
  if (tab.getLastRow() < 2) return -1;
  const found = tab.getRange(2,1,tab.getLastRow()-1,1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return found ? found.getRow() : -1;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const payload = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('RECALL_SECRET');
    if (!secret || payload.secret !== secret) return reply_({ok:false,error:'Unauthorized'});
    if (!payload.eventId || !['interaction','action','ping'].includes(payload.type)) return reply_({ok:false,error:'Invalid event'});
    lock.waitLock(20000);
    const seen = sheet_('Processed Events', ['Event ID','Received IST']);
    if (findRow_(seen,payload.eventId) !== -1) return reply_({ok:true,duplicate:true});
    if (payload.type === 'ping') {
      // A settings check: record only the event receipt.
    } else if (payload.type === 'interaction') {
      if (!payload.interactionId) return reply_({ok:false,error:'Missing conversation fields'});
      sheet_('Conversations',NOTES_HEADERS).appendRow([payload.eventId,payload.interactionId,payload.contactName||'',payload.transcript||'',payload.summary||'',payload.recordedAt||'',format_(payload.recordedAt)]);
    } else {
      if (!payload.actionId) return reply_({ok:false,error:'Missing action fields'});
      const tab = sheet_('Actions',ACTION_HEADERS);
      const values = [payload.actionId,payload.interactionId||'',payload.contactName||'',payload.kind||'',payload.title||'',format_(payload.createdAt),payload.dueAt&&payload.timeSpecified===0?format_(payload.dueAt).slice(0,10)+' Any time':format_(payload.dueAt),payload.status||'pending',format_(new Date().toISOString())];
      const found = findRow_(tab,payload.actionId);
      if (found === -1) tab.appendRow(values); else tab.getRange(found,1,1,values.length).setValues([values]);
    }
    seen.appendRow([payload.eventId,format_(new Date().toISOString())]);
    return reply_({ok:true});
  } catch (error) { return reply_({ok:false,error:String(error)}); }
  finally { try { lock.releaseLock(); } catch (_) {} }
}

function sendMorningDigest() {
  const props = PropertiesService.getScriptProperties();
  const recipient = props.getProperty('DIGEST_EMAIL');
  if (!recipient) throw new Error('DIGEST_EMAIL is missing.');
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (props.getProperty('LAST_DIGEST_DATE') === today) return;
  const tab = sheet_('Actions',ACTION_HEADERS);
  const values = tab.getLastRow() > 1 ? tab.getRange(2,1,tab.getLastRow()-1,ACTION_HEADERS.length).getDisplayValues() : [];
  const due = values.filter(row => row[7] === 'pending' && row[6].slice(0,10) === today);
  const lines = due.map(row => `• ${row[6].slice(11)==='Any time'?'Any time':row[6].slice(11)+' IST'} — ${row[4]}${row[2]?' ('+row[2]+')':''}`);
  const body = due.length ? `Your actions for ${today}:\n\n${lines.join('\n')}\n\nOpen Recall for the conversation history.` : `Nothing is due today. You have time to meet your next prospect.\n\nOpen Recall to capture a new conversation.`;
  MailApp.sendEmail({to:recipient,subject:`Recall · ${due.length} action${due.length===1?'':'s'} for today`,body});
  props.setProperty('LAST_DIGEST_DATE',today);
}
