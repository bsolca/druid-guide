#!/usr/bin/env python3
"""Write data/sims.js: every number the guide shows, from wowsimcli runs of the setups in tools/setups.

    python tools/run_sims.py --cli path/to/wowsimcli[.exe] [--only cat,bear]

Each build is a setup file with its talents swapped in. Per build: three fight lengths, the damage split by ability,
what each talent is worth (the build minus that talent, all points and last point), consumables, raid buffs and races.
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETUPS = ROOT / 'tools' / 'setups'
NAME_CACHE = ROOT / 'tools' / 'spell_names.json'
TREE_SIZES = [16, 20, 16]
FIGHT_LENGTHS = [90, 180, 300]
RACES = ['night_elf', 'tauren', 'high_order_skyborne', 'windshaper_skyborne']
BUFF_SECTIONS = ['buffs', 'party_buffs', 'raid_buffs', 'debuffs']

BUILDS = [
    {'id': 'balance', 'setup': 'balance.siml', 'talents': None, 'tank': False},
    {'id': 'cat', 'setup': 'cat.siml', 'talents': '050021-53200032123012125001-055', 'tank': False},
    {'id': 'cat-hybrid', 'setup': 'cat.siml', 'talents': '050012-50230302123110125011-055', 'tank': False},
    {'id': 'bear', 'setup': 'bear.siml', 'talents': '050022-5023030212310112501-055', 'tank': True},
    {'id': 'bear-hybrid', 'setup': 'bear.siml', 'talents': '050012-50230302123110125011-055', 'tank': True},
]


def talent_points(talent_string):
    trees = talent_string.split('-')
    trees += [''] * (3 - len(trees))
    return [[int(d) for d in tree.ljust(size, '0')] for tree, size in zip(trees, TREE_SIZES)]


def talent_string(points):
    return '-'.join(''.join(str(p) for p in tree).rstrip('0') for tree in points).rstrip('-')


def with_talents(setup_text, talents):
    return re.sub(r'^talents ".*"$', f'talents "{talents}"', setup_text, count=1, flags=re.M)


def with_fight_length(setup_text, seconds):
    return re.sub(r'^  duration \d+$', f'  duration {seconds}', setup_text, count=1, flags=re.M)


def with_race(setup_text, race):
    return re.sub(r'^  race \w+$', f'  race {race}', setup_text, count=1, flags=re.M)


def without_sections(setup_text, names):
    kept, skipping = [], False
    for line in setup_text.split('\n'):
        header = re.match(r'^([a-z_]+):', line)
        if header:
            skipping = header.group(1) in names
        elif line and not line.startswith(' '):
            skipping = False
        if not skipping:
            kept.append(line)
    return '\n'.join(kept)


class Simulator:
    def __init__(self, cli):
        self.cli = cli
        self.runs = 0

    def run(self, setup_text):
        with tempfile.TemporaryDirectory(dir=SETUPS) as folder:
            setup = Path(folder) / 'run.siml'
            result_file = Path(folder) / 'out.json'
            setup.write_text(setup_text.replace('use "', 'use "../'), encoding='utf-8')
            done = subprocess.run([self.cli, 'sim', '--infile', str(setup), '--outfile', str(result_file)],
                                  capture_output=True, text=True)
            if done.returncode != 0 or not result_file.exists():
                sys.exit(f'wowsimcli failed:\n{done.stdout}\n{done.stderr}')
            result = json.loads(result_file.read_text(encoding='utf-8'))
        if result.get('error'):
            sys.exit(f"sim error: {result['error']}")
        self.runs += 1
        return result['raidMetrics']['parties'][0]['players'][0]


def headline(player, tank):
    numbers = {'dps': round(player['dps']['avg'], 1)}
    if tank:
        numbers['tps'] = round(player['threat']['avg'], 1)
        numbers['dtps'] = round(player['dtps']['avg'], 1)
        numbers['death'] = round(player['chanceOfDeath'] * 100, 2)
    return numbers


def difference(base, other):
    return {key: round(base[key] - other[key], 1 if key != 'death' else 2) for key in base}


def action_key(action_id):
    for kind in ('spellId', 'itemId', 'otherId'):
        if kind in action_id:
            return kind.replace('Id', ''), action_id[kind]
    return 'other', 'unknown'


class Names:
    def __init__(self):
        self.cache = json.loads(NAME_CACHE.read_text(encoding='utf-8')) if NAME_CACHE.exists() else {}

    def lookup(self, kind, ident):
        key = f'{kind}:{ident}'
        if key not in self.cache:
            self.cache[key] = self.fetch(kind, ident)
        return self.cache[key]

    def fetch(self, kind, ident):
        if kind == 'other':
            words = re.sub(r'^OtherAction', '', str(ident))
            return {'name': re.sub(r'(?<!^)([A-Z])', r' \1', words), 'icon': None}
        url = f'https://nether.wowhead.com/forever/tooltip/{kind}/{ident}'
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 druid-guide'})
        try:
            tooltip = json.loads(urllib.request.urlopen(request, timeout=20).read().decode('utf-8'))
            return {'name': tooltip.get('name', f'{kind} {ident}'), 'icon': tooltip.get('icon')}
        except Exception:
            return {'name': f'{kind} {ident}', 'icon': None}

    def save(self):
        NAME_CACHE.write_text(json.dumps(self.cache, indent=1, sort_keys=True), encoding='utf-8')


def damage_split(player, names):
    by_name = {}
    for action in player['actions']:
        damage = sum(t.get('damage', 0) for t in action['targets'])
        if damage <= 0:
            continue
        kind, ident = action_key(action['id'])
        label = names.lookup(kind, ident)
        entry = by_name.setdefault(label['name'], {'name': label['name'], 'icon': label['icon'], 'damage': 0,
                                                    'kind': kind, 'id': ident})
        entry['damage'] += damage
    total = sum(e['damage'] for e in by_name.values()) or 1
    dps = player['dps']['avg']
    split = [{'name': e['name'], 'icon': e['icon'], 'kind': e['kind'], 'id': e['id'],
              'dps': round(dps * e['damage'] / total, 1), 'share': round(100 * e['damage'] / total, 1)}
             for e in by_name.values()]
    return sorted(split, key=lambda e: -e['dps'])


def talent_values(simulator, setup_text, talents, base, tank, talent_names):
    points = talent_points(talents)
    values = {}
    for tree_index, tree in enumerate(points):
        for slot, taken in enumerate(tree):
            if not taken:
                continue
            name = talent_names[tree_index][slot]

            def minus(removed):
                changed = [list(t) for t in points]
                changed[tree_index][slot] = taken - removed
                player = simulator.run(with_talents(setup_text, talent_string(changed)))
                return difference(base, headline(player, tank))

            values[name] = {'points': taken, 'all': minus(taken), 'last': minus(1) if taken > 1 else None}
    return values


def load_talent_names():
    text = (ROOT / 'data' / 'talents.js').read_text(encoding='utf-8')
    trees = json.loads(text.split('window.TALENTS = ', 1)[1].rstrip().rstrip(';'))['trees']
    return [[t['name'] for t in tree['talents']] for tree in trees]


def sim_build(simulator, build, names, talent_names):
    setup_text = (SETUPS / build['setup']).read_text(encoding='utf-8')
    talents = build['talents'] or re.search(r'^talents "(.*)"$', setup_text, flags=re.M).group(1)
    setup_text = with_talents(setup_text, talents)
    tank = build['tank']

    base_player = simulator.run(setup_text)
    base = headline(base_player, tank)
    out = {
        'talents': talents,
        'base': base,
        'byLength': {str(s): headline(simulator.run(with_fight_length(setup_text, s)), tank) for s in FIGHT_LENGTHS},
        'sources': damage_split(base_player, names),
        'talentValues': talent_values(simulator, setup_text, talents, base, tank, talent_names),
        'withoutConsumables': difference(base, headline(simulator.run(without_sections(setup_text, ['consumables'])), tank)),
        'withoutBuffs': difference(base, headline(simulator.run(without_sections(setup_text, BUFF_SECTIONS)), tank)),
        'races': {race: headline(simulator.run(with_race(setup_text, race)), tank) for race in RACES},
    }
    print(build['id'], base, f'{simulator.runs} runs so far', flush=True)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cli', required=True)
    parser.add_argument('--only', default='')
    parser.add_argument('--sim-version', default='')
    parser.add_argument('--date', default='')
    args = parser.parse_args()

    out_file = ROOT / 'data' / 'sims.js'
    existing = {}
    if out_file.exists():
        existing = json.loads(out_file.read_text(encoding='utf-8').split('window.SIMS = ', 1)[1].rstrip().rstrip(';'))
    wanted = set(filter(None, args.only.split(',')))

    simulator, names, talent_names = Simulator(args.cli), Names(), load_talent_names()
    builds = dict(existing.get('builds', {}))
    for build in BUILDS:
        if wanted and build['id'] not in wanted:
            continue
        builds[build['id']] = sim_build(simulator, build, names, talent_names)
    names.save()

    meta = dict(existing.get('meta', {}))
    meta.update({'iterations': 25000, 'fightLengths': FIGHT_LENGTHS})
    if args.sim_version:
        meta['simVersion'] = args.sim_version
    if args.date:
        meta['simDate'] = args.date
    payload = json.dumps({'meta': meta, 'builds': builds}, separators=(',', ':'), ensure_ascii=False)
    out_file.write_text('// Generated by tools/run_sims.py from wowsimcli runs. Do not edit by hand.\n'
                        f'window.SIMS = {payload};\n', encoding='utf-8')
    print(out_file, f'{simulator.runs} runs')


if __name__ == '__main__':
    main()
