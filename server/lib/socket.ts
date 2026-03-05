import { Server } from "socket.io";

// Singleton io instance, initialized by server/index.ts
let _io: Server | null = null;

export function setIo(instance: Server): void {
  _io = instance;
}

export function getIo(): Server {
  if (!_io) {
    throw new Error("Socket.io has not been initialized yet");
  }
  return _io;
}
