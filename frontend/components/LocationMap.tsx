"use client";

import { ExternalLink, MapPin } from "lucide-react";

export function LocationMap({
  latitude,
  longitude,
  name,
  className = "h-[280px]",
}: {
  latitude: number;
  longitude: number;
  name: string;
  className?: string;
}) {
  const d = 0.06;
  const bbox = [longitude - d, latitude - d * 0.6, longitude + d, latitude + d * 0.6]
    .map((value) => value.toFixed(5))
    .join("%2C");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-mist-200">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3.5 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-ink-soft">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-700" />
          <span className="truncate">{name}</span>
        </p>
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=12/${latitude}/${longitude}`}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-teal-700 hover:underline"
        >
          Open map <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <iframe
        title={`Map of ${name}`}
        src={src}
        className={`w-full ${className}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
