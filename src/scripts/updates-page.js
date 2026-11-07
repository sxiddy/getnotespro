import { getUpdates, dateText } from './updates.js';
import { esc } from './core.js';

const list = document.getElementById('upd-list'), empty = document.getElementById('upd-empty');
const names = JSON.parse(list.dataset.names || '{}');
const items = await getUpdates();
list.removeAttribute('aria-busy');
list.innerHTML = items.map((u) => `<li class="upd-item" id="u-${esc(u.id)}">
  <p class="upd-item__meta mono"><time datetime="${new Date(u.at).toISOString()}">${dateText(u.at)}</time>${(u.codes || []).filter((c) => names[c]).map((c) => ` <a class="upd-item__tag" href="/${c.toLowerCase()}" title="${esc(names[c])}">${c}</a>`).join('')}</p>
  <h2 class="upd-item__title">${esc(u.title)}</h2>
  ${u.body ? `<p class="upd-item__body">${esc(u.body)}</p>` : ''}
</li>`).join('');
empty.hidden = items.length > 0;
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
