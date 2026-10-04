import { useEffect, useState } from 'react';

export type ChoixTheme = 'clair' | 'sombre' | 'systeme';
const CLE = 'kanevas-theme';

export function choixMemorise(): ChoixTheme {
  try {
    const v = localStorage.getItem(CLE);
    if (v === 'clair' || v === 'sombre' || v === 'systeme') return v;
  } catch {
    /* storage blocked: default */
  }
  return 'sombre'; // charte: dark by default
}

/** "Système" is resolved to dark or light here, so tokens.css has only two colour blocks. */
export function appliquerTheme(choix: ChoixTheme) {
  const clair =
    choix === 'clair' || (choix === 'systeme' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = clair ? 'light' : 'dark';
}

export function useTheme(): [ChoixTheme, (c: ChoixTheme) => void] {
  const [choix, setChoix] = useState<ChoixTheme>(choixMemorise);
  useEffect(() => {
    appliquerTheme(choix);
    if (choix !== 'systeme') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const suivre = () => appliquerTheme('systeme');
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, [choix]);
  return [
    choix,
    (c) => {
      try {
        localStorage.setItem(CLE, c);
      } catch {
        /* not remembered */
      }
      setChoix(c);
    },
  ];
}
