// The site's subject content. Name, notes site and price come from PRODUCTS in api/_lib.js (the payment code reads
// those too); everything a page shows about a subject comes from here. To add a subject:
//   1. one line in api/_lib.js PRODUCTS
//   2. one entry below (the build stops with a clear message if the two lists disagree)
// Home tiles, search, the marquee, the footer counts and (Phase 2) the /<code> pages all follow this list.
//
// group: unused for now; rows or filter chips can be switched on later without a rebuild of the pages.
// aka:   nicknames the search also matches (the owner should confirm or extend these).
// pro:   what Pro adds for this subject (taken from the live store's card lists).
export const SUBJECTS = {
  BACHY105: {
    group: 'Chemistry',
    aka: ['chem', 'chemistry'],
    blurb: 'Batteries, fuel cells, solar cells, semiconductors, nanomaterials and spectroscopy.',
    modules: [
      [1, 'Thermodynamics & Kinetics'],
      [2, 'Energy Devices'],
      [3, 'Functional Materials'],
      [4, 'Spectroscopy & Diffraction'],
      [5, 'Computational Chemistry'],
    ],
    pro: [
      'Every interactive model (Nernst, Beer–Lambert, Bragg and more) and the Lab bench',
      'Every flashcard, quiz, weak-spot quiz and mastery per topic',
      'Answers to every practice question and model answers for the CAT papers',
      'Timed mock CAT (90 min) and mock FAT (180 min) on a real paper',
      'Night-before revision pack and formula sheet',
      'Progress sync, bookmarks, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles',
    ],
  },
  BAEEE101: {
    group: 'Electrical',
    aka: ['beee', 'bee', 'basic electrical', 'electrical', 'electronics'],
    blurb: 'Circuits, machines, electronics, communication, graphics, CAD and manufacturing.',
    modules: [
      [1, 'Principles of Electrical Engineering'],
      [2, 'Foundations of Electronics and Communication Systems'],
      [3, 'Engineering Graphics and CAD'],
      [4, 'Manufacturing, Energy and Mechanical Automation'],
    ],
    pro: [
      'Every interactive model of circuits, amplifiers and mechanisms, plus the Lab bench',
      'Every flashcard, quiz, weak-spot quiz and mastery per topic',
      'Answers and explanations for every practice question and model answers for the CAT and FAT papers',
      'Timed mock CAT (90 min) and mock FAT (180 min) on a real paper',
      'Night-before revision pack and formula sheet',
      'Progress sync, bookmarks, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles',
    ],
  },
  BAENG101: {
    group: 'English',
    aka: ['english', 'tech english', 'eng'],
    blurb: 'Technical writing, grammar, reading and communication, as short tabbed notes.',
    // modules 1–2 are the owner's uncommitted edit in baeng101-notes; add them here once committed there
    modules: [
      [3, 'Reading'],
      [4, 'Writing'],
      [5, 'Interpersonal Communication'],
    ],
    pro: [
      'Every interactive writing and communication tool in the Practice lab',
      'Every flashcard, quiz, weak-spot quiz and mastery per topic',
      'Answers to every practice question and model answers for the CAT-2 papers',
      'Rules and templates page',
      'Progress sync, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles',
    ],
  },
  BACHY101: {
    group: 'Environment',
    aka: ['evs', 'env', 'environment', 'environmental science', 'environmental studies', 'ecology'],
    blurb: 'Ecosystems, biodiversity, pollution, environmental laws, the SDGs and climate change.',
    // the five weeks of lecture notes in evs-notes (site/data.js)
    modules: [
      [1, 'Fundamentals of Environment and Ecosystems'],
      [2, 'Biodiversity and Environmental Quality'],
      [3, 'Pollution and Its Management Techniques'],
      [4, 'Environmental Laws and Sustainable Development Goals'],
      [5, 'Climate Change and Emerging Environmental Issues'],
    ],
    pro: [], // the owner to fill in once the EVS Pro tools exist (an empty list hides the "Pro" section on /bachy101)
  },
};
