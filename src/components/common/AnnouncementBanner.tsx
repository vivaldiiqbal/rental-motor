import React, { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { getBlocks } from '../../services/api';
import type { AnnouncementBlock } from '../../types';

export const AnnouncementBanner: React.FC = () => {
  const [announcement, setAnnouncement] = useState<AnnouncementBlock | null>(null);
  const [closed, setClosed] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    getBlocks()
      .then((blocks) => {
        if (active && blocks?.announcement?.text) {
          setAnnouncement(blocks.announcement);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!announcement || closed) return null;

  return (
    <aside
      aria-label="Pengumuman"
      className="relative z-40 bg-gradient-to-r from-amber-500 via-primary-600 to-primary-700 text-white text-xs sm:text-sm py-2 px-8 text-center font-medium shadow-xs"
    >
      <div className="mx-auto max-w-7xl flex items-center justify-center gap-2 flex-wrap">
        <Megaphone className="w-4 h-4 shrink-0 inline-block text-amber-200" aria-hidden="true" />
        <span>{announcement.text}</span>
        {announcement.linkUrl && (
          <a
            href={announcement.linkUrl}
            className="underline font-bold hover:text-amber-100 transition-colors inline-flex items-center gap-1 ml-1"
          >
            {announcement.linkLabel || 'Lihat Info'}
            <span aria-hidden="true">&rarr;</span>
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={() => setClosed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/80 hover:text-white rounded-md hover:bg-black/10 transition-colors"
        aria-label="Tutup pengumuman"
      >
        <X className="w-4 h-4" />
      </button>
    </aside>
  );
};
