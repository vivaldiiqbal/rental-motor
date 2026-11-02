import { useEffect, useRef } from 'react';
import { realtimeBus, type RealtimeEvent, type RealtimeEventType } from '../services/realtimeEventMap';

/**
 * Hook untuk berlangganan peristiwa realtime tertentu secara deklaratif.
 * Otomatis membersihkan listener saat komponen di-unmount (Bebas Memory Leak).
 */
export function useRealtimeSubscription(
  types: RealtimeEventType | '*' | (RealtimeEventType | '*')[],
  callback: (event: RealtimeEvent) => void,
  filter?: (event: RealtimeEvent) => boolean
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const filterRef = useRef(filter);
  filterRef.current = filter;

  const typeKey = Array.isArray(types) ? types.join(',') : types;

  useEffect(() => {
    const handler = (event: RealtimeEvent) => {
      if (filterRef.current && !filterRef.current(event)) {
        return;
      }
      callbackRef.current(event);
    };

    const typeList = Array.isArray(types) ? types : [types];
    const unsubs = typeList.map((t) => realtimeBus.on(t, handler));

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [typeKey]);
}
