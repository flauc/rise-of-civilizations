# Diplomacy

> **Status (audited 2026-06-19): v1 IMPLEMENTED** in `packages/sim/src/game/diplomacy.ts` (the original "for review before implementation" note is stale). First contact, state-aware `areEnemies`, peace/war with cooldown, attitudes & warmonger reputation, open borders, pacts, deals, gifts, demand-tribute, and AI evaluation are built, with the client diplomacy screen. **The §11 "Deferred" list is still deferred (not implemented):** city-states & envoys, tech trading, espionage/embassies, casus belli, AI counter-offers, world congress / **diplomatic victory**, and enforced territory passage.

*Design spec (2026-06-15).*

## 1. Goal & feel

Civilizations are no longer permanently at war with everyone (today `areEnemies`
returns `true` for any two players). Instead, major civs **meet**, form opinions
of one another, and conduct relations: peace and war, treaties, trades, threats
and gifts. The headline moment is **first contact** — the first time you sight
another civ's unit or city, a dialog presents the two civilizations **side by
side** (leader portrait, civ, ability) so the encounter feels like an event.

Diplomacy applies between **major civilizations** (the human player + AI civs).
**Barbarians are excluded** (always hostile, never negotiate). Independent
**city-states** are noted as a future extension (§11), not part of v1.

## 2. Core model

### 2.1 Who can have relations

Every ordered pair of major civs has, once they have **met**, a single shared
**relation** record (stored under a canonical key `min(id)-max(id)`):

```ts
type DiploStatus = "peace" | "war";

interface Relation {
  a: number; b: number;                 // player ids, a < b
  status: DiploStatus;                  // starts "peace" on first contact
  metTurn: number;
  lastStatusChangeTurn: number;         // gates the peace/war cooldown
  openBorders: boolean;                 // mutual right of passage
  pact: "none" | "non_aggression" | "defensive" | "alliance";
  pactUntilTurn?: number;               // timed pacts expire
  deals: Deal[];                        // active, time-limited agreements
}
```

Two **attitudes** are tracked *per direction* (A→B and B→A) because the AI's
opinion of you is not symmetric:

```ts
interface Attitude {
  from: number; to: number;
  score: number;                        // sum of modifiers, clamped [-100, 100]
  modifiers: { reason: string; value: number; expiresTurn?: number }[];
}
```

Score → label: `≤ -60 Hostile · -25 Unfriendly · -10 Wary · +10 Neutral ·
+40 Friendly · ≥ +40 Allied-leaning`. (Human-held attitude is not used by the
sim — only the AI consults its attitude toward you; we still display a label so
the player sees how the AI feels.)

### 2.2 State on `GameState`

```ts
relations: Relation[];                  // only for met pairs
attitudes: Attitude[];                  // AI-held; one per directed met pair where 'from' is AI
reputation: Record<number, number>;     // warmonger score per player (decays)
contactQueue: ContactEvent[];           // first-contacts awaiting client acknowledgement
diploProposals: Proposal[];             // pending offers needing a response (multiplayer / async)
```

Each `Player` gains `met: number[]` (ids of civs encountered) for fog/serialize
and to gate the UI.

### 2.3 `areEnemies` becomes state-aware

```ts
areEnemies(state, a, b): boolean
  = a.isBarbarian || b.isBarbarian        // barbarians: always hostile
  || relationBetween(state, a, b)?.status === "war";
```

Civs you have **not met** are not enemies (you can't attack what you haven't
found). Combat, attack-target computation and barbarian targeting all route
through this, so **you must be at war to attack another civ** — declaring war
becomes a real decision. (This touches `combat.ts`, `barbarians.ts`, `ai.ts`;
the signature gains `state`.)

## 3. First contact

In `updateExplored` (already recomputes visibility each turn and after moves):
for every tile a player can see that holds a **unit or city of another major
civ**, if the pair has not met:

1. create the `Relation` (status `peace`), add each to the other's `met` list,
   seed neutral attitudes;
2. push a `ContactEvent { youId, otherId, isPlayerCiv }` to `contactQueue`.

The serialized view surfaces the viewer's pending contact events. The client:

- **human ↔ AI:** pops the **first-contact dialog** (§7.1).
- **human ↔ human:** per the requirement, **no auto-dialog** (`isPlayerCiv`
  true → client skips the modal); contact is still recorded so both can open the
  diplomacy screen manually.

Acknowledging a contact (or it being a player civ) clears it from the queue.

## 4. Diplomatic actions (Commands)

All are validated `Command`s, so they work identically in hotseat and over the
network. They fall into **unilateral** (apply immediately) and **consensual**
(need the other side's agreement).

| Action | Kind | Effect |
|---|---|---|
| **Declare War** | unilateral | status → war (if not on peace-cooldown). Big attitude hit on the target & third parties; breaks treaties/deals; adds warmonger reputation if it was a surprise (no prior denounce). |
| **Make Peace** | consensual | only while at war. Ends war, sets a peace-cooldown. vs AI: accepted/declined instantly by war-weariness logic; vs human: a proposal. |
| **Denounce** | unilateral | public condemnation: attitude hit, removes the "surprise war" reputation penalty for a later declaration, signals intent. |
| **Gift** | unilateral | give gold / a strategic resource; raises the recipient's attitude toward you. |
| **Demand Tribute** | semi | coerce gold/resource under threat; AI complies if weak/afraid, else refuses with an attitude hit. |
| **Propose Deal** | consensual | a structured two-sided offer (§5). |
| **Open Borders** | consensual | mutual right of passage (units may cross each other's territory; matters once territory restricts movement — see §9). |
| **Form Pact** | consensual | non-aggression / defensive pact / alliance (timed). Higher tiers need higher attitude. |
| **Respond to Proposal** | n/a | accept / reject a pending `Proposal` (human side of a consensual action). |

Command additions (sketch):

```ts
| { type: "declareWar"; targetId: number }
| { type: "makePeace"; targetId: number }
| { type: "denounce"; targetId: number }
| { type: "giftTo"; targetId: number; gold?: number; resource?: string }
| { type: "demandTribute"; targetId: number; gold?: number; resource?: string }
| { type: "proposeDeal"; targetId: number; offer: DealOffer }
| { type: "respondProposal"; proposalId: number; accept: boolean }
| { type: "acknowledgeContact"; otherId: number }
```

## 5. Deals

A **deal** is a structured exchange. Each side lists what it **gives**:

```ts
type DealItem =
  | { kind: "gold"; amount: number }                 // lump sum
  | { kind: "goldPerTurn"; amount: number; turns: number }
  | { kind: "resource"; id: string; turns: number }  // strategic resource, per turn
  | { kind: "peace" }                                 // end a war
  | { kind: "openBorders" }
  | { kind: "pact"; tier: "non_aggression" | "defensive" | "alliance"; turns: number }
  | { kind: "declareWarOn"; civId: number }           // a favour
  | { kind: "embassy" };                              // shares basic info (future)

interface DealOffer { give: DealItem[]; want: DealItem[]; }   // from proposer's view
```

Timed items (`goldPerTurn`, `resource`, `pact`) create entries that tick down
each turn and are removed on expiry (reverting their effects). Lump items apply
once. A deal is only created if **both** sides can pay (enough gold, owns the
resource, etc.).

**AI evaluation** prices each item (gold value, resource scarcity, strategic
worth of peace/alliance scaled by attitude & threat) and accepts when the net
value to the AI ≥ 0 **and** attitude permits the relationship implied (e.g. it
won't ally a Hostile civ at any price). A future pass adds **counter-offers**;
v1 is accept/reject.

## 6. AI behaviour

### 6.1 Attitude modifiers (examples, tunable)

Positive: shared religion (+), our pacts/alliance (+), sustained peace (+ over
time), you gifted (+, decaying), at war with their enemy (+), open borders (+).

Negative: you denounced them (−), border friction / you settled in their face
(−), your religion pressured their cities (−), you broke a deal or pact (−−),
you're allied with their enemy (−), warmonger reputation (− scaled by §6.3),
you demanded tribute (−).

### 6.2 Decisions each AI turn

- **Peace upkeep:** if Friendly+ and no deals, may propose a non-aggression pact
  or open borders; may gift a rival's enemy to court them.
- **War:** declares war on a met civ when attitude is low **and** it estimates a
  military/opportunity advantage (relative unit strength near the border, target
  already at war, undefended cities). Sues for peace when war-weary or losing.
- **Proposals:** evaluates incoming `Proposal`s via §5; honours/breaks deals
  based on attitude and desperation (breaking costs reputation + attitude).
- **Defensive pacts/alliances:** if an ally is attacked, may join the war.

### 6.3 Reputation (warmonger)

A per-civ score raised by surprise wars, razing cities, and broken treaties;
decays slowly. High reputation worsens **every** AI's attitude toward the
offender, so serial aggression isolates you diplomatically.

## 7. Client UI

### 7.1 First-contact dialog

A modal with **two civilization cards side by side** — *you* on the left, the
*met civ* on the right — each showing leader portrait (`public/leaders/<id>.png`),
civ name, leader name, and unique ability. Centre shows the opening posture
(their initial attitude label) and a one-line leader quote. Actions: **Exchange
greetings** (dismiss at peace) and quick **Denounce** / **Declare War** for the
bold. (Suppressed for human↔human meetings.)

### 7.2 Diplomacy screen

A **Contacts** panel (opened from a new topbar 🕊️ button) lists every met civ
with: leader portrait, civ, **status** (Peace/War), the AI's **attitude label**,
and active treaties. Selecting one opens the **negotiation view**:

- header: the two leaders, status, attitude, reputation;
- **action buttons:** Declare War / Make Peace / Denounce / Gift / Demand
  Tribute / Open Borders / Form Pact / **Propose Deal**;
- the **deal builder**: two columns ("They give" / "You give") of addable
  `DealItem`s with a running value hint; **Propose** sends it; the AI's
  accept/reject (with a one-line reason) returns immediately.

### 7.3 Notifications

Banner + log entries for: war declared (on/by you), peace made, denouncements,
deals accepted/rejected/expired, an ally joining a war. Pending human proposals
(multiplayer) surface as an actionable notice.

## 8. Serialization & multiplayer

`viewForPlayer` exposes only what the viewer may know:

- their own `met` list and **all relations that involve them** (status,
  treaties, deals, and the AI's attitude-toward-them label);
- **war/peace status among other met civs** (public knowledge) — but **not**
  AI-vs-AI attitudes;
- pending `contactQueue` events and `diploProposals` addressed to them.

Consensual actions between two humans become `Proposal`s delivered to the other
human and resolved on their turn (async, fits the simultaneous-turn model).
`SerializedState` persists `relations`/`attitudes`/`reputation`/`met` for saves.

## 9. Movement & territory interaction

v1 keeps current movement rules (only enemy **structures**/cities block). **Open
Borders** is recorded and gates a future rule where units may not enter a civ's
**territory** without it. This is called out so the data is ready; enforcing
territory-passage is a fast follow, not v1.

## 10. Edge cases & rules

- **Peace cooldown:** N turns (e.g. 10) after making peace before war can be
  re-declared; prevents war spam.
- **Treaty break on war:** declaring war voids open borders, pacts and deals
  with that civ (and triggers ally responses).
- **Elimination:** when a civ loses its last city (existing domination logic),
  its relations/attitudes/proposals are purged.
- **Determinism:** all AI decisions are pure functions of state (seeded where
  randomness helps), so hotseat and server agree.

## 11. Scope

**v1 (this module):** first contact + side-by-side dialog; war/peace with the
`areEnemies` refactor; attitude + reputation model; actions (declare war, make
peace, denounce, gift, demand tribute, open borders, pacts, propose/respond
deal) with gold / gold-per-turn / resource / peace / open-borders / pact / favour
items; AI evaluation & war/peace logic; serialize + multiplayer proposals;
client contact dialog, Contacts/negotiation screen, deal builder, notifications;
tests.

**Deferred:** city-states & envoys; tech trading & espionage/embassies;
casus belli; AI counter-offers; world congress / diplomatic victory; enforced
territory passage.

## 12. Touch-points (implementation map)

- `sim/state.ts` — `Relation`/`Attitude`/`Deal`/`Proposal`/`ContactEvent` types,
  `GameState` fields, `Player.met`, `areEnemies(state,a,b)`.
- `sim/diplomacy.ts` *(new)* — relation/attitude helpers, action resolvers, deal
  pricing, AI evaluation, contact detection, per-turn deal/expiry tick.
- `sim/visibility.ts` — first-contact hook in `updateExplored`.
- `sim/combat.ts`, `sim/barbarians.ts` — pass `state` to `areEnemies`.
- `sim/commands.ts` — new diplomacy commands + per-turn diplomacy tick in
  `beginTurn`/`resolveSimultaneousTurn`.
- `sim/ai.ts` — attitude-driven war/peace and proposal handling.
- `sim/serialize.ts` — view exposure + persistence.
- `client/diplomacy.ts` *(new)* — first-contact dialog, Contacts/negotiation
  screen, deal builder (self-contained, like `empire.ts`).
- `client/main.ts`/`ui.ts` — topbar 🕊️ button, contact-event handling,
  notifications, command wiring.
- `data` — already has leaders/portraits; may add per-leader diplomatic
  personality weights (aggressive/expansionist/etc.) later.
