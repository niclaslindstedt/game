# Ada's Trail — Steam store listing draft

The Steamworks settings that are not the store page's words: the features to
select, the tag order, the system requirements, and what is still to be done in
the portal. Keep them aligned with the current build: Valve reviews the listing
and product together, and features planned for later must not be presented as
shipped.

The words themselves — the brief description, About This Game, the
mature-content description and the generative-AI disclosure — are kept out of
the repository, like the App Store listing's (`native/store/copy.mts`, which
`native/store/listing.mts` explains): they are the page's own prose, and a
public copy would put it on a crawlable page somewhere else. The internal page
mock reads them from `tauri/store/steam.md`, which is gitignored
(`preview/README.md` says how).

## Features selected in Steamworks

- Single-player
- Online Co-op (2–8 players)
- Steam Achievements
- Steam Cloud
- Steam Workshop
- Full controller support
- Remote Play Together: do not select unless tested and intentionally shipped
- Cross-platform multiplayer: do not select; there is no cross-store promise

## Tags — ordered draft

Steam requires at least five tags and recommends up to twenty. The first five
should describe the game without relying on generic `Action` or `Indie` tags.

1. Bullet Heaven
2. Top-Down
3. Loot
4. Online Co-Op
5. Pixel Graphics
6. Action Roguelike
7. Survival
8. Procedural Generation
9. RPG
10. Co-op
11. Space
12. Sci-fi
13. Atmospheric
14. Difficult
15. Gore
16. Controller
17. Singleplayer
18. Multiplayer
19. Action
20. Indie

## System requirements — provisional until release-build QA

The product must be launched on every listed OS before these are submitted.
The one-gigabyte storage allowance deliberately includes headroom for the
bundled Node runtime (multiplayer and mods), Workshop items, and save data.

### Windows

**Minimum**

- OS: Windows 10, 64-bit
- Processor: Dual-core 2.0 GHz
- Memory: 4 GB RAM
- Graphics: Integrated graphics with WebGL 2 support
- Storage: 1 GB available space
- Network: Broadband connection for online co-op and Workshop; solo works
  offline

**Recommended**

- OS: Windows 11, 64-bit
- Processor: Quad-core 2.5 GHz
- Memory: 8 GB RAM
- Graphics: Recent integrated or dedicated graphics
- Storage: 1 GB available space

### macOS

**Minimum**

- OS: macOS 12 Monterey
- Processor: Intel or Apple silicon
- Memory: 4 GB RAM
- Graphics: Metal-capable integrated graphics
- Storage: 1 GB available space
- Network: Broadband connection for online co-op and Workshop; solo works
  offline

**Recommended**

- OS: macOS 13 Ventura or later
- Processor: Apple M1 or later
- Memory: 8 GB RAM
- Storage: 1 GB available space

### SteamOS + Linux

**Minimum**

- OS: 64-bit Linux distribution with glibc 2.35 or later
- Processor: Dual-core 2.0 GHz, x86-64
- Memory: 4 GB RAM
- Graphics: Vulkan- or OpenGL-capable integrated graphics with WebGL 2 support
- Storage: 1 GB available space
- Network: Broadband connection for online co-op and Workshop; solo works
  offline

**Recommended**

- OS: SteamOS 3 or Ubuntu 22.04 LTS
- Processor: Quad-core 2.5 GHz, x86-64
- Memory: 8 GB RAM
- Graphics: Recent integrated or dedicated graphics
- Storage: 1 GB available space

## Submission checks still requiring the Steamworks portal or release builds

- Set the final price and release date.
- Enter the real app/depot ids and public store URL.
- Confirm supported languages and localize the listing/assets before claiming
  them.
- Run each packaged depot on its listed minimum OS and adjust requirements.
- Complete the General Content, Mature Content, and Generative AI survey.
- Mark at least four genuinely all-ages screenshots in Steamworks. Because the
  current gameplay set depicts combat, do not mark them blindly; capture calmer
  traversal/menu frames if Valve's review considers the current frames violent.
- Upload and configure the trailer; it is strongly recommended but not yet
  produced.
- Confirm controller glyphs before requesting Steam Deck Verified review.
