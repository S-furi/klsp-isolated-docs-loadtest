import ws from "k6/ws";
import { check } from "k6";
import {
    MAX_LATENCY_MS,
    WS_HOST,
    retrieveOptionsForRandomLoadTest, setupWSCompletionClient,
} from "./testUtils.js";

export const options = retrieveOptionsForRandomLoadTest(250, 600, {
  latency: [`p(95)<${MAX_LATENCY_MS}`],
});

export default function() {
    const params = { headers: { "Content-Type": "application/json" } };

    const res = ws.connect(WS_HOST, params, function (socket) {
        socket.on("open", () => {
            setupWSCompletionClient(socket, { delayMin: 0.1, delayMax: 0.4 });
        });

        socket.on("error", (e) => {
            console.error(`WebSocket error: ${e.error()}`);
        });
    });

    check(res, { connected: (r) => r && r.status === 101 });
}
