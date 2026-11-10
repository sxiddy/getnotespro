// Joins PRODUCTS (api/_lib.js: name, tag, notes site, price) with the page content in src/data/subjects.mjs.
// Runs at build time only. Fails the build if the two lists disagree, so a half-added subject can't ship.
import { createRequire } from 'node:module';
import { SUBJECTS } from '../data/subjects.mjs';

// resolved from the project root, not this file: the build moves this code into a bundle elsewhere
const require = createRequire(process.cwd() + '/');
const { PRODUCTS, priceOf, listPriceOf, saleOn, SALE } = require('./api/_lib.js');
// the launch sale as it stands at build time; the browser re-checks it against /api/session (core.js paintPrices)
export const sale = { on: saleOn(), pct: SALE.pct, until: SALE.until };

const codes = Object.keys(PRODUCTS);
const missing = codes.filter((c) => !SUBJECTS[c]);
const extra = Object.keys(SUBJECTS).filter((c) => !PRODUCTS[c]);
if (missing.length || extra.length) {
  throw new Error(
    'Subject lists disagree. ' +
      (missing.length ? `In api/_lib.js PRODUCTS but not in src/data/subjects.mjs: ${missing.join(', ')}. ` : '') +
      (extra.length ? `In src/data/subjects.mjs but not in api/_lib.js PRODUCTS: ${extra.join(', ')}.` : ''),
  );
}

/** @type {{code:string,name:string,tag:string,site:string,price:number,list:number,group:string,aka:string[],blurb:string,modules:[number,string][],pro:string[]}[]} */
export const subjects = codes.map((code) => {
  const p = PRODUCTS[code], s = SUBJECTS[code];
  return {
    code,
    name: p.name,
    tag: p.tag || '',
    site: p.site,
    price: priceOf(code) / 100, // rupees, what the student pays now (sale included); PRICE_<CODE> in Vercel overrides
    list: listPriceOf(code) / 100, // rupees, the full price
    group: s.group || '',
    aka: s.aka || [],
    blurb: s.blurb,
    modules: s.modules,
    pro: s.pro || [],
  };
});

export const moduleCount = subjects.reduce((n, s) => n + s.modules.length, 0);
// what the browser needs for search and the cart (no Pro lists, to keep the page small)
export const clientSubjects = subjects.map(({ code, name, tag, site, price, list, aka, modules }) => ({ code, name, tag, site, price, list, aka, modules }));
