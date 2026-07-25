# RF propagation engines for terrain-aware drone-detection coverage — landscape & recommendation

**Scope:** open-source engine to sit behind our Leaflet/React + Fastify app and compute
antenna coverage / dead zones over real terrain (+ forest/building clutter) for low-altitude
drones (30–1000 m AGL, ~50 km radius). We integrate an engine — we don't write propagation
physics ourselves.

All claims below were fact-checked 3-vote against primary sources (GitHub repos, NTIA/ITS,
ITU-R). Confidence noted where a vote was split or a claim couldn't be verified.

---

## TL;DR recommendation

| Goal | Pick | Why |
|---|---|---|
| **Fastest credible red/green demo** | **Signal-Server (W3AXL fork)** as a CLI batch behind Node, PNG → Leaflet `ImageOverlay` | Real diffraction (ITM), eats SRTM 30/90 m, emits georeferenced 360° coverage raster out of the box. But **GPLv2** (copyleft). |
| **Best long-term fidelity + license-clean** | **crc-covlib** (Canada CRC), Python microservice | **MIT license**, bundles ITM + P.1812 + P.452 diffraction **and P.2108 clutter**, consumes **SRTM + ESA WorldCover** (the "forests block the antenna" requirement), official Python wrapper. |
| **Already shipped (branch)** | our `viewshed.ts` LOS + 4/3-earth | Zero deps, instant, good enough for the binary dead-zone picture. Use as the "coarse" tier. |

**One critical caveat up front (radar vs comms):** every OSS engine here models a **comms
link budget** (one-way path loss, "can a receiver hear a transmitter"). Drone **detection by
radar** is a *two-way* problem (energy out → reflects off the drone's radar-cross-section →
energy back). The **terrain masking / line-of-sight / dead-zone geometry is identical** — a
hill blocks radar exactly as it blocks comms — so these tools are perfectly valid for the
**"where can the antenna see" dead-zone map**, which is what you're demoing. They are *not*
valid for absolute detection range in km without adding the radar equation (RCS + two-way loss
+ receiver sensitivity) on top. The only tool with a native bistatic-radar+RCS model is
**CloudRF (commercial)**. Flag this to the advisor: our heatmap answers "line-of-sight /
shadowing," not "detection range against a 0.04 m² Shahed" — that's a second layer.

---

## Tier 1 — Standalone coverage engines (drop-in, terrain in → raster out)

### ⭐ crc-covlib — best overall fit
- **What:** C++ radiowave coverage/interference library from **Communications Research Centre
  Canada** (federal research institution). *(primary, 3-0)*
- **Models bundled:** Free space, **Longley-Rice/ITM**, **ITU-R P.1812-7**, **P.452-17/18**,
  **Extended-Hata**, **P.2108-1 statistical clutter loss**, **P.676-13 gaseous attenuation**.
  → diffraction **and** clutter in one lib. *(primary, 3-0)*
- **Data in:** **SRTM DEM** + **ESA WorldCover land-cover** + Natural Resources Canada land
  cover; GeoTIFF also supported; WGS-84 worldwide. Matches our Terrarium/SRTM pipeline and
  gives the forest-attenuation input directly. *(primary, 3-0)*
- **License:** **MIT** (Crown copyright) — *no GPL contamination*, safe in a closed/defense app.
  Ships an official **Python wrapper with examples**. *(primary, 3-0)*
- **Maintenance:** actively maintained, **v4.6.3 (July 2026)**. *(primary, 3-0)*
- **Integration:** Python wrapper → thin FastAPI/Flask microservice → Fastify calls it → returns
  a coverage GeoTIFF/PNG → Leaflet `ImageOverlay`. This is the clean long-term stack.
- Repo: https://github.com/ic-crc/crc-covlib

### Signal-Server (W3AXL fork) — fastest path to a real diffraction demo
- **What:** multi-threaded RF coverage calculator. Models: **ITM (Longley-Rice)**, LOS, Hata,
  ECC33, SUI, COST-Hata, FSPL, ITWOM, Ericsson, Plane-earth, Egli. *(primary, 3-0)*
- **Data in:** **SRTM `.sdf` 30 m / 90 m** (gzip/bzip2), plus LIDAR ASCII grids. Freq **20 MHz–100
  GHz** (LOS-only >20 GHz). *(primary, 3-0)*
- **Out:** **360° polar coverage raster, WGS-84, PPM bitmap** → trivially converted to PNG/KMZ →
  Leaflet overlay. Exactly the shape we need. *(primary, 3-0)*
- **License:** **GPLv2** (copyleft — matters if you distribute the binary; running it as a
  separate CLI process behind an HTTP boundary is the usual way people avoid linking issues).
- **Maintenance:** the **original Cloud-RF/Signal-Server is dead** — CloudRF replaced it with the
  proprietary SLEIPNIR ~2019 and the current official repo is docs-only (5 commits, created
  Aug 2025). *(primary, 3-0)* The **W3AXL community fork** is the live one: ~18★, 189 commits,
  last commit **Jan 30 2026**, buffer-overflow fixes Sep 2025. *(primary, 2-1 — star/commit
  numbers may drift)*
- **Origin:** it's a 2011 fork of **SPLAT! 1.3** made specifically "to run unattended on a
  server" (CLI args instead of interactive files) — i.e. purpose-built for our wrap-behind-HTTP
  pattern. *(primary, 3-0)*
- Repos: https://github.com/W3AXL/Signal-Server (use this), https://github.com/Cloud-RF/Signal-Server (history only)

### SPLAT! — the ancestor
- GPL terrestrial RF propagation tool; Signal-Server is its server-oriented descendant. If you're
  taking a fork, take Signal-Server, not raw SPLAT! *(secondary/Wikipedia, 3-0)*

---

## Tier 2 — NTIA/ITS official model libraries (public domain, compose-your-own)

These are **individual reference models**, not turnkey coverage tools — you iterate them over
radial DEM profiles yourself. Value: authoritative, public-domain (no license friction at all).

- **NTIA/itm** — official US-gov C++ **ITM/Longley-Rice**, **20 MHz–20 GHz**, point-to-point
  (PFL terrain profiles — matches our DEM-derived profiles) + area mode. Models free-space +
  **diffraction** + troposcatter. **No clutter** — clutter is a separate lib. *(primary, 3-0)*
- **NTIA/p2108** — official C++ **ITU-R P.2108 clutter loss**, with an official **Python
  wrapper** (`p2108-python`). The clutter layer you bolt onto ITM for forests/buildings.
  *(primary, 3-0; the "all 3 methods incl. Aeronautical" + "v1.1 Jan 2025" specifics were the
  2 claims left **unverified** when the run hit the limit — treat as likely-true, confirm on
  the repo.)*
- **NTIA/p528** — official **ITU-R P.528 aeronautical (air-to-ground) path loss**, VHF/UHF/SHF.
  **Directly relevant to airborne targets like UAVs** — this is the model built for exactly the
  air-to-ground geometry of a drone. *(primary, 3-0)*
- **NTIA/ehata** — official C++ **Extended-Hata** urban model; API is point-to-point path loss
  over a terrain profile (pfl, MHz, tx/rx heights, NLCD env code, reliability quantile → dB).
  Effectively **public domain, royalty-free worldwide, derivatives allowed** — no license
  barrier for a defense app. *(primary, 3-0)*
- Index: https://its.ntia.gov/software/its-open-source-software

---

## Tier 3 — ITU-R reference implementations (eeveetza / OFCOM, pycraf)

For maximum standards fidelity, or to cross-check crc-covlib.

- **eeveetza (Ivica Stevanovic, Swiss OFCOM)** — **~35 repos** of ITU-R propagation Recs:
  P.1546, **P.1812**, P.2001, **P.452**, **P.528**, P.1411, **P.2108**, P.2109… in
  MATLAB/Octave, **Python**, Java, and C++ (P.452). Several carry **official ITU-R SG3 reference
  status**. *(profile, 3-0)*
  - **Py1812** — pure-Python **ITU-R P.1812-8** (point-to-area, 30 MHz–6 GHz), takes **terrain
    profile heights + representative clutter heights**, ships validation data. A ready
    terrain+clutter core for DEM-based coverage in pure Python. *(primary, 3-0)*
  - **p452** MATLAB is the ITU-R WP3M-approved reference version. *(primary, 2-1)*
  - Profile: https://github.com/eeveetza
- **pycraf** — Python, includes full **ITU-R P.452-17** path attenuation. Good if you want a
  pip-installable Python attenuation model. *(primary; extracted, not in final verified top-25)*
  Repo: https://github.com/bwinkel/pycraf

---

## Tier 4 — GIS viewshed (the cheap LOS tier — what we already built)

*(These sources were fetched but their specific claims fell outside the verified top-25 —
directionally reliable, not individually fact-checked here.)*

- **GDAL `gdal_viewshed`** and **GRASS `r.viewshed`** — binary/near-binary line-of-sight
  visibility over a DEM, with **earth-curvature + refraction** options. Fast on 50 km @ 30 m.
  Accuracy: pure geometric LOS — **no diffraction, no clutter** (a target just behind a ridge
  reads as invisible even though real signal knife-edge-diffracts a bit over it).
- **This is exactly the tier our `client/src/lib/viewshed.ts` already occupies** (radial LOS +
  4/3-effective-earth). For the *demo*, this already draws the red/green dead-zone picture with
  zero external engine. Use GDAL/GRASS only if you want it server-side/batch.
- **Takeaway:** viewshed = "geometry" tier (already done); Tier 1/2 engines = "adds diffraction
  + clutter." The advisor's "units go on the relief, not geometry" ask is satisfied at the
  viewshed tier; forests/buildings need Tier 1 (crc-covlib) or Tier 2 (ITM+P.2108).

---

## Tier 5 — GPU ray tracing (overkill for now)

- **NVIDIA Sionna RT** (`NVlabs/sionna-large-radio-maps`, Apache-2.0) — GPU ray-traced radio
  maps over large areas via adaptive tiling. *(primary; extracted, not in verified top-25.)*
- Verdict: **overkill** for a terrain dead-zone map. It shines for urban multipath/5G, needs a
  GPU + 3D city meshes, and is heavy to operate. Not the demo path. Revisit only if you later
  need building-level multipath in cities.

---

## Commercial (benchmark / fallback only)

- **CloudRF** — hosted API + the **SOOTHSAYER** self-hostable server. Uniquely has a **dedicated
  bistatic RADAR model with RCS** (drone RCS ~0.04 m² vs plane ~6.0) → models actual *detection
  range*, not just link budget. *(blog/primary; extracted, not in verified top-25.)* This is the
  reference for "real radar detection." Paid tiers. Useful to benchmark our OSS heatmap against,
  and the RCS/radar-equation approach to copy if we build the detection layer.

---

## Land-cover / clutter data (the "forests block it" input)

- **ESA WorldCover** — 10 m global land cover; **directly consumed by crc-covlib**. *(primary,
  3-0)* This is the path of least resistance for vegetation attenuation.
- Copernicus / OSM landuse — alternatives; require you to map land classes → attenuation dB
  yourself (via **ITU-R P.833 vegetation** or **P.2108 clutter**). crc-covlib + WorldCover
  already wires this for you.

---

## Recommended stacks, ranked

**(a) Fastest to a credible red/green dead-zone demo**
1. **What we have** — `viewshed.ts` LOS + 4/3 earth. Ships today, no engine. Binary shadowing.
2. **+ Signal-Server (W3AXL) as CLI batch** → adds real ITM diffraction, PNG overlay. ~days to
   wire: Node `child_process` → convert PPM→PNG → Leaflet `ImageOverlay`. GPLv2 (process
   boundary keeps it clean).

**(b) Best long-term fidelity (diffraction + clutter), license-clean**
1. **crc-covlib** (MIT) as a Python microservice, fed **SRTM + ESA WorldCover** → ITM/P.1812
   diffraction **+ P.2108 clutter** → GeoTIFF/PNG → Leaflet. The forests-and-buildings answer.
2. Cross-check / à-la-carte alternative: **NTIA ITM + P.2108 + P.528(aeronautical)**, public
   domain, if you want US-gov reference models instead of the Canadian bundle.

**Detection-range layer (separate, later):** radar equation (two-way path loss + RCS + receiver
sensitivity) on top of whichever path-loss engine — or benchmark against **CloudRF SOOTHSAYER**.

---

## Sources (primary unless noted)
- Signal-Server (history): https://github.com/Cloud-RF/Signal-Server
- Signal-Server (live fork): https://github.com/W3AXL/Signal-Server
- NTIA ITM: https://github.com/NTIA/itm · P.2108: https://github.com/NTIA/p2108 · eHata: https://github.com/NTIA/ehata · index: https://its.ntia.gov/software/its-open-source-software
- crc-covlib: https://github.com/ic-crc/crc-covlib
- ITU-R refs (OFCOM): https://github.com/eeveetza · pycraf: https://github.com/bwinkel/pycraf
- GRASS r.viewshed: https://grass.osgeo.org/grass-stable/manuals/r.viewshed.html · gdal_viewshed: https://gdal.org/en/stable/programs/gdal_viewshed.html
- Sionna RT: https://nvlabs.github.io/sionna/rt/ · large radio maps: https://github.com/NVlabs/sionna-large-radio-maps
- CloudRF drone/radar: https://cloudrf.com/optimising-drone-detection-with-rf-simulation/ · SOOTHSAYER: https://cloudrf.com/soothsayer/

*Verification note: 23 of 25 sampled claims confirmed 3-vote against primary sources, 0
refuted, 2 (P.2108 method-count & release-date specifics) left unverified when the run hit the
session token limit. Tier 4/5 and commercial items were fetched but not individually vote-verified.*
