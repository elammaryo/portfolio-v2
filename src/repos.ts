// Display metadata for each repo, in the same order as commits.json `repos`. `stack` is what
// the repo is built on, read from its package.json or pubspec.yaml; the "built with" chart
// counts each repo's commits toward every framework it lists.
export const REPO_META: Record<string, { label: string; color: string; stack: string[] }> = {
  'super-over': { label: 'SuperOver app', color: '#1fd17a', stack: ['Flutter', 'Firebase'] },
  athena: { label: 'Athena', color: '#b9a6ff', stack: ['React', 'Node.js', 'Postgres'] },
  gameover: { label: 'GameOver Studio', color: '#00d4ff', stack: ['Next.js', 'React'] },
  'super-over-backend': { label: 'SuperOver API', color: '#9df5c6', stack: ['Firebase', 'Node.js'] },
  'budgeting-app': { label: 'Budget', color: '#f2c879', stack: ['React', 'Supabase', 'Postgres'] },
  'cosmic-portfolio': { label: 'Portfolio v1', color: '#8b7bff', stack: ['React'] },
  'superover-green-grounds': { label: 'superoverapp.com', color: '#0fa968', stack: ['React', 'Supabase', 'Postgres'] },
  gameday: { label: 'GameDay', color: '#ff4d6a', stack: ['Next.js', 'React', 'Postgres'] },
  'gyo-self-order': { label: 'GYO Kiosk', color: '#ffa726', stack: ['Flutter'] },
  'ai-chatbot': { label: 'GlazeBot', color: '#f7b2c8', stack: ['Node.js'] },
  'admin-dashboard': { label: 'SuperOver Admin', color: '#5fb892', stack: ['React'] },
  'qr-generator': { label: 'QR Generator', color: '#a0a0b8', stack: [] },
};

export type CommitData = {
  repos: { id: string; mine: number; langs: Record<string, number> }[];
  commits: [number, number, string][];
  hours: number[];
  weekdays: number[];
  days: Record<string, number>;
  langs: Record<string, number>;
  stats: { total: number; activeDays: number; bestStreak: number; busiest: [string, number]; first: string; last: string; lateNight: number };
};
