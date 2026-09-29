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
  1: "SPIRIT BOX",
  2: "REM POD",
  3: "GEOPHONE",
  4: "ALICE BOX",
};

export default function Dashboard() {
  const [data, setData] = useState<TelemetryPayload | null>(null);
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    // Connect to the API server depending on whether running in Vite dev or production
    const socketUrl = window.location.port === "5173" ? "http://localhost:3030" : "/";
    const socket = io(socketUrl);

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("sensor_update", (payload: TelemetryPayload) => {
      setData(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (!data) {
    return (
      <div style={styles.loading}>
        <h2>
          {connected
            ? "Awaiting AetherStream Hardware Telemetry..."
            : "Connecting to AetherStream Socket Bridge..."}
        </h2>
        <div style={styles.spinner}></div>
        <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.9rem" }}>
          TCP Ingestion Active on Port 8081. Transmit JSON payload from ESP32 node to initiate
          telemetry link.
        </p>
      </div>
    );
  }

  const { system, radio, sensors } = data;
  const { environment, mpr121, mpu6050 } = sensors;

  const isKineticAlert = mpu6050.peak_g > system.geo_threshold_g;
  const isThermalAlert = environment.temp_c < 24.5;

  return (
    <div style={styles.container}>
      <header style={styles.topBar}>
        <div>
          <h1 style={styles.title}>AETHER OS TELEMETRY</h1>
          <span style={connected ? styles.statusOnline : styles.statusOffline}>
            {connected ? "● LIVE STREAM" : "○ OFFLINE"}
          </span>
        </div>
        <div style={styles.activeMode}>
          MODE: <span style={styles.highlight}>{MODES[system.active_mode] || "UNKNOWN"}</span>
        </div>
      </header>

      <div style={styles.grid}>
        {/* Environmental Card */}
        <div
          style={{
            ...styles.card,
            ...(isThermalAlert ? styles.cardAlert : {}),
          }}
        >
          <h3 style={styles.cardHeader}>ENVIRONMENTAL (BME280)</h3>
          <div style={styles.dataRow}>
            <span>Temperature</span>
            <span style={styles.value}>{environment.temp_c.toFixed(1)} °C</span>
          </div>
          <div style={styles.dataRow}>
            <span>Humidity</span>
            <span style={styles.value}>{environment.humidity_pct.toFixed(1)} %</span>
          </div>
          <div style={styles.dataRow}>
            <span>Pressure</span>
            <span style={styles.value}>{environment.pressure_hpa.toFixed(1)} hPa</span>
          </div>
        </div>

        {/* Electromagnetic Card */}
        <div style={styles.card}>
          <h3 style={styles.cardHeader}>ELECTROMAGNETIC (MPR121)</h3>
          <div style={styles.dataRow}>
            <span>Capacitance Level</span>
            <span style={styles.value}>{mpr121.capacitance}</span>
          </div>
          <div style={styles.dataRow}>
            <span>Sensitivity Lvl</span>
            <span style={styles.value}>{system.rem_sensitivity_lvl} / 5</span>
          </div>
          <div style={styles.dataRow}>
            <span>Pad Mask (Hex)</span>
            <span style={styles.value}>0x{mpr121.pad_mask.toString(16).toUpperCase()}</span>
          </div>
        </div>

        {/* Kinematics Card */}
        <div
          style={{
            ...styles.card,
            ...(isKineticAlert ? styles.cardAlert : {}),
          }}
        >
          <h3 style={styles.cardHeader}>KINEMATICS (MPU6050)</h3>
          <div style={styles.dataRow}>
            <span>Peak Impact</span>
            <span
              style={{
                ...styles.value,
                ...(isKineticAlert ? styles.textAlert : {}),
              }}
            >
              {mpu6050.peak_g.toFixed(3)} G
            </span>
          </div>
          <div style={styles.dataRow}>
            <span>Threshold</span>
            <span style={styles.value}>{system.geo_threshold_g.toFixed(2)} G</span>
          </div>
          <div style={styles.dataRow}>
            <span>Raw Accel (X,Y,Z)</span>
            <span style={styles.subValue}>
              {mpu6050.accel.x.toFixed(2)}, {mpu6050.accel.y.toFixed(2)},{" "}
              {mpu6050.accel.z.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Radio & System Card */}
        <div style={styles.card}>
          <h3 style={styles.cardHeader}>RADIO FREQUENCY & SYSTEM</h3>
          <div style={styles.dataRow}>
            <span>Current Channel</span>
            <span style={styles.value}>{radio.frequency.toFixed(1)} FM</span>
          </div>
          <div style={styles.dataRow}>
            <span>Scan Rate</span>
            <span style={styles.value}>Dynamic</span>
          </div>
          <div style={styles.dataRow}>
            <span>Last Telemetry Sync</span>
            <span style={styles.subValue}>{new Date(data.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#0a0a0c",
    color: "#e2e8f0",
    minHeight: "80vh",
    padding: "1rem",
    fontFamily: "'Courier New', Courier, monospace",
  },
  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    backgroundColor: "#0a0a0c",
    color: "#00ffcc",
    fontFamily: "'Courier New', Courier, monospace",
    textAlign: "center",
  },
  spinner: {
    marginTop: "20px",
    width: "40px",
    height: "40px",
    border: "4px solid rgba(0, 255, 204, 0.2)",
    borderTop: "4px solid #00ffcc",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #333",
    paddingBottom: "1rem",
    marginBottom: "2rem",
  },
  title: {
    margin: 0,
    fontSize: "1.8rem",
    fontWeight: "bold",
    letterSpacing: "2px",
    color: "#ffffff",
  },
  statusOnline: {
    color: "#00ffcc",
    fontWeight: "bold",
    fontSize: "0.9rem",
    textShadow: "0 0 8px rgba(0,255,204,0.5)",
  },
  statusOffline: {
    color: "#ff3333",
    fontWeight: "bold",
    fontSize: "0.9rem",
  },
  activeMode: {
    fontSize: "1rem",
    backgroundColor: "#1a1a24",
    padding: "8px 16px",
    borderRadius: "4px",
    border: "1px solid #444",
  },
  highlight: {
    color: "#b48ead",
    fontWeight: "bold",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "1.5rem",
  },
  card: {
    backgroundColor: "#111116",
    border: "1px solid #2a2a35",
    borderRadius: "6px",
    padding: "1.5rem",
  },
  cardAlert: {
    border: "1px solid #ff3333",
    boxShadow: "0 0 15px rgba(255, 51, 51, 0.2)",
  },
  cardHeader: {
    margin: "0 0 1rem 0",
    color: "#64748b",
    fontSize: "0.95rem",
    borderBottom: "1px solid #2a2a35",
    paddingBottom: "0.5rem",
  },
  dataRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.8rem",
    fontSize: "0.95rem",
  },
  value: {
    fontSize: "1.15rem",
    fontWeight: "bold",
    color: "#00ffcc",
  },
  subValue: {
    fontSize: "0.85rem",
    color: "#94a3b8",
  },
  textAlert: {
    color: "#ff3333",
    textShadow: "0 0 8px rgba(255,51,51,0.6)",
  },
};
