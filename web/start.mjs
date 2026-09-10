// start.mjs — production process entry (Docker CMD).
//
// Next compiles instrumentation.ts for Edge as well as Node, so a prune tick
// that imports `pg` cannot live there (webpack Can't resolve `fs`). This file
// is plain Node ESM, like migrate.mjs: start the B-26 daily prune, then the
// Next standalone server. Fail-soft: a prune fault must never block boot.
import { startTurnRecordPruneScheduler } from "./prune-turn-records.mjs";

startTurnRecordPruneScheduler();
await import("./server.js");
