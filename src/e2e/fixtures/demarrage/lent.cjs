// Preloaded into the server (NODE_OPTIONS=--require): the server needs 12 s before it can listen.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 12000);
