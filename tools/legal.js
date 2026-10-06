// node tools/legal.js -> writes app/terms.html, privacy.html, refund.html, contact.html
const fs = require('fs'), path = require('path');
const MAIL = 'notesbugsreportandsupport@gmail.com';
const SUBJ = 'Applied Chemistry (BACHY105), Basic Engineering (BAEEE101) and Technical English (BAENG101)';
const links = '<p class="legal-links"><a href="terms.html">Terms</a> · <a href="refund.html">Refunds and cancellations</a> · <a href="contact.html">Contact</a> · <a href="privacy.html">Privacy</a></p>';
const mail = `<a href="mailto:${MAIL}">${MAIL}</a>`;
const page = (title, lead, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title} · Notix</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,500&display=swap">
<link rel="stylesheet" href="css/store.css">
</head>
<body class="prose-page">
<div class="wrap">
  <div class="eyebrow"><span class="code">NOTIX</span><a href="./" style="color:inherit">Back to the store</a></div>
  <h1>${title}</h1>
  <p class="lead">${lead}</p>
${body}
  ${links}
</div>
</body>
</html>
`;
const out = {
  'terms.html': page('Terms and conditions', `These terms apply to Notix (https://getnotespro.vercel.app), a website that sells one-time Pro access for study note websites made for VIT students: ${SUBJ}. Last updated 6 October 2026.`, `
  <h2>What you get</h2>
  <ul>
    <li>The notes on each subject website are free. A <b>one-time payment</b>, shown on this website in Indian rupees, unlocks the <b>Pro features for that subject</b>: interactive models, the question bank, quiz, flashcards, formula sheet and summaries, and quiz battles.</li>
    <li>Each subject is bought separately. Access is digital and starts as soon as the payment is confirmed. Nothing is shipped.</li>
    <li>Pro lasts for as long as that subject website runs. There is no subscription and no automatic renewal.</li>
  </ul>
  <h2>Your account</h2>
  <ul>
    <li>You sign in with your VIT student Google account (…@vitstudent.ac.in). Your purchase is linked to that account and works on the matching subject website when you sign in there.</li>
    <li>Access is personal. Do not share your account, or copy, resell or republish the notes. Accounts that do this can lose access without a refund.</li>
  </ul>
  <h2>Payments</h2>
  <ul>
    <li>Payments are made by UPI through Razorpay. This website never sees your bank or UPI details.</li>
    <li>If money was taken but Pro did not unlock, reload the subject website, or use "Check my payment" on this website, or write to ${mail}.</li>
    <li>Refunds are covered by the <a href="refund.html">refund and cancellation policy</a>.</li>
  </ul>
  <h2>About the content</h2>
  <ul>
    <li>The notes are made by a student to help with studying. They are not official VIT material, and these websites are not run by or linked to VIT.</li>
    <li>Care is taken to make them correct, but mistakes can happen. Please check important points against your course material.</li>
    <li>Topics and features may be updated, added or improved over time.</li>
  </ul>
  <h2>Changes and contact</h2>
  <p>These terms may be updated; the date above shows the latest version. Questions: ${mail}, or see the <a href="contact.html">contact page</a>.</p>`),

  'refund.html': page('Refund and cancellation policy', `Notix sells one-time digital Pro access for the subject note websites (the notes themselves are free). Last updated 6 October 2026.`, `
  <h2>Cancellations</h2>
  <p>The payment is one-time and access starts straight away, so there is no order to cancel and nothing renews. If you tap Pay by mistake, close the UPI checkout before approving the payment in your UPI app.</p>
  <h2>When you get a refund</h2>
  <ul>
    <li><b>Charged twice</b> for the same subject and account: the extra payment is refunded in full.</li>
    <li><b>Money taken but Pro never unlocked</b>, and it could not be fixed within 3 days of writing to us: refunded in full.</li>
    <li><b>Charged by mistake</b> (for example on the wrong account or subject) and the Pro features were not used: write within 7 days of the payment and it is refunded in full.</li>
  </ul>
  <p>Because Pro is digital and opens immediately, a payment for an account that has already used the Pro features is not refunded only because you changed your mind.</p>
  <h2>How to ask</h2>
  <p>Write to ${mail} from your student email with the Razorpay payment ID (it starts with pay_ and is in your UPI app or the Razorpay receipt email), the subject, and the reason. You will get an answer within 3 working days.</p>
  <h2>How refunds are paid</h2>
  <p>Approved refunds are made through Razorpay to the same UPI or bank account you paid from, usually within 5 to 7 working days. Pro for that subject ends when a refund is made; the free notes stay open.</p>`),

  'contact.html': page('Contact us', `Notix sells Pro access for study note websites made for VIT students: ${SUBJ}.`, `
  <h2>Email</h2>
  <p>${mail}<br>For payments, refunds, sign-in problems, mistakes in the notes, or anything else. Replies within 3 working days.</p>
  <h2>Payment problems</h2>
  <p>If money was taken but Pro did not unlock, first reload the subject website. Then sign in on this website and use "Check my payment". If that does not help, email the Razorpay payment ID (it starts with pay_) from your student email, and say which subject you bought.</p>`),

  'privacy.html': page('Privacy', `Notix is a small store run by a student. This page explains what it stores about you and why. Last updated 6 October 2026.`, `
  <h2>What is stored</h2>
  <ul>
    <li><b>Your VIT student email</b>, from "Sign in with Google". It is used to let you in and to link your payments to your account. Your name and profile photo from Google are not stored.</li>
    <li><b>When you first signed in, when you last signed in, and how many times</b>, shown to the owner.</li>
    <li><b>Your payment record</b> for each subject: the Razorpay payment ID, amount and date, linked to your email. UPI details are handled entirely by <a href="https://razorpay.com/privacy/">Razorpay</a>; this website never sees your bank or UPI details.</li>
    <li><b>Which subjects you bought</b>, which the subject websites check (by your email) to unlock Pro for you.</li>
  </ul>
  <h2>What is not done</h2>
  <ul>
    <li>Your data is not sold or shared with anyone, and not used for ads.</li>
    <li>No tracking or advertising cookies are used. The only cookies keep you signed in and remember which subject you came from for a few minutes.</li>
  </ul>
  <h2>Where it is kept</h2>
  <p>The website runs on Vercel, with a small Upstash database for the records above. Payments go through Razorpay. Google handles sign-in.</p>
  <h2>Your choices</h2>
  <p>You can sign out at any time. To have your email and payment record deleted, write to ${mail} from your student account. Deleting your record also removes your Pro access.</p>`),
};
for (const f in out) fs.writeFileSync(path.join(__dirname, '..', 'app', f), out[f]);
console.log('wrote', Object.keys(out).join(', '));
