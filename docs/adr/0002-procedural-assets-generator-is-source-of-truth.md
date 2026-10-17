# Procedural assets: the generator is the source of truth, binaries are disposable

All art, terrain, fonts and audio are produced by code. One pure generation library turns a seed plus a spec into pixel buffers — unit figures composed from parametric parts, buildings from primitives, terrain from heightmap noise plus bitmask autotiling, a bitmap font, and synthesized sound. The runtime and a build step use the *same* library; the build step bakes atlases. Baked files are build products: gitignored, regenerated deterministically, and hash-checked in CI. No image or audio file is ever committed, and no image-generating model is used at any point. An "Atelier" debug page renders every generated asset so a human or an agent can inspect the whole catalogue at once.

**Considered Options**: generating only at runtime (no files at all) — rejected because nothing is inspectable, reviewable or diffable; committing baked atlases — rejected because it puts binaries in the repo and invites drift from the generator.

**Consequences**: the repository stays code-only. Visual regressions are caught by pixel-hash tests rather than by eye. Adding a unit becomes declaring data, not drawing. A bitmap font generated in code is a hard requirement of the constraint, not a stylistic choice.
