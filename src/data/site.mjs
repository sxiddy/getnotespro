// Site-wide settings. Until notix-notes.cv is connected (launch step), the store lives at notix-notes.vercel.app.
// SITE_URL is the only absolute address of the store; every other link is relative, so a later
// domain move is this one value (or the SITE_URL environment variable in Vercel) plus the steps in MOVING-DOMAIN.md.
export const SITE_URL = (process.env.SITE_URL || 'https://notix-notes.vercel.app').replace(/\/+$/, '');

export const SITE = {
  name: 'Notix',
  title: 'Notix · VIT notes, free to read',
  description: 'Notes for VIT subjects, free to read. Pro adds the study tools for ₹20 a subject, one time.',
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
