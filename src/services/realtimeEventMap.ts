/**
 * Pemetaan Jenis Peristiwa Realtime RodaKita (Notify-then-Refetch Architecture)
 */

export type RealtimeEventType =
  | 'booking.updated'
  | 'payment.updated'
  | 'document.updated'
  | 'motor.availability.changed'
  | 'counters.changed'
  | 'message.new'
  | 'settings.changed'
  | 'gps.position'
  | 'gps.alert';

export interface RealtimeEvent {
  id: number;
  type: RealtimeEventType;
  entityId: string | null;
  userId: number | null;
  version?: number;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

class RealtimeEventBus {
  private listeners: Map<string, Set<RealtimeEventHandler>> = new Map();

  on(type: RealtimeEventType | '*', handler: RealtimeEventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);

    return () => {
      this.off(type, handler);
    };
  }

  off(type: RealtimeEventType | '*', handler: RealtimeEventHandler) {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(type);
      }
    }
  }

  emit(event: RealtimeEvent) {
    // 1. Panggil pendengar spesifik tipe event
    const specific = this.listeners.get(event.type);
    if (specific) {
      specific.forEach((handler) => {
        try {
          handler(event);
        } catch (e) {
          console.error('[RealtimeBus] Error in handler for', event.type, e);
        }
      });
    }

    // 2. Panggil wildcard pendengar
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      wildcard.forEach((handler) => {
        try {
          handler(event);
        } catch (e) {
          console.error('[RealtimeBus] Error in wildcard handler', e);
        }
      });
    }
  }
}

export const realtimeBus = new RealtimeEventBus();
