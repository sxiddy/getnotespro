// Site-wide settings. SITE_URL is the only absolute address of the store; every other link is relative, so a later
// domain move is this one value (or the SITE_URL environment variable in Vercel) plus the steps in MOVING-DOMAIN.md.
export const SITE_URL = (process.env.SITE_URL || 'https://notix-notes.cv').replace(/\/+$/, '');

export const SITE = {
  name: 'Notix',
  title: 'Notix · VIT notes, free to read',
  description: 'Notes for VIT subjects, free to read. Pro adds the study tools for ₹10 a subject, one time.',
  support: 'notesbugsreportandsupport@gmail.com',
  // "Request a subject" is an email until the request board (N3) is built
  request: 'mailto:notesbugsreportandsupport@gmail.com?subject=Subject%20request',
  madeBy: 'Made by a VIT student',
  more: [
    { name: 'Marks / CGPA calculator', href: 'https://markscalc.cv' },
    { name: 'Pick My Prof', href: 'https://pickmyprof.web.app' },
  ],
  legal: [
    { name: 'Terms', href: '/terms.html' },
    { name: 'Privacy', href: '/privacy.html' },
    { name: 'Refunds', href: '/refund.html' },
    { name: 'Contact', href: '/contact.html' },
  ],
};
