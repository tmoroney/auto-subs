import { useEffect, useState } from "react";
import { subscribeBackgroundColor, evalTS } from "../lib/utils/bolt";
import { useWebSocket } from "./useWebSocket";
import { AppProvider, useAppState, useActions } from "../lib/store";
import "./main.scss";

const ProgressBar = ({ progress, status }: { progress: number; status: string }) => (
  <div className="progress-container">
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${progress}%` }} />
    </div>
    <span className="progress-text">{status} - {progress}%</span>
  </div>
);

const ConnectionStatus = ({ status, port, attempts, pending }: { status: string; port: number; attempts: number; pending: number }) => (
  <div className="connection-info">
    <span className={`dot ${status}`} />
    <span className="text">
      {status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected"}
    </span>
    <span className="port">Port: {port}</span>
    {attempts > 0 && <span className="attempts">Reconnect: {attempts}</span>}
    {pending > 0 && <span className="pending">Pending: {pending}</span>}
  </div>
);

const AppContent = () => {
  const [bgColor, setBgColor] = useState("#1a1a1a");
  const { status, logs, sequenceInfo, refreshSequenceInfo, progress, pendingMessages, reconnectAttempts } = useWebSocket(8185);
  const actions = useActions();

  useEffect(() => {
    if (window.cep) subscribeBackgroundColor(setBgColor);
  }, []);

  useEffect(() => {
    actions.setConnectionStatus(status);
  }, [status]);

  useEffect(() => {
    if (sequenceInfo) actions.setSequenceInfo(sequenceInfo);
  }, [sequenceInfo]);


  return (
    <div className="app" style={{ backgroundColor: bgColor }}>
      <header className="header">
        <h1 className="title">AutoSubs</h1>
        <p className="subtitle">Premiere Pro Extension</p>
      </header>

      {progress && progress.status !== 'completed' && (
        <section className="section progress-section">
          <ProgressBar progress={progress.progress} status={progress.type} />
        </section>
      )}

      <section className="section">
        <label className="label">Status</label>
        <div className="card status-header">
          <ConnectionStatus status={status} port={8085} attempts={reconnectAttempts} pending={pendingMessages} />
        </div>
      </section>

      <section className="section">
        <label className="label">Active Sequence</label>
        <div className="card sequence-info">
          <div className={`name ${sequenceInfo?.success ? "active" : ""}`}>
            {sequenceInfo?.name || "No active sequence"}
          </div>
          <div className="details">
            {sequenceInfo?.success ? (
              <>{sequenceInfo.width}x{sequenceInfo.height} • {sequenceInfo.durationSeconds?.toFixed(2)}s • {sequenceInfo.numAudioTracks} Audio • {sequenceInfo.numVideoTracks} Video</>
            ) : ("Please open a sequence in Premiere Pro")}
          </div>
          <div className="actions">
            <button className="primary" onClick={refreshSequenceInfo}>Refresh Info</button>
          </div>
        </div>
      </section>

      <section className="section">
        <label className="label">Logs</label>
        <div className="logs-container">
          {logs.map((log, i) => (
            <div key={i} className={`log-entry ${log.type}`}>
              <span className="timestamp">[{log.timestamp}]</span>
              <span className="message">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="log-entry info">No logs yet...</div>}
        </div>
      </section>

      <footer style={{ marginTop: "auto", textAlign: "center", fontSize: "10px", color: "#666" }}>
        Bolt Version 0.0.19
      </footer>
    </div>
  );
};

export const App = () => (
  <AppProvider>
    <AppContent />
  </AppProvider>
);
