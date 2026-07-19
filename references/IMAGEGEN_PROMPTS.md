# NJUcsPete image-generation prompts

Mode: built-in image generation with all three `pete-*.jpg` files as identity references, followed by flat-green chroma-key removal. Walking and dragging use 18 directly generated native frames; optical-flow tweening remains only in legacy animation assets.

## Main keyframe sheet

Create an exact 6-column by 5-row production sprite sheet of the same tortoiseshell cat. Preserve the mostly black short coat, irregular orange-brown patches, pale yellow-green eyes, upright ears, rounded sturdy body and dark face. Use a polished cute semi-realistic 2D game-sprite style. The cat faces left throughout. Row 1: seamless idle breathing/blink loop. Row 2: one complete natural walking-left gait. Row 3: seamless eating loop with a small red bowl. Row 4: gentle vertical dangling/dragging loop from an invisible grab point, with no hand or object. Row 5: falling, curling, paws-down landing, crouching and standing. Use exactly 30 complete uncropped figures in equal cells on a perfectly flat `#00ff00` background. No grid, labels, shadows, reflections, text, watermark, duplicate limbs, missing limbs, changing markings or changing eye color.

## Front-wind riding strip

Create an exact horizontal 6-cell seamless riding loop of the same left-facing tortoiseshell cat. Wind comes from the front, left to right; the cat braces low while ears, whiskers, cheek fur and tail stream backward toward the right. Keep identity, scale, baseline and markings consistent. Use a flat `#00ff00` background with no props, platform, wind symbols, text, shadow or watermark.

## Rear-wind riding strip

Create an exact horizontal 6-cell seamless riding loop of the same left-facing tortoiseshell cat. Wind comes from behind, right to left; tail and rear fur are pushed forward toward the left while the cat never turns around. Keep identity, scale, baseline and markings consistent. Use a flat `#00ff00` background with no props, platform, wind symbols, text, shadow or watermark.

## v1.0.1 native 18-frame walking loop

The final source used the following prompt verbatim:

```text
Generate a single professional animation sprite sheet with EXACTLY 18 separately illustrated frames — no fewer and no more — arranged in an EXACT 6-COLUMN by 3-ROW regular grid. Reading order: row 1 is frames 1–6, row 2 is frames 7–12, row 3 is frames 13–18. Every row has exactly six cats at evenly spaced cell centers. Each cell has exactly one complete cat. Do not add labels, numbers, grid lines, borders, text, or extra figures.

The subject is the SAME adult female tortoiseshell cat in all 18 frames, matching the three photos: mostly black short coat, irregular orange-brown patches, pale yellow-green eyes, upright triangular ears, dark face, broad chest, full rounded ribcage and belly, substantial shoulders and hips, medium-short legs. Keep her sturdy, heavy, rounded adult body and the same large visual mass as the cat lying down in the references. She must never become a skinny kitten, narrow-waisted, elongated, tiny, long-legged, or reduced in scale.

Draw a genuine native 18-phase seamless side-view WALK CYCLE toward screen-left. Every one of the 18 poses must be newly illustrated as a distinct consecutive gait phase. All four legs move in a biomechanically credible feline walking sequence: alternating paw contacts, weight transfer, passing poses, lift and reach, with paws planting on one common baseline. Only a gentle torso bob and subtle tail follow-through. The head stays stable. The cat faces LEFT in every cell and actually walks toward the left; no backward walking, moonwalking, turning, running, jumping, floating, sliding, morphing, or duplicated/missing limbs. Frame 18 must be the immediately preceding cyclic phase that flows smoothly into frame 1, with matching position, scale, baseline, body height, rendering and limb rhythm. Frames 18 and 1 are neighboring phases, not identical duplicates.

Maintain absolutely consistent camera, generous apparent size, head/body proportion, markings, lighting, linework and baseline across all cells. Full ears, tail and paws visible and uncropped. Use a polished cute semi-realistic 2D desktop-pet game-sprite style.

Fill all non-cat pixels with one perfectly uniform solid #00ff00 chroma green background. No scenery, floor, grass, contact shadow, reflection, gradient, texture, watermark, checkerboard, captions, cell borders, or props.
```

## v1.0.1 native 18-frame dragging loop

The final source used the following prompt verbatim:

```text
Generate a single professional animation sprite sheet with EXACTLY 18 separately illustrated frames — no fewer and no more — arranged in an EXACT 6-COLUMN by 3-ROW regular grid. Reading order: row 1 is frames 1–6, row 2 is frames 7–12, row 3 is frames 13–18. Every row has exactly six cats at evenly spaced cell centers. Each cell has exactly one complete cat. Do not add labels, numbers, grid lines, borders, text, or extra figures.

The subject is the SAME adult female tortoiseshell cat in all 18 frames, matching the three photos: mostly black short coat, irregular orange-brown patches, pale yellow-green eyes, upright triangular ears, dark face, broad chest, full rounded ribcage and belly, substantial shoulders and hips. Preserve her sturdy, heavy, rounded adult body, visible torso volume, and large visual mass. She must never look like a skinny kitten, thin vertical sausage, tiny cat, elongated cat, or reduced-scale cat.

Draw a native 18-frame seamless DESKTOP-DRAG / GENTLE-LIFT loop. The cat is safely held from an invisible stable grab point at the loose skin above the shoulder blades, as if the desktop pet itself is being picked up. Do NOT show any hand, arm, hook, rope, collar, clip, harness, cursor, or object. The cat remains a compact, broad, slightly comma-shaped hanging bundle: rounded torso, hips tucked slightly forward, hind paws relaxed below and a little forward, forepaws softly bent, tail curving naturally to the side. Do not stretch the neck or torso. The pose should communicate full body weight and volume while suspended, not a thin dangling line.

All 18 frames are directly illustrated as distinct consecutive phases of one subtle, calm sway loop: tiny left-right body sway, very small paw and tail follow-through, gentle ear response, no spinning and no sudden pose change. Frame 18 transitions seamlessly into frame 1 with matching scale, center, lighting and cyclic motion. Frames 18 and 1 are adjacent phases, not identical duplicates.

Maintain identical generous character scale, body width, head/body ratio, coat markings, eye color, rendering and camera across every cell. The lifted cat must appear at least as visually substantial as the standing/walking cat, filling each cell generously while leaving ears, tail and paws uncropped. Use a polished cute semi-realistic 2D desktop-pet game-sprite style.

Fill all non-cat pixels with one perfectly uniform solid #00ff00 chroma green background. No scenery, floor, shadow, reflection, gradients, texture, watermark, checkerboard, captions, cell borders, or props.
```
