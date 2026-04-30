// Runtime-agnostic types and constants shared between Node (src/node/**)
// and Worker (src/worker/**) runtimes. Both tsconfig.node.json and
// tsconfig.worker.json include this directory in their `include` glob.
//
// CONSTRAINT: contents MUST be importable from BOTH runtimes — that means
// no `node:*` builtins, no `@cloudflare/workers-types` API references, no
// runtime-specific globals (Buffer, FetchEvent, etc.). Pure TypeScript
// literal types and constants only.
//
// Starter ships this file empty; adopters add shared error codes, request
// shapes, branded types, etc. here as feature work demands.

export {};
