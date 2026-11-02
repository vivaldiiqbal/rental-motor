import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getRealtimeTicket } from '../services/api';
import { realtimeBus, type RealtimeEvent, type RealtimeEventType } from '../services/realtimeEventMap';

export type RealtimeStatus = 'connected' | 'reconnecting' | 'offline' | 'idle';

interface RealtimeContextValue {
  status: RealtimeStatus;
  isConnected: boolean;
  lastEventTime: string | null;
  reconnect: () => void;
  registerRefetch: (id: string, refetchFn: () => void | Promise<void>) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const [lastEventTime, setLastEventTime] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const lastEventIdRef = useRef<number | null>(null);
  const seenEventIdsRef = useRef<Set<number>>(new Set());
  const activeRefetchMapRef = useRef<Map<string, () => void | Promise<void>>>(new Map());
  const isDestroyedRef = useRef(false);

  // Registrasi fungsi pembaruan data aktif saat reconnect
  const registerRefetch = useCallback((id: string, refetchFn: () => void | Promise<void>) => {
    activeRefetchMapRef.current.set(id, refetchFn);
    return () => {
      activeRefetchMapRef.current.delete(id);
    };
  }, []);

  // Panggil seluruh data aktif saat tersambung kembali
  const triggerAllActiveRefetch = useCallback(() => {
    activeRefetchMapRef.current.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('[Realtime] Error executing refetch handler:', err);
      }
    });
  }, []);

  // Tutup koneksi SSE saat ini
  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.close();
      } catch (e) {}
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Hentikan cadangan polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Mulai cadangan polling (15 detik) jika SSE terhalang atau gagal berulang
  const startFallbackPolling = useCallback(() => {
    if (pollingIntervalRef.current || isDestroyedRef.current) return;
    pollingIntervalRef.current = setInterval(() => {
      triggerAllActiveRefetch();
    }, 15000);
  }, [triggerAllActiveRefetch]);

  // Fungsi penyambungan SSE utama
  const connectSSE = useCallback(async () => {
    if (isDestroyedRef.current || document.hidden) return;

    // Jika pengguna belum login, kita tidak perlu membuka stream berautentikasi (idle)
    if (!user) {
      setStatus('idle');
      closeEventSource();
      stopPolling();
      return;
    }

    try {
      setStatus((prev) => (prev === 'connected' ? 'connected' : 'reconnecting'));

      // 1. Dapatkan tiket 30 detik
      const { ticket } = await getRealtimeTicket();
      if (isDestroyedRef.current) return;

      closeEventSource();

      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const lastIdParam = lastEventIdRef.current ? `&lastEventId=${lastEventIdRef.current}` : '';
      const sseUrl = `${apiUrl}/events?ticket=${encodeURIComponent(ticket)}${lastIdParam}`;

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus('connected');
        retryCountRef.current = 0;
        stopPolling();

        // Saat berhasil tersambung kembali setelah putus, muat ulang data aktif
        triggerAllActiveRefetch();
      };

      // Listener event umum & khusus
      const eventTypes: RealtimeEventType[] = [
        'booking.updated',
        'payment.updated',
        'document.updated',
        'motor.availability.changed',
        'counters.changed',
        'message.new',
        'settings.changed',
        'gps.position',
      ];

      eventTypes.forEach((type) => {
        es.addEventListener(type, (event: MessageEvent) => {
          try {
            const data: RealtimeEvent = JSON.parse(event.data);
            
            // Deduplikasi berdasarkan ID
            if (data.id && seenEventIdsRef.current.has(data.id)) {
              return; // Lewati duplikat
            }

            if (data.id) {
              seenEventIdsRef.current.add(data.id);
              // Batasi ukuran set ke 200 id terakhir
              if (seenEventIdsRef.current.size > 200) {
                const oldest = seenEventIdsRef.current.values().next().value;
                if (oldest) seenEventIdsRef.current.delete(oldest);
              }
              lastEventIdRef.current = Math.max(lastEventIdRef.current || 0, data.id);
            }

            setLastEventTime(data.timestamp || new Date().toISOString());

            // Pancarkan ke event bus
            realtimeBus.emit(data);
          } catch (err) {
            console.error('[Realtime] Gagal memproses event:', type, err);
          }
        });
      });

      es.onerror = () => {
        closeEventSource();
        setStatus(navigator.onLine ? 'reconnecting' : 'offline');

        // Hitung exponential backoff dengan jitter: 1s s/d 30s
        retryCountRef.current++;
        const baseDelay = Math.min(30000, 1000 * Math.pow(1.5, retryCountRef.current));
        const jitter = Math.floor(Math.random() * 500);
        const delay = baseDelay + jitter;

        // Jika sudah gagal lebih dari 3 kali, aktifkan fallback polling cadangan
        if (retryCountRef.current >= 3) {
          startFallbackPolling();
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connectSSE();
        }, delay);
      };
    } catch (err) {
      closeEventSource();
      setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      startFallbackPolling();

      const delay = Math.min(30000, 1000 * Math.pow(1.5, (retryCountRef.current || 0) + 1));
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSSE();
      }, delay);
    }
  }, [user, closeEventSource, stopPolling, startFallbackPolling, triggerAllActiveRefetch]);

  // Efek inisialisasi koneksi saat user login/logout
  useEffect(() => {
    isDestroyedRef.current = false;
    connectSSE();

    return () => {
      closeEventSource();
      stopPolling();
    };
  }, [connectSSE, closeEventSource, stopPolling]);

  // Tangani visibilitychange & online/offline browser
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab tidak aktif -> tutup stream SSE untuk menghemat sumber daya & koneksi
        closeEventSource();
      } else {
        // Tab aktif kembali -> sambung ulang seketika & perbarui data
        retryCountRef.current = 0;
        connectSSE();
      }
    };

    const handleOnline = () => {
      setStatus('reconnecting');
      retryCountRef.current = 0;
      connectSSE();
    };

    const handleOffline = () => {
      setStatus('offline');
      closeEventSource();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connectSSE, closeEventSource]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    connectSSE();
  }, [connectSSE]);

  const value: RealtimeContextValue = {
    status,
    isConnected: status === 'connected',
    lastEventTime,
    reconnect,
    registerRefetch,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export const useRealtime = (): RealtimeContextValue => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime harus digunakan di dalam RealtimeProvider');
  }
  return ctx;
};
