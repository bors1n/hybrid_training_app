import type { ReactElement } from 'react';

const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const HomeIcon = (): ReactElement => (<svg {...base}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>);
export const PlanIcon = (): ReactElement => (<svg {...base}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>);
export const ProgressIcon = (): ReactElement => (<svg {...base}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>);
/** Огонёк: рекорд серии. Заливка и цвет задаются снаружи. */
export const FlameIcon = (): ReactElement => (<svg {...base} fill="currentColor" strokeWidth={1.5}><path d="M12 2c.5 3-1.5 4.7-3 6.5C7.5 10.2 7 11.5 7 13a5 5 0 0 0 10 0c0-1.8-.7-3.2-1.8-4.4-.4 1-1 1.7-1.7 2C14 8.5 13.5 4.5 12 2z" /></svg>);
export const CatalogIcon = (): ReactElement => (<svg {...base}><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></svg>);
