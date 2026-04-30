import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { WS_PORT } from './constants';

interface SequenceInfo {
  success: boolean;
  name?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  numAudioTracks?: number;
  numVideoTracks?: number;
  hasActiveSequence?: boolean;
  error?: string;
}

interface LogEntry {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

interface OperationProgress {
  id: string;
  type: string;
  progress: number;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface AppState {
  connection: { status: 'disconnected' | 'connecting' | 'connected'; port: number; lastHeartbeat: number; reconnectAttempts: number; pendingMessages: number };
  sequence: { info: SequenceInfo | null; loading: boolean; lastUpdated: number | null };
  operations: { current: OperationProgress | null; history: OperationProgress[] };
  logs: { entries: LogEntry[] };
  settings: { autoReconnect: boolean; heartbeatInterval: number; maxRetries: number; showNotifications: boolean };
}

type Action =
  | { type: 'SET_CONNECTION_STATUS'; payload: AppState['connection']['status'] }
  | { type: 'SET_PORT'; payload: number }
  | { type: 'SET_LAST_HEARTBEAT'; payload: number }
  | { type: 'INCREMENT_RECONNECT_ATTEMPTS' }
  | { type: 'RESET_RECONNECT_ATTEMPTS' }
  | { type: 'SET_PENDING_MESSAGES'; payload: number }
  | { type: 'SET_SEQUENCE_INFO'; payload: SequenceInfo | null }
  | { type: 'SET_SEQUENCE_LOADING'; payload: boolean }
  | { type: 'SET_CURRENT_OPERATION'; payload: OperationProgress | null }
  | { type: 'UPDATE_OPERATION_PROGRESS'; payload: number }
  | { type: 'COMPLETE_OPERATION'; payload: any }
  | { type: 'FAIL_OPERATION'; payload: string }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'CLEAR_LOGS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppState['settings']> }
  | { type: 'RESET' };

const initialState: AppState = {
  connection: { status: 'disconnected', port: WS_PORT, lastHeartbeat: 0, reconnectAttempts: 0, pendingMessages: 0 },
  sequence: { info: null, loading: false, lastUpdated: null },
  operations: { current: null, history: [] },
  logs: { entries: [] },
  settings: { autoReconnect: true, heartbeatInterval: 30000, maxRetries: 3, showNotifications: true }
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CONNECTION_STATUS': return { ...state, connection: { ...state.connection, status: action.payload } };
    case 'SET_PORT': return { ...state, connection: { ...state.connection, port: action.payload } };
    case 'SET_LAST_HEARTBEAT': return { ...state, connection: { ...state.connection, lastHeartbeat: action.payload } };
    case 'INCREMENT_RECONNECT_ATTEMPTS': return { ...state, connection: { ...state.connection, reconnectAttempts: state.connection.reconnectAttempts + 1 } };
    case 'RESET_RECONNECT_ATTEMPTS': return { ...state, connection: { ...state.connection, reconnectAttempts: 0 } };
    case 'SET_PENDING_MESSAGES': return { ...state, connection: { ...state.connection, pendingMessages: action.payload } };
    case 'SET_SEQUENCE_INFO': return { ...state, sequence: { info: action.payload, loading: false, lastUpdated: action.payload ? Date.now() : state.sequence.lastUpdated } };
    case 'SET_SEQUENCE_LOADING': return { ...state, sequence: { ...state.sequence, loading: action.payload } };
    case 'SET_CURRENT_OPERATION': return { ...state, operations: { ...state.operations, current: action.payload } };
    case 'UPDATE_OPERATION_PROGRESS':
      if (!state.operations.current) return state;
      return { ...state, operations: { ...state.operations, current: { ...state.operations.current, progress: action.payload } } };
    case 'COMPLETE_OPERATION':
      if (!state.operations.current) return state;
      const completed: OperationProgress = { ...state.operations.current, status: 'completed', result: action.payload, endTime: Date.now() };
      return { ...state, operations: { current: null, history: [...state.operations.history.slice(-49), completed] } };
    case 'FAIL_OPERATION':
      if (!state.operations.current) return state;
      const failed: OperationProgress = { ...state.operations.current, status: 'failed', error: action.payload, endTime: Date.now() };
      return { ...state, operations: { current: null, history: [...state.operations.history.slice(-49), failed] } };
    case 'ADD_LOG': return { ...state, logs: { entries: [...state.logs.entries.slice(-99), action.payload] } };
    case 'CLEAR_LOGS': return { ...state, logs: { entries: [] } };
    case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'RESET': return initialState;
    default: return state;
  }
}

interface AppContextValue { state: AppState; dispatch: React.Dispatch<Action>; }
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppState must be used within AppProvider');
  return context.state;
}

export function useAppDispatch() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppDispatch must be used within AppProvider');
  return context.dispatch;
}

export function useActions() {
  const dispatch = useAppDispatch();
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    dispatch({ type: 'ADD_LOG', payload: { message, type, timestamp } });
  }, [dispatch]);
  const setConnectionStatus = useCallback((status: AppState['connection']['status']) => dispatch({ type: 'SET_CONNECTION_STATUS', payload: status }), [dispatch]);
  const setSequenceInfo = useCallback((info: SequenceInfo | null) => dispatch({ type: 'SET_SEQUENCE_INFO', payload: info }), [dispatch]);
  const startOperation = useCallback((id: string, type: string, total: number) => dispatch({ type: 'SET_CURRENT_OPERATION', payload: { id, type, progress: 0, total, status: 'pending', startTime: Date.now() } }), [dispatch]);
  const updateOperationProgress = useCallback((progress: number) => dispatch({ type: 'UPDATE_OPERATION_PROGRESS', payload: progress }), [dispatch]);
  const completeOperation = useCallback((result?: any) => dispatch({ type: 'COMPLETE_OPERATION', payload: result }), [dispatch]);
  const failOperation = useCallback((error: string) => dispatch({ type: 'FAIL_OPERATION', payload: error }), [dispatch]);
  const clearLogs = useCallback(() => dispatch({ type: 'CLEAR_LOGS' }), [dispatch]);
  return { addLog, setConnectionStatus, setSequenceInfo, startOperation, updateOperationProgress, completeOperation, failOperation, clearLogs };
}

export type { AppState, SequenceInfo, LogEntry, OperationProgress };