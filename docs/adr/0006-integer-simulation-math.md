# Simulation math is integer, and its randomness is sfc32

The authoritative state of a Match contains integers only, and every random draw comes from `sfc32` seeded through `xmur3`. `Math.random` is banned repository-wide, and `Math.sin`, `cos`, `exp`, `pow` and `log` are banned inside the simulation because ECMA-262 leaves them implementation-approximated, which means two browsers may legitimately disagree. Geometry that needs them uses lookup tables or integer approximation. Derived floating-point values are permitted as long as they never feed state or the state hash.

**Considered Options**: floats throughout with a tolerance-based comparison — rejected because a replay would then be "approximately right", and a replay that is approximately right cannot reproduce a bug or gate a balance tournament. Same-platform-only determinism — rejected because development happens on Windows while CI runs on Linux.

**Consequences**: bit-identical replays across machines and engines, so a balance tournament is a measurement rather than a sample. The cost is ergonomic: trigonometry needs tables, ratios need care, and reviewers must push back on a convenient `Math.sqrt` in the wrong place.
