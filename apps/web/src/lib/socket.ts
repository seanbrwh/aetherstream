import { io, Socket } from "socket.io-client";

let socketInstance: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socketInstance) {
    const socketUrl =
      window.location.port === "5173" ? `http://${window.location.hostname}:3030` : "/";

    socketInstance = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketInstance.on("connect", () => {
      console.log("[AetherStream Socket] Connected successfully. Socket ID:", socketInstance?.id);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("[AetherStream Socket] Disconnected. Reason:", reason);
    });
  }

  return socketInstance;
};
