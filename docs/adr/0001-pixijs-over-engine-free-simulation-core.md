# PixiJS as renderer over an engine-free simulation core

We render with PixiJS 8, but the simulation (map, economy, squads, combat, AI, victory) is plain TypeScript that imports no engine code and therefore runs in Node. PixiJS owns pixels only: it draws generated textures, applies the camera, and turns pointer events into Commands. We chose Pixi over Phaser because Phaser's asset pipeline (Loader, atlas JSON, Tilemap) assumes pre-made external files, which the no-external-assets constraint forbids, and because its built-in physics and tilemap subsystems are ones an RTS does not use.

**Considered Options**: Phaser 4 — a full framework that would have reached a first moving frame faster, rejected for the asset-pipeline mismatch, the larger bundle, and the subsystems we would end up fighting rather than using.

**Consequences**: we own camera, picking, selection and culling. The render layer becomes swappable, the simulation is testable headlessly, and "why is this not a Phaser project?" is answered here rather than in a comment.
