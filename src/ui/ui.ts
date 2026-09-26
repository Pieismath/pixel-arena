import { PRICES, SEAT_COUNT, takeoverPrice, usd } from '../config';
import type { ArenaState, Brand, Holding, SeatSale, SpotRef } from '../data/types';
import { bannerSideName, muralWallName, SEATS, SECTIONS, seatKey } from '../world/layout';

export interface UIHandlers {
  focus(ref: SpotRef): void;
  clearFocus(): void;
  toggleTrailer(): void;
  toggleDemo(): void;
  setView?(view: 'overview' | 'courtside' | 'crowd'): void;
  playHighlight?(): void;
  onShare?(ref: SpotRef): Promise<void>;
  previewTakeover?(): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Only http(s) links ever reach an href. */
function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function createUI(handlers: UIHandlers) {
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const title = byId('court-title');
  const namingLine = byId<HTMLButtonElement>('naming-line');
  const chipSales = byId('chip-sales');
  const chipSeats = byId('chip-seats');
  const panel = byId('panel');
  const panelBody = byId('panel-body');
  const leaders = byId('leaders');
  const leadersBody = byId('leaders-body');
  const tooltip = byId('tooltip');
  const toast = byId('toast');
  const demoNote = byId('demo-note');
  const demoBtn = byId<HTMLButtonElement>('btn-demo');
  const namingTier = byId('tier-naming-price');
  const screenTier = byId('tier-screen-price');
  const leadersBtn = byId<HTMLButtonElement>('btn-leaders');
  const highlightBtn = byId<HTMLButtonElement>('btn-highlight');
  const exitTrailerBtn = byId<HTMLButtonElement>('btn-exit-trailer');

  let state: ArenaState;
  let selected: SpotRef | null = null;
  let sharing = false;
  const seatSales = new Map<string, SeatSale>();
  let toastTimer = 0;

  const brandOf = (id: string | null) => (id ? state.brands[id] ?? null : null);

  function render(next: ArenaState) {
    state = next;
    seatSales.clear();
    for (const s of state.seats) seatSales.set(seatKey(s.section, s.row, s.col), s);

    const naming = brandOf(state.naming.brandId);
    title.textContent = 'RUCKER PARK';
    document.title = `Rucker Park · ${state.demo ? 'Fictional pickup game' : 'Court preview'}`;
    namingLine.textContent = naming
      ? `Demo presented by ${naming.name} ↗`
      : `Your name here · ${usd(state.naming.valueCents)} ↗`;
    namingTier.textContent = naming ? usd(takeoverPrice(state.naming.valueCents)) : usd(state.naming.valueCents);
    screenTier.textContent = `${usd(state.screen.dayPriceCents)}/day`;
    chipSales.textContent = state.demo ? 'FICTIONAL DEMO' : state.totalSalesCents === null ? 'PREVIEW · OPENING SOON' : `Sales ${usd(state.totalSalesCents)}`;
    chipSeats.textContent = `${state.seats.length.toLocaleString('en-US')} / ${SEAT_COUNT.toLocaleString('en-US')} seats`;
    demoNote.hidden = !state.demo;
    demoBtn.textContent = state.demo ? 'Demo: on' : 'Demo: off';
    demoBtn.setAttribute('aria-pressed', String(state.demo));
    if (!leaders.hidden) renderLeaders();
  }

  function brandBlock(b: Brand) {
    const url = safeUrl(b.url);
    return `
      <div class="brand-card" style="--brand:${esc(b.color)};--brand-ink:${esc(b.accent)}">
        <div class="brand-swatch">${esc(b.name.slice(0, 1).toUpperCase())}</div>
        <div class="brand-text">
          <div class="brand-name">${esc(b.name)}</div>
          <div class="brand-tagline">${esc(b.tagline)}</div>
          ${url ? `<a class="brand-link" href="${esc(url)}" target="_blank" rel="sponsored noopener noreferrer">${esc(hostOf(url))} ↗</a>` : ''}
        </div>
      </div>`;
  }

  const stats = (h: Holding, label: string) =>
    `<dl class="stats"><div><dt>${state.demo ? 'Demo spot value' : 'Last sold for'}</dt><dd>${usd(h.valueCents)}</dd></div><div><dt>${state.demo ? `Demo: ${label.toLowerCase()}` : label}</dt><dd>${h.takeovers}×</dd></div></dl>`;

  function takeoverBlock(h: Holding, noun: string, verbOpen: string) {
    const brand = brandOf(h.brandId);
    if (brand) {
      return `${brandBlock(brand)}${stats(h, 'Taken over')}
        <p>Anyone can take this ${noun} by paying 1.25× what it last sold for.</p>
        <button class="cta" data-checkout>Take this ${noun} · ${usd(takeoverPrice(h.valueCents))}</button>`;
    }
    return `<p class="big">Available</p>
      <p>${verbOpen} Once it's yours, anyone can take it by paying 1.25× your price.</p>
      <button class="cta" data-checkout>Claim this ${noun} · ${usd(h.valueCents)}</button>`;
  }

  function spotHtml(ref: SpotRef): string {
    if (ref.kind === 'seat') {
      const sale = seatSales.get(seatKey(ref.section, ref.row, ref.col));
      const where = `${SECTIONS[ref.section].name} bleachers · Row ${ref.row + 1} · Seat ${ref.col + 1}`;
      const brand = sale ? brandOf(sale.brandId) : null;
      return `
        <div class="badge">Seat</div>
        <h2 id="panel-title">${where}</h2>
        ${
          brand
            ? `${brandBlock(brand)}
               <p class="muted">Seats are kept for good. The fan here wears ${esc(brand.name)}'s colors and holds up its card.</p>
               <button class="cta" data-checkout>Claim an empty seat · ${usd(PRICES.seatCents)}</button>`
            : `<p class="big">Available</p>
               <p>Put a fan in your colors in the bleachers, holding up your card, for as long as the court exists.</p>
               <p class="muted">Buy a block of seats and the cards spell out your logo, like a stadium card stunt.</p>
               <button class="cta" data-checkout>Claim this seat · ${usd(PRICES.seatCents)}</button>`
        }`;
    }
    if (ref.kind === 'banner') {
      return `
        <div class="badge">Banner #${ref.index + 1}</div>
        <h2 id="panel-title">${bannerSideName(ref.index)}</h2>
        ${takeoverBlock(state.banners[ref.index], 'banner', 'Your banner zip-tied courtside, in every shot of the game.')}`;
    }
    if (ref.kind === 'mural') {
      return `
        <div class="badge">Mural #${ref.index + 1}</div>
        <h2 id="panel-title">${muralWallName(ref.index)}</h2>
        ${takeoverBlock(state.murals[ref.index], 'mural', 'A spray-painted mural of your brand on the wall overlooking the court.')}`;
    }
    if (ref.kind === 'screen') {
      const brand = brandOf(state.screen.brandId);
      return `
        <div class="badge">Big screen</div>
        <h2 id="panel-title">${brand ? 'On the big screen today' : 'Open today'}</h2>
        ${brand ? brandBlock(brand) : ''}
        <p>The courtside scoreboard shows a compact sponsor card between score updates. Rented by the day.</p>
        <p class="muted">Launching something new? Put your launch day up in lights.</p>
        <button class="cta" data-checkout>Pick a day · ${usd(state.screen.dayPriceCents)}/day</button>`;
    }
    const brand = brandOf(state.naming.brandId);
    const h = state.naming;
    return `
      <div class="badge">Court name</div>
      <h2 id="panel-title">${brand ? `The ${esc(brand.name)} Court` : 'The ______ Court'}</h2>
      ${brand ? brandBlock(brand) : ''}
      <p>One featured sponsor spot: center court, sideline lettering, and the scoreboard header. Rucker Park remains the location of this fictional game.</p>
      ${
        brand
          ? `${stats(h, 'Renamed')}<button class="cta" data-checkout>Rename the court · ${usd(takeoverPrice(h.valueCents))}</button>`
          : `<button class="cta" data-checkout>Name the court · ${usd(h.valueCents)}</button>`
      }
      <p class="muted">Anyone can take the name by paying 1.25× the last price.</p>
      ${handlers.previewTakeover ? '<button class="share-button" data-takeover-preview type="button">Preview a court takeover <span aria-hidden="true">↗</span></button><p class="preview-footnote">A temporary fictional demo. No purchase or ownership change.</p>' : ''}`;
  }

  function showSpot(ref: SpotRef) {
    selected = ref;
    leaders.hidden = true;
    leadersBtn.setAttribute('aria-expanded', 'false');
    panelBody.innerHTML = `${spotHtml(ref)}
      ${handlers.onShare ? '<button class="share-button" data-share type="button">Download spot card <span aria-hidden="true">↓</span></button>' : ''}
      <p class="preview-footnote">${state.demo ? 'Fictional demo brands. ' : ''}Preview prices. Checkout is not live.</p>`;
    panel.hidden = false;
    panel.scrollTop = 0;
  }

  function hidePanels() {
    panel.hidden = true;
    leaders.hidden = true;
    selected = null;
    leadersBtn.setAttribute('aria-expanded', 'false');
  }

  function renderLeaders() {
    const naming = brandOf(state.naming.brandId);
    const screen = brandOf(state.screen.brandId);
    const ranked = (list: Holding[], kind: 'banner' | 'mural') =>
      list
        .map((h, index) => ({ h, index, brand: brandOf(h.brandId) }))
        .filter((b) => b.brand)
        .sort((a, b) => b.h.valueCents - a.h.valueCents)
        .slice(0, 5)
        .map((b) => row(JSON.stringify({ kind, index: b.index }), b.brand!.name, usd(b.h.valueCents), b.brand))
        .join('');
    const seatCounts = new Map<string, number>();
    for (const s of state.seats) seatCounts.set(s.brandId, (seatCounts.get(s.brandId) ?? 0) + 1);
    const topSeats = [...seatCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    function row(ref: string, label: string, value: string, brand: Brand | null) {
      return `<li><button class="leader-row" data-ref='${ref}'>
         <span class="dot" style="background:${esc(brand?.color ?? '#2b3558')}"></span>
         <span class="leader-name">${esc(label)}</span><span class="leader-value">${esc(value)}</span>
       </button></li>`;
    }

    const banners = ranked(state.banners, 'banner');
    const murals = ranked(state.murals, 'mural');
    leadersBody.innerHTML = `
      <h3>Court name</h3>
      <ul>${row('{"kind":"naming"}', naming ? naming.name : 'Open', usd(state.naming.valueCents), naming)}</ul>
      <h3>Big screen today</h3>
      <ul>${row('{"kind":"screen"}', screen ? screen.name : 'Open', `${usd(state.screen.dayPriceCents)}/day`, screen)}</ul>
      <h3>Top murals</h3>
      <ul>${murals || '<li class="muted">No murals sold yet.</li>'}</ul>
      <h3>Top banners</h3>
      <ul>${banners || '<li class="muted">No banners sold yet.</li>'}</ul>
      <h3>Most seats</h3>
      <ul>${
        topSeats.length
          ? topSeats
              .map(([id, n]) => {
                const brand = brandOf(id);
                const first = state.seats.find((s) => s.brandId === id)!;
                return row(JSON.stringify({ kind: 'seat', section: first.section, row: first.row, col: first.col }), brand?.name ?? id, `${n} seats`, brand);
              })
              .join('')
          : '<li class="muted">No seats sold yet.</li>'
      }</ul>`;
  }

  function showToast(text: string) {
    toast.textContent = text;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 3200);
  }

  function describe(ref: SpotRef): string {
    if (ref.kind === 'seat') {
      const sale = seatSales.get(seatKey(ref.section, ref.row, ref.col));
      const brand = sale ? brandOf(sale.brandId) : null;
      return brand ? `${brand.name} · seat` : `Empty seat · ${usd(PRICES.seatCents)}`;
    }
    if (ref.kind === 'banner' || ref.kind === 'mural') {
      const h = (ref.kind === 'banner' ? state.banners : state.murals)[ref.index];
      const brand = brandOf(h.brandId);
      return brand ? `${brand.name} · take it for ${usd(takeoverPrice(h.valueCents))}` : `Open ${ref.kind} · ${usd(h.valueCents)}`;
    }
    if (ref.kind === 'screen') {
      const brand = brandOf(state.screen.brandId);
      return brand ? `Big screen today: ${brand.name}` : `Big screen · ${usd(state.screen.dayPriceCents)}/day`;
    }
    const brand = brandOf(state.naming.brandId);
    return brand ? `The ${brand.name} Court · rename it for ${usd(takeoverPrice(state.naming.valueCents))}` : 'Naming rights available';
  }

  function firstOpenSeat(): SpotRef {
    // Prefer a seat near half court in the main (north) bleachers.
    const mid = (SECTIONS[0].cols - 1) / 2;
    const candidates = SEATS.filter((s) => s.section === 0 && s.row <= 5).sort((a, b) => Math.abs(a.col - mid) - Math.abs(b.col - mid) || a.row - b.row);
    const open = candidates.find((s) => !seatSales.has(seatKey(s.section, s.row, s.col))) ?? SEATS[0];
    return { kind: 'seat', section: open.section, row: open.row, col: open.col };
  }

  function firstOpen(list: Holding[]) {
    const open = list.findIndex((h) => !h.brandId);
    if (open >= 0) return open;
    let cheapest = 0;
    list.forEach((h, i) => {
      if (h.valueCents < list[cheapest].valueCents) cheapest = i;
    });
    return cheapest;
  }

  document.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const share = el.closest<HTMLButtonElement>('[data-share]');
    if (share && selected && handlers.onShare && !sharing) {
      sharing = true;
      share.disabled = true;
      share.textContent = 'Making your spot card…';
      void handlers.onShare(selected).then(
        () => showToast('Your spot card is ready.'),
        () => showToast('The spot card could not be saved. Please try again.'),
      ).finally(() => {
        sharing = false;
        share.disabled = false;
        share.innerHTML = 'Download spot card <span aria-hidden="true">↓</span>';
      });
      return;
    }
    if (el.closest('[data-takeover-preview]')) {
      handlers.previewTakeover?.();
      return;
    }
    const view = el.closest<HTMLElement>('[data-view]')?.dataset.view;
    if (view === 'overview' || view === 'courtside' || view === 'crowd') {
      handlers.setView?.(view);
      return;
    }
    if (el.closest('[data-checkout]')) {
      showToast("Checkout isn't live yet. This is a preview of the court.");
      return;
    }
    const leader = el.closest<HTMLElement>('.leader-row');
    if (leader?.dataset.ref) {
      handlers.focus(JSON.parse(leader.dataset.ref) as SpotRef);
      return;
    }
    const tier = el.closest<HTMLElement>('.tier');
    if (tier) {
      const kind = tier.dataset.kind;
      const ref: SpotRef =
        kind === 'seat'
          ? firstOpenSeat()
          : kind === 'banner'
            ? { kind: 'banner', index: firstOpen(state.banners) }
            : kind === 'mural'
              ? { kind: 'mural', index: firstOpen(state.murals) }
              : kind === 'screen'
                ? { kind: 'screen' }
                : { kind: 'naming' };
      handlers.focus(ref);
    }
  });
  namingLine.addEventListener('click', () => handlers.focus({ kind: 'naming' }));
  leadersBtn.addEventListener('click', () => {
    if (leaders.hidden) {
      panel.hidden = true;
      renderLeaders();
      leaders.hidden = false;
    } else leaders.hidden = true;
    leadersBtn.setAttribute('aria-expanded', String(!leaders.hidden));
  });
  byId('btn-trailer').addEventListener('click', () => handlers.toggleTrailer());
  exitTrailerBtn.addEventListener('click', () => handlers.toggleTrailer());
  highlightBtn.addEventListener('click', () => handlers.playHighlight?.());
  demoBtn.addEventListener('click', () => handlers.toggleDemo());
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.panel-close')) {
    btn.addEventListener('click', () => {
      hidePanels();
      handlers.clearFocus();
    });
  }

  return {
    render,
    showSpot,
    hidePanels,
    showToast,
    setView(view: 'overview' | 'courtside' | 'crowd') {
      for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
        button.setAttribute('aria-pressed', String(button.dataset.view === view));
      }
    },
    setHighlightPlaying(active: boolean) {
      highlightBtn.classList.toggle('is-playing', active);
      highlightBtn.innerHTML = active ? '<span aria-hidden="true">↗</span> Highlight playing' : '<span aria-hidden="true">↗</span> Play a highlight';
      highlightBtn.setAttribute('aria-pressed', String(active));
    },
    setTrailerMode(active: boolean) {
      exitTrailerBtn.hidden = !active;
      byId('btn-trailer').setAttribute('aria-pressed', String(active));
    },
    showTooltip(ref: SpotRef, x: number, y: number) {
      tooltip.textContent = describe(ref);
      tooltip.hidden = false;
      const left = Math.max(12, Math.min(x + 14, innerWidth - tooltip.offsetWidth - 12));
      const top = Math.max(12, Math.min(y + 14, innerHeight - tooltip.offsetHeight - 12));
      tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    },
    hideTooltip() {
      tooltip.hidden = true;
    },
  };
}

export type UI = ReturnType<typeof createUI>;
