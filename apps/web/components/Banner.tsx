"use client";

import { usePathname } from "next/navigation";

function Flag() {
  return (
    <svg className="w-8 h-6 shrink-0 drop-shadow-md" viewBox="0 0 60 45" aria-hidden="true">
      <defs>
        <clipPath id="waveClip">
          <path d="M0 5 Q15 0 30 5 Q45 10 60 5 V40 Q45 35 30 40 Q15 45 0 40 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#waveClip)">
        <rect width="60" height="45" fill="#FCD116" rx="2" />
        <rect y="15" width="60" height="15" fill="#003893" />
        <rect y="30" width="60" height="15" fill="#CE1126" />
      </g>
      <rect width="60" height="45" fill="none" stroke="#92400e" strokeWidth="1.5" rx="2" opacity="0.6" />
      <rect width="4" height="45" fill="#92400e" rx="1" />
      <circle cx="4" cy="22.5" r="3" fill="#d97706" stroke="#92400e" strokeWidth="0.8" />
    </svg>
  );
}

const content = (
  <span className="mx-4 flex items-center gap-2 shrink-0">
    <Flag />
    <span className="font-bold text-sm md:text-base tracking-wide">
      🚚 Envíos gratis a todo Colombia, ¡solo por hoy!
    </span>
    <Flag />
  </span>
);

export default function Banner() {
  const pathname = usePathname();

  if (pathname !== "/" && pathname !== "/products" && !pathname.startsWith("/products/")) return null;

  return (
    <div className="bg-gradient-to-r from-[#FCD116] via-[#FFCC00] to-[#FCD116] text-black overflow-hidden py-2.5 shadow-md border-b-2 border-[#CE1126]/40">
      <div className="animate-marquee whitespace-nowrap flex">
        {content}
        {content}
        {content}
        {content}
      </div>
    </div>
  );
}
