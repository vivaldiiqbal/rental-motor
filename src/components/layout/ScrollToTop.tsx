import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Gulir ke atas saat pindah halaman (kecuali ada hash). */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash]);
  return null;
}
