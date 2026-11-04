// Preloaded into the server: the process stays alive and never answers.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * 60 * 1000);
