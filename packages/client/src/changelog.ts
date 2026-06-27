/// <reference types="vite/client" />
// Changelog: a simple overlay listing what changed in each release. Surfaced
// from the start screen via the version label so players can see what's new.

/** The current game version — shown on the start screen and atop the changelog. */
export const CURRENT_VERSION = "0.1.0";

interface ChangeEntry {
  /** Short category badge, e.g. "New", "Gameplay", "Fix". */
  tag: string;
  title: string;
  desc: string;
}

interface Release {
  version: string;
  /** Optional release date label, e.g. "June 2026". */
  date?: string;
  changes: ChangeEntry[];
}

/** Newest release first. */
const CHANGELOG: Release[] = [
  {
    version: "0.1.0",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Train armies from dedicated military buildings",
        desc:
          "Units are no longer built on the same queue as everything else. To raise an army you now construct the training building for each unit class — a Barracks for infantry, an Archery Range for ranged troops, a Stable for cavalry, a Siege Workshop for engines and a Shipyard for ships — then train units there. Every building has five tiers that train faster, muster steadier and more experienced recruits, and let you train several units at once.",
      },
      {
        tag: "Gameplay",
        title: "Every soldier is a citizen",
        desc:
          "Training a unit now costs one population — a citizen leaves the fields to take up arms. Construction is reserved for buildings, wonders and projects, so the real limit on your army is food and growth, not hammers. Settlers, traders and scouts likewise cost a citizen and are trained from the city centre.",
      },
      {
        tag: "Balance",
        title: "A richer food economy",
        desc:
          "With population now feeding your armies, the land feeds harder: grassland, lakes, wetlands and coasts yield more food, granaries and farms are more generous, cities grow faster, and every new city is founded at population 2 — or 3 for fertile river civilizations.",
      },
      {
        tag: "Gameplay",
        title: "Civilizations begin in character",
        desc:
          "Each civ now starts with an army drawn from its identity. A people whose unique unit is a bowman — Aragon's Almogàver, Babylon's Bowman, Nubia's archers — opens with ranged troops; mounted and seafaring nations bring extra scouts; and fertile river valleys found their capital a citizen larger. The civilization picker now lists each civ's exact starting units and capital size.",
      },
      {
        tag: "Balance",
        title: "All 137 civilizations rebalanced",
        desc:
          "Every civilization was re-tuned for the new economy. Production-for-war bonuses became training advantages (Assyria's war machine, Hungary's professional Black Army, the Tarascan metalsmiths), fertile and monastic peoples now lean into food and faith, and a handful of unique abilities that quietly never did anything were replaced with effects that actually work.",
      },
      {
        tag: "UI",
        title: "New training screen and military-building art",
        desc:
          "A new Train Units panel on every city shows its military buildings, how many units they can train at once, recruits in progress (with the option to cancel or rush them), and a clear free-citizen count — all with freshly painted art for the Barracks, Archery Range, Stable, Siege Workshop and Shipyard.",
      },
    ],
  },
  {
    version: "0.04",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Rush production with gold — or faith and culture",
        desc:
          "Impatient? You can now spend your treasury to finish a city's current build or a tile/wonder work immediately, paying per unit of work remaining. Gold always works; the new Corvée policy lets you rush with culture, and the Labor of Devotion belief lets you rush with faith — both a little cheaper than coin.",
      },
      {
        tag: "Gameplay",
        title: "Staff public works with individual craftsmen",
        desc:
          "Wonders and tile works are no longer powered by whole cities — you now assign specific craftsmen to them, and each works one project at a time. Start a work as soon as you've researched the right craft (you can staff it later), watch a turns-to-complete estimate, and pull crews onto whatever matters most right now.",
      },
      {
        tag: "Gameplay",
        title: "Wonders are within reach",
        desc:
          "Every ancient wonder costs roughly 40% less labour to raise, so a focused city can realistically complete one in the Ancient Era instead of toiling for an age.",
      },
      {
        tag: "Gameplay",
        title: "A far sharper opponent",
        desc:
          "Rival civilizations now play to win: they march armies onto your cities instead of skirmishing, cross the sea to reach island foes, garrison cities under threat, pull wounded units back to heal, beeline military tech when at war, settle genuinely good land, pick wonders and policies that suit their character, and splurge gold or faith to rush a wonder they're racing you for.",
      },
      {
        tag: "Gameplay",
        title: "Smarter, less repetitive diplomacy",
        desc:
          "AI civs now answer a lopsided trade with a fair counter-offer instead of a flat refusal, and they stop pestering you with the same deal — or the same peace plea — turn after turn. They also only declare wars they can actually prosecute, and commit to a single best target rather than picking a fight with the whole world at once.",
      },
      {
        tag: "Gameplay",
        title: "Barbarians burn your economy",
        desc:
          "Raiders no longer only hunt your units and cities — they now pillage farms, mines and roads and plunder trade routes running through their reach, so an unguarded frontier bleeds yields fast.",
      },
      {
        tag: "New",
        title: "Disband a trade route",
        desc:
          "You can now close one of your own trade routes — handy when raiders keep plundering it. The trader that opened the route is lost and there's no refund, so choose your moment.",
      },
      {
        tag: "New",
        title: "Richer village rewards",
        desc:
          "Goody huts can now bless you with a stockpile of faith or teach your people progress toward the civic you're studying. A gifted citizen now goes straight to work the best free tile, and scouts (who carry no morale) reroll a morale gift into something they can actually use.",
      },
      {
        tag: "UI",
        title: "Construction sites on the map",
        desc:
          "Tiles with a work under way now show an under-construction sprite — distinct for economic improvements, defences and wonders — so you can see at a glance where your craftsmen are busy.",
      },
      {
        tag: "UI",
        title: "See exactly what a Great Person will do",
        desc:
          "Activating a Great Person now previews the precise effect first — how much science, gold or production you'll gain, which city it lands in, or how many units get promoted or healed — so there are no surprises.",
      },
      {
        tag: "Fix",
        title: "Occupied tiles stop paying out",
        desc:
          "An enemy or barbarian standing on one of your worked tiles now blocks it — your citizens won't venture out under a hostile occupation, so a besieging army actually chokes the city it surrounds.",
      },
      {
        tag: "Fix",
        title: "Truly unlimited games",
        desc:
          "Setting no turn limit now means the game never ends on a score countdown — it runs until someone wins by a decisive condition (conquest, religion, and so on).",
      },
    ],
  },
  {
    version: "0.03",
    date: "June 2026",
    changes: [
      {
        tag: "Gameplay",
        title: "Scouts reworked into true explorers",
        desc:
          "Scouts no longer carry morale. They now grow by surviving attacks and by discovery — being the one to find villages, barbarian camps, natural wonders and new civilizations earns them experience. Their promotions are all reconnaissance now (sight, mobility, survival, defence), capped by a new Escape line: a rising chance — 50%, 75%, then 95% — to dodge an attack and slip back a tile unharmed, once per turn.",
      },
      {
        tag: "New",
        title: "Tech tree highlights your civilization's unique unlocks",
        desc:
          "The full tech tree now marks the technologies that unlock your civ's unique unit, unique building and leader ability — sometimes three different techs — and labels them with your unique's proper name instead of the generic one, so you can beeline what makes your civ special.",
      },
      {
        tag: "UI",
        title: "Cleaner unit info on mobile",
        desc:
          "On phones the unit panel now opens as a compact bar showing just the unit's name, strength and health, tucked in just above the toolbar so it no longer swallows the screen. Tap it to expand the full details, tap again to collapse.",
      },
      {
        tag: "UI",
        title: "Clearer tile yields when managing a city",
        desc:
          "Selecting a city now shows each workable tile's yields centred on the tile as a colour-coded label (food, production, gold, science), drawn on top so the city's name can no longer hide the tiles around it. Worked tiles are marked with a gold ring.",
      },
      {
        tag: "Fix",
        title: "Unit strength and movement now reflect civ bonuses",
        desc:
          "The unit info window showed only base stats. Combat strength now includes your civilization's class bonuses and unique-unit bonuses, and movement reflects civ movement perks — so a +2-melee civ's Warrior reads 10, not 8, matching what actually happens in battle.",
      },
      {
        tag: "Fix",
        title: "Military pay boosts are no longer free",
        desc:
          "Paying your army extra to lift morale now costs a minimum each turn — 10, 20, 30 or 40 gold at +50%, +100%, +150% and +200% — even when you have few or no units. Previously a large army-pay morale boost could cost nothing at all.",
      },
    ],
  },
  {
    version: "0.02",
    date: "June 2026",
    changes: [
      {
        tag: "New",
        title: "Turn idle labour into wealth, knowledge & more",
        desc:
          "A city with nothing it wants to build can now run a standing project that converts its production each turn. Coinage mints production into gold and is always available; once you research the right institutions you can also direct a city's labour into Scholarship (science), Patronage (culture) or Tithe (faith). No more wasting turns on units you don't need.",
      },
    ],
  },
  {
    version: "0.01",
    date: "June 2026",
    changes: [
      {
        tag: "Gameplay",
        title: "Reworked barbarians",
        desc:
          "Barbarian strength now scales with map size — no more near-empty giant maps. Camps keep raising war-bands with no global cap, and fresh camps emerge over time out in the fog of war, so clearing one eventually invites another to rise elsewhere.",
      },
      {
        tag: "New",
        title: "Bug reporting",
        desc:
          "You can now report a bug from inside the game. Your report carries a snapshot of the current game, so problems can be reproduced and fixed far faster.",
      },
    ],
  },
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function createChangelog(): { open(): void; close(): void } {
  const root = document.createElement("div");
  root.id = "changelog";
  root.className = "hidden";
  root.innerHTML = `
    <div class="changelog-shell">
      <div class="changelog-header">
        <div class="changelog-heading">
          <div class="changelog-title">What's New</div>
          <div class="changelog-subtitle">Recent changes to Rise of Civilizations.</div>
        </div>
        <button class="changelog-close" id="changelog-close" aria-label="Close">✕</button>
      </div>
      <div class="changelog-list">
        ${CHANGELOG.map(
          (r) => `
          <div class="changelog-release">
            <div class="changelog-release-head">
              <span class="changelog-version">v${escapeHtml(r.version)}</span>
              ${r.date ? `<span class="changelog-date">${escapeHtml(r.date)}</span>` : ""}
            </div>
            <div class="changelog-changes">
              ${r.changes
                .map(
                  (c) => `
                <div class="changelog-item">
                  <div class="changelog-item-top">
                    <span class="changelog-badge">${escapeHtml(c.tag)}</span>
                    <span class="changelog-item-title">${escapeHtml(c.title)}</span>
                  </div>
                  <div class="changelog-item-desc">${escapeHtml(c.desc)}</div>
                </div>`,
                )
                .join("")}
            </div>
          </div>`,
        ).join("")}
      </div>
    </div>`;

  const style = document.createElement("style");
  style.textContent = `
    #changelog{position:fixed;inset:0;z-index:60;background:rgba(15,14,11,.94);backdrop-filter:blur(10px);display:flex;align-items:stretch;justify-content:center;overflow:auto}
    #changelog.hidden{display:none !important}
    .changelog-shell{display:flex;flex-direction:column;width:min(640px,100%);margin:auto;min-height:100%;padding:max(28px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
    .changelog-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex:none}
    .changelog-title{font-family:'Cinzel',Georgia,serif;font-size:30px;font-weight:800;color:#e8dcc5;letter-spacing:.5px}
    .changelog-subtitle{color:#b8aa8d;font-size:14px;margin-top:6px;max-width:460px;line-height:1.5}
    .changelog-close{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:1px solid var(--edge);background:transparent;color:#e8dcc5;cursor:pointer;font-size:16px;line-height:1;transition:background .12s,border-color .12s,color .12s}
    .changelog-close:hover{background:rgba(201,162,39,.14);border-color:#c9a227;color:#f0d878}
    .changelog-list{flex:1;display:flex;flex-direction:column;gap:26px;margin-top:26px}
    .changelog-release-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--edge)}
    .changelog-version{font-family:'Cinzel',Georgia,serif;font-size:20px;font-weight:800;color:#f0d878}
    .changelog-date{color:#b8aa8d;font-size:12.5px;text-transform:uppercase;letter-spacing:.06em}
    .changelog-changes{display:flex;flex-direction:column;gap:12px;margin-top:14px}
    .changelog-item{padding:16px 18px;background:#1f1c14;border:1px solid var(--edge);border-radius:14px}
    .changelog-item-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .changelog-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#15120c;background:linear-gradient(135deg,#c9a227,#a6821f);border-radius:999px;padding:3px 9px}
    .changelog-item-title{font-family:'Cinzel',Georgia,serif;font-size:17px;font-weight:700;color:#e8dcc5}
    .changelog-item-desc{color:#b8aa8d;font-size:13.5px;line-height:1.5;margin-top:7px}
    @media(max-width:640px){
      .changelog-title{font-size:24px}
      .changelog-item{padding:14px}
    }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  const doClose = (): void => {
    root.classList.add("hidden");
  };
  root.querySelector<HTMLButtonElement>("#changelog-close")!.addEventListener("click", doClose);
  root.addEventListener("click", (e) => {
    if (e.target === root) doClose();
  });

  return {
    open() {
      root.classList.remove("hidden");
    },
    close: doClose,
  };
}
