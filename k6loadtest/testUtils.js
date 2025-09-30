import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

export const MAX_LATENCY_MS = 2000;
export const MAX_COMPLETION_FAILURE_RATE = 0.1;

export function retrieveOptions(minClients, maxClients, thresholds) {
  return {
    scenarios: {
      loading_test: {
        executor: "ramping-vus",
        stages: [
          { duration: "10s", target: minClients },
          { duration: "1m", target: minClients },
          { duration: "5s", target: maxClients },
          { duration: "1m", target: maxClients },
          { duration: "10s", target: 0 },
        ],
        gracefulRampDown: "10s",
      },
    },
    thresholds: {
      completion_failure_rate: [`rate<${MAX_COMPLETION_FAILURE_RATE}`],
      ...thresholds,
    },
  };
}

export function retrieveOptionsForRandomLoadTest(
  maxNumClient,
  testDuration,
  thresholds,
) {
  const stages = generateStage(maxNumClient, testDuration);
  const scenarios = {};
  let offsetSeconds = 0;

  stages.forEach((stage, idx) => {
    const duration = parseInt(String(stage.duration).replace("s", ""));
    scenarios[`loading_test_${idx}`] = {
      executor: "constant-vus",
      vus: stage.target,
      duration: stage.duration,
      startTime: `${offsetSeconds}s`,
      gracefulStop: "0s",
    };
    offsetSeconds += duration;
  });

  return {
    scenarios,
    thresholds: {
      completion_failure_rate: [`rate<${MAX_COMPLETION_FAILURE_RATE}`],
      ...thresholds,
    },
  };
}

export const MIN_STEP_DURATION = 5;
export const MAX_STEP_DURATION = 20;

export function generateStage(maxVus, duration) {
  const stages = [];
  let timeLeft = duration;

  while (timeLeft > 0) {
    const stageDuration = Math.min(
      timeLeft,
      Math.floor(randomInRange(MIN_STEP_DURATION, MAX_STEP_DURATION)),
    );
    const target = Math.floor(randomInRange(10, maxVus));

    stages.push({ duration: `${stageDuration}s`, target });
    timeLeft -= stageDuration;
  }
  return stages;
}

export const REST_LSP_HOST = "http://localhost:8080/api/compiler/lsp/complete";
export const REST_COMPILER_HOST = "http://localhost:8080/api/compiler/complete";
export const WS_HOST = "ws://localhost:8080/lsp/complete";
export const latency = new Trend("latency");
export const completionFailures = new Counter("completion_failures");
export const completionFailureRate = new Rate("completion_failure_rate");

const completionScenarios = [
  {
    snippet: "fun main() {\n    3.0.toIn\n}",
    line: 1,
    ch: 12,
    expected: ["toInt", "toUInt"],
  },
  {
    snippet: 'fun main() {\n    "hello".lower\n}',
    line: 1,
    ch: 15,
    expected: ["lowercase"],
  },
  {
    snippet: "fun main() {\n    listOf(1,2,3).fir\n}",
    line: 1,
    ch: 21,
    expected: ["first", "firstOrNull"],
  },
  {
    snippet: "fun main() {\n    val sb = StringBuilder()\n    sb.app\n}",
    line: 2,
    ch: 10,
    expected: ["append", "appendLine", "appendRange"],
  },
  {
    snippet: 'fun main() {\n    val m = mapOf(1 to "a")\n    m.con\n}',
    line: 2,
    ch: 9,
    expected: ["containsKey", "containsValue", "contains"],
  },
  {
    snippet: "fun main() {\n    sequenceOf(1,2,3).map\n}",
    line: 1,
    ch: 25,
    expected: ["map", "mapIndexed", "mapNotNull"],
  },
  {
    snippet: "fun main() {\n    val s: String? = null\n    s?.let\n}",
    line: 2,
    ch: 9,
    expected: ["let"],
  },
  {
    snippet: "fun main() {\n    val xs = listOf(1,2,3)\n    xs.fil\n}",
    line: 2,
    ch: 10,
    expected: ["filter", "filterNot", "filterIndexed"],
  },
];

export function getRandomCompletionScenario() {
  return {
    filename: `${crypto.randomUUID()}.kt`,
    ...completionScenarios[
      Math.floor(Math.random() * completionScenarios.length)
    ],
  };
}

/**
 * Check if at least one expected completion is present in the response.
 * Logs missing completions for debugging.
 *
 * @param {string[]} response - list of raw completion labels
 * @param {string[]} expected - list of expected completions
 * @param {string} codeSnippet - the code snippet tested (for logging)
 * @param {number} elapsedTime - the time passed for tests that do not include request time (e.g. WS)
 * @returns {boolean} true if at least one expected completion found
 */
export function checkCompletionResponse(
  response,
  expected,
  codeSnippet,
  elapsedTime,
) {
  const completions = response.map((t) => t.replace("(", "").replace(")", ""));

  const found = expected.filter((exp) => completions.includes(exp));
  const missing = expected.filter((exp) => !completions.includes(exp));

  let ok = found.length > 0; // at least one completion is ok

  check(completions, {
    "completions contains at least one expected completion": () => ok,
  });

  if (elapsedTime) {
    check(completions, {
      [`completions < ${MAX_LATENCY_MS}ms`]: () => elapsedTime < MAX_LATENCY_MS,
    });
  }

  if (!ok) {
    // console.error(
    //   `No expected completions found!\n` +
    //     `expected: ${expected.join(", ")}\n` +
    //     `got: ${completions}\n` +
    //     `for code:\n${codeSnippet}`,
    // );
    completionFailures.add(1);
    completionFailureRate.add(1);
  } else if (missing.length > 0) {
    // console.warn(
    //   `Missing some completions.\n` +
    //     `expected: ${expected.join(", ")}\n` +
    //     `found: ${found.join(", ")}\n` +
    //     `missing: ${missing.join(", ")}\n` +
    //     `for code:\n${codeSnippet}\n` +
    //     `with completions: \b${completions}`,
    // );
  }

  return ok;
}

export function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function randomSleep(min, max) {
  sleep(randomInRange(min, max));
}

export function setupWSCompletionClient(
  socket,
  { delayMin = 0.1, delayMax = 0.2 } = {},
) {
  const inFlight = new Map();

  const sendMessage = () => {
    const completionScenario = getRandomCompletionScenario();
    const requestId = crypto.randomUUID();
    const payload = JSON.stringify({
      requestId,
      project: {
        args: "",
        files: [
          {
            name: completionScenario.filename,
            text: completionScenario.snippet,
          },
        ],
        confType: "java",
      },
      line: completionScenario.line,
      ch: completionScenario.ch,
    });

    inFlight.set(requestId, { start: Date.now(), completionScenario });
    socket.send(payload);
  };

  const scheduleNext = () => {
    const delayMs = Math.floor(randomInRange(delayMin, delayMax) * 1000);
    socket.setTimeout(() => {
      sendMessage();
      scheduleNext();
    }, delayMs);
  };

  sendMessage();
  scheduleNext();

  socket.on("message", (message) => {
    const parsed = JSON.parse(message);
    if (parsed["sessionId"] !== undefined) {
      // init msg
      return;
    }
    const requestId = parsed["requestId"];
    if (!requestId || !inFlight.has(requestId)) {
      console.error("cannot recognise this: ", parsed)
    }

    if (requestId && parsed["sessionId"]) {
      // init msg
      return;
    }

    let discarded = requestId && parsed["message"] && parsed["message"] == "discarded"

    const { start, completionScenario } = inFlight.get(requestId);
    inFlight.delete(requestId);

    const elapsed = Date.now() - start;
    latency.add(elapsed);

    if (discarded) return;

    let completions = [];
    if (parsed["completions"]) {
      completions = parsed["completions"].map((c) => c.text);
    }

    // outdated request
    if (completions.size === 0) return;

    checkCompletionResponse(
      completions,
      completionScenario.expected,
      completionScenario.snippet,
      elapsed,
    );
  });
}
