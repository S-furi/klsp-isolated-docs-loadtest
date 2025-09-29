import ws from "k6/ws";
import { check } from "k6";
import {
    MAX_LATENCY_MS,
    WS_HOST,
    retrieveOptions,
    setupWSCompletionClient,
} from "./testUtils.js";

export const options = retrieveOptions(100, 150, {
    latency: [`p(95)<${MAX_LATENCY_MS}`],
});

export default function() {
    const params = { headers: { "Content-Type": "application/json" } };
    const res = ws.connect(WS_HOST, params, (socket) => {
        socket.on("open", () => {
            setupWSCompletionClient(socket, { delayMin: 0.2, delayMax: 2 });
        });

        socket.on("error", (e) => {
            console.error(`WebSocket error: ${e.error()}`);
        });
    });

    check(res, { connected: (r) => r && r.status === 101 })
}
