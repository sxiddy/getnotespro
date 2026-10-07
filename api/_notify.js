// Tells the owner when something needs attention: a Telegram message and an email (Resend).
// Both are optional. With no keys set every call does nothing, so the store works the same.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   Telegram message to the owner (see README "Alerts and backups")
//   RESEND_API_KEY, OWNER_EMAIL      email to the owner (Resend's free plan can send to its own account email)
const store = require('./_store');

// The text may use <b> and <i>; anything else typed into it must go through esc() first.
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 3500), parse_mode: 'HTML', disable_web_page_preview: true }), signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch (e) { return false; }
}

async function email(subject, text, attachments) {
  const key = process.env.RESEND_API_KEY, to = process.env.OWNER_EMAIL;
  if (!key || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Notix <onboarding@resend.dev>', to: [to], subject, text, attachments: attachments || undefined }), signal: AbortSignal.timeout(15000),
    });
    return r.ok;
  } catch (e) { return false; }
}

// An alert about a problem. The same problem is sent at most once an hour, and at most 8 alerts an hour in all,
// so an outage cannot fill the owner's phone.
async function alert(id, text) {
  try {
    if (store.configured()) {
      const hour = new Date().toISOString().slice(0, 13);
      const [first, count] = await store.pipeline([['SET', 'alert:' + hour + ':' + id, '1', 'NX', 'EX', 7200], ['INCR', 'alertcount:' + hour], ['EXPIRE', 'alertcount:' + hour, 7200]]);
      if (!first || +count > 8) return false;
    }
    return await telegram('🚨 <b>Notix alert</b>\n' + esc(text));
  } catch (e) { return false; }
}

module.exports = { telegram, email, alert, esc };
