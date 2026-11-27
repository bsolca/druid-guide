(function () {
  const { GUIDE, SIMS, SETUPS, TALENTS } = window;
  const state = { mode: 'pve', buildId: 'cat', length: '180', talent: null };
  const RACE_NAMES = { night_elf: 'Night Elf', tauren: 'Tauren', high_order_skyborne: 'High Order Skyborne', windshaper_skyborne: 'Windshaper Skyborne' };
  const SOURCE_NAMES = { Attack: 'Auto attack' };

  const el = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size = 'medium') => `https://wow.zamimg.com/images/wow/icons/${size}/${name || 'inv_misc_questionmark'}.jpg`;
  const whole = n => Math.round(n).toLocaleString('en-US');
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const stripTags = text => text.replace(/<!--.*?-->/g, '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  const builds = () => GUIDE[state.mode];
  const build = () => builds().find(b => b.id === state.buildId) || builds()[0];
  const sim = b => (b.sim ? SIMS.builds[b.sim] : null);
  const isTank = b => Boolean(sim(b) && 'tps' in sim(b).base);
  const talentsOf = b => (sim(b) ? sim(b).talents : b.talents);

  function pointsByTree(talentString) {
    const parts = (talentString || '').split('-');
    return TALENTS.trees.map((tree, i) => tree.talents.map((_, slot) => Number((parts[i] || '')[slot] || 0)));
  }

  function toggle(container, options, current, onPick) {
    container.innerHTML = options.map(([value, label]) =>
      `<button type="button" data-value="${esc(value)}" aria-pressed="${value === current}">${esc(label)}</button>`).join('');
    container.onclick = event => {
      const button = event.target.closest('button');
      if (button) onPick(button.dataset.value);
    };
  }

  function headlineFigure(b, numbers) {
    if (!numbers) return { value: '—', unit: 'not simulated' };
    return isTank(b) ? { value: whole(numbers.tps), unit: 'TPS' } : { value: whole(numbers.dps), unit: 'DPS' };
  }

  function renderMode() {
    toggle(el('mode'), [['pve', 'PvE'], ['pvp', 'PvP']], state.mode, mode => {
      state.mode = mode;
      state.buildId = GUIDE[mode][0].id;
      state.talent = null;
      render();
    });
    const pve = state.mode === 'pve';
    el('lede').textContent = pve
      ? 'Pick a build, copy its talents, learn one short priority list, bring the right consumables. Every PvE number comes from the WoWSims Forever simulator.'
      : 'Builds for battlegrounds, duels and flag running. No simulator covers PvP, so this side is advice with its sources, not measurements.';
    el('notice').hidden = pve;
    el('notice').textContent = GUIDE.pvpNotice;
    el('lengths').hidden = !pve;
    el('pickhint').textContent = pve
      ? 'Cat does the most damage, Bear tanks, Moonkin casts from range. Hybrid is one talent build for both Feral forms.'
      : 'Feral has the most PvP material so far. Balance has none that anyone has tested.';
  }

  function renderLengths() {
    toggle(el('lengths'), SIMS.meta.fightLengths.map(s => [String(s), s < 120 ? `${s} s` : `${s / 60} min`]), state.length, length => {
      state.length = length;
      renderBuilds();
      renderPicked();
    });
  }

  function renderBuilds() {
    el('builds').innerHTML = builds().map(b => {
      const spec = GUIDE.specs[b.spec];
      const figure = state.mode === 'pve' ? headlineFigure(b, sim(b) && sim(b).byLength[state.length]) : null;
      return `<button type="button" class="card" data-build="${b.id}" aria-pressed="${b.id === build().id}" style="--accent:${spec.color}">
        <span class="card-top"><img src="${icon(spec.icon)}" width="36" height="36" alt=""><span><span class="card-name">${esc(b.name)}</span><br><span class="small">${esc(b.sub)}</span></span></span>
        ${figure ? `<span class="card-big">${figure.value}<small>${figure.unit}</small></span>` : ''}
        <span class="tag plain">${esc(spec.name)}</span>
      </button>`;
    }).join('');
    el('builds').onclick = event => {
      const card = event.target.closest('[data-build]');
      if (!card) return;
      state.buildId = card.dataset.build;
      state.talent = null;
      render();
    };
  }

  function barLines(rows, format) {
    const top = Math.max(...rows.map(r => Math.abs(r.value)), 1);
    return `<div class="bars">${rows.map(r => `<div class="bar-line">
      <span class="bar-label">${r.icon ? `<img src="${icon(r.icon, 'small')}" width="18" height="18" alt="">` : ''}<span>${esc(r.label)}</span></span>
      <span class="track"><span class="fill" style="width:${Math.max(2, 100 * Math.abs(r.value) / top)}%"></span></span>
      <span class="num">${format(r.value)}</span></div>`).join('')}</div>`;
  }

  function renderPicked() {
    const b = build();
    const spec = GUIDE.specs[b.spec];
    const data = sim(b);
    let body = `<p>${esc(b.when)}</p>`;
    if (data) {
      const n = data.byLength[state.length];
      const figures = isTank(b)
        ? [[whole(n.tps), 'threat per second'], [whole(n.dtps), 'damage taken per second'], [`${n.death}%`, 'chance to die'], [whole(n.dps), 'DPS']]
        : SIMS.meta.fightLengths.map(s => [whole(data.byLength[s].dps), `DPS at ${s} s${String(s) === state.length ? ' (selected)' : ''}`]);
      body += `<div class="figures">${figures.map(([value, label]) => `<div class="figure"><b>${value}</b><span>${label}</span></div>`).join('')}</div>`;
      const sources = data.sourcesByLength[state.length].filter(s => s.share >= 1).map(s => ({ label: SOURCE_NAMES[s.name] || s.name, icon: s.icon, value: s.dps }));
      body += `<h3 style="margin-top:18px">Where the damage comes from, at ${state.length} s</h3>${barLines(sources, v => whole(v))}`;
      body += `<p class="small">${whole(SIMS.meta.iterations)} simulated fights against one level 63 boss, full raid buffs and consumables, WoWSims Forever ${esc(SIMS.meta.simVersion)} on ${esc(SIMS.meta.simDate)}.</p>`;
    }
    if (b.source) body += `<p class="small">Source: <a href="${esc(b.source[1])}" target="_blank" rel="noopener">${esc(b.source[0])}</a></p>`;
    el('picked').style.setProperty('--accent', spec.color);
    el('picked').innerHTML = body;
  }

  function talentValue(b, name) {
    const data = sim(b);
    return data && data.talentValues[name];
  }

  function keyTalents(b) {
    const data = sim(b);
    if (!data) return new Set();
    const metric = isTank(b) ? 'tps' : 'dps';
    return new Set(Object.entries(data.talentValues).sort((a, c) => c[1].all[metric] - a[1].all[metric]).slice(0, 5).map(([name]) => name));
  }

  function renderTalents() {
    const b = build();
    const talentString = talentsOf(b);
    const actions = el('talentactions');
    if (!talentString) {
      actions.innerHTML = '';
      el('trees').innerHTML = '';
      el('talentinfo').innerHTML = '<p>No talent build to show for this card yet.</p>';
      return;
    }
    const calc = `https://www.wowhead.com/forever/talent-calc/druid/${TALENTS.hashVersion}${talentString}`;
    actions.innerHTML = `<button type="button" class="btn primary" id="copytalents">Copy talent string</button><a class="btn" href="${calc}" target="_blank" rel="noopener">Open in Wowhead ↗</a>`;
    el('copytalents').onclick = () => copy(talentString, 'Talent string copied');

    const points = pointsByTree(talentString);
    const key = keyTalents(b);
    el('trees').innerHTML = TALENTS.trees.map((tree, t) => {
      const spent = points[t].reduce((a, c) => a + c, 0);
      const cells = tree.talents.map((talent, slot) => {
        const taken = points[t][slot];
        const classes = ['talent', taken ? 'taken' : '', taken === talent.max ? 'full' : '', key.has(talent.name) ? 'key' : ''].join(' ');
        const pressed = state.talent && state.talent[0] === t && state.talent[1] === slot;
        return `<button type="button" class="${classes}" style="grid-row:${talent.row + 1};grid-column:${talent.col + 1}" data-tree="${t}" data-slot="${slot}" aria-pressed="${Boolean(pressed)}" title="${esc(talent.name)}">
          <img src="${icon(talent.icon)}" alt="${esc(talent.name)}" loading="lazy"><span class="pts">${taken}/${talent.max}</span></button>`;
      }).join('');
      return `<div class="tree"><div class="tree-head">${esc(tree.name)}<span>${spent}</span></div><div class="tree-grid">${cells}</div></div>`;
    }).join('');
    el('trees').onclick = event => {
      const cell = event.target.closest('.talent');
      if (!cell) return;
      state.talent = [Number(cell.dataset.tree), Number(cell.dataset.slot)];
      renderTalents();
    };
    renderTalentInfo(b, points);
  }

  function renderTalentInfo(b, points) {
    const info = el('talentinfo');
    if (!state.talent) {
      const note = b.unsimmed ? 'This build is not simulated: no talent has a measured value.' : sim(b) ? 'The glowing talents are the five worth the most in this build.' : 'PvP builds have no measured talent values.';
      info.innerHTML = `<p class="small" style="margin:0">${note}</p>`;
      return;
    }
    const [t, slot] = state.talent;
    const talent = TALENTS.trees[t].talents[slot];
    const taken = points[t][slot];
    const text = stripTags(talent.ranks[Math.max(taken, 1) - 1]);
    const value = talentValue(b, talent.name);
    let worth = '';
    const noise = sim(b) && sim(b).noise;
    const measurable = value && Object.keys(noise).some(metric => Math.abs(value.all[metric]) >= noise[metric]);
    if (value && !measurable) {
      worth = '<p><b>Worth in this build:</b> nothing the simulator can measure. Any difference is smaller than its run-to-run noise.</p>';
    } else if (value) {
      const tank = isTank(b);
      const parts = tank
        ? [`${signed(value.all.tps)} threat per second`, `${signed(value.all.dtps)} damage taken per second`, `${signed(value.all.death)} points of chance to die`]
        : [`${signed(value.all.dps)} DPS`];
      worth = `<p><b>Worth in this build:</b> ${parts.join(', ')} for ${value.points > 1 ? `all ${value.points} points` : 'its one point'}`;
      const lastPoint = value.last && (tank ? value.last.tps : value.last.dps);
      if (value.last && Math.abs(lastPoint) >= noise[tank ? 'tps' : 'dps']) worth += `; the last point alone is ${signed(lastPoint)} ${tank ? 'TPS' : 'DPS'}`;
      worth += '.</p>';
    } else if (taken && sim(b)) {
      worth = '<p class="small">No measured value for this talent.</p>';
    } else if (!taken) {
      worth = '<p class="small">Not taken in this build.</p>';
    }
    info.innerHTML = `<h3><a href="https://www.wowhead.com/forever/spell=${talent.spell}" target="_blank" rel="noopener">${esc(talent.name)}</a> <span class="small">${taken}/${talent.max}</span></h3><p>${esc(text)}</p>${worth}`;
  }

  function renderPlay() {
    const b = build();
    el('loop').style.setProperty('--accent', GUIDE.specs[b.spec].color);
    const lines = b.loop || b.play || [];
    el('loop').innerHTML = lines.map(([name, text]) => `<li><b>${esc(name)}</b><span>${esc(text)}</span></li>`).join('') || '<li><b>Nothing tested</b><span>No playstyle advice has a source yet.</span></li>';
    const opener = b.opener || [];
    el('openertitle').textContent = opener.length ? 'Opener: the first seconds, in order' : 'Opener';
    el('opener').innerHTML = opener.map(step => `<li>${esc(step)}</li>`).join('') || '<li class="small">PvP has no fixed opener: it depends on who you face.</li>';
    el('tips').innerHTML = b.tips.map(tip => `<li>${esc(tip)}</li>`).join('');
  }

  function itemLink(item, size = 18) {
    return `<a class="item q${item.quality || 1}" href="https://www.wowhead.com/forever/item=${item.id}" target="_blank" rel="noopener"><img src="${icon(item.icon, 'small')}" width="${size}" height="${size}" alt="">${esc(item.name)}</a>`;
  }

  function renderPrep() {
    const b = build();
    const body = el('prepbody');
    if (state.mode === 'pvp') {
      el('preptitle').textContent = 'PvP basics';
      el('prephint').textContent = 'What exists in Forever PvP, as far as sources confirm.';
      body.innerHTML = `<article class="panel" style="margin-top:0"><dl class="kv">${GUIDE.pvpBasics.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></article>`;
      return;
    }
    el('preptitle').textContent = 'Before the pull';
    const data = sim(b);
    const setup = b.setup && SETUPS[b.setup];
    if (!data || !setup) {
      el('prephint').textContent = 'Nothing measured for this build.';
      body.innerHTML = '<article class="panel" style="margin-top:0"><p style="margin:0">Bring mana: Major Mana Potions and Demonic Runes, plus an Innervate plan with the other druids.</p></article>';
      return;
    }
    const tank = isTank(b);
    const metric = tank ? 'tps' : 'dps';
    const unit = tank ? 'TPS' : 'DPS';
    el('prephint').textContent = `Consumables are worth ${whole(data.withoutConsumables[metric])} ${unit} here, raid buffs ${whole(data.withoutBuffs[metric])}.`;
    const consumables = setup.consumables.map(c => `<tr><td class="small">${esc(c.kind)}</td><td>${itemLink(c)}</td></tr>`).join('');
    const races = Object.entries(data.races).sort((a, c) => c[1][metric] - a[1][metric]);
    const best = races[0][1][metric];
    const raceRows = races.map(([race, n]) => `<tr><td>${RACE_NAMES[race]}</td><td class="num">${whole(n[metric])}</td><td class="num">${n[metric] === best ? 'best' : signed(n[metric] - best)}</td></tr>`).join('');
    const survival = tank ? `<div class="figure"><b>${signed(-data.withoutConsumables.dtps)}</b><span>damage taken per second without them</span></div>` : '';
    body.innerHTML = `<div class="three-up">
      <article class="panel" style="margin-top:0"><h3>Consumables in the sim</h3><table class="table">${consumables}</table></article>
      <article class="panel" style="margin-top:0"><h3>What they are worth</h3>
        <div class="figures"><div class="figure"><b>${whole(data.withoutConsumables[metric])}</b><span>${unit} from consumables</span></div>
        <div class="figure"><b>${whole(data.withoutBuffs[metric])}</b><span>${unit} from raid buffs</span></div>${survival}</div>
        ${setup.buffs.map(g => `<p class="small" style="margin:10px 0 4px">${esc(g.group)}</p><div class="chips">${g.names.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>`).join('')}
      </article>
      <article class="panel" style="margin-top:0"><h3>Which race?</h3><table class="table"><tr><th>Race</th><th class="num">${unit}</th><th class="num"></th></tr>${raceRows}</table>
        <p class="small">The gap is small. Play the one you like.</p></article>
    </div>`;
  }

  function renderGear() {
    const b = build();
    const body = el('gearbody');
    if (state.mode === 'pvp') {
      el('gearhint').textContent = 'Predicted, not tested.';
      body.innerHTML = `<article class="panel" style="margin-top:0"><ul class="plain">
        <li>The honor sets are the target: a blue set first, then epic upgrades tied to rank.</li>
        <li>Feral: Stamina and Attack Power. The pre-raid PvP set is reported at about 457 Attack Power and 241 Stamina.</li>
        <li>Boots: a speed enchant. Trinket: the PvP insignia.</li>
        <li>No source confirms a resilience stat or a PvP hit cap.</li></ul></article>`;
      return;
    }
    if (!b.weights) {
      el('gearhint').textContent = 'No measured stat weights for healing.';
      body.innerHTML = '<article class="panel" style="margin-top:0"><p style="margin:0">From the talent text: healing power first, then Spirit (Living Spirit and Bloom both scale with it) and Intellect.</p></article>';
      return;
    }
    const weights = GUIDE.statWeights[b.weights.source].map(([label, value]) => ({ label, value }));
    const setup = SETUPS[b.setup];
    el('gearhint').textContent = `${b.caps.join(', ')}. After that: longer bar, better stat.`;
    const gearRows = setup.gear.map(g => `<tr><td class="small">${esc(g.slot)}</td><td>${itemLink(g)}</td><td class="small">${esc(g.enchant || '')}</td></tr>`).join('');
    const swap = setup.swap.length ? `<p class="small">Swap slot: ${setup.swap.map(item => itemLink(item, 16)).join(', ')}</p>` : '';
    body.innerHTML = `<div class="two">
      <article class="panel" style="margin-top:0;--accent:${GUIDE.specs[b.spec].color}"><h3>Stat weights</h3>${barLines(weights, v => v.toFixed(2))}<p class="small">${esc(GUIDE.statWeightsNote)}</p></article>
      <article class="panel" style="margin-top:0"><h3>The gear set behind the numbers</h3><table class="table">${gearRows}</table>${swap}
        <p class="small">This is the simulator's reference set (${esc(setup.race)}, ${setup.professions.join(' and ')}), not a best-in-slot list.</p></article>
    </div>`;
  }

  function renderExtras() {
    el('macros').innerHTML = GUIDE.macros.map(([name, text], i) => `<div class="macro"><div class="macro-head">${esc(name)}<button type="button" class="btn" data-macro="${i}">Copy</button></div><pre>${esc(text)}</pre></div>`).join('');
    el('macros').onclick = event => {
      const button = event.target.closest('[data-macro]');
      if (button) copy(GUIDE.macros[Number(button.dataset.macro)][1], 'Macro copied');
    };
    el('macrosource').innerHTML = `Paste into a new macro in game (<b>/macro</b>). Adapted from <a href="${esc(GUIDE.macroSource[1])}" target="_blank" rel="noopener">${esc(GUIDE.macroSource[0])}</a>.`;
    el('addons').innerHTML = GUIDE.addons.map(([name, text, url]) => `<a class="card" href="${esc(url)}" target="_blank" rel="noopener"><span class="card-name">${esc(name)} ↗</span><span class="small">${esc(text)}</span></a>`).join('');
    el('gloss').innerHTML = GUIDE.glossary.map(([term, text]) => `<div><dt>${esc(term)}</dt><dd>${esc(text)}</dd></div>`).join('');
    el('foot').innerHTML = `<p>Sources: ${GUIDE.sources.map(([name, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`).join(' ')}</p>
      <p>A fan guide. World of Warcraft is a trademark of Blizzard Entertainment. Icons and tooltips load from Wowhead.</p>`;
  }

  let toastTimer;
  function copy(text, message) {
    const done = () => {
      el('toast').textContent = message;
      el('toast').hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el('toast').hidden = true; }, 1600);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy:', text));
    else window.prompt('Copy:', text);
  }

  function render() {
    renderMode();
    renderLengths();
    renderBuilds();
    renderPicked();
    renderTalents();
    renderPlay();
    renderPrep();
    renderGear();
  }

  renderExtras();
  render();
})();
