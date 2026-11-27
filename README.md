# Forever Druid Guide

A druid guide for WoW Forever at level 60: Balance, Feral (Cat and Bear) and Restoration, in PvE and PvP.
Pick a build, copy its talents, read one short priority list, see what consumables, buffs and races are worth.

Open `index.html` in a browser. The page reads the files in `data/` and loads icons and links from Wowhead.

## Where the numbers come from

PvE numbers are WoWSims Forever runs (`wowsimcli` v1.0.11): 25,000 fights of 180 s against one level 63 boss with full
raid buffs and consumables, on the simulator's own preset talents, gear and rotations for Balance, Feral Cat and
Feral Bear. A talent's value is the build's result minus the same build without that talent.

Not measured:

- **Restoration.** The simulator does not model healing. Its talent build is a starting point from the talent text.
- **PvP.** No simulator covers it. Builds and advice are summarised from the sources linked on the page, which were
  written during the level 30 beta.

## Rebuilding the data

`data/talents.js`, `data/sims.js` and `data/setups.js` are generated; `data/guide.js` is written by hand.

1. Download `wowsimcli` from the [WoWSims Forever releases](https://github.com/wowsims/forever/releases).
2. `python tools/build_talents.py` reads the talent trees from Wowhead's Forever talent calculator.
3. `python tools/run_sims.py --cli path/to/wowsimcli --sim-version v1.0.11 --date 2026-11-27` runs every build
   (about 210 sims, six minutes). `--only cat,bear` reruns some of them.
4. `python tools/build_setups.py --cli path/to/wowsimcli` lists each setup's gear, consumables and buffs.

The setups in `tools/setups/` mirror the simulator's defaults (`ui/specs/druid/*` in wowsims/forever, MIT licence).
Cat and Bear have no `defaults.siml` upstream, so theirs are assembled from `presets.ts` and `spec.ts`.
