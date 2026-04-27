import { useState, useEffect, useCallback, useRef } from "react";
import { evalTS } from "../lib/utils/bolt";

interface QueuedMessage {
  id: string;
  type: string;
  payload: any;
  retries: number;
  timestamp: number;
}

interface OperationProgress {
  id: string;
  type: string;
  progress: number;
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

interface WebSocketState {
  status: 'disconnected' | 'connecting' | 'connected';
  lastHeartbeat: number;
  reconnectAttempts: number;
  pendingMessages: number;
}

const MAX_RETRIES = 3;
const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_BASE_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export const useWebSocket = (port: number) => {
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [logs, setLogs] = useState<{ message: string; type: string; timestamp: string }[]>([]);
  const [sequenceInfo, setSequenceInfo] = useState<any>(null);
  const [progress, setProgress] = useState<OperationProgress | null>(null);
  const [state, setState] = useState<WebSocketState>({
    status: 'disconnected',
    lastHeartbeat: 0,
    reconnectAttempts: 0,
    pendingMessages: 0
  });

  const ws = useRef<WebSocket | null>(null);
  const messageQueue = useRef<QueuedMessage[]>([]);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const operationIdCounter = useRef(0);

  const generateOperationId = () => `op_${Date.now()}_${++operationIdCounter.current}`;

  const addLog = useCallback((message: string, type = "info") => {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((prev) => [...prev.slice(-49), { message, type, timestamp }]);
  }, []);

  const updateState = useCallback((updates: Partial<WebSocketState>) => {
    setState(prev => ({ ...prev, ...updates }));
    if (updates.reconnectAttempts !== undefined) {
      reconnectAttemptsRef.current = updates.reconnectAttempts;
    }
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const processQueue = useCallback(() => {
    const queue = messageQueue.current;
    if (queue.length === 0) return;
    updateState({ pendingMessages: queue.length });
    const processedIds: string[] = [];
    queue.forEach((msg) => {
      const success = sendMessage({ type: msg.type, id: msg.id, payload: msg.payload, fromQueue: true });
      if (success) processedIds.push(msg.id);
    });
    messageQueue.current = queue.filter(m => !processedIds.includes(m.id));
    updateState({ pendingMessages: messageQueue.current.length });
  }, [sendMessage, updateState]);

  const queueMessage = useCallback((type: string, payload: any, retries = MAX_RETRIES) => {
    const message: QueuedMessage = { id: generateOperationId(), type, payload, retries, timestamp: Date.now() };
    messageQueue.current.push(message);
    updateState({ pendingMessages: messageQueue.current.length });
  }, [updateState]);

  const startProgress = useCallback((id: string, type: string, total: number) => {
    setProgress({ id, type, progress: 0, total, status: 'pending' });
  }, []);

  const updateProgress = useCallback((progressUpdate: Partial<OperationProgress>) => {
    setProgress(prev => prev ? { ...prev, ...progressUpdate } : null);
  }, []);

  const clearProgress = useCallback(() => setProgress(null), []);

  const connectRef = useRef<() => void>(() => {});

  const refreshSequenceInfo = useCallback(async () => {
    addLog("Refreshing sequence info", "info");
    
    // Attempt to connect if disconnected
    if (ws.current?.readyState !== WebSocket.OPEN && ws.current?.readyState !== WebSocket.CONNECTING) {
      addLog("Connection lost, attempting to reconnect...", "warning");
      connectRef.current();
    }

    try {
      const result = await evalTS("getActiveSequenceInfo");
      const data = JSON.parse(result);
      if (data.success) {
        setSequenceInfo(data);
        addLog(`Sequence: ${data.name}`, "success");
      } else {
        setSequenceInfo(null);
        addLog(`Failed to get sequence info: ${data.error}`, "error");
      }
    } catch (e: any) {
      addLog(`Error refreshing sequence: ${e.message}`, "error");
    }
  }, [addLog]);

  const executeWithRetry = useCallback(async <T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<{ success: boolean; data?: T; error?: string; retries: number }> => {
    let lastError: string = "";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        return { success: true, data: result, retries: attempt };
      } catch (e: any) {
        lastError = e.message || String(e);
        if (attempt < maxRetries) {
          addLog(` Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError}. Retrying...`, "warning");
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
    }
    return { success: false, error: lastError, retries: maxRetries };
  }, [addLog]);

  const handleMessage = useCallback(async (message: any) => {
    const opId = message.id || generateOperationId();
    switch (message.type) {
      case "ping":
        sendMessage({ type: "pong", timestamp: Date.now() });
        updateState({ lastHeartbeat: Date.now() });
        break;
      case "refresh":
        refreshSequenceInfo();
        break;
      case "execute_script":
        if (message.scriptName) {
          const { data } = await executeWithRetry(() => evalTS(message.scriptName, message.args));
          sendMessage({ type: "script_result", id: opId, payload: data });
        }
        break;
      case "handshake_ack":
        addLog("Handshake acknowledged", "success");
        processQueue();
        break;
      case "request_sequence_info":
        addLog("Sequence info requested", "info");
        const seqResult = await executeWithRetry(() => evalTS("getActiveSequenceInfo"));
        sendMessage({ type: "sequence_info_response", payload: seqResult.success ? seqResult.data : JSON.stringify({ success: false, error: seqResult.error }), sessionId: message.sessionId });
        if (seqResult.success) {
          const data = JSON.parse(seqResult.data as string);
          if (data.success) setSequenceInfo(data);
        }
        break;
      case "request_audio_export": {
        const { exportFolder, selectedTracks, selectedRange, presetPath } = message.payload;
        addLog(`Exporting audio: ${selectedTracks.length} tracks`, "info");
        startProgress(opId, "audio_export", 100);
        const { data: audioData } = await executeWithRetry(() => evalTS("exportSequenceAudio", exportFolder, JSON.stringify(selectedTracks), selectedRange, presetPath || ""));
        sendMessage({ type: "audio_export_response", payload: audioData, sessionId: message.sessionId });
        updateProgress({ status: audioData ? 'completed' : 'failed', result: audioData });
        setTimeout(clearProgress, 3000);
        break;
      }
      case "request_import_srt": {
        const { filePath } = message.payload;
        addLog(`Importing SRT: ${filePath}`, "info");
        const { data: importData } = await executeWithRetry(() => evalTS("importSRTFile", filePath));
        sendMessage({ type: "import_srt_response", payload: importData, sessionId: message.sessionId, operationId: opId });
        break;
      }
      case "pong":
        updateState({ lastHeartbeat: Date.now() });
        break;
      default:
        addLog(`Unhandled message type: ${message.type}`, "warning");
    }
  }, [sendMessage, addLog, refreshSequenceInfo, processQueue, updateState, executeWithRetry, startProgress, updateProgress, clearProgress]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;
    
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    setStatus("connecting");
    updateState({ status: 'connecting' });
    addLog(`Connecting to AutoSubs app on port ${port}`, "info");
    
    const socket = new WebSocket(`ws://localhost:${port}`);
    ws.current = socket;

    socket.onopen = () => {
      setStatus("connected");
      reconnectAttemptsRef.current = 0;
      updateState({ status: 'connected', reconnectAttempts: 0, lastHeartbeat: Date.now() });
      addLog("Connected to AutoSubs app", "success");
      sendMessage({ type: "handshake", payload: "premiere", clientVersion: "1.0.0" });
      processQueue();
      refreshSequenceInfo();
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = setInterval(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          sendMessage({ type: "ping", timestamp: Date.now() });
        }
      }, HEARTBEAT_INTERVAL);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type !== "ping" && message.type !== "pong") {
          addLog(`Received: ${message.type}`, "info");
        }
        handleMessage(message);
      } catch (e: any) {
        addLog(`Error parsing message: ${e.message}`, "error");
      }
    };

    socket.onclose = (event) => {
      setStatus("disconnected");
      updateState({ status: 'disconnected' });
      addLog(`Disconnected (code: ${event.code})`, "warning");
      
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }

      const attempts = reconnectAttemptsRef.current;
      const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempts), MAX_RECONNECT_DELAY);
      
      reconnectAttemptsRef.current = attempts + 1;
      updateState({ reconnectAttempts: attempts + 1 });
      
      addLog(`Reconnecting in ${delay}ms (attempt ${attempts + 1})...`, "info");
      
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    socket.onerror = (error) => {
      addLog(`WebSocket error. Check if AutoSubs app is running on port ${port}`, "error");
      console.error("WebSocket Error:", error);
      
      // On some initial connection failures, onclose is never invoked by the browser.
      // We enforce the reconnection loop here.
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.CLOSED) {
        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempts), MAX_RECONNECT_DELAY);
        
        reconnectAttemptsRef.current = attempts + 1;
        updateState({ reconnectAttempts: attempts + 1, status: 'disconnected' });
        setStatus("disconnected");
        
        addLog(`Reconnecting in ${delay}ms (attempt ${attempts + 1})...`, "info");
        
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [port, addLog, updateState, handleMessage, sendMessage, processQueue, refreshSequenceInfo]);

  connectRef.current = connect;

  useEffect(() => {
    connect();

    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((type: string, payload: any) => {
    const message = { type, payload, id: generateOperationId() };
    if (!sendMessage(message)) { queueMessage(type, payload); addLog(`Message queued: ${type}`, "info"); }
  }, [sendMessage, queueMessage, addLog]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    ws.current?.close();
    setStatus("disconnected");
    updateState({ status: 'disconnected' });
  }, [updateState]);

  const reconnect = useCallback(() => { disconnect(); updateState({ reconnectAttempts: 0 }); setTimeout(connect, 100); }, [disconnect, connect, updateState]);

  return { status, logs, sequenceInfo, refreshSequenceInfo, progress, send, disconnect, reconnect, pendingMessages: state.pendingMessages, lastHeartbeat: state.lastHeartbeat, reconnectAttempts: state.reconnectAttempts };
};