(function () {
  'use strict';

  const { TIERS, staleness } = window.ProduceData;

  const els = {
    stale: document.getElementById('stale'),
    status: document.getElementById('status'),
    results: document.getElementById('results'),
    updated: document.getElementById('updated'),
    scanPage: document.getElementById('scan-page'),
  };

  function renderStaleness() {
    const s = staleness(new Date());
    els.updated.textContent = `List updated ${s.updated}`;
    if (!s.isStale) return;
    els.stale.hidden = false;
    els.stale.innerHTML =
      `<strong>⚠ This list is ${s.months} months old.</strong> ` +
      `EWG republishes the Shopper's Guide annually. Rankings have likely shifted — ` +
      `refresh <code>src/data/produce.js</code> from <a href="${s.source}" target="_blank" rel="noreferrer">ewg.org/foodnews</a>.`;
  }

  const ORDER = ['dirty', 'caution', 'moderate', 'clean'];

  function render(items, scope) {
    els.results.innerHTML = '';

    // The whole point of the audit: what's in the basket conventional that shouldn't be.
    const swaps = items.filter((i) => !i.organic && (i.tier === 'dirty' || i.tier === 'caution'));
    if (scope === 'cart') {
      const summary = document.createElement('div');
      summary.className = swaps.length ? 'summary summary--warn' : 'summary summary--ok';
      summary.textContent = swaps.length
        ? `${swaps.length} item${swaps.length === 1 ? '' : 's'} worth swapping to organic`
        : 'Nothing in the cart needs an organic swap';
      els.results.appendChild(summary);
    }

    const groups = ORDER.map((tier) => [tier, items.filter((i) => i.tier === tier)]).filter(
      ([, list]) => list.length
    );

    for (const [tier, list] of groups) {
      const section = document.createElement('section');
      const h = document.createElement('h2');
      h.innerHTML = `<span class="dot dot--${tier}"></span>${TIERS[tier].badge} <em>${TIERS[tier].advice}</em>`;
      section.appendChild(h);

      const ul = document.createElement('ul');
      for (const item of list.sort((a, b) => (a.rank || 99) - (b.rank || 99))) {
        const li = document.createElement('li');
        li.className = item.organic ? 'already-organic' : '';
        li.textContent = item.title;
        if (item.organic) {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = 'already organic';
          li.appendChild(tag);
        }
        ul.appendChild(li);
      }
      section.appendChild(ul);
      els.results.appendChild(section);
    }
  }

  async function ask(type) {
    els.results.innerHTML = '';
    els.status.textContent = 'Reading page…';
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab || !/instacart\.com/.test(tab.url || '')) {
      els.status.textContent = 'Open an Instacart page first.';
      return;
    }

    let res;
    try {
      res = await browser.tabs.sendMessage(tab.id, { type });
    } catch (e) {
      els.status.textContent = 'Content script not loaded — reload the Instacart tab.';
      return;
    }

    if (type === 'AUDIT_CART' && !res.cartFound) {
      els.status.textContent = 'Cart not visible. Open your cart, then audit again.';
      return;
    }
    if (!res.items.length) {
      els.status.textContent = 'No produce recognized here.';
      return;
    }

    els.status.textContent = `${res.items.length} produce item${res.items.length === 1 ? '' : 's'} found`;
    render(res.items, res.scope);
  }

  els.scanPage.addEventListener('click', () => ask('SCAN_PAGE'));

  // Dim (default) vs hide outright. Persisted so it survives the popup closing;
  // pushed to the open tab so the grid updates without a reload.
  const hideMode = document.getElementById('hide-mode');
  browser.storage.local.get({ hideMode: false })
    .then((cfg) => { hideMode.checked = !!cfg.hideMode; })
    .catch(() => { hideMode.checked = false; });
  hideMode.addEventListener('change', async () => {
    await browser.storage.local.set({ hideMode: hideMode.checked });
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab && /instacart\.com/.test(tab.url || '')) {
      try {
        await browser.tabs.sendMessage(tab.id, { type: 'SET_MODE', hideMode: hideMode.checked });
      } catch (e) {
        els.status.textContent = 'Reload the Instacart tab to apply.';
      }
    }
  });

  renderStaleness();
})();
