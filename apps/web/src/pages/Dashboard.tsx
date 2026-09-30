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
  tempF: number;
  capacitance: number;
  peakG: number;
  pressure: number;
}

// Plain-English translations of hardware modes
const SIMPLE_MODES: Record<number, string> = {
  1: "Spirit Box Radio Sweep",
  2: "Proximity Field Detection (REM)",
  3: "Vibration & Footstep Sensor",
  4: "Speech Dictionary ITC",
};

const MAX_HISTORY = 24;

// Temperature conversion helper
const toFahrenheit = (celsius: number): number => {
  return celsius * 1.8 + 32;
};

export default function Dashboard() {
  const [data, setData] = useState<TelemetryPayload | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [history, setHistory] = useState<TelemetryHistoryPoint[]>([]);
  const [packetCount, setPacketCount] = useState<number>(0);

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

      const currentTempF = toFahrenheit(payload.sensors.environment.temp_c);

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            timeLabel,
            tempF: currentTempF,
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
          {connected ? "Receiving Live Sensor Data..." : "Waiting for Hardware to Connect"}
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
          Listening on port 8081 for incoming sensor updates from your research unit
        </p>
      </div>
    );
  }

  const { system, radio, sensors } = data;
  const { environment, mpr121, mpu6050 } = sensors;

  // Real-time calculations in Fahrenheit
  const tempF = toFahrenheit(environment.temp_c);
  const coldBaselineF = 72.0;
  const isColdDrop = tempF < coldBaselineF;

  // Plain language alert states
  const isKineticAlert = mpu6050.peak_g > system.geo_threshold_g;
  const isRemActive = mpr121.capacitance > 120;

  // SVG trend chart generator
  const renderTrendPath = (
    points: TelemetryHistoryPoint[],
    key: "tempF" | "peakG" | "capacitance",
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

  // Temperature chart limits in Fahrenheit (60°F to 90°F)
  const tempMin = 60;
  const tempMax = 90;
  const tempPolyline = renderTrendPath(history, "tempF", 400, 110, tempMin, tempMax);

  const seismicMax = Math.max(0.5, ...history.map((h) => h.peakG));
  const seismicPolyline = renderTrendPath(history, "peakG", 400, 110, 0, seismicMax);

  // Capacitance percentage for radar
  const capPercent = Math.min(100, Math.round((mpr121.capacitance / 220) * 100));

  // Device level / tilt dot mapping
  const targetX = 50 + Math.max(-42, Math.min(42, mpu6050.accel.x * 6));
  const targetY = 50 - Math.max(-42, Math.min(42, mpu6050.accel.y * 6));
  const isBoxFlat = Math.abs(mpu6050.accel.x) < 1.5 && Math.abs(mpu6050.accel.y) < 1.5;

  // Radio frequency band preview
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
          <div style={dashStyles.subHeaderTag}>Live Field Equipment Monitoring</div>
          <h1 style={dashStyles.title}>Sensor Monitor Dashboard</h1>
        </div>

        <div style={dashStyles.statusCluster}>
          <div style={dashStyles.statusPill}>
            <span style={dashStyles.pillLabel}>STATUS:</span>
            <span style={{ fontWeight: 600, color: "var(--accent-emerald)" }}>
              {connected ? `Live (${hzRate}/sec)` : "Disconnected"}
            </span>
          </div>

          <div style={dashStyles.statusPill}>
            <span style={dashStyles.pillLabel}>LOGGED:</span>
            <span style={{ fontWeight: 600, fontFamily: "monospace" }}>
              {packetCount.toLocaleString()} readings
            </span>
          </div>

          <div style={dashStyles.statusPill}>
            <span style={dashStyles.pillLabel}>MODE:</span>
            <span style={{ fontWeight: 600, color: "var(--accent-primary)" }}>
              {SIMPLE_MODES[system.active_mode] || "Multi-Sensor"}
            </span>
          </div>
        </div>
      </div>

      {/* TOP SUMMARY CARDS (PLAIN ENGLISH) */}
      <div style={dashStyles.kpiGrid}>
        {/* ROOM TEMPERATURE */}
        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>Room Temperature</div>
          <div
            style={{
              ...dashStyles.kpiValue,
              color: isColdDrop ? "var(--accent-cyan)" : "var(--text-primary)",
            }}
          >
            {tempF.toFixed(1)}°F
          </div>
          <div style={dashStyles.kpiFootnote}>
            {isColdDrop
              ? "Cold Spot Detected: Below 72.0°F baseline"
              : "Normal: Temperature is holding steady"}
          </div>
        </div>

        {/* PROXIMITY SENSOR (REM) */}
        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>Proximity Energy (REM)</div>
          <div
            style={{
              ...dashStyles.kpiValue,
              color: isRemActive ? "var(--accent-amber)" : "var(--text-primary)",
            }}
          >
            {capPercent}%
          </div>
          <div style={dashStyles.kpiFootnote}>
            {isRemActive
              ? "Alert: Presence or hand detected near antenna"
              : "Clear: Nothing detected near the antenna"}
          </div>
        </div>

        {/* VIBRATION & SHOCK */}
        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>Vibration & Movement</div>
          <div
            style={{
              ...dashStyles.kpiValue,
              color: isKineticAlert ? "var(--accent-rose)" : "var(--text-primary)",
            }}
          >
            {isKineticAlert ? "Movement!" : "Still"}
          </div>
          <div style={dashStyles.kpiFootnote}>
            {isKineticAlert
              ? `Vibration trigger: ${mpu6050.peak_g.toFixed(3)} G force detected`
              : "Surface is still: No footsteps or bumps detected"}
          </div>
        </div>

        {/* SPIRIT BOX RADIO */}
        <div style={dashStyles.kpiCard}>
          <div style={dashStyles.kpiTitle}>Spirit Box Radio Channel</div>
          <div style={{ ...dashStyles.kpiValue, color: "var(--accent-primary)" }}>
            {radio.frequency.toFixed(1)}{" "}
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>FM</span>
          </div>
          <div style={dashStyles.kpiFootnote}>Scanning rapidly across local broadcast stations</div>
        </div>
      </div>

      {/* DETAILED DIAGRAMS WITH LAYMAN EXPLANATIONS */}
      <div style={dashStyles.chartsGrid}>
        {/* CHART 1: TEMPERATURE TREND IN FAHRENHEIT */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>Temperature Tracker (Cold Spot Watch)</div>
              <div style={dashStyles.cardSectionSubtitle}>
                Watches for sudden unexplained cold spots in the room over the last 2 minutes
              </div>
            </div>
            <div style={dashStyles.chipGroup}>
              <span style={dashStyles.metricPill}>
                Humidity: {environment.humidity_pct.toFixed(0)}%
              </span>
              <span style={dashStyles.metricPill}>
                Pressure: {environment.pressure_hpa.toFixed(0)} hPa
              </span>
            </div>
          </div>

          <div style={dashStyles.svgWrapper}>
            <svg
              viewBox="0 0 400 110"
              style={{ width: "100%", height: "140px", overflow: "visible" }}
              preserveAspectRatio="none"
            >
              {/* Background grid */}
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

              {/* Cold Spot Reference Line at 72.0°F */}
              {(() => {
                const markY = 110 - ((coldBaselineF - tempMin) / (tempMax - tempMin)) * 110;
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
                      Cold Anomaly Line (72.0°F)
                    </text>
                  </g>
                );
              })()}

              {/* Live Temperature Polyline in Fahrenheit */}
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
            <span>Earliest Reading</span>
            <span>CURRENT: {tempF.toFixed(1)}°F</span>
            <span>Right Now</span>
          </div>

          <div style={dashStyles.laymanNote}>
            <strong>What this means:</strong> Spirits are reported to draw thermal energy from the
            air. A sudden dip below the blue line indicates an active cold spot.
          </div>
        </div>

        {/* CHART 2: VIBRATION MONITOR */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>Floor & Table Vibration Monitor</div>
              <div style={dashStyles.cardSectionSubtitle}>
                Measures physical knocks, footsteps, or table bumps in real time
              </div>
            </div>
            <span
              style={{
                ...dashStyles.metricPill,
                color: isKineticAlert ? "var(--accent-rose)" : "var(--accent-emerald)",
              }}
            >
              {isKineticAlert ? "Vibration Alert!" : "Status: Calm"}
            </span>
          </div>

          <div style={dashStyles.svgWrapper}>
            <svg
              viewBox="0 0 400 110"
              style={{ width: "100%", height: "140px", overflow: "visible" }}
              preserveAspectRatio="none"
            >
              {/* Trigger Threshold Line */}
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
                      Alert Trigger Line ({system.geo_threshold_g.toFixed(2)} G)
                    </text>
                  </g>
                );
              })()}

              {/* Vibration Line */}
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
            <span>Still (0.0 G)</span>
            <span>FORCE DETECTED: {mpu6050.peak_g.toFixed(3)} G</span>
            <span>Max Spike: {seismicMax.toFixed(2)} G</span>
          </div>

          <div style={dashStyles.laymanNote}>
            <strong>What this means:</strong> The line stays flat when the room is peaceful. Any
            heavy footsteps, door slams, or knocks create an upward spike.
          </div>
        </div>

        {/* DIAGRAM 3: PROXIMITY RADAR (REM-POD) */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>Antenna Proximity Radar (REM-Pod)</div>
              <div style={dashStyles.cardSectionSubtitle}>
                Detects static electrical fields and bodies approaching the antenna
              </div>
            </div>
            <span
              style={{
                ...dashStyles.metricPill,
                color: isRemActive ? "var(--accent-amber)" : "var(--text-secondary)",
              }}
            >
              Signal Strength: {capPercent}%
            </span>
          </div>

          <div style={dashStyles.radarContainer}>
            <div style={dashStyles.radarCircleWrapper}>
              <svg viewBox="0 0 100 100" style={{ width: "110px", height: "110px" }}>
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

                {/* Radiating wave expands with signal strength */}
                <circle
                  cx="50"
                  cy="50"
                  r={Math.max(8, (capPercent / 100) * 44)}
                  fill="none"
                  stroke={isRemActive ? "var(--accent-amber)" : "var(--accent-primary)"}
                  strokeWidth="2.5"
                  opacity={isRemActive ? 0.9 : 0.4}
                />
              </svg>
            </div>

            <div style={dashStyles.radarMetricsSide}>
              <div style={dashStyles.segmentBarContainer}>
                {[
                  { lvl: 1, label: "Clear", color: "var(--accent-emerald)" },
                  { lvl: 2, label: "Faint", color: "var(--accent-cyan)" },
                  { lvl: 3, label: "Near", color: "var(--accent-amber)" },
                  { lvl: 4, label: "Close", color: "var(--accent-amber)" },
                  { lvl: 5, label: "Touch", color: "var(--accent-rose)" },
                ].map((item) => {
                  const active = mpr121.capacitance >= item.lvl * 38;
                  return (
                    <div
                      key={item.lvl}
                      style={{
                        ...dashStyles.segmentBlock,
                        backgroundColor: active ? item.color : "var(--bg-surface-elevated)",
                        borderColor: active ? item.color : "var(--border-default)",
                        color: active ? "#ffffff" : "var(--text-muted)",
                      }}
                    >
                      {item.label}
                    </div>
                  );
                })}
              </div>

              <div style={dashStyles.metricFootnotes}>
                <div>
                  <strong>Antenna Status:</strong> Calibrated and searching
                </div>
                <div>
                  <strong>Field Reading:</strong>{" "}
                  {isRemActive ? "Activity detected near antenna!" : "Field is clear and calm"}
                </div>
              </div>
            </div>
          </div>

          <div style={dashStyles.laymanNote}>
            <strong>What this means:</strong> Functions like a standard REM-Pod. As energy or a hand
            gets closer to the antenna, the lights progress from green to red.
          </div>
        </div>

        {/* DIAGRAM 4: DEVICE LEVEL & RADIO SWEEP */}
        <div style={dashStyles.chartCard}>
          <div style={dashStyles.cardHeaderRow}>
            <div>
              <div style={dashStyles.cardSectionTitle}>Equipment Position & Spirit Box Scanner</div>
              <div style={dashStyles.cardSectionSubtitle}>
                Confirms the device is flat and shows the active radio frequency sweep
              </div>
            </div>
            <span style={dashStyles.metricPill}>{radio.frequency.toFixed(1)} MHz</span>
          </div>

          <div style={dashStyles.gyroAndRfContainer}>
            {/* Level Bubble Crosshair */}
            <div style={dashStyles.gyroCol}>
              <div style={dashStyles.colTitle}>Device Level (Bubble Level)</div>
              <svg viewBox="0 0 100 100" style={{ width: "100px", height: "100px" }}>
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="var(--bg-surface-elevated)"
                  stroke="var(--border-default)"
                  strokeWidth="1"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="16"
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeDasharray="2 2"
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

                {/* Level Dot */}
                <circle
                  cx={targetX}
                  cy={targetY}
                  r="6"
                  fill={isBoxFlat ? "var(--accent-emerald)" : "var(--accent-rose)"}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              </svg>
              <div style={dashStyles.axisCoords}>
                {isBoxFlat ? "Station is Sitting Flat" : "Station is Tilted or Moving"}
              </div>
            </div>

            {/* Radio Frequency Spectrum Bars */}
            <div style={dashStyles.rfCol}>
              <div style={dashStyles.colTitle}>FM Radio Station Sweep</div>
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
              <div style={dashStyles.rfStatusText}>Sweeping 10 channels every second</div>
            </div>
          </div>

          <div style={dashStyles.laymanNote}>
            <strong>What this means:</strong> The left bubble shows if someone moved or bumped the
            equipment box. The right bars show the spirit box scanning for voices.
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
    fontSize: "1.75rem",
    fontWeight: 700,
    fontFamily: "monospace",
    margin: "6px 0 2px 0",
  },
  kpiFootnote: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    marginTop: "4px",
    lineHeight: 1.4,
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
    gap: "10px",
  },
  cardHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "8px",
  },
  cardSectionTitle: {
    fontSize: "0.95rem",
    fontWeight: 700,
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
  laymanNote: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    backgroundColor: "var(--bg-surface-elevated)",
    borderLeft: "3px solid var(--accent-primary)",
    padding: "6px 10px",
    borderRadius: "0 4px 4px 0",
    marginTop: "4px",
    lineHeight: 1.4,
  },
  radarContainer: {
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
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
    gap: "10px",
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
    fontWeight: 700,
    border: "1px solid",
    transition: "all 0.15s ease",
  },
  metricFootnotes: {
    fontSize: "0.75rem",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
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
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--text-primary)",
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
