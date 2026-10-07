// Tells the owner when something needs attention: a WhatsApp message (CallMeBot) and an email (Resend).
// Both are optional. With no keys set every call does nothing, so the store works the same.
//   CALLMEBOT_PHONE, CALLMEBOT_KEY   WhatsApp to the owner's own number (see README "Alerts and backups")
//   RESEND_API_KEY, OWNER_EMAIL      email to the owner (Resend's free plan can send to its own account email)
const store = require('./_store');

async function whatsapp(text) {
  const phone = process.env.CALLMEBOT_PHONE, key = process.env.CALLMEBOT_KEY;
  if (!phone || !key) return false;
  try {
    const r = await fetch('https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(phone.replace(/[^\d]/g, '')) + '&apikey=' + encodeURIComponent(key) + '&text=' + encodeURIComponent(String(text).slice(0, 1500)), { signal: AbortSignal.timeout(10000) });
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
    return await whatsapp('Notix alert: ' + text);
  } catch (e) { return false; }
}

module.exports = { whatsapp, email, alert };
