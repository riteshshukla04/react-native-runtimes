# Maestro Flows

Run against an installed Android release build:

```sh
maestro test maestro
```

Useful focused runs:

```sh
maestro test maestro/01-scroll-10k-snapshots.yaml
maestro test maestro/02-reaction-no-flicker.yaml
maestro test maestro/03-reaction-rerender.yaml
maestro test maestro/04-prepend-1000-no-jump.yaml
maestro test maestro/05-scroll-to-item.yaml
maestro test maestro/06-reset-item-rerender.yaml
maestro test maestro/07-reorder-swap-pairs.yaml
maestro test maestro/09-message-spacing-geometry.yaml
```

The scroll flow writes snapshots with `scroll-10k-*` names. Reaction flows verify row accessibility markers such as `chat-row-0-v1`, `chat-row-0-v2`, and `chat-reaction-0-like-1`. The prepend flow taps `action-prepend-1000` and asserts the old visible row remains visible as `chat-row-1000-v1`.
The command flow taps `action-scroll-to-7500` in both list modes and asserts `chat-row-7500-v1` becomes visible without leaving row 0 on screen.
The reset flow taps `action-reset-item-0` in both list modes and verifies native passes row index 0 back to JS for a render-only refresh, advancing the row marker to `chat-row-0-v2` while the data version stays `v1`.
The reorder flow taps `action-swap-first-ten-pairs` and verifies item markers move as `(0,1)(2,3)...(8,9)` without falling back to skeleton rows.
The spacing geometry flow asserts `visible-list-spacing-ok-*` across all three tabs after repeated scrolls. That marker is produced from row layout bounds, so the flow catches overlapping rows and inconsistent adjacent gaps instead of relying only on screenshots.
