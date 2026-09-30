import { useEffect, useState } from "react";
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

const MODES: Record<number, string> = {
  1: "RF Sweep (Spirit Box)",
  2: "Proximity (REM-Pod)",
  3: "Seismic (Geophone)",
  4: "Dictionary ITC (Alice)",
};

export default function Dashboard() {
  const [data, setData] = useState<TelemetryPayload | null>(null);
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    // Dynamically target the host IP rather than hardcoded localhost
    const socketUrl =
      window.location.port === "5173" ? `http://${window.location.hostname}:3030` : "/";

    const socket = io(socketUrl);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("sensor_update", (payload: TelemetryPayload) => setData(payload));

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!data) {
    return (
      <div style={dashStyles.emptyState}>
        <div style={dashStyles.spinner} />
        <h3 style={{ margin: "1rem 0 0.25rem 0", fontWeight: 600 }}>
          {connected ? "Awaiting Telemetry Packet" : "Connecting to Hardware Bridge"}
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
          Listening on TCP Port 8081 for incoming ESP32 transmissions
        </p>
      </div>
    );
  }

  const { system, radio, sensors } = data;
  const { environment, mpr121, mpu6050 } = sensors;

  const isColdDrop = environment.temp_c < 24.5;
  const isKineticAlert = mpu6050.peak_g > system.geo_threshold_g;
  const isRemActive = mpr121.capacitance > 120;

  return (
    <div style={dashStyles.container}>
      {/* HEADER SECTION */}
      <div style={dashStyles.header}>
        <div>
          <h2 style={dashStyles.pageTitle}>Sensor Telemetry</h2>
          <div style={dashStyles.pageSubtitle}>
            Live hardware readings from field instrumentation
          </div>
        </div>

        <div style={dashStyles.headerBadges}>
          <div style={dashStyles.badge}>
            <span style={{ color: "var(--text-muted)" }}>Mode:</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {MODES[system.active_mode] || "Multi-Sensor"}
            </span>
          </div>

          <div style={dashStyles.badge}>
            <span style={{ color: "var(--text-muted)" }}>Status:</span>
            <span style={{ fontWeight: 600, color: "var(--accent-emerald)" }}>Connected</span>
          </div>
        </div>
      </div>

      {/* METRIC GRID */}
      <div style={dashStyles.grid}>
        {/* CARD 1: ENVIRONMENTAL (BME280) */}
        <div style={dashStyles.card}>
          <div style={dashStyles.cardHeader}>
            <span style={dashStyles.cardTitle}>Atmospheric Environment</span>
            <span style={dashStyles.sensorChip}>BME280</span>
          </div>

          <div style={dashStyles.metricHero}>
            <span
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                fontFamily: "monospace",
                color: isColdDrop ? "var(--accent-cyan)" : "var(--text-primary)",
              }}
            >
              {environment.temp_c.toFixed(1)}°C
            </span>
            <span style={dashStyles.metricLabel}>Ambient Temperature</span>
          </div>

          <div style={dashStyles.dataRows}>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Barometric Pressure</span>
              <span style={dashStyles.rowVal}>{environment.pressure_hpa.toFixed(1)} hPa</span>
            </div>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Relative Humidity</span>
              <span style={dashStyles.rowVal}>{environment.humidity_pct.toFixed(1)}%</span>
            </div>
          </div>

          <div
            style={{
              ...dashStyles.cardFooter,
              color: isColdDrop ? "var(--accent-cyan)" : "var(--text-muted)",
            }}
          >
            {isColdDrop ? "Rapid ambient thermal drop observed" : "Atmospheric conditions stable"}
          </div>
        </div>

        {/* CARD 2: CAPACITIVE PROXIMITY (MPR121) */}
        <div style={dashStyles.card}>
          <div style={dashStyles.cardHeader}>
            <span style={dashStyles.cardTitle}>Capacitive Proximity</span>
            <span style={dashStyles.sensorChip}>MPR121</span>
          </div>

          <div style={dashStyles.metricHero}>
            <span
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                fontFamily: "monospace",
                color: isRemActive ? "var(--accent-amber)" : "var(--text-primary)",
              }}
            >
              {mpr121.capacitance}
            </span>
            <span style={dashStyles.metricLabel}>Signal Level</span>
          </div>

          <div style={dashStyles.dataRows}>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Sensitivity Level</span>
              <span style={dashStyles.rowVal}>{system.rem_sensitivity_lvl} of 5</span>
            </div>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Electrode Pad Mask</span>
              <span style={dashStyles.rowVal}>0x{mpr121.pad_mask.toString(16).toUpperCase()}</span>
            </div>
          </div>

          <div
            style={{
              ...dashStyles.cardFooter,
              color: isRemActive ? "var(--accent-amber)" : "var(--text-muted)",
            }}
          >
            {isRemActive ? "Proximity field threshold exceeded" : "No field disturbance registered"}
          </div>
        </div>

        {/* CARD 3: KINEMATICS & VIBRATION (MPU6050) */}
        <div style={dashStyles.card}>
          <div style={dashStyles.cardHeader}>
            <span style={dashStyles.cardTitle}>Kinematics & Surface Impact</span>
            <span style={dashStyles.sensorChip}>MPU6050</span>
          </div>

          <div style={dashStyles.metricHero}>
            <span
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                fontFamily: "monospace",
                color: isKineticAlert ? "var(--accent-rose)" : "var(--text-primary)",
              }}
            >
              {mpu6050.peak_g.toFixed(3)} G
            </span>
            <span style={dashStyles.metricLabel}>Peak Impact Force</span>
          </div>

          <div style={dashStyles.dataRows}>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Alarm Threshold</span>
              <span style={dashStyles.rowVal}>{system.geo_threshold_g.toFixed(2)} G</span>
            </div>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Vector Coordinates</span>
              <span style={dashStyles.rowVal}>
                {mpu6050.accel.x.toFixed(1)}, {mpu6050.accel.y.toFixed(1)},{" "}
                {mpu6050.accel.z.toFixed(1)}
              </span>
            </div>
          </div>

          <div
            style={{
              ...dashStyles.cardFooter,
              color: isKineticAlert ? "var(--accent-rose)" : "var(--text-muted)",
            }}
          >
            {isKineticAlert ? "Vibrational baseline breach registered" : "Surface vibration quiet"}
          </div>
        </div>

        {/* CARD 4: RF AUDIO SWEEP */}
        <div style={dashStyles.card}>
          <div style={dashStyles.cardHeader}>
            <span style={dashStyles.cardTitle}>Acoustic RF Sweep</span>
            <span style={dashStyles.sensorChip}>TEA5767</span>
          </div>

          <div style={dashStyles.metricHero}>
            <span
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                fontFamily: "monospace",
                color: "var(--accent-primary)",
              }}
            >
              {radio.frequency.toFixed(1)} MHz
            </span>
            <span style={dashStyles.metricLabel}>Current FM Carrier</span>
          </div>

          <div style={dashStyles.dataRows}>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Scan Mode</span>
              <span style={dashStyles.rowVal}>Forward Step (100ms)</span>
            </div>
            <div style={dashStyles.row}>
              <span style={dashStyles.rowLabel}>Last Synchronization</span>
              <span style={dashStyles.rowVal}>{new Date(data.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>

          <div style={dashStyles.cardFooter}>Radio receiver sweeping carrier frequencies</div>
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
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "12px",
    borderBottom: "1px solid var(--border-default)",
    paddingBottom: "1rem",
  },
  pageTitle: {
    fontSize: "1.4rem",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "-0.3px",
  },
  pageSubtitle: {
    fontSize: "0.85rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  headerBadges: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "0.8rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: "1rem",
    width: "100%",
  },
  card: {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "8px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    boxShadow: "var(--card-shadow)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  sensorChip: {
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "var(--bg-surface-elevated)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
    fontFamily: "monospace",
  },
  metricHero: {
    display: "flex",
    flexDirection: "column",
    margin: "0.25rem 0",
  },
  metricLabel: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    marginTop: "2px",
  },
  dataRows: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    borderTop: "1px solid var(--border-subtle)",
    paddingTop: "8px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.8rem",
  },
  rowLabel: {
    color: "var(--text-secondary)",
  },
  rowVal: {
    fontWeight: 600,
    fontFamily: "monospace",
  },
  cardFooter: {
    fontSize: "0.75rem",
    marginTop: "auto",
    paddingTop: "6px",
    borderTop: "1px solid var(--border-subtle)",
  },
  emptyState: {
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
  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid var(--border-default)",
    borderTop: "3px solid var(--accent-primary)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};
