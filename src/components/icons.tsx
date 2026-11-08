// Minimal line icons (stroke = currentColor). No emoji in the UI.
import type { SVGProps } from "react";
const base = (p: SVGProps<SVGSVGElement>) => ({ width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });
export const Mic = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
export const Chat = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 5h16v11H8l-4 4z" /></svg>);
export const Sim = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M7 3h7l4 4v14H7z" /><rect x="10" y="11" width="5" height="6" rx="1" /></svg>);
export const Info = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const Box = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></svg>);
export const Tool = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3z" /></svg>);
export const Pen = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 20l4-1 11-11-3-3L5 16z" /></svg>);
export const Lock = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const Check = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 12l5 5L19 7" /></svg>);
export const Arrow = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const Message = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12z" /></svg>);
export const Stop = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="7" y="7" width="10" height="10" rx="2" /></svg>);
