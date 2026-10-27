import type { ReactElement } from 'react';

const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const HomeIcon = (): ReactElement => (<svg {...base}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>);
export const PlanIcon = (): ReactElement => (<svg {...base}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>);
export const ProgressIcon = (): ReactElement => (<svg {...base}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>);
export const CatalogIcon = (): ReactElement => (<svg {...base}><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></svg>);
