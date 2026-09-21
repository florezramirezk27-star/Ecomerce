"use client";

import Link from "next/link";
import { ArrowRight, Flame, Sparkles } from "lucide-react";

type Tone = "blue" | "rose";

const TONES: Record<
  Tone,
  {
    chip: string;
    dot: string;
    hairline: string;
    icon: React.ReactNode;
  }
> = {
  blue: {
    chip: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    hairline: "from-blue-600 via-indigo-600 to-transparent",
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  rose: {
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    hairline: "from-rose-500 via-orange-500 to-transparent",
    icon: <Flame className="h-3.5 w-3.5" />,
  },
};

export default function SectionHeader({
  label,
  title,
  subtitle,
  actionHref,
  actionLabel = "Ver todos",
  tone = "blue",
}: {
  label: string;
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  tone?: Tone;
}) {
  const t = TONES[tone];

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${t.chip}`}
        >
          {t.icon}
          {label}
        </span>

        <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
          {title}
        </h2>

        <div className="mt-2.5 flex items-center gap-2">
          <span className={`h-1.5 w-10 rounded-full bg-gradient-to-r ${t.hairline}`} />
          <span className={`h-1.5 w-3 rounded-full bg-gradient-to-r ${t.hairline}`} />
          <span className="h-1.5 w-14 rounded-full bg-gray-100" />
        </div>

        {subtitle && (
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            {subtitle}
          </p>
        )}
      </div>

      {actionHref && (
        <Link
          href={actionHref}
          className="group/link inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-300 hover:text-blue-600 hover:shadow-md"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}