import { inspectVisual } from "../lib/ui-agent/inspect";
const result = inspectVisual({ id: "golden-4-node", version: "fixture-1", nodes: [{ id: "a", position: { x: 0, y: 0 } }, { id: "b", position: { x: 20, y: 20 } }, { id: "c", position: { x: 400, y: 0 } }, { id: "d", position: { x: 700, y: 0 } }], edges: [{ id: "ab", source: "a", target: "b" }] });
const blocking = result.filter((finding) => finding.severity === "critical");
console.log(JSON.stringify({ inspected: 1, findings: result.length, blocking: blocking.length }, null, 2));
if (blocking.length) process.exitCode = 1;
