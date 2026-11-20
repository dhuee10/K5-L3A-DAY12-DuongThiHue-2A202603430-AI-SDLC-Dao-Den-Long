# Credits

## Code libraries
- **three.js r160** (MIT License, © 2010–2023 three.js authors), vendored as `vendor/three.module.js`; license text in `vendor/three.LICENSE`. https://threejs.org

## Art, models, textures
- None imported. Every 3D object (Mây with her nón lá, lanterns, shades, Gió Lạc ribbons, charms, islands, bell tower, trees, sky lanterns) is built from three.js primitive shapes in `src/game.js`. The glow sprite is a radial gradient drawn on a canvas at runtime.

## Sound and music
- None imported. All sound effects and the night music are synthesized at runtime with the WebAudio API (oscillators on a pentatonic scale) in `src/game.js`.

## Fonts
- System UI font of the player's OS (`system-ui`). No font files shipped.

## AI tools used to create content
- **Claude Code (Anthropic, Claude Opus model)**: wrote the code, tests, harness (AGENTS.md, Stop hook, verify skill, CI), notes, ADR and retro, under the author's direction and review. The text in Ông Đăng's lines and the in-game Vietnamese UI copy was also drafted with Claude.
- No AI-generated images, audio or 3D models are included.

## Characters and setting
- Mây, Đảo Đèn Lồng, Bóng Mực, Gió Lạc, Ông Đăng and the three islands belong to the Day 12 AI SDLC lab brief.
