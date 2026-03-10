import { useState, useEffect, useRef } from "react";

const API_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws/feed";

const DARK = {
  bg: "#060E14",
  panel: "#0B1820",
  card: "#0D1F2D",
  border: "#0F2535",
  border2: "#1A3548",
  teal: "#00C9B1",
  tealGlow: "#00C9B118",
  amber: "#FFB300",
  red: "#FF3D57",
  green: "#00E676",
  blue: "#29B6F6",
  purple: "#CE93D8",
  text: "#E4F0F6",
  textSub: "#8BAAB8",
  muted: "#3A5566",
  input: "#060E14",
  shadow: "0 4px 24px #00000066",
  mode: "dark",
};

const LIGHT = {
  bg: "#EEF4F8",
  panel: "#FFFFFF",
  card: "#FFFFFF",
  border: "#D8E8F0",
  border2: "#B8D0DC",
  teal: "#007A6E",
  tealGlow: "#007A6E18",
  amber: "#C47A00",
  red: "#C82838",
  green: "#1A9450",
  blue: "#1878A8",
  purple: "#7848A0",
  text: "#0D1F2D",
  textSub: "#3A6070",
  muted: "#94B0BC",
  input: "#F4F8FA",
  shadow: "0 4px 24px #00000015",
  mode: "light",
};

const COLORS = (T) => ({
  Plastic: T.teal,
  Metal: T.blue,
  Glass: T.purple,
  Paper: T.amber,
  "Bio-Hazard": T.red,
  "E-Waste": T.purple,
  "Mixed Waste": T.muted,
});

// Custom hook for backend connection
function useBackend() {
  const [connected, setConnected] = useState(false);
  const [backendUp, setBackendUp] = useState(false);
  const [cameraUp, setCameraUp] = useState(false);
  const [offlineReason, setReason] = useState("");
  const [liveData, setLiveData] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [summary, setSummary] = useState({
    class_counts: {},
    contaminated_total: 0,
    latest_bin: { fill_pct: 0, status: "OK" },
  });

  useEffect(() => {
    let ws;
    let healthTimer;

    const checkHealth = async () => {
      try {
        const r = await fetch(`${API_URL}/api/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (r.ok) {
          const h = await r.json();
          setBackendUp(true);
          if (h.fps !== undefined && h.fps === 0 && connected) {
            setCameraUp(false);
            setReason("camera");
          } else if (h.camera_active) {
            setCameraUp(true);
            setReason("");
          }
        } else {
          setBackendUp(false);
          setCameraUp(false);
          setReason("backend");
        }
      } catch (e) {
        setBackendUp(false);
        setCameraUp(false);
        setReason("backend");
      }
    };

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => {
          setConnected(true);
        };
        ws.onclose = () => {
          setConnected(false);
          setTimeout(connect, 2000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.frame_b64) {
              setLiveData(d);
              setCameraUp(true);
              setBackendUp(true);
              setReason("");
            }
          } catch (_) {}
        };
      } catch (e) {
        setTimeout(connect, 2000);
      }
    };

    checkHealth();
    connect();
    healthTimer = setInterval(checkHealth, 5000);

    return () => {
      if (ws) ws.close();
      clearInterval(healthTimer);
    };
  }, []);

  useEffect(() => {
    const poll = async () => {
      if (!backendUp) return;
      try {
        const [a, al, r, s] = await Promise.all([
          fetch(`${API_URL}/api/audit?limit=200`).then((r) => r.json()),
          fetch(`${API_URL}/api/alerts`).then((r) => r.json()),
          fetch(`${API_URL}/api/recordings`).then((r) => r.json()),
          fetch(`${API_URL}/api/summary`).then((r) => r.json()),
        ]);
        setAuditLog(a);
        setAlerts(al);
        setRecordings(r);
        setSummary(s);
      } catch (_) {}
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [backendUp]);

  const startRecording = () =>
    fetch(`${API_URL}/api/record/start`, { method: "POST" });
  const stopRecording = () =>
    fetch(`${API_URL}/api/record/stop`, { method: "POST" });
  const ackAlert = async (id) => {
    await fetch(`${API_URL}/api/alerts/${id}/acknowledge`, { method: "POST" });
    setAlerts((p) =>
      p.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  };
  const saveConfig = (cfg) =>
    fetch(`${API_URL}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });

  return {
    connected,
    backendUp,
    cameraUp,
    offlineReason,
    liveData,
    auditLog,
    alerts,
    recordings,
    summary,
    startRecording,
    stopRecording,
    ackAlert,
    saveConfig,
  };
}

// UI Components
const Card = ({ T, children, style = {} }) => (
  <div
    style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: 16,
      boxShadow: T.shadow,
      ...style,
    }}
  >
    {children}
  </div>
);

const Dot = ({ color, size = 7 }) => (
  <span
    style={{
      display: "inline-block",
      width: size,
      height: size,
      borderRadius: "50%",
      background: color,
      animation: "pulse 1.4s infinite",
      flexShrink: 0,
    }}
  />
);

const Badge = ({ color, label }) => (
  <span
    style={{
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: 1,
      padding: "2px 8px",
      borderRadius: 20,
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
    }}
  >
    {label}
  </span>
);

const Toast = ({ T, events, onDismiss }) => {
  if (!events.length) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {events.map((e, i) => (
        <div
          key={i}
          style={{
            background: `${T.red}f0`,
            border: `1px solid ${T.red}`,
            borderRadius: 10,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 4px 20px #FF3D5766",
            animation: "slideIn 0.3s ease",
            minWidth: 290,
          }}
        >
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div
              style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}
            >
              CONTAMINATION ALERT
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#ffcccc",
                marginTop: 2,
              }}
            >
              {e.class_name} · Track #{e.track_id} · {(e.confidence * 100).toFixed(0)}% conf
            </div>
          </div>
          <button
            onClick={() => onDismiss(i)}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

const OfflineScreen = ({ T, reason, connected }) => {
  const isBackend = reason === "backend" || !connected;
  const isCamera = reason === "camera";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 0,
        background: T.mode === "dark" ? "#040C12" : "#C8D8E0",
        padding: 24,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>
        {isCamera ? "📷" : "🔌"}
      </div>

      {isBackend && (
        <>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: T.red,
              marginBottom: 8,
            }}
          >
            Backend Server Offline
          </div>
          <div
            style={{
              fontSize: 12,
              color: T.textSub,
              marginBottom: 20,
              textAlign: "center",
              maxWidth: 380,
            }}
          >
            The Python backend is not running. ECO-SIGHT needs the FastAPI
            server to process camera frames and run AI detection.
          </div>
          <div
            style={{
              background: T.panel,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 18,
              width: "100%",
              maxWidth: 420,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: T.teal,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              HOW TO START THE BACKEND
            </div>
            {[
              {
                step: "1",
                cmd: "cd backend",
                desc: "Navigate to backend folder",
              },
              {
                step: "2",
                cmd: "pip install -r requirements.txt",
                desc: "Install dependencies (first time only)",
              },
              {
                step: "3",
                cmd: "python app.py",
                desc: "Start the FastAPI server",
              },
            ].map((s) => (
              <div
                key={s.step}
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 12,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: T.tealGlow,
                    border: `1px solid ${T.teal}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: T.teal,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {s.step}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: T.teal,
                      background: T.bg,
                      padding: "4px 8px",
                      borderRadius: 6,
                      marginBottom: 3,
                    }}
                  >
                    {s.cmd}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted }}>{s.desc}</div>
                </div>
              </div>
            ))}
            <div
              style={{
                marginTop: 4,
                padding: "8px 12px",
                background: `${T.amber}10`,
                border: `1px solid ${T.amber}33`,
                borderRadius: 8,
                fontSize: 10,
                color: T.amber,
              }}
            >
              💡 Or double-click <strong>setup.bat</strong> (Windows) /{" "}
              <strong>./setup.sh</strong> (Mac/Linux) in the project root — it
              starts everything automatically.
            </div>
          </div>
        </>
      )}

      {isCamera && (
        <>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: T.amber,
              marginBottom: 8,
            }}
          >
            Camera Not Connected
          </div>
          <div
            style={{
              fontSize: 12,
              color: T.textSub,
              marginBottom: 20,
              textAlign: "center",
              maxWidth: 380,
            }}
          >
            The backend is running but cannot open a camera feed. The detection
            pipeline needs a webcam or video source.
          </div>
          <div
            style={{
              background: T.panel,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 18,
              width: "100%",
              maxWidth: 420,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: T.amber,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              HOW TO FIX CAMERA
            </div>
            {[
              {
                icon: "🎥",
                title: "Check webcam connection",
                desc: "Make sure your USB/built-in webcam is plugged in and not used by another app",
              },
              {
                icon: "🔢",
                title: "Try a different device index",
                desc: "Open backend/config.py and change CAMERA_SOURCE = 0 to CAMERA_SOURCE = 1",
              },
              {
                icon: "🎬",
                title: "Use a video file instead",
                desc: 'Set CAMERA_SOURCE = "test.mp4" in config.py to test with a pre-recorded video',
              },
              {
                icon: "🔄",
                title: "Restart the backend",
                desc: "After changing config.py, restart the server",
              },
            ].map((fix, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 12,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{fix.icon}</span>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.text,
                      marginBottom: 2,
                    }}
                  >
                    {fix.title}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted }}>{fix.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 18,
          fontSize: 10,
          color: T.muted,
          textAlign: "center",
        }}
      >
        This page auto-refreshes every 5 seconds · Backend:{" "}
        <span style={{ fontFamily: "monospace", color: T.teal }}>
          http://localhost:8000
        </span>
      </div>
    </div>
  );
};

const TopBar = ({
  T,
  theme,
  onTheme,
  connected,
  backendUp,
  cameraUp,
  fps,
  recording,
  recTime,
  page,
  setPage,
  unackedAlerts,
}) => {
  const [clock, setClock] = useState(
    new Date().toTimeString().slice(0, 8)
  );
  
  useEffect(() => {
    const t = setInterval(
      () => setClock(new Date().toTimeString().slice(0, 8)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(
      s % 60
    ).padStart(2, "0")}`;
  const dark = theme === "dark";
  
  const status = !backendUp
    ? "offline"
    : !cameraUp
    ? "no-camera"
    : "live";
  const statusColor =
    status === "live" ? T.green : status === "no-camera" ? T.amber : T.red;
  const statusLabel =
    status === "live" ? "LIVE" : status === "no-camera" ? "NO CAMERA" : "OFFLINE";

  return (
    <div
      style={{
        height: 52,
        borderBottom: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        justifyContent: "space-between",
        flexShrink: 0,
        background: T.panel,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: T.teal,
            fontFamily: "monospace",
            letterSpacing: -0.5,
            animation: "glow 3s infinite",
          }}
        >
          🌿 ECO-SIGHT
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {[
          { id: "live", icon: "◉", label: "Live Feed" },
          { id: "upload", icon: "⬆", label: "Upload Video" },
          { id: "analytics", icon: "▦", label: "Analytics" },
          { id: "alerts", icon: "⚠", label: "Alerts", badge: unackedAlerts },
          { id: "bin", icon: "⬟", label: "Bin Monitor" },
          { id: "audit", icon: "☰", label: "Audit Log" },
        ].map((n) => (
          <div key={n.id} style={{ position: "relative" }}>
            <button
              onClick={() => setPage(n.id)}
              title={n.label}
              style={{
                width: 36,
                height: 36,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                background: page === n.id ? T.tealGlow : "transparent",
                color: page === n.id ? T.teal : T.muted,
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
                outline:
                  page === n.id ? `1.5px solid ${T.teal}44` : "none",
                fontFamily: "inherit",
              }}
            >
              {n.icon}
            </button>
            {n.badge > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: T.red,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  color: "#fff",
                  fontWeight: 800,
                  pointerEvents: "none",
                }}
              >
                {n.badge}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {recording && (
          <span
            style={{
              fontSize: 10,
              color: T.red,
              fontFamily: "monospace",
              fontWeight: 700,
            }}
          >
            ⏺ {fmt(recTime || 0)}
          </span>
        )}
        {fps > 0 && (
          <span
            style={{
              fontSize: 10,
              color: T.textSub,
              fontFamily: "monospace",
            }}
          >
            {fps} FPS
          </span>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10,
            fontWeight: 700,
            color: statusColor,
          }}
        >
          <Dot color={statusColor} />
          {statusLabel}
        </div>
        <div
          style={{
            fontSize: 11,
            color: T.textSub,
            fontFamily: "monospace",
          }}
        >
          {clock}
        </div>
        <button
          onClick={() => setPage("settings")}
          title="Settings"
          style={{
            width: 36,
            height: 36,
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            background: page === "settings" ? T.tealGlow : "transparent",
            color: page === "settings" ? T.teal : T.muted,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
            outline:
              page === "settings" ? `1.5px solid ${T.teal}44` : "none",
          }}
        >
          ⚙
        </button>
        <div
          onClick={() => onTheme(dark ? "light" : "dark")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: T.card,
            border: `1px solid ${T.border2}`,
            borderRadius: 999,
            padding: "3px 8px 3px 5px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span style={{ fontSize: 11 }}>{dark ? "🌙" : "☀️"}</span>
          <div
            style={{
              width: 24,
              height: 13,
              borderRadius: 999,
              background: dark ? T.teal : T.border2,
              position: "relative",
              transition: "background 0.3s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 1.5,
                left: dark ? 10 : 1.5,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.25s",
                display: "block",
              }}
            />
          </div>
        </div>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: T.tealGlow,
            border: `1px solid ${T.teal}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: T.teal,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          OP
        </div>
      </div>
    </div>
  );
};

const LiveFeed = ({ T, backend }) => {
  const { liveData, connected, backendUp, cameraUp, offlineReason, startRecording, stopRecording } = backend;
  const tracks = liveData?.tracks || [];
  const humans = liveData?.humans || [];
  const binStatus = liveData?.bin_status || { fill_pct: 0, status: "OK" };
  const fps = liveData?.fps || 0;
  const recording = liveData?.recording || false;
  const recTime = liveData?.rec_time || 0;
  const frameB64 = liveData?.frame_b64 || null;
  const frameW = liveData?.frame_w || 640;
  const frameH = liveData?.frame_h || 480;
  const binCounts = liveData?.bin_counts || {};
  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(
      s % 60
    ).padStart(2, "0")}`;

  const showFeed = backendUp && cameraUp && frameB64;
  const wasteColors = COLORS(T);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 10,
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 0,
        }}
      >
        <Card
          T={T}
          style={{
            flex: 1,
            padding: 0,
            overflow: "hidden",
            position: "relative",
            minHeight: 0,
          }}
        >
          {showFeed ? (
            <div
              style={{ width: "100%", height: "100%", position: "relative" }}
            >
              <img
                src={`data:image/jpeg;base64,${frameB64}`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
                alt="live"
              />
              <div
                style={{
                  position: "absolute",
                  top: "63%",
                  left: 0,
                  right: 0,
                  height: 2,
                  background: `${T.teal}bb`,
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "60%",
                  left: 10,
                  fontSize: 8,
                  color: T.teal,
                  letterSpacing: 2,
                  fontFamily: "monospace",
                  pointerEvents: "none",
                }}
              >
                ── BIN ENTRY LINE ──
              </div>
              {(tracks.length > 0 || humans.length > 0) && (
                <svg
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                  viewBox={`0 0 ${frameW} ${frameH}`}
                  preserveAspectRatio="none"
                >
                  {tracks.map((t) => {
                    const [x, y, w, h] = t.bbox;
                    const col = t.contaminated
                      ? T.red
                      : wasteColors[t.class_name] || T.teal;
                    return (
                      <g key={t.track_id}>
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          fill="none"
                          stroke={col}
                          strokeWidth="2"
                          strokeDasharray={t.contaminated ? "6,3" : "none"}
                        />
                        <rect
                          x={x}
                          y={Math.max(0, y - 18)}
                          width={Math.min(w, 150)}
                          height={16}
                          fill={col}
                          opacity="0.9"
                          rx="2"
                        />
                        <text
                          x={x + 4}
                          y={Math.max(12, y - 6)}
                          fontSize="9"
                          fill="white"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {t.contaminated ? "⚠ CONTAM" : t.class_name} #
                          {t.track_id} {(t.confidence * 100).toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                  {humans.map((h, i) => {
                    const [x, y, w, hh] = h.bbox;
                    return (
                      <g key={`h${i}`}>
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={hh}
                          fill="none"
                          stroke={T.purple}
                          strokeWidth="2.5"
                        />
                        <rect
                          x={x}
                          y={Math.max(0, y - 18)}
                          width={90}
                          height={16}
                          fill={T.purple}
                          opacity="0.9"
                          rx="2"
                        />
                        <text
                          x={x + 4}
                          y={Math.max(12, y - 6)}
                          fontSize="9"
                          fill="white"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          👤 HUMAN {(h.confidence * 100).toFixed(0)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  display: "flex",
                  gap: 6,
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    background: "#00000099",
                    border: `1px solid ${T.green}55`,
                    borderRadius: 5,
                    padding: "3px 8px",
                    fontSize: 10,
                    color: T.green,
                    fontFamily: "monospace",
                  }}
                >
                  <Dot color={T.green} size={6} /> LIVE
                </span>
                <span
                  style={{
                    background: "#00000099",
                    borderRadius: 5,
                    padding: "3px 8px",
                    fontSize: 10,
                    color: "#bbb",
                    fontFamily: "monospace",
                  }}
                >
                  YOLOv8
                </span>
                {recording && (
                  <span
                    style={{
                      background: "#00000099",
                      border: `1px solid ${T.red}66`,
                      borderRadius: 5,
                      padding: "3px 8px",
                      fontSize: 10,
                      color: T.red,
                      fontFamily: "monospace",
                    }}
                  >
                    ⏺ {fmt(recTime)}
                  </span>
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  background: "#00000099",
                  borderRadius: 5,
                  padding: "3px 8px",
                  fontSize: 10,
                  color: "#bbb",
                  fontFamily: "monospace",
                  pointerEvents: "none",
                }}
              >
                {tracks.length} obj · {fps} FPS
              </div>
              {tracks.length === 0 && humans.length === 0 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#00000088",
                    borderRadius: 8,
                    padding: "4px 14px",
                    fontSize: 10,
                    color: T.green,
                    fontFamily: "monospace",
                  }}
                >
                  ✓ No waste detected
                </div>
              )}
            </div>
          ) : (
            <OfflineScreen T={T} reason={offlineReason} connected={connected} />
          )}
        </Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              flex: 1,
              fontSize: 10,
              color: T.muted,
              fontFamily: "monospace",
            }}
          >
            {Object.entries(binCounts)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k}:${v}`)
              .join(" · ") || "Session item counts appear here"}
          </span>
          {!recording ? (
            <button
              onClick={startRecording}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 700,
                background: T.tealGlow,
                border: `1px solid ${T.teal}`,
                color: T.teal,
              }}
            >
              ⏺ Record
            </button>
          ) : (
            <button
              onClick={stopRecording}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 700,
                background: `${T.red}18`,
                border: `1px solid ${T.red}`,
                color: T.red,
              }}
            >
              ⏹ Stop
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          width: 180,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflowY: "auto",
        }}
      >
        <Card
          T={T}
          style={{
            padding: 12,
            border: `1px solid ${
              binStatus.fill_pct > 85 ? T.red : T.border
            }`,
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: T.textSub,
              letterSpacing: 2,
              marginBottom: 4,
            }}
          >
            BIN LEVEL
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              fontFamily: "monospace",
              color:
                binStatus.fill_pct > 85
                  ? T.red
                  : binStatus.fill_pct > 60
                  ? T.amber
                  : T.green,
            }}
          >
            {binStatus.fill_pct}
            <span style={{ fontSize: 11 }}>%</span>
          </div>
          <div
            style={{
              marginTop: 5,
              height: 5,
              background: T.border,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${binStatus.fill_pct}%`,
                borderRadius: 3,
                transition: "width 0.6s",
                background:
                  binStatus.fill_pct > 85
                    ? T.red
                    : binStatus.fill_pct > 60
                    ? T.amber
                    : T.green,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color:
                binStatus.fill_pct > 85 ? T.red : T.textSub,
            }}
          >
            {binStatus.status === "OVERFLOW"
              ? "⚠ OVERFLOW"
              : binStatus.status === "WARNING"
              ? "Filling Up"
              : "Normal"}
          </div>
        </Card>
        <Card T={T} style={{ padding: 12 }}>
          <div
            style={{
              fontSize: 9,
              color: T.textSub,
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            DETECTIONS
          </div>
          {tracks.length === 0 ? (
            <div
              style={{
                fontSize: 10,
                color: T.muted,
                textAlign: "center",
                padding: "6px 0",
              }}
            >
              Nothing in frame
            </div>
          ) : (
            tracks.map((d) => (
              <div
                key={d.track_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 5,
                  padding: "4px 6px",
                  background: d.contaminated ? `${T.red}10` : T.bg,
                  borderRadius: 7,
                  border: `1px solid ${
                    d.contaminated ? T.red + "44" : T.border
                  }`,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: d.contaminated
                      ? T.red
                      : wasteColors[d.class_name],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, color: T.text, flex: 1 }}>
                  {d.class_name}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: T.muted,
                    fontFamily: "monospace",
                  }}
                >
                  #{d.track_id}
                </span>
                {d.contaminated && (
                  <span style={{ fontSize: 10, color: T.red }}>⚠</span>
                )}
              </div>
            ))
          )}
        </Card>
        <Card T={T} style={{ padding: 12 }}>
          <div
            style={{
              fontSize: 9,
              color: T.textSub,
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            CONTAM FEED
          </div>
          {tracks.filter((t) => t.contaminated).length === 0 ? (
            <div
              style={{
                fontSize: 10,
                color: T.green,
                textAlign: "center",
                padding: "4px 0",
              }}
            >
              ✓ None
            </div>
          ) : (
            tracks
              .filter((t) => t.contaminated)
              .map((e) => (
                <div
                  key={e.track_id}
                  style={{
                    padding: "5px 7px",
                    marginBottom: 5,
                    borderRadius: 7,
                    background: `${T.red}10`,
                    border: `1px solid ${T.red}30`,
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: T.red, fontWeight: 700 }}>
                    ⚠ {e.class_name}
                  </span>
                  <span style={{ color: T.textSub }}> #{e.track_id}</span>
                </div>
              ))
          )}
        </Card>
      </div>
    </div>
  );
};

const UploadPanel = ({ T }) => {
  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState(null);
  const ref = useRef(null);

  const pick = (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["mp4", "avi", "mov", "mkv", "wmv"].includes(ext)) {
      setError(`Unsupported: .${ext}`);
      return;
    }
    setError(null);
    setFile(f);
    setProgress(0);
    setResult(null);
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setProgress(5);
    setError(null);
    
    let p = 5;
    const tick = setInterval(() => {
      p = Math.min(p + Math.random() * 3, 90);
      setProgress(p);
    }, 400);

    try {
      const form = new FormData();
      form.append("file", file);
      
      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: form,
      });
      
      clearInterval(tick);
      setProgress(100);
      
      if (!res.ok) {
        const e = await res.json().catch(() => ({ detail: "Upload failed" }));
        setError("Error: " + (e.detail || res.statusText));
        setAnalyzing(false);
        return;
      }
      
      const d = await res.json();
      const total = Object.values(d.class_counts).reduce((a, b) => a + b, 0);
      
      setResult({
        totalItems: total,
        contaminated: d.contaminated,
        peakFill: d.peak_fill,
        binOverflow: d.overflow,
        duration: `${String(Math.floor(d.duration_sec / 60)).padStart(
          2,
          "0"
        )}:${String(Math.floor(d.duration_sec % 60)).padStart(2, "0")}`,
        classes: d.class_counts,
      });
    } catch (e) {
      clearInterval(tick);
      setError("Network error: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div
      style={{
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
        height: "100%",
      }}
    >
      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: `${T.red}12`,
            border: `1px solid ${T.red}44`,
            borderRadius: 10,
            fontSize: 11,
            color: T.red,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          border: `2px dashed ${drag ? T.teal : T.border2}`,
          background: drag ? T.tealGlow : T.card,
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
          transition: "all 0.2s",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={ref}
          type="file"
          accept=".mp4,.avi,.mov,.mkv,.wmv,video/*"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files[0]) pick(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎬</div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: T.text,
            marginBottom: 4,
          }}
        >
          {file ? file.name : "Drop video here"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: T.textSub,
            marginBottom: 14,
          }}
        >
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
            : "MP4 · AVI · MOV · MKV · WMV"}
        </div>
        <button
          onClick={() => ref.current && ref.current.click()}
          style={{
            padding: "8px 22px",
            background: T.tealGlow,
            border: `1px solid ${T.teal}`,
            borderRadius: 8,
            color: T.teal,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          Browse File
        </button>
      </div>

      {file && !result && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={analyze}
            disabled={analyzing}
            style={{
              flex: 1,
              padding: "11px",
              background: analyzing ? T.muted : T.teal,
              border: "none",
              borderRadius: 10,
              color: T.mode === "dark" ? "#060E14" : "#fff",
              fontWeight: 800,
              fontSize: 12,
              cursor: analyzing ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {analyzing ? `Analysing… ${progress.toFixed(0)}%` : "▶ Analyse Video"}
          </button>
          <button
            onClick={() => {
              setFile(null);
              setResult(null);
              setError(null);
            }}
            style={{
              padding: "11px 16px",
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              color: T.textSub,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}
          >
            Clear
          </button>
        </div>
      )}

      {analyzing && (
        <Card T={T} style={{ padding: 12 }}>
          <div
            style={{
              fontSize: 11,
              color: T.textSub,
              marginBottom: 8,
            }}
          >
            Processing with YOLOv8…
          </div>
          <div
            style={{
              height: 7,
              background: T.border,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: T.teal,
                borderRadius: 4,
                transition: "width 0.2s",
              }}
            />
          </div>
        </Card>
      )}

      {result && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 8,
            }}
          >
            {[
              { l: "Items", v: result.totalItems, c: T.teal },
              { l: "Contaminated", v: result.contaminated, c: T.red },
              { l: "Peak Fill", v: `${result.peakFill}%`, c: T.amber },
              { l: "Duration", v: result.duration, c: T.blue },
            ].map((s) => (
              <Card
                key={s.l}
                T={T}
                style={{
                  textAlign: "center",
                  padding: 12,
                  border: `1px solid ${s.c}33`,
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: s.c,
                    fontFamily: "monospace",
                  }}
                >
                  {s.v}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: T.textSub,
                    marginTop: 4,
                  }}
                >
                  {s.l}
                </div>
              </Card>
            ))}
          </div>

          {result.binOverflow && (
            <div
              style={{
                padding: "9px 14px",
                background: `${T.red}12`,
                border: `1px solid ${T.red}40`,
                borderRadius: 10,
                fontSize: 11,
                color: T.red,
              }}
            >
              ⚠ Overflow detected — peak {result.peakFill}%
            </div>
          )}

          {result.contaminated > 0 && (
            <div
              style={{
                padding: "9px 14px",
                background: `${T.amber}12`,
                border: `1px solid ${T.amber}40`,
                borderRadius: 10,
                fontSize: 11,
                color: T.amber,
              }}
            >
              ⚠ {result.contaminated} contaminated item
              {result.contaminated > 1 ? "s" : ""} found
            </div>
          )}

          <Card T={T} style={{ padding: 14 }}>
            <div
              style={{
                fontSize: 9,
                color: T.textSub,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              CLASS BREAKDOWN
            </div>
            {Object.entries(result.classes).map(([cls, cnt]) => {
              const pct = (
                result.totalItems > 0 ? (cnt / result.totalItems) * 100 : 0
              ).toFixed(0);
              return (
                <div key={cls} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 11, color: T.text }}>{cls}</span>
                    <span
                      style={{
                        fontSize: 10,
                        color: COLORS(T)[cls],
                        fontFamily: "monospace",
                      }}
                    >
                      {cnt} ({pct}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: T.border,
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: COLORS(T)[cls],
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>

          <button
            onClick={() => {
              setFile(null);
              setResult(null);
              setError(null);
            }}
            style={{
              padding: "8px 18px",
              background: T.tealGlow,
              border: `1px solid ${T.teal}`,
              borderRadius: 8,
              color: T.teal,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}
          >
            ⬆ Analyse Another
          </button>
        </>
      )}
    </div>
  );
};

const AnalyticsPanel = ({ T, summary }) => {
  const counts = summary.class_counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const max = Math.max(...Object.values(counts), 1);
  
  return (
    <div
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10,
        }}
      >
        {[
          { l: "Total Detected", v: total, c: T.teal },
          { l: "Contaminated", v: summary.contaminated_total || 0, c: T.red },
          {
            l: "Bin Fill",
            v: `${summary.latest_bin?.fill_pct || 0}%`,
            c: T.amber,
          },
        ].map((s) => (
          <Card
            key={s.l}
            T={T}
            style={{ textAlign: "center", padding: 12 }}
          >
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: s.c,
                fontFamily: "monospace",
              }}
            >
              {s.v}
            </div>
            <div
              style={{ fontSize: 10, color: T.textSub, marginTop: 4 }}
            >
              {s.l}
            </div>
          </Card>
        ))}
      </div>

      <Card T={T} style={{ padding: 14 }}>
        <div
          style={{
            fontSize: 9,
            color: T.textSub,
            letterSpacing: 2,
            marginBottom: 14,
          }}
        >
          ITEMS BY CLASS
        </div>
        {Object.entries(counts).length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: T.muted,
              textAlign: "center",
              padding: 16,
            }}
          >
            No data yet — start the live feed
          </div>
        ) : (
          Object.entries(counts).map(([cls, cnt]) => (
            <div key={cls} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: COLORS(T)[cls],
                    }}
                  />
                  <span style={{ fontSize: 11, color: T.text }}>{cls}</span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: COLORS(T)[cls],
                    fontFamily: "monospace",
                  }}
                >
                  {cnt} ({total > 0 ? ((cnt / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  background: T.border,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(cnt / max) * 100}%`,
                    background: COLORS(T)[cls],
                    borderRadius: 4,
                    transition: "width 0.6s",
                  }}
                />
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
};

const AlertsPanel = ({ T, alerts, ackAlert }) => {
  const unacked = alerts.filter((a) => !a.acknowledged).length;
  
  return (
    <div
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflowY: "auto",
        height: "100%",
      }}
    >
      {unacked > 0 && (
        <div
          style={{
            padding: "8px 12px",
            background: `${T.red}12`,
            border: `1px solid ${T.red}33`,
            borderRadius: 8,
            fontSize: 11,
            color: T.red,
            fontWeight: 700,
          }}
        >
          ⚠ {unacked} alert{unacked > 1 ? "s" : ""} need acknowledgement
        </div>
      )}
      
      {alerts.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 30,
            fontSize: 12,
            color: T.green,
          }}
        >
          ✓ No alerts
        </div>
      ) : (
        alerts.map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 10,
              background: a.acknowledged ? T.card : `${T.red}08`,
              border: a.acknowledged
                ? `1px solid ${T.border}`
                : `1px solid ${T.red}44`,
            }}
          >
            <span style={{ fontSize: 16 }}>
              {a.alert_type === "CONTAMINATION" ? "⚠" : "🗑"}
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: a.acknowledged ? T.textSub : T.text,
                }}
              >
                {a.alert_type} · {a.detail?.slice(0, 60)}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: T.muted,
                  marginTop: 2,
                }}
              >
                {a.timestamp?.slice(0, 16)}
              </div>
            </div>
            {!a.acknowledged ? (
              <button
                onClick={() => ackAlert(a.id)}
                style={{
                  padding: "4px 12px",
                  background: "transparent",
                  border: `1px solid ${T.teal}66`,
                  borderRadius: 6,
                  color: T.teal,
                  fontSize: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ACK
              </button>
            ) : (
              <span style={{ fontSize: 9, color: T.muted }}>Done</span>
            )}
          </div>
        ))
      )}
    </div>
  );
};

const BinPanel = ({ T, liveData }) => {
  const mainFill = liveData?.bin_status?.fill_pct || 0;
  const bins = [
    {
      id: "A1",
      label: "Recycling — Zone A",
      fill: mainFill,
      type: "Plastic / Glass",
    },
    {
      id: "B1",
      label: "Metal — Zone B",
      fill: Math.min(99, mainFill * 0.55 + 12),
      type: "Metal",
    },
    {
      id: "C1",
      label: "Bio-Hazard — Zone C",
      fill: Math.min(99, mainFill * 0.28 + 6),
      type: "Bio-Hazard",
    },
    {
      id: "D1",
      label: "Paper — Zone D",
      fill: Math.min(99, mainFill * 0.72 + 18),
      type: "Paper",
    },
  ];

  const getColor = (f) => (f > 85 ? T.red : f > 60 ? T.amber : T.green);

  return (
    <div
      style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        overflowY: "auto",
        alignContent: "start",
      }}
    >
      {bins.map((bin) => {
        const col = getColor(bin.fill);
        return (
          <Card
            key={bin.id}
            T={T}
            style={{ padding: 14, border: `1px solid ${col}33` }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 10,
              }}
            >
              <div>
                <div
                  style={{ fontSize: 11, fontWeight: 700, color: T.text }}
                >
                  {bin.label}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: T.textSub,
                    marginTop: 2,
                  }}
                >
                  {bin.type}
                </div>
              </div>
              <Badge
                color={col}
                label={bin.fill > 85 ? "COLLECT" : bin.fill > 60 ? "WARN" : "OK"}
              />
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div
                style={{
                  width: 34,
                  height: 60,
                  border: `2px solid ${T.border2}`,
                  borderRadius: "4px 4px 8px 8px",
                  overflow: "hidden",
                  background: T.bg,
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${bin.fill}%`,
                    background: `${col}44`,
                    borderTop: `2px solid ${col}`,
                    transition: "height 0.8s",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    color: col,
                    fontFamily: "monospace",
                    lineHeight: 1,
                  }}
                >
                  {bin.fill.toFixed(0)}
                  <span style={{ fontSize: 11 }}>%</span>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    height: 5,
                    background: T.border,
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${bin.fill}%`,
                      background: col,
                      borderRadius: 3,
                      transition: "width 0.8s",
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

const AuditPanel = ({ T, auditLog }) => {
  const [filter, setFilter] = useState("All");
  const classes = ["All", "Plastic", "Metal", "Glass", "Paper", "Bio-Hazard", "E-Waste"];
  
  const filtered =
    filter === "All"
      ? auditLog
      : auditLog.filter((l) => l.class_name === filter);

  return (
    <div
      style={{
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 5,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {classes.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              border: `1px solid ${filter === c ? T.teal : T.border}`,
              background: filter === c ? T.tealGlow : "transparent",
              color: filter === c ? T.teal : T.textSub,
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <Card
        T={T}
        style={{
          padding: 0,
          overflow: "hidden",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 100px 55px 60px 90px 60px",
            padding: "8px 14px",
            borderBottom: `1px solid ${T.border}`,
            fontSize: 9,
            color: T.muted,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          <span>TIME</span>
          <span>CLASS</span>
          <span>TRACK</span>
          <span>CONF</span>
          <span>CONTAM</span>
          <span>STATUS</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                fontSize: 11,
                color: T.muted,
              }}
            >
              No events yet
            </div>
          ) : (
            filtered.map((log, i) => (
              <div
                key={log.id || i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 100px 55px 60px 90px 60px",
                  padding: "7px 14px",
                  borderBottom: `1px solid ${T.border}22`,
                  background: i % 2 === 0 ? "transparent" : `${T.bg}88`,
                  fontSize: 10,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    color: T.muted,
                    fontFamily: "monospace",
                    fontSize: 9,
                  }}
                >
                  {log.timestamp?.slice(11, 19)}
                </span>
                <span
                  style={{ display: "flex", alignItems: "center", gap: 5 }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: COLORS(T)[log.class_name],
                    }}
                  />
                  <span style={{ color: T.text }}>{log.class_name}</span>
                </span>
                <span
                  style={{ color: T.muted, fontFamily: "monospace" }}
                >
                  #{log.track_id}
                </span>
                <span
                  style={{ color: T.textSub, fontFamily: "monospace" }}
                >
                  {log.confidence?.toFixed(2)}
                </span>
                <span style={{ color: log.contaminated ? T.red : T.muted }}>
                  {log.contaminated ? "⚠ YES" : "—"}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 10,
                    background: log.contaminated ? `${T.red}18` : T.border,
                    color: log.contaminated ? T.red : T.muted,
                  }}
                >
                  {log.contaminated ? "FLAGGED" : "OK"}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

const SettingsPage = ({ T, backend, theme, onTheme }) => {
  const { recordings, saveConfig, backendUp, cameraUp } = backend;
  const [conf, setConf] = useState(0.45);
  const [binWarn, setBinWarn] = useState(60);
  const [binFull, setBinFull] = useState(85);
  const [saved, setSaved] = useState(false);
  const dark = theme === "dark";

  const handleSave = async () => {
    await saveConfig({
      confidence_threshold: conf,
      bin_warning_threshold: binWarn / 100,
      bin_full_threshold: binFull / 100,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: T.bg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${T.border}`,
          background: T.panel,
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
          ⚙ Settings
        </div>
        <div
          style={{
            fontSize: 10,
            color: T.textSub,
            marginTop: 2,
          }}
        >
          Configuration pushed to backend in real-time
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            maxWidth: 900,
            marginBottom: 14,
          }}
        >
          <Card T={T} style={{ padding: 16, gridColumn: "1/-1" }}>
            <div
              style={{
                fontSize: 9,
                color: T.textSub,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              SYSTEM STATUS
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 12,
              }}
            >
              {[
                {
                  label: "Backend Server",
                  ok: backendUp,
                  okText: "Running on :8000",
                  failText: "Not started",
                  icon: "🖥",
                },
                {
                  label: "Camera / Source",
                  ok: cameraUp,
                  okText: "Streaming frames",
                  failText: "No camera detected",
                  icon: "📷",
                },
                {
                  label: "AI Model",
                  ok: backendUp,
                  okText: "YOLOv8 loaded",
                  failText: "Depends on backend",
                  icon: "🧠",
                },
                {
                  label: "Database",
                  ok: backendUp,
                  okText: "MongoDB Atlas",
                  failText: "Depends on backend",
                  icon: "🗄",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: "12px",
                    background: s.ok ? `${T.green}08` : `${T.red}08`,
                    border: `1px solid ${s.ok ? T.green + "33" : T.red + "33"}`,
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.text,
                      marginBottom: 4,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      marginBottom: 4,
                    }}
                  >
                    <Dot color={s.ok ? T.green : T.red} />
                    <span
                      style={{
                        fontSize: 10,
                        color: s.ok ? T.green : T.red,
                        fontWeight: 700,
                      }}
                    >
                      {s.ok ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: T.textSub }}>
                    {s.ok ? s.okText : s.failText}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card T={T} style={{ padding: 16 }}>
            <div
              style={{
                fontSize: 9,
                color: T.textSub,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              DETECTION THRESHOLDS
            </div>
            {[
              {
                label: "Confidence",
                val: conf,
                set: setConf,
                min: 0.1,
                max: 0.9,
                step: 0.01,
                fmt: (v) => v.toFixed(2),
                color: T.teal,
              },
              {
                label: "Bin Warning %",
                val: binWarn,
                set: setBinWarn,
                min: 30,
                max: 80,
                fmt: (v) => v + "%",
                color: T.amber,
              },
              {
                label: "Bin Full %",
                val: binFull,
                set: setBinFull,
                min: 60,
                max: 99,
                fmt: (v) => v + "%",
                color: T.red,
              },
            ].map((s) => (
              <div key={s.label} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontSize: 11, color: T.textSub }}>
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: s.color,
                      fontFamily: "monospace",
                    }}
                  >
                    {s.fmt(s.val)}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step || 1}
                  value={s.val}
                  onChange={(e) => s.set(+e.target.value)}
                  style={{
                    width: "100%",
                    accentColor: s.color,
                  }}
                />
              </div>
            ))}
            <button
              onClick={handleSave}
              style={{
                width: "100%",
                padding: "9px",
                background: saved ? T.green : T.teal,
                border: "none",
                borderRadius: 8,
                color: T.mode === "dark" ? "#060E14" : "#fff",
                fontWeight: 800,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.3s",
              }}
            >
              {saved ? "✓ SAVED" : "PUSH TO BACKEND"}
            </button>
          </Card>

          <Card T={T} style={{ padding: 16 }}>
            <div
              style={{
                fontSize: 9,
                color: T.textSub,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              FEATURES
            </div>
            {[
              {
                label: "Face Blurring (Privacy Guard)",
                on: true,
                desc: "Blurs faces before display",
              },
              {
                label: "Audit Logging (MongoDB)",
                on: true,
                desc: "All events saved to database",
              },
              {
                label: "Auto-save Recordings",
                on: true,
                desc: "MP4s saved to /recordings",
              },
              {
                label: "Dashboard Alerts",
                on: true,
                desc: "Contamination + overflow alerts",
              },
            ].map((opt, i) => (
              <label
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  marginBottom: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  defaultChecked={opt.on}
                  style={{
                    accentColor: T.teal,
                    width: 13,
                    height: 13,
                    marginTop: 1,
                  }}
                />
                <div>
                  <div style={{ fontSize: 11, color: T.text }}>
                    {opt.label}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: T.muted,
                      marginTop: 2,
                    }}
                  >
                    {opt.desc}
                  </div>
                </div>
              </label>
            ))}
          </Card>

          <Card T={T} style={{ padding: 16 }}>
            <div
              style={{
                fontSize: 9,
                color: T.textSub,
                letterSpacing: 2,
                marginBottom: 12,
              }}
            >
              APPEARANCE
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { id: "dark", label: "🌙 Dark Mode" },
                { id: "light", label: "☀️ Light Mode" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTheme(t.id)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 9,
                    border: `1px solid ${
                      theme === t.id ? T.teal : T.border
                    }`,
                    background: theme === t.id ? T.tealGlow : T.bg,
                    color: theme === t.id ? T.teal : T.textSub,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: theme === t.id ? 700 : 400,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          <Card
            T={T}
            style={{
              padding: 0,
              overflow: "hidden",
              gridColumn: "1/-1",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: `1px solid ${T.border}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>🎬</span>
              <span
                style={{ fontSize: 12, fontWeight: 700, color: T.text }}
              >
                Saved Recordings
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: T.muted,
                  marginLeft: "auto",
                }}
              >
                {recordings.length} files
              </span>
            </div>
            {recordings.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  fontSize: 11,
                  color: T.muted,
                }}
              >
                No recordings yet — press ⏺ Record on the live feed
              </div>
            ) : (
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {recordings.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      padding: "10px 16px",
                      borderBottom: `1px solid ${T.border}22`,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>🎬</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: T.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {v.filename || v.session_id}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: T.textSub,
                          marginTop: 2,
                        }}
                      >
                        {v.started_at?.slice(0, 16)} · {v.duration_sec}s ·{" "}
                        {v.total_items} items
                      </div>
                    </div>
                    {v.had_overflow === true && (
                      <Badge color={T.red} label="OVERFLOW" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

const PANEL_TITLES = {
  analytics: "▦ Analytics",
  alerts: "⚠ Alerts",
  bin: "⬟ Bin Monitor",
  audit: "☰ Audit Log",
};

const SplitLayout = ({ T, mainPage, panelPage, backend }) => {
  const renderPanel = () => {
    switch (panelPage) {
      case "analytics":
        return <AnalyticsPanel T={T} summary={backend.summary} />;
      case "alerts":
        return (
          <AlertsPanel
            T={T}
            alerts={backend.alerts}
            ackAlert={backend.ackAlert}
          />
        );
      case "bin":
        return <BinPanel T={T} liveData={backend.liveData} />;
      case "audit":
        return <AuditPanel T={T} auditLog={backend.auditLog} />;
      default:
        return null;
    }
  };

  const showSplit = panelPage && PANEL_TITLES[panelPage];

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          flex: showSplit ? 1 : 1,
          minWidth: 0,
          height: "100%",
          overflow: "hidden",
          transition: "flex 0.3s",
        }}
      >
        {mainPage === "live" && <LiveFeed T={T} backend={backend} />}
        {mainPage === "upload" && <UploadPanel T={T} />}
      </div>

      {showSplit && (
        <div
          style={{
            width: 360,
            flexShrink: 0,
            borderLeft: `1px solid ${T.border}`,
            background: T.bg,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "slidePanel 0.25s ease",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${T.border}`,
              background: T.panel,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
              {PANEL_TITLES[panelPage]}
            </div>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>{renderPanel()}</div>
        </div>
      )}
    </div>
  );
};

const LoginPage = ({ T, onLogin, theme, onTheme }) => {
  const [loading, setLoad] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  const doLogin = () => {
    setLoad(true);
    setTimeout(() => {
      setLoad(false);
      onLogin();
    }, 900);
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: T.bg,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${T.border} 1px,transparent 1px),linear-gradient(90deg,${T.border} 1px,transparent 1px)`,
          backgroundSize: "44px 44px",
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle,${T.tealGlow} 0%,transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div
        onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
        style={{
          position: "absolute",
          top: 18,
          right: 20,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: T.card,
          border: `1px solid ${T.border2}`,
          borderRadius: 999,
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 12,
          color: T.textSub,
          userSelect: "none",
        }}
      >
        {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
      </div>
      <div style={{ position: "relative", width: 340 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: T.teal,
              fontFamily: "monospace",
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            ECO
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: T.text,
              fontFamily: "monospace",
              letterSpacing: -3,
              lineHeight: 1,
              marginTop: -4,
            }}
          >
            SIGHT
          </div>
          <div
            style={{
              fontSize: 10,
              color: T.muted,
              letterSpacing: 4,
              marginTop: 8,
            }}
          >
            SMART WASTE MANAGEMENT
          </div>
        </div>
        <Card T={T} style={{ padding: 24 }}>
          <div
            style={{
              fontSize: 11,
              color: T.textSub,
              marginBottom: 16,
            }}
          >
            Facility Operator Login
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: T.muted,
                  marginBottom: 4,
                }}
              >
                USERNAME
              </div>
              <input
                style={{
                  width: "100%",
                  background: T.input,
                  border: `1px solid ${T.border2}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: T.text,
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="operator@facility.com"
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: T.muted,
                  marginBottom: 4,
                }}
              >
                PASSWORD
              </div>
              <input
                style={{
                  width: "100%",
                  background: T.input,
                  border: `1px solid ${T.border2}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: T.text,
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && !loading && doLogin()}
              />
            </div>
            <button
              onClick={doLogin}
              style={{
                marginTop: 4,
                padding: "11px",
                background: T.teal,
                border: "none",
                borderRadius: 8,
                color: T.mode === "dark" ? "#060E14" : "#fff",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "AUTHENTICATING…" : "ENTER DASHBOARD"}
            </button>
          </div>
        </Card>
        <div
          style={{
            textAlign: "center",
            marginTop: 12,
            fontSize: 10,
            color: T.muted,
          }}
        >
          ECO-SIGHT v1.0 · Smart Waste Management
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [loggedIn, setLogin] = useState(false);
  const [mainPage, setMain] = useState("live");
  const [panelPage, setPanel] = useState(null);
  const [fullPage, setFull] = useState(null);
  const [contamToasts, setContamToasts] = useState([]);
  
  const prevContamRef = useRef(new Set());
  const T = theme === "dark" ? DARK : LIGHT;
  const backend = useBackend();

  const setPage = (p) => {
    if (p === "settings") {
      setFull((prev) => (prev === "settings" ? null : "settings"));
      setPanel(null);
      return;
    }
    if (p === "live" || p === "upload") {
      setMain(p);
      setFull(null);
      return;
    }
    setPanel((prev) => (prev === p ? null : p));
    setFull(null);
  };

  useEffect(() => {
    const tracks = backend.liveData?.tracks || [];
    const newC = tracks.filter(
      (t) => t.contaminated && !prevContamRef.current.has(t.track_id)
    );
    if (newC.length > 0) {
      setContamToasts((p) => [...p, ...newC]);
      newC.forEach((t) => prevContamRef.current.add(t.track_id));
      setTimeout(() => setContamToasts((p) => p.slice(newC.length)), 6000);
    }
  }, [backend.liveData]);

  const unackedAlerts = backend.alerts.filter((a) => !a.acknowledged).length;

  return (
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, 'SF Pro Display', 'Segoe UI', sans-serif;
          background: ${T.bg};
        }
      `}</style>

      <Toast
        T={T}
        events={contamToasts}
        onDismiss={(i) => setContamToasts((p) => p.filter((_, idx) => idx !== i))}
      />

      <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
        {!loggedIn ? (
          <LoginPage
            T={T}
            theme={theme}
            onTheme={setTheme}
            onLogin={() => setLogin(true)}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
            <TopBar
              T={T}
              theme={theme}
              onTheme={setTheme}
              connected={backend.connected}
              backendUp={backend.backendUp}
              cameraUp={backend.cameraUp}
              fps={backend.liveData?.fps || 0}
              recording={backend.liveData?.recording || false}
              recTime={backend.liveData?.rec_time || 0}
              page={fullPage || panelPage || mainPage}
              setPage={setPage}
              unackedAlerts={unackedAlerts}
            />

            {backend.liveData?.bin_status?.status === "OVERFLOW" && !fullPage && (
              <div
                style={{
                  background: `${T.red}18`,
                  borderBottom: `1px solid ${T.red}44`,
                  padding: "6px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  animation: "flash 1s infinite",
                  flexShrink: 0,
                }}
              >
                <span>⚠</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.red,
                  }}
                >
                  BIN OVERFLOW — Immediate collection required
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    color: T.red,
                    fontFamily: "monospace",
                  }}
                >
                  {new Date().toTimeString().slice(0, 8)}
                </span>
              </div>
            )}

            {!fullPage && (
              <div
                style={{
                  display: "flex",
                  borderBottom: `1px solid ${T.border}`,
                  background: T.panel,
                  flexShrink: 0,
                }}
              >
                {[
                  { id: "live", label: "◉  Live Camera" },
                  { id: "upload", label: "⬆  Upload Video" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPage(t.id)}
                    style={{
                      padding: "9px 20px",
                      border: "none",
                      background: "transparent",
                      borderBottom: `2px solid ${
                        mainPage === t.id && !fullPage ? T.teal : "transparent"
                      }`,
                      color: mainPage === t.id && !fullPage ? T.teal : T.textSub,
                      fontWeight: mainPage === t.id ? 700 : 400,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.2s",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
                {panelPage && (
                  <div
                    style={{
                      marginLeft: "auto",
                      padding: "9px 16px",
                      fontSize: 10,
                      color: T.muted,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    Split:{" "}
                    <span style={{ color: T.teal, fontWeight: 700 }}>
                      {PANEL_TITLES[panelPage]}
                    </span>
                    <button
                      onClick={() => setPanel(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: T.muted,
                        cursor: "pointer",
                        fontSize: 13,
                        lineHeight: 1,
                        padding: "0 4px",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1, overflow: "hidden" }}>
              {fullPage === "settings" ? (
                <SettingsPage
                  T={T}
                  backend={backend}
                  theme={theme}
                  onTheme={setTheme}
                />
              ) : (
                <SplitLayout
                  T={T}
                  mainPage={mainPage}
                  panelPage={panelPage}
                  backend={backend}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}