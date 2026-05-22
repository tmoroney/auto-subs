type EventCallback<T = any> = (data: T) => void;

interface EventMap {
  [key: string]: EventCallback[];
}

interface OperationEvent {
  operationId: string;
  type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  result?: any;
  error?: string;
  timestamp: number;
}

class EventBus {
  private events: EventMap = {};
  private operationHistory: OperationEvent[] = [];
  private maxHistorySize = 100;

  on<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
    return () => { this.events[event] = this.events[event].filter(cb => cb !== callback); };
  }

  off(event: string, callback: EventCallback): void {
    if (this.events[event]) this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  emit<T = any>(event: string, data?: T): void {
    if (this.events[event]) {
      this.events[event].forEach(callback => {
        try { callback(data); } catch (error) { console.error(`Error in event handler for ${event}:`, error); }
      });
    }
  }

  emitOperation(event: OperationEvent): void {
    this.operationHistory.push(event);
    if (this.operationHistory.length > this.maxHistorySize) this.operationHistory.shift();
    this.emit('operation:*', event);
    this.emit(`operation:${event.type}`, event);
    this.emit(`operation:${event.operationId}`, event);
  }

  getOperationHistory(): OperationEvent[] { return [...this.operationHistory]; }
  clearHistory(): void { this.operationHistory = []; }

  once<T = any>(event: string, callback: EventCallback<T>): void {
    const wrapper: EventCallback<T> = (data) => { callback(data); this.off(event, wrapper); };
    this.on(event, wrapper);
  }
}

export const eventBus = new EventBus();
export const useEventBus = () => eventBus;
export type { OperationEvent };