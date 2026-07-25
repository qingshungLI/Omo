import { server } from "../backend/src/server.js";

const requestHandler = server.listeners("request")[0];

if (typeof requestHandler !== "function") {
  throw new Error("Recallo HTTP request handler is unavailable.");
}

export default requestHandler;
