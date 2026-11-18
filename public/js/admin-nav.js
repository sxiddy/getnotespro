/* Notix admin: a section menu like the subject sites' admin pages. Each card is put in a section by its title;
   the alert bar above the menu stays on every section. The open section is kept in the URL (#payments etc.). */
(function () {
  'use strict';
  const GROUPS = [
    ['overview', 'Overview', /^(Notes website visits)/],
    ['inbox', 'Inbox', /^Inbox/],
    ['payments', 'Payments', /^(Payments|Refund history|Give or remove access|Paid outside|Check Razorpay|.*Razorpay)/i],
    ['community', 'Community', /^Community/],
    ['updates', 'Updates', /^Updates/],
    ['offers', 'Discounts & referrals', /^(Discount codes|Referrals)/],
    ['people', 'People', /^Everyone who signed in/],
  ];
  const app = document.querySelector('#app .container-xl'), nav = document.getElementById('anav');
  const blocks = [...app.children].filter((el) => !['alerts', 'anav'].includes(el.id) && !el.querySelector('#refresh'));
  const title = (el) => ((el.querySelector('.card-title, summary') || {}).textContent || '').trim();
  blocks.forEach((el) => { const g = el.matches('.card') && GROUPS.find((x) => x[2].test(title(el))); el.dataset.grp = g ? g[0] : (el.matches('.card') ? 'payments' : 'overview'); });
  const badge = {};
  function draw() {
    nav.innerHTML = GROUPS.filter((g) => app.querySelector('[data-grp="' + g[0] + '"]')).map((g) => '<button type="button" data-g="' + g[0] + '">' + g[1] + (badge[g[0]] ? '<span class="n">' + badge[g[0]] + '</span>' : '') + '</button>').join('');
    nav.hidden = false; mark();
  }
  let cur = (location.hash || '#overview').slice(1);
  function mark() { nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.g === cur)); }
  function show(g) {
    if (!GROUPS.some((x) => x[0] === g)) g = 'overview';
    cur = g; history.replaceState(null, '', '#' + g);
    blocks.forEach((el) => { el.hidden = el.dataset.grp !== g; });
    mark();
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { show(b.dataset.g); window.scrollTo(0, 0); } });
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-goto]'); if (a) { e.preventDefault(); show(a.dataset.goto); window.scrollTo(0, 0); } });
  document.addEventListener('notix-badges', (e) => { badge.inbox = e.detail.inbox || 0; badge.overview = e.detail.alerts || 0; draw(); });
  draw(); show(cur);
})();
