import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

interface Device {
  id: string;
  name: string;
  status: string;
  lastSeen: string;
  createdAt: string;
}

export default function Dashboard() {
  const { token, logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/devices", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          logout();
          throw new Error("Session expired. Please log in again.");
        }
        if (!res.ok) throw new Error("Failed to fetch data");
        return res.json();
      })
      .then((data) => setDevices(data))
      .catch((err) => setError(err.message));
  }, [token, logout]);

  return (
    <div>
      <h2 style={{ borderBottom: "1px solid #333", paddingBottom: "1rem" }}>Telemetry Dashboard</h2>
      {error && <p style={{ color: "#ff4444", marginTop: "2rem" }}>Error: {error}</p>}

      <div style={{ marginTop: "2rem" }}>
        <h3>Registered Sensor Nodes</h3>

        {devices.length === 0 ? (
          <p style={{ color: "#888" }}>No devices found or awaiting network connection.</p>
        ) : (
          <table
            style={{
              width: "100%",
              textAlign: "left",
              borderCollapse: "collapse",
              border: "1px solid #00ffcc",
              marginTop: "1rem",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #00ffcc", backgroundColor: "#0f0f0f" }}>
                <th style={{ padding: "12px" }}>Node Name</th>
                <th style={{ padding: "12px" }}>Status</th>
                <th style={{ padding: "12px" }}>Last Seen</th>
                <th style={{ padding: "12px" }}>Hardware ID</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "12px", fontWeight: "bold" }}>{device.name}</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ color: device.status === "offline" ? "#ffaa00" : "#00ffcc" }}>
                      ● {device.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "12px" }}>{new Date(device.lastSeen).toLocaleString()}</td>
                  <td style={{ padding: "12px", fontSize: "0.85em", color: "#666" }}>
                    {device.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
