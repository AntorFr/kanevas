# Battle map — trial of the image engine

Spike page of AD-battlemap-generation-5. The trial is manual, outside CI:

```
CODEX_HOME=<directory holding auth.json> npx tsx scripts/essai-moteur-alpha.ts
```

`scripts/essai-moteur-alpha.ts` generates two assets per category through the production prompt (`construirePrompt`) and prints
one line per asset: the category, the name, the answer of `alphaPng` and the size. With `KANEVAS_STUB=1` it runs against the
stub (it checks the script, not the engine). Without an engine it prints « non joué : pas de moteur dans ce pod ». It never
reads `auth.json` and prints nothing the engine wrote.

## Result

**Non joué : pas de moteur dans ce pod.** The pod running the task has the `codex` executable (codex-cli 0.162.1) but no
`auth.json` under `CODEX_HOME`, so `choisirAdaptateur()` is `aucun`. Run on 2026-11-17 (the stub run only).

| Question | Answer |
|---|---|
| Engine version | not played (the pod's executable is codex-cli 0.162.1, never signed in) |
| Date | not played |
| PNG with an alpha channel and transparent pixels | not played |
| Reference images accepted | not played |

## Consequences

- The default of `fond` stays `'transparent'`: nothing shows that the engine misses transparent pixels.
- The keying path (`appliquerTransparence`: `detourerFondUni`, then the square footprint if the result stays opaque) is the safety
  net and is proved on a fixture image by the tests of the core slice, whatever this trial says.
- Reference images are not sent (text only); a follow-up changes `construirePrompt` alone if the trial says the engine takes them.
- To close the trial, someone with a signed-in engine runs the command above and fills the table. If every `objet` / `vaisseau` /
  `decor` line says `alphaPng=false` while a flat background keys well, the default of `fond` becomes `'uni'`.
