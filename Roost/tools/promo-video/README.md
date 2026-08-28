# Promo video renderer

Procedurally renders the Roost landing-page promo video — every frame is
drawn with Pillow (no video editing software, no LLM in the loop) and
streamed into ffmpeg to produce a real H.264 `.mp4`. No audio is generated;
the current live video (`packages/web/public/videos/roost-promo.mp4`) had
music added afterward in an external editor.

## Requirements

```
pip install pillow opencv-python imageio-ffmpeg
```

`imageio-ffmpeg` bundles a standalone ffmpeg binary — no system install needed.
Text is rendered with Segoe UI / Consolas (`C:\Windows\Fonts`), so this
currently only runs on Windows as written; swap `FONT_DIR` in
`render_promo.py` to retarget another OS's font paths.

## Files

- `render_promo.py` — the engine: canvas/timing constants, Roost's design
  tokens (colors), font loading, easing functions, drawing helpers
  (`rounded_rect`, `radial_glow`, `paste_logo`, `draw_checkmark`, `inr` for
  Indian-style number grouping), the `@scene(start, end)` decorator, and the
  frame-by-frame render loop that pipes raw RGB frames into ffmpeg.
- `scenes_full.py` — every scene in the current video (logo reveal, feature
  list, intake form, shortlist, outreach email, the live-reply-under-15s
  demo, negotiation transcript, guardrails diagram, savings counter, impact
  stats, no-LLM differentiator, closing CTA), registered via `@scene(...)`.

## Re-rendering

```
cd tools/promo-video
python scenes_full.py
```

Renders `TOTAL_DURATION` seconds (currently 66s) to `roost_promo.mp4` next
to the script — **not** directly into `packages/web/public/videos/**`, since
that would silently overwrite the current video's music/edits with a silent
raw render. `--test` flag renders only the first 12s, for fast iteration
while tweaking a scene.

## Editing a scene

Each scene is a plain function:

```python
@scene(27.0, 35.0)          # start/end in seconds, absolute timeline position
def s_email_demo(layer, d, t, gt):
    # layer: this scene's own transparent RGBA layer (composited over the
    #        previous scenes' output — you only draw what's new)
    # d:     ImageDraw.Draw(layer)
    # t:     this scene's own progress, 0..1 (use local_t(t, a, b) to carve
    #        out sub-ranges for staggered reveals within the scene)
    # gt:    the absolute global time in seconds (for things like a
    #        continuously-spinning icon that shouldn't reset with t)
    ...
```

Every scene automatically fades its own layer in/out over `EDGE_FADE`
(0.18s) at its start/end, so hard cuts between scenes don't strobe — you
don't need to handle that yourself.

To change copy, numbers, or timing: edit the relevant scene function directly
(most content is inline literals — `INBOUND_TEXT`, `LISTINGS`,
`IMPACT_STATS`, etc. — search for the string you want to change). To change
overall pacing, adjust the `@scene(start, end)` bounds; scenes execute
independently and can overlap or leave gaps if you want a hold on black.

## Getting the edited file live

1. Render (`python scenes_full.py`), producing `roost_promo.mp4`.
2. Edit it in whatever tool you like — trim, add music, whatever — and
   export a final `.mp4`.
3. Replace `packages/web/public/videos/roost-promo.mp4` with your export.
4. Regenerate the WebM copy (used as the primary `<source>` in
   `PromoVideo.tsx` since it's usually smaller) and the poster frame:
   ```
   ffmpeg -y -i roost-promo.mp4 -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 \
     -c:a libopus -b:a 96k roost-promo.webm
   ```
   For the poster, grab a representative frame (a fully-settled UI moment,
   not mid-transition) as `roost-promo-poster.jpg`, 90% JPEG quality is fine.
5. Both files live in `packages/web/public/videos/` — no code changes
   needed unless you rename them (in which case update the `<source>` /
   `poster` paths in `packages/web/app/PromoVideo.tsx`).
