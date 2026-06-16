import './styles.css';
import { FEATURED_CIVS, PILLARS, ERAS, ALL_LEADERS, HERO_IMAGES } from './data';

function $<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector(selector);
}

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function populatePillars(): void {
  const grid = $('#pillars-grid');
  if (!grid) return;
  grid.innerHTML = PILLARS.map(
    (p, i) => `
      <article class="pillar-card" style="--delay:${i * 0.1}s">
        <div class="pillar-art"><img src="assets/pillars/${p.image}.png" alt="" loading="lazy" /></div>
        <h3>${p.title}</h3>
        <p>${p.desc}</p>
      </article>
    `
  ).join('');
}

function populateFeaturedCiv(index: number): void {
  const civ = FEATURED_CIVS[index];
  if (!civ) return;

  const img = $<HTMLImageElement>('#featured-img');
  const region = $('#featured-region');
  const name = $('#featured-name');
  const leader = $('#featured-leader');
  const abilityName = $('#featured-ability-name');
  const abilityDesc = $('#featured-ability-desc');
  const uu = $('#featured-uu');
  const ui = $('#featured-ui');
  const counter = $('#civ-counter');

  if (img) {
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = `assets/leaders/${civ.id}.png`;
      img.alt = `${civ.leader}, leader of ${civ.name}`;
      img.style.opacity = '1';
    }, 200);
  }
  if (region) region.textContent = `${civ.region} • ${civ.era}`;
  if (name) name.textContent = civ.name;
  if (leader) leader.textContent = `Led by ${civ.leader}`;
  if (abilityName) abilityName.textContent = civ.abilityName;
  if (abilityDesc) abilityDesc.textContent = civ.abilityDesc;
  if (uu) uu.textContent = civ.uniqueUnit;
  if (ui) ui.textContent = civ.uniqueInfra;
  if (counter) counter.textContent = `${index + 1} / ${FEATURED_CIVS.length}`;
}

function setupFeaturedCarousel(): void {
  let index = 0;
  populateFeaturedCiv(index);

  const prev = $('#prev-civ');
  const next = $('#next-civ');

  const go = (dir: number) => {
    index = (index + dir + FEATURED_CIVS.length) % FEATURED_CIVS.length;
    populateFeaturedCiv(index);
  };

  prev?.addEventListener('click', () => go(-1));
  next?.addEventListener('click', () => go(1));

  // Auto-advance every 6s, pause on hover
  const wrapper = $('#featured-civ');
  let timer = setInterval(() => go(1), 6000);

  const restartTimer = () => {
    clearInterval(timer);
    timer = setInterval(() => go(1), 6000);
  };

  const goTo = (target: number) => {
    index = (target + FEATURED_CIVS.length) % FEATURED_CIVS.length;
    populateFeaturedCiv(index);
    restartTimer();
  };

  wrapper?.addEventListener('mouseenter', () => clearInterval(timer));
  wrapper?.addEventListener('mouseleave', restartTimer);

  // Clicking a leader portrait in the marquee jumps the carousel to that civ.
  const marquee = $('#leader-marquee');
  marquee?.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.marquee-item') as HTMLElement | null;
    if (!item) return;
    const id = item.dataset.id;
    if (!id) return;
    const targetIndex = FEATURED_CIVS.findIndex((c) => c.id === id);
    if (targetIndex !== -1) goTo(targetIndex);
  });
}

function populateLeaderMarquee(): void {
  const track = $('#leader-marquee');
  if (!track) return;
  const shuffled = shuffle(ALL_LEADERS);
  const items = shuffled
    .map(
      (id) => `
        <div class="marquee-item" data-id="${id}" tabindex="0" role="button" aria-label="View ${id.replace(/_/g, ' ')}">
          <img src="assets/leaders/${id}.png" alt="" loading="lazy" />
        </div>
      `
    )
    .join('');
  track.innerHTML = items + items; // duplicate for seamless loop

  // Keyboard support: Enter/Space activates a portrait.
  track.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = (e.target as HTMLElement).closest('.marquee-item') as HTMLElement | null;
    if (!item) return;
    e.preventDefault();
    item.click();
  });
}

function populateEras(): void {
  const timeline = $('#eras-timeline');
  if (!timeline) return;
  timeline.innerHTML = ERAS.map(
    (era, i) => `
      <article class="era-card" style="--delay:${i * 0.12}s">
        <div class="era-art"><img src="assets/ages/${era.image}.png" alt="" loading="lazy" /></div>
        <div class="era-body">
          <span class="era-years">${era.years}</span>
          <h3>${era.name}</h3>
          <p>${era.desc}</p>
        </div>
      </article>
    `
  ).join('');
}

function populateHexCluster(): void {
  const cluster = $('#hex-cluster');
  if (!cluster) return;
  const terrains = ['plains', 'grassland', 'forest', 'hills', 'mountains', 'ocean', 'desert', 'coast', 'jungle', 'tundra', 'snow'];
  const rows = 5;
  const cols = 6;
  let html = '';
  for (let r = 0; r < rows; r++) {
    html += '<div class="hex-row">';
    for (let c = 0; c < cols; c++) {
      const terrain = terrains[(r + c) % terrains.length];
      const unit = (r + c) % 7 === 0 ? 'assets/units/warrior.png' : (r + c) % 11 === 0 ? 'assets/buildings/city_1.png' : null;
      html += `
        <div class="hex" style="--delay:${(r * cols + c) * 0.03}s">
          <img class="hex-terrain" src="assets/terrain/${terrain}.png" alt="" loading="lazy" />
          ${unit ? `<img class="hex-overlay" src="${unit}" alt="" loading="lazy" />` : ''}
        </div>
      `;
    }
    html += '</div>';
  }
  cluster.innerHTML = html;
}

function setupHeroBackground(): void {
  const bg = $('#hero-bg');
  if (!bg) return;

  HERO_IMAGES.forEach((id, i) => {
    const img = document.createElement('img');
    img.src = `assets/hero/${id}.png`;
    img.alt = '';
    img.loading = i === 0 ? 'eager' : 'lazy';
    if (i === 0) img.classList.add('active');
    bg.appendChild(img);
  });

  // Cycle backgrounds every 10s with a slow crossfade + zoom.
  let index = 0;
  const images = bg.querySelectorAll('img');
  if (images.length <= 1) return;

  setInterval(() => {
    images[index]?.classList.remove('active');
    index = (index + 1) % images.length;
    images[index]?.classList.add('active');
  }, 10000);
}

function setupNavigation(): void {
  const toggle = $('.nav-toggle');
  const menu = $('#nav-menu');
  toggle?.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    menu?.classList.toggle('open');
  });

  const nav = $('.site-nav');
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 20);
  });
}

function setupScrollReveal(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.section-title, .section-lead, .pillar-card, .era-card, .featured-civ, .world-layout, .cta-actions').forEach((el) => {
    el.classList.add('reveal-on-scroll');
    observer.observe(el);
  });
}

function init(): void {
  populatePillars();
  setupFeaturedCarousel();
  populateLeaderMarquee();
  populateEras();
  populateHexCluster();
  setupHeroBackground();
  setupNavigation();
  setupScrollReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
