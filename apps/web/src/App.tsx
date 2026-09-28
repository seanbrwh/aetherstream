import { useEffect, useState } from "react";

function App() {
  const [apiStatus, setApiStatus] = useState<string>("Pinging Node API...");

  useEffect(() => {
    fetch("/api/health")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Health check failed (${res.status})`);
        }
        return res.json() as Promise<{ timestamp: string }>;
      })
      .then((data) => {
        setApiStatus(`Connected! Server Time: ${data.timestamp}`);
      })
      .catch((err) => {
        console.error(err);
        setApiStatus("Failed to connect to Node API.");
      });
  }, []);

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "monospace",
        background: "#1a1a1a",
        color: "#00ffcc",
        minHeight: "100vh",
      }}
    >
      <h1>AetherStream Dashboard</h1>
      <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #00ffcc" }}>
        <p>
          <strong>Backend Status:</strong> {apiStatus}
        </p>
      </div>
    </div>
  );
}

export default App;
