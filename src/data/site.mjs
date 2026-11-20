// Site-wide settings. The store lives at https://notix.in (Cloudflare Workers, see wrangler.jsonc).
// SITE_URL is the only absolute address of the store; every other link is relative, so a later
// domain move is this one value (or the SITE_URL environment variable in Vercel) plus the steps in MOVING-DOMAIN.md.
export const SITE_URL = (process.env.SITE_URL || 'https://notix.in').replace(/\/+$/, '');

export const SITE = {
  name: 'Notix',
  title: 'Notix · VIT notes, free to read',
  description: 'Notes for VIT subjects, free to read. Pro adds the study tools for ₹30 a subject (₹20 till 30 Nov), one time.',
  support: 'notesbugsreportandsupport@gmail.com',
  // "Request a subject" goes to the request board (N3, /requests)
  request: '/requests',
  madeBy: 'Made by a VIT student',
  more: [
    { name: 'Marks / CGPA calculator', href: 'https://markscalc.cv' },
    { name: 'Pick My Prof', href: 'https://pickmyprof.web.app' },
  ],
  legal: [
    { name: 'Terms', href: '/terms' },
    { name: 'Privacy', href: '/privacy' },
    { name: 'Refunds', href: '/refund' },
    { name: 'Contact', href: '/contact' },
  ],
};
