import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

interface SystemData {
  active_mode: number;
  rem_sensitivity_lvl: number;
  geo_threshold_g: number;
}

interface RadioData {
  frequency: number;
}

interface EnvironmentData {
  temp_c: number;
  humidity_pct: number;
  pressure_hpa: number;
}

interface MPR121Data {
  capacitance: number;
  pad_mask: number;
}

interface MPU6050Data {
  peak_g: number;
  accel: {
    x: number;
    y: number;
    z: number;
  };
}

interface TelemetryPayload {
  timestamp: string | number;
  system: SystemData;
  radio: RadioData;
  sensors: {
    environment: EnvironmentData;
    mpr121: MPR121Data;
    mpu6050: MPU6050Data;
  };
}

interface TelemetryHistoryPoint {
  timeLabel: string;
  temp: number;
  capacitance: number;
  peakG: number;
  pressure: number;
}

const MODES: Record<number, string> = {
  1: "Acoustic RF Sweep (TEA5767)",
  2: "Proximity REM-Pod (MPR121)",
  3: "Seismic Geophone (MPU6050)",
  4: "Dictionary ITC (Alice Bank)",
};

const MAX_HISTORY = 24;

export default function Dashboard() {
  const [data, setData] = useState<TelemetryPayload | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [history, setHistory] = useState<TelemetryHistoryPoint[]>([]);
  const [packetCount, setPacketCount] = useState<number>(0);

  // Packet frequency calculation
  const lastPacketTime = useRef<number>(Date.now());
  const [hzRate, setHzRate] = useState<number>(0);

  useEffect(() => {
    const socketUrl =
      window.location.port === "5173" ? `http://${window.location.hostname}:3030` : "/";

    const socket = io(socketUrl);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => {
      setConnected(false);
      setHzRate(0);
    });

    socket.on("sensor_update", (payload: TelemetryPayload) => {
      const now = Date.now();
      const delta = now - lastPacketTime.current;
      lastPacketTime.current = now;
      if (delta > 0) {
        setHzRate(Math.min(30, Math.round(1000 / delta)));
      }

      setData(payload);
      setPacketCount((prev) => prev + 1);

      const timeLabel = new Date(payload.timestamp).toLocaleTimeString([], {
        minute: "2-digit",
        second: "2-digit",
      });

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            timeLabel,
            temp: payload.sensors.environment.temp_c,
            capacitance: payload.sensors.mpr121.capacitance,
            peakG: payload.sensors.mpu6050.peak_g,
            pressure: payload.sensors.environment.pressure_hpa,
          },
        ];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!data) {
    return (
      <div style={dashStyles.emptyContainer}>
        <div style={dashStyles.radarSpinner} />
        <h3 style={{ margin: "1.25rem 0 0.25rem 0", fontWeight: 600 }}>
          {connected ? "Synchronizing Sensor Stream..." : "Connecting to Hardware Bridge"}
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
          Listening on TCP Port 8081 for incoming ESP32 sensor frames
        </p>
      </div>
    );
  }

  const { system, radio, sensors } = data;
  const { environment, mpr121, mpu6050 } = sensors;

  const isColdDrop = environment.temp_c < 24.5;
  const isKineticAlert = mpu6050.peak_g > system.geo_threshold_g;
  const isRemActive = mpr121.capacitance > 120;

  // SVG Line Chart Generator Helpers
  const renderTrendPath = (
    points: TelemetryHistoryPoint[],
    key: "temp" | "peakG" | "capacitance",
    width: number,
    height: number,
    minVal: number,
    maxVal: number,
  ) => {
    if (points.length < 2) return "";
    const span = Math.max(0.1, maxVal - minVal);
    const stepX = width / (points.length - 1);

    const coords = points.map((p, idx) => {
      const x = idx * stepX;
      const normalized = (p[key] - minVal) / span;
      const y = height - Math.max(0, Math.min(height, normalized * height));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return coords.join(" ");
  };

  const tempMin = 18;
  const tempMax = 32;
  const tempPolyline = renderTrendPath(history, "temp", 400, 110, tempMin, tempMax);

  const seismicMax = Math.max(1.5, ...history.map((h) => h.peakG));
  const seismicPolyline = renderTrendPath(history, "peakG", 400, 110, 0, seismicMax);

  // Capacitance percentage for radial gauge
  const capPercent = Math.min(100, Math.round((mpr121.capacitance / 220) * 100));

  // Accelerometer Kinematic Target Dot Mapping
  const targetX = 50 + Math.max(-42, Math.min(42, mpu6050.accel.x * 6));
  const targetY = 50 - Math.max(-42, Math.min(42, mpu6050.accel.y * 6));

  // Simulated RF spectrum bars centered around carrier
  const rfFrequencies = [
    radio.frequency - 0.4,
    radio.frequency - 0.2,
    radio.frequency - 0.1,
    radio.frequency,
    radio.frequency + 0.1,
    radio.frequency + 0.2,
    radio.frequency + 0.4,
  ];

  return (
    <div style={dashStyles.container}>
      {/* HEADER BAR */}
      <div style={dashStyles.header}>
        <div>
          <div style={dashStyles.subHeaderTag}>AetherStream Rig // Real-Time Telemetry</div>
          <h1 style={dashStyles.title}>Instrumentation Console</h1>
        </div>

        <div style={dashStyles.statusCluster}>
          <div style={dashStyles.statusPill}>
            <span style={dashStyles.pillLabel}>STREAM:</span>
            <span style={{ fontWeight: 600, color: "var(--accent-emerald)" }}>
              {connected ? `${hzRate} Hz ACTIVE` : "DISCONNECTED"}
            </span>
          </div>

          <div style={dashStyles.statusPill}>
            <span style={dashStyles.pillLabel}>PACKETS:</span>
            <span style={{ fontWeight: 600, fontFamily: "monospace" }}>#{packetCount}</span>
          </div>

          <div style={dashStyles.statusPill}>
            <span style={dashStyles.pillLabel}>MODE:</span>
            <span style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
              {MODES[system.active_mode] || "Multi-Sensor"}
            </span>
          </div>
        </div>
      </div>

      {/* TOP KPI NUMERIC STRIP */}
      <div style={dashStyles.kpiGrid}>
        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>Ambient Temperature</div>
          <div
            style={{
              ...dashStyles.kpiValue,
              color: isColdDrop ? "var(--accent-cyan)" : "var(--text-primary)",
            }}
          >
            {environment.temp_c.toFixed(1)}°C
          </div>
          <div style={dashStyles.kpiFootnote}>
            {isColdDrop ? "Threshold Breach: Rapid Cold Drop" : "Atmospheric Baseline Stable"}
          </div>
        </div>

        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>Capacitive Flux</div>
          <div
            style={{
              ...dashStyles.kpiValue,
              color: isRemActive ? "var(--accent-amber)" : "var(--text-primary)",
            }}
          >
            {mpr121.capacitance}{" "}
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>mG</span>
          </div>
          <div style={dashStyles.kpiFootnote}>
            Pad Mask: 0x{mpr121.pad_mask.toString(16).toUpperCase()} | Level{" "}
            {system.rem_sensitivity_lvl}/5
          </div>
        </div>

        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>Seismic Shock Vector</div>
          <div
            style={{
              ...dashStyles.kpiValue,
              color: isKineticAlert ? "var(--accent-rose)" : "var(--text-primary)",
            }}
          >
            {mpu6050.peak_g.toFixed(3)}{" "}
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>G</span>
          </div>
          <div style={dashStyles.kpiFootnote}>
            Alarm Ceiling: {system.geo_threshold_g.toFixed(2)} G Trigger
          </div>
        </div>

        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>RF Carrier Sweep</div>
          <div style={{ ...dashStyles.kpiValue, color: "var(--accent-primary)" }}>
            {radio.frequency.toFixed(1)}{" "}
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>MHz</span>
          </div>
          <div style={dashStyles.kpiFootnote}>TEA5767 Fast Forward Scan</div>
        </div>
      </div>

      {/* DETAILED SENSOR DIAGRAM & CHART GRID */}
      <div style={dashStyles.chartsGrid}>
        {/* CHART 1: THERMAL & BAROMETRIC CHRONOLOGICAL TREND */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>Environmental Real-Time Trend</div>
              <div style={dashStyles.cardSectionSubtitle}>
                BME280 Atmospheric Sensor (24 Sample Rolling Buffer)
              </div>
            </div>
            <div style={dashStyles.chipGroup}>
              <span style={dashStyles.metricPill}>
                Pressure: {environment.pressure_hpa.toFixed(1)} hPa
              </span>
              <span style={dashStyles.metricPill}>
                Humidity: {environment.humidity_pct.toFixed(1)}%
              </span>
            </div>
          </div>

          <div style={dashStyles.svgWrapper}>
            <svg
              viewBox="0 0 400 110"
              style={{ width: "100%", height: "140px", overflow: "visible" }}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="tempAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line
                x1="0"
                y1="20"
                x2="400"
                y2="20"
                stroke="var(--border-subtle)"
                strokeDasharray="3 3"
              />
              <line
                x1="0"
                y1="55"
                x2="400"
                y2="55"
                stroke="var(--border-subtle)"
                strokeDasharray="3 3"
              />
              <line
                x1="0"
                y1="90"
                x2="400"
                y2="90"
                stroke="var(--border-subtle)"
                strokeDasharray="3 3"
              />

              {/* Anomaly baseline mark at 24.5C */}
              {(() => {
                const markY = 110 - ((24.5 - tempMin) / (tempMax - tempMin)) * 110;
                return (
                  <g>
                    <line
                      x1="0"
                      y1={markY}
                      x2="400"
                      y2={markY}
                      stroke="var(--accent-cyan)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x="6"
                      y={markY - 4}
                      fill="var(--accent-cyan)"
                      fontSize="9"
                      fontWeight="600"
                    >
                      Cold Anomaly Baseline (24.5°C)
                    </text>
                  </g>
                );
              })()}

              {/* Real-time Trend Polyline */}
              {tempPolyline && (
                <polyline
                  fill="none"
                  stroke={isColdDrop ? "var(--accent-cyan)" : "var(--accent-primary)"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={tempPolyline}
                />
              )}
            </svg>
          </div>

          <div style={dashStyles.chartAxisRow}>
            <span>{history[0]?.timeLabel || "T-24"}</span>
            <span>CURRENT: {environment.temp_c.toFixed(1)}°C</span>
            <span>{history[history.length - 1]?.timeLabel || "NOW"}</span>
          </div>
        </div>

        {/* CHART 2: SEISMIC IMPACT WAVEFORM (GEOPHONE) */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>Kinematic Shock Oscilloscope</div>
              <div style={dashStyles.cardSectionSubtitle}>
                MPU6050 Surface Impact Baseline vs Peak Force
              </div>
            </div>
            <span
              style={{
                ...dashStyles.metricPill,
                color: isKineticAlert ? "var(--accent-rose)" : "var(--text-secondary)",
              }}
            >
              Peak: {mpu6050.peak_g.toFixed(3)} G
            </span>
          </div>

          <div style={dashStyles.svgWrapper}>
            <svg
              viewBox="0 0 400 110"
              style={{ width: "100%", height: "140px", overflow: "visible" }}
              preserveAspectRatio="none"
            >
              {/* Threshold Alarm Line */}
              {(() => {
                const threshNorm = Math.min(1, system.geo_threshold_g / seismicMax);
                const threshY = 110 - threshNorm * 110;
                return (
                  <g>
                    <line
                      x1="0"
                      y1={threshY}
                      x2="400"
                      y2={threshY}
                      stroke="var(--accent-rose)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x="6"
                      y={threshY - 4}
                      fill="var(--accent-rose)"
                      fontSize="9"
                      fontWeight="600"
                    >
                      Alarm Ceiling ({system.geo_threshold_g.toFixed(2)} G)
                    </text>
                  </g>
                );
              })()}

              {/* Seismic Waveform Line */}
              {seismicPolyline && (
                <polyline
                  fill="none"
                  stroke={isKineticAlert ? "var(--accent-rose)" : "var(--accent-emerald)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={seismicPolyline}
                />
              )}
            </svg>
          </div>

          <div style={dashStyles.chartAxisRow}>
            <span>QUIET (0.0 G)</span>
            <span>SHOCK ABSORPTION</span>
            <span>MAX: {seismicMax.toFixed(2)} G</span>
          </div>
        </div>

        {/* DIAGRAM 3: CAPACITIVE PROXIMITY FIELD & RADIAL GAUGE */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>REM-Pod Proximity Radar</div>
              <div style={dashStyles.cardSectionSubtitle}>
                MPR121 Antenna Capacitive Disturbance Field
              </div>
            </div>
            <span
              style={{
                ...dashStyles.metricPill,
                color: isRemActive ? "var(--accent-amber)" : "var(--text-secondary)",
              }}
            >
              Signal: {capPercent}%
            </span>
          </div>

          <div style={dashStyles.radarContainer}>
            {/* Concentric Vector Radar */}
            <div style={dashStyles.radarCircleWrapper}>
              <svg viewBox="0 0 100 100" style={{ width: "120px", height: "120px" }}>
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="32"
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="18"
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <circle cx="50" cy="50" r="5" fill="var(--accent-primary)" />

                {/* Dynamic Radiating Wave */}
                <circle
                  cx="50"
                  cy="50"
                  r={Math.max(8, (capPercent / 100) * 44)}
                  fill="none"
                  stroke={isRemActive ? "var(--accent-amber)" : "var(--accent-primary)"}
                  strokeWidth="2"
                  opacity={isRemActive ? 0.9 : 0.4}
                />
              </svg>
            </div>

            {/* Segmented Meter */}
            <div style={dashStyles.radarMetricsSide}>
              <div style={dashStyles.segmentBarContainer}>
                {[1, 2, 3, 4, 5].map((lvl) => {
                  const active = mpr121.capacitance >= lvl * 38;
                  const colors = [
                    "var(--accent-emerald)",
                    "var(--accent-cyan)",
                    "var(--accent-amber)",
                    "var(--accent-amber)",
                    "var(--accent-rose)",
                  ];
                  return (
                    <div
                      key={lvl}
                      style={{
                        ...dashStyles.segmentBlock,
                        backgroundColor: active ? colors[lvl - 1] : "var(--bg-surface-elevated)",
                        border: `1px solid ${active ? colors[lvl - 1] : "var(--border-default)"}`,
                      }}
                    >
                      Stage {lvl}
                    </div>
                  );
                })}
              </div>

              <div style={dashStyles.metricFootnotes}>
                <div>
                  <strong>Antenna Baseline:</strong> Calibrated
                </div>
                <div>
                  <strong>Field State:</strong>{" "}
                  {isRemActive ? "Proximity Entry Registered" : "Equilibrium Stable"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DIAGRAM 4: 3-AXIS ATTITUDE VECTOR & RF WATERFALL */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>Kinematic Gyro Vector & RF Spectrum</div>
              <div style={dashStyles.cardSectionSubtitle}>
                3-Axis Coordinate Mapping and Acoustic Radio Band
              </div>
            </div>
            <span style={dashStyles.metricPill}>{radio.frequency.toFixed(1)} MHz</span>
          </div>

          <div style={dashStyles.gyroAndRfContainer}>
            {/* Kinematic Crosshair Visualizer */}
            <div style={dashStyles.gyroCol}>
              <div style={dashStyles.colTitle}>Attitude Vector (X/Y)</div>
              <svg viewBox="0 0 100 100" style={{ width: "100px", height: "100px" }}>
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="var(--bg-surface-elevated)"
                  stroke="var(--border-default)"
                  strokeWidth="1"
                />
                <line
                  x1="50"
                  y1="4"
                  x2="50"
                  y2="96"
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <line
                  x1="4"
                  y1="50"
                  x2="96"
                  y2="50"
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <circle cx="50" cy="50" r="2" fill="var(--text-muted)" />

                {/* Live Position Dot */}
                <circle
                  cx={targetX}
                  cy={targetY}
                  r="6"
                  fill="var(--accent-rose)"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              </svg>
              <div style={dashStyles.axisCoords}>
                X: {mpu6050.accel.x.toFixed(1)} | Y: {mpu6050.accel.y.toFixed(1)} | Z:{" "}
                {mpu6050.accel.z.toFixed(1)}
              </div>
            </div>

            {/* RF Sweep Spectrum Bars */}
            <div style={dashStyles.rfCol}>
              <div style={dashStyles.colTitle}>RF Waterfall Carrier Sweep</div>
              <div style={dashStyles.rfSpectrumBars}>
                {rfFrequencies.map((freq, idx) => {
                  const isCenter = idx === 3;
                  const barHeight = isCenter ? 65 : 20 + Math.sin(idx * 1.5) * 15;
                  return (
                    <div key={idx} style={dashStyles.rfBarColumn}>
                      <div
                        style={{
                          ...dashStyles.rfBar,
                          height: `${barHeight}px`,
                          backgroundColor: isCenter
                            ? "var(--accent-primary)"
                            : "var(--bg-surface-elevated)",
                          border: `1px solid ${isCenter ? "var(--accent-cyan)" : "var(--border-default)"}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.65rem",
                          color: isCenter ? "var(--accent-primary)" : "var(--text-muted)",
                          fontWeight: isCenter ? 700 : 400,
                        }}
                      >
                        {freq.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={dashStyles.rfStatusText}>Step Interval: 100ms Forward Sweep</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const dashStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    width: "100%",
  },
  emptyContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "4rem 1.5rem",
    textAlign: "center",
    backgroundColor: "var(--bg-surface)",
    border: "1px dashed var(--border-default)",
    borderRadius: "8px",
  },
  radarSpinner: {
    width: "38px",
    height: "38px",
    border: "3px solid var(--border-default)",
    borderTop: "3px solid var(--accent-primary)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px solid var(--border-default)",
    paddingBottom: "1rem",
    flexWrap: "wrap",
    gap: "12px",
  },
  subHeaderTag: {
    fontSize: "0.75rem",
    color: "var(--accent-primary)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  title: {
    fontSize: "1.4rem",
    fontWeight: 700,
    margin: "2px 0 0 0",
    letterSpacing: "-0.3px",
  },
  statusCluster: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  statusPill: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "0.8rem",
  },
  pillLabel: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    fontWeight: 600,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: "12px",
  },
  kpiCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.1rem",
    boxShadow: "var(--card-shadow)",
  },
  kpiTitle: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  kpiValue: {
    fontSize: "1.8rem",
    fontWeight: 700,
    fontFamily: "monospace",
    margin: "6px 0 2px 0",
  },
  kpiFootnote: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginTop: "4px",
  },
  chartsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
    gap: "1.25rem",
  },
  chartCard: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.25rem",
    boxShadow: "var(--card-shadow)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  cardHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "8px",
  },
  cardSectionTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  cardSectionSubtitle: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  chipGroup: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
  },
  metricPill: {
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    padding: "2px 8px",
    borderRadius: "4px",
    fontFamily: "monospace",
  },
  svgWrapper: {
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "10px 12px",
    position: "relative",
  },
  chartAxisRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    fontFamily: "monospace",
  },
  radarContainer: {
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "1rem",
    flexWrap: "wrap",
  },
  radarCircleWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radarMetricsSide: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minWidth: "180px",
  },
  segmentBarContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "4px",
  },
  segmentBlock: {
    padding: "6px 2px",
    borderRadius: "4px",
    textAlign: "center",
    fontSize: "0.65rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    transition: "all 0.15s ease",
  },
  metricFootnotes: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  },
  gyroAndRfContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "1rem",
    backgroundColor: "var(--bg-surface-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "1rem",
  },
  gyroCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
  colTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textAlign: "center",
  },
  axisCoords: {
    fontSize: "0.7rem",
    fontFamily: "monospace",
    color: "var(--text-muted)",
    marginTop: "4px",
  },
  rfCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  rfSpectrumBars: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
    height: "75px",
    paddingBottom: "4px",
  },
  rfBarColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
  },
  rfBar: {
    width: "14px",
    borderRadius: "2px 2px 0 0",
    transition: "height 0.2s ease",
  },
  rfStatusText: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    textAlign: "center",
  },
};
