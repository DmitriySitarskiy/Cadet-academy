// Рангова сітка департаменту (з гри). Порядок = порядковий номер рангу.
export const RANKS: { n: number; name: string }[] = [
  { n: 1, name: 'Recruit' },
  { n: 2, name: 'Cadet' },
  { n: 3, name: 'Corporal' },
  { n: 4, name: 'Officer' },
  { n: 5, name: 'Junior Sergeant' },
  { n: 6, name: 'Sergeant' },
  { n: 7, name: 'Senior Sergeant' },
  { n: 8, name: 'Junior Lieutenant' },
  { n: 9, name: 'Lieutenant' },
  { n: 10, name: 'Inspector of Department' },
  { n: 11, name: 'Instructor of Department' },
  { n: 12, name: 'Deputy of Department' },
  { n: 13, name: 'Head of Department' },
  { n: 14, name: 'Deputy Sheriff' },
  { n: 15, name: 'Sheriff' },
];

export function rankLabel(n: number | null | undefined): string {
  if (!n) return '—';
  const r = RANKS.find((x) => x.n === n);
  return r ? `[${r.n}] ${r.name}` : `[${n}]`;
}
