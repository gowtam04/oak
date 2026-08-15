/* Oak theme lab · five worlds, web + iOS */

const S = {
  garchomp: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/445.png",
  farigiraf: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/981.png",
  dragapult: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/887.png",
  kingambit: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/983.png",
  greatTusk: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/984.png",
  tingLu: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1003.png",
};

const Q = "Does Fake Out work on Farigiraf?";
const A = "No. Fake Out is a +3 priority move. Farigiraf's Armor Tail blocks priority, so Fake Out fails before it can flinch.";
const WHY = "Fake Out has priority +3. Armor Tail (and Queenly Majesty / Dazzling) negate moves with priority greater than 0. The flinch never applies because the move does not execute.";

const WORLDS = [
  {
    id: "shift",
    name: "Night Shift",
    thesis: "A Japanese research floor at 1am. You file queries. Oak files reports.",
    hero: "assets/silph-office.jpg",
    swatches: ["#0e1520", "#d7e4d8", "#c41e3a", "#e8b86d", "#162033"],
    fonts: "IBM Plex Sans Condensed + IBM Plex Sans + IBM Plex Mono",
    why: "Oak is a professor inside an institution, not a gadget and not a journal. Citations become filed sources. Scope is a regional office. Uncertainty is a clearance stamp. The fluorescent green-white and navy have nothing to do with Pokéball red or cream paper.",
    palette: [
      ["Ground", "#0E1520"],
      ["Panel", "#162033"],
      ["Fluorescent", "#D7E4D8"],
      ["Hanko red", "#C41E3A"],
      ["Amber data", "#E8B86D"],
    ],
    type: "Condensed grotesque for report titles. Plex Sans for body. Plex Mono for clocks, document numbers, the query slip. Labels are 10–11px, tracked, uppercase. Almost no rounding (2px).",
    motion: [
      "Folder pull: content enters 10px from the left in 520ms, cubic-bezier(0.2, 0, 0, 1). Elevator doors, not a bounce.",
      "Hanko stamp: the signature. 1.45 scale, −12° rotation, 180ms delay, then a press to rest. One per inferred claim.",
      "Teletype ticker while tools run. Each line appears, no caret fireworks.",
      "Block cursor blinks at 530ms. The clock in the header is real.",
      "Send: the slip does not bounce. It becomes a filed note with a red corner pip.",
      "Hover is a fluorescent hairline, never a lift. Press is an 80ms fill flash.",
      "Scope change: the division name crossfades. A red underline slides.",
      "iOS tabs are department codes (INQ / BOX / UNIT / ID). Active is fluorescent text, no bubble.",
    ],
    micro: [
      "Report spine color encodes query class: battle red, dex teal, rules amber, meta violet.",
      "Focus is a 2px rectangular fluorescent ring, offset.",
      "Auth is researcher access. OTP is a 6-digit clearance, not a friendly code.",
      "Voice is a desk intercom. Amber VU meters, not an orb.",
      "History is a cabinet of report titles and timestamps.",
      "Artifact is a dossier sliding from the right like a pulled folder.",
      "Empty state is a blank form: FILE A QUERY, not a logo hero.",
    ],
    web: "196px department rail. Thin status bar (company, division, time). Bound reports in the well. Command-line composer with a block cursor.",
    ios: "Slim corporate header. Query slip above a code tab bar. Dossiers rise as sheets. No large titles, no friendly bubbles.",
    refuse: "Pokéball chassis, cream paper, grain, dashed plates, pill buttons, chat bubbles, spring bounce, rounded display faces.",
  },
  {
    id: "climate",
    name: "Climate",
    thesis: "The 18 types are weather. Every answer changes the sky.",
    hero: "assets/climate-sand.jpg",
    swatches: ["#3a2418", "#e8b86d", "#7038f8", "#e0c068", "#f7f1e8"],
    fonts: "Syne + Manrope + DM Mono",
    why: "Pokémon's native language is type, and every previous Oak skin treated type as a badge. Climate puts type in the air. You feel Dragon/Ground as a late sandstorm before you finish the sentence. The chrome is landscape, not a device.",
    palette: [
      ["Dusk sand", "#C9A27A"],
      ["Violet sky", "#3A2458"],
      ["Card glass", "rgba(18,16,22,0.58)"],
      ["Moon ink", "#F7F1E8"],
      ["Clear dawn", "#8EB4D4"],
    ],
    type: "Syne for climate names and the answer lead (wide, a little strange). Manrope for reading. DM Mono for weather codes (SANDSTORM, CLEAR). Type badges are flags: a stripe plus a name, not candy pills.",
    motion: [
      "Hero: when the answer resolves, the sky crossfades in 800ms to the subject's climate.",
      "Cards form like clouds: blur 10px to 0, rise 16px, 700ms [0.16, 1, 0.3, 1].",
      "Fine dust drifts on sand/ground/rock answers. Electric would spark. Ghost would fog. Particles stay under 35% opacity.",
      "Starter fronts approach on load, staggered 70ms.",
      "Scope change is wind: content shears 6px and settles.",
      "Voice: the sky pulses with amplitude. A quiet brightness, not a scale bounce.",
      "Composer focus brightens the horizon glass.",
    ],
    micro: [
      "Empty is a clear dawn. The first answer is what brings weather.",
      "Uncertainty is a folded weather advisory, not a warning triangle.",
      "Artifact is a field glass over the landscape.",
      "Teams are a line of small climates, one sky each.",
      "iOS tab bar is four instruments sitting in the fog above the home bar.",
      "Text never sits on raw sky. Cards are 58–62% opaque glass.",
    ],
    web: "No sidebar. A horizon bar with location (scope) and weather code. Reports float in the sky. Composer is a fog pill at the bottom.",
    ios: "Full-bleed climate. Translucent horizon composer. Sheets are weather glass. The moon/location lives in the header, not a chip farm.",
    refuse: "Device bezels, record-light red, paper grain, equal starter chips, Inter, purple AI mesh on black.",
  },
  {
    id: "press",
    name: "Press Box",
    thesis: "The sports desk that covers the games. Box scores, not chat bubbles.",
    hero: "assets/ladder-lights.jpg",
    swatches: ["#101114", "#f2f4f6", "#3ddc84", "#f0b429", "#c1121f"],
    fonts: "Oswald + Source Sans 3 + IBM Plex Mono",
    why: "Half of Oak is competitive: damage rolls, usage, rosters, speed ties. Treat that half with the graphic dignity of F1 timing and a night game, not gamer neon and not a notebook. Numbers are the identity.",
    palette: [
      ["Stadium night", "#101114"],
      ["Panel", "#181B21"],
      ["Live green", "#3DDC84"],
      ["Clock amber", "#F0B429"],
      ["KO red", "#C1121F"],
    ],
    type: "Oswald for recap headlines and jersey numbers (condensed, uppercase, tabular). Source Sans 3 for the article. Plex Mono for the crawl and the box score. Radius 0–4px. Hairlines, not cards.",
    motion: [
      "Split-flap: the lead numeral rotates in on X in 420ms. That is the signature.",
      "LIVE pip blinks on a 1.2s step while a turn is open.",
      "Bottom ticker crawls tool work as play-by-play.",
      "Rows flash a 200ms green sweep when a number lands.",
      "No bounce. 140–180ms snaps. Send locks the prompt as a slug (PROMPT FILED).",
      "iOS titles are condensed and huge. Tabs are FEED / ROSTER / BOX / YOU.",
    ],
    micro: [
      "Damage is a box score, not a paragraph.",
      "Teams are a numbered roster 01–06.",
      "History is a standings column with tiny result marks.",
      "Auth is a press credential.",
      "Voice shows a live decibel numeral, stadium-board size.",
      "Artifact is a broadcast player card.",
    ],
    web: "240px feed rail. League header. Recap plus box-score module. Persistent crawl. Composer is a slug line with a live-green go key.",
    ios: "Large condensed title. Recap stacks over the score module. Tab bar is league lettering. Sheets are player cards.",
    refuse: "Warm paper, rounded blobs, Pokéball chrome, playful bounce, badge soup, ChatGPT bubbles.",
  },
  {
    id: "garden",
    name: "Night Garden",
    thesis: "Oak is a tree. Knowledge grows in the dark.",
    hero: "assets/garden-moon.jpg",
    swatches: ["#07110c", "#e8f0e4", "#c4e87a", "#e89b6c", "#0e2218"],
    fonts: "Newsreader + Figtree + IBM Plex Mono",
    why: "The name is a tree and nobody has taken that seriously. This is not wellness beige and not a lab. It is a moonlit grove. History is growth rings. Voice is moths. Uncertainty is a folded leaf. The curiosity half of Oak finally has a home.",
    palette: [
      ["Soil", "#07110C"],
      ["Canopy", "#0E2218"],
      ["Moon", "#E8F0E4"],
      ["Sap", "#C4E87A"],
      ["Blossom", "#E89B6C"],
    ],
    type: "Newsreader italic for the lead (a garden journal, optical sizes). Figtree for the rest. Mono in sap green for numbers. Organic radii 20–28px. Soft moon-glow, green-tinted, never black drop shadows.",
    motion: [
      "Growth: answers unfurl from 96% and 10px below, 800ms [0.22, 1, 0.36, 1].",
      "Sap line draws down the left rail while tools run.",
      "Sprites breathe 1.00–1.03 over 4s. Living, not bouncing.",
      "Send ripples the basin (box-shadow pulse).",
      "History hover expands a ring.",
      "Voice gathers moths (four drifting points).",
      "Scope lives in the moon. Phase shifts when the generation changes.",
    ],
    micro: [
      "Empty: What should we grow? Four seeds, not chips.",
      "Citations are pressed blossom labels.",
      "Artifact is a pressed-leaf sheet.",
      "Teams are a bed of six plants.",
      "Auth is a gardener's mark, quiet, serif.",
      "iOS tab bar is four seed words over soil.",
    ],
    web: "A 72px ring rail. A narrow reading path. A stone basin composer. Optional pressed sheet from the right.",
    ios: "Moon disk as the scope control. Serif lead. Basin above a seed tab bar. Sheets are rounded leaves.",
    refuse: "Cream craft paper, Fredoka, dashed specimen plates, record-light red, stadium density, hardware bezels.",
  },
  {
    id: "box",
    name: "Box One",
    thesis: "Everything lives in a PC box. Scope is wallpaper. Teams are party slots.",
    hero: "assets/box-wallpaper.jpg",
    swatches: ["#e7ecf4", "#3d4c7a", "#5b8def", "#1b2430", "#f7f9fc"],
    fonts: "Outfit + IBM Plex Mono",
    why: "The most Pokémon spatial system that is not a red gadget. Conversations are boxes. A Pokémon is a cell. Chat is the summary screen writing itself. This is native without becoming a ROM hack.",
    palette: [
      ["Shell", "#E7ECF4"],
      ["Well", "#F7F9FC"],
      ["Cursor", "#5B8DEF"],
      ["Wallpaper", "#3D4C7A"],
      ["Ink", "#1B2430"],
    ],
    type: "Outfit at 400/600 for everything human. Plex Mono for slot codes and the wallpaper name. Slot radius 16px. The PC cursor is a 3px rounded rect. Wallpaper changes with scope (indigo National Dex, gold Champions, teal SV).",
    motion: [
      "Signature: the PC cursor. It follows in 180ms and overshoots to 1.04, then settles. The only theme allowed a tiny overshoot, because that is the game cursor.",
      "Slot land: sprites drop 12px in 200ms.",
      "Wallpaper crossfades 400ms on scope change.",
      "Answer is a summary page sliding up from the active slot.",
      "Streaming: the cursor blinks on an empty SEARCHING slot.",
      "Teams: six party slots. Hover lifts 2px.",
    ],
    micro: [
      "Empty box shows a 6×5 grid. Four slots hold starter silhouettes.",
      "Auth is a trainer ID. OTP is six box codes.",
      "History is a wall of mini-boxes with wallpapers.",
      "Artifact is the official summary layout: art, types, stat bars.",
      "Voice: the current slot's sprite waves.",
      "iOS: wallpaper full-bleed under translucent panels. Swiping boxes is swiping threads.",
    ],
    web: "Box list on the left. Current box in the center. Optional summary pane. Composer sits in a party bar.",
    ios: "Wallpaper behind glass panels. Party-bar composer. Four-item storage tab. Sheets are summary pages.",
    refuse: "Night-only chrome, paper grain, hanko stamps, weather particles, stadium crawl, Instrument red thread.",
  },
];

const SCREENS = [
  ["empty", "Empty"],
  ["streaming", "Streaming"],
  ["answer", "Answer"],
  ["artifact", "Artifact"],
  ["teams", "Teams"],
  ["history", "History"],
  ["auth", "Sign in"],
  ["voice", "Voice"],
  ["compare", "All five"],
];

const state = { world: "shift", screen: "answer", plat: "web", doctrine: false, view: "picker" };

function readHash() {
  const h = (location.hash || "").replace(/^#/, "");
  if (!h) return;
  const [world, screen, plat] = h.split("/");
  if (WORLDS.some((w) => w.id === world)) state.world = world;
  if (SCREENS.some((s) => s[0] === screen)) state.screen = screen;
  if (plat === "web" || plat === "ios") state.plat = plat;
  state.view = "lab";
}
function writeHash() {
  if (state.view !== "lab") return;
  const next = `#${state.world}/${state.screen}/${state.plat}`;
  if (location.hash !== next) history.replaceState(null, "", next);
}

const $ = (id) => document.getElementById(id);

function typeChip(name, hex, kind) {
  if (kind === "flag") {
    return `<span class="climate-flag"><i style="background:${hex}"></i>${name}</span>`;
  }
  if (kind === "box") {
    return `<span class="box-type" style="--tc:${hex}">${name}</span>`;
  }
  return `<span style="display:inline-block;padding:2px 7px;border-radius:3px;background:${hex};color:#fff;font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-right:4px">${name}</span>`;
}

const dragon = typeChip("Dragon", "#7038f8");
const ground = typeChip("Ground", "#e0c068");
const psychic = typeChip("Psychic", "#f85888");
const normal = typeChip("Normal", "#a8a878");

function team(n, img, name, types) {
  return { n, img, name, types };
}
const PARTY = [
  team("01", S.garchomp, "Garchomp", "Dragon / Ground"),
  team("02", S.dragapult, "Dragapult", "Dragon / Ghost"),
  team("03", S.kingambit, "Kingambit", "Dark / Steel"),
  team("04", S.greatTusk, "Great Tusk", "Ground / Fighting"),
  team("05", S.tingLu, "Ting-Lu", "Dark / Ground"),
  team("06", S.farigiraf, "Farigiraf", "Normal / Psychic"),
];

/* ---------- picker ---------- */
function renderPicker() {
  $("picker-grid").innerHTML = WORLDS.map((w) => `
    <button class="world-card" data-enter="${w.id}" type="button">
      <div class="world-card-hero" style="background-image:url('${w.hero}')"></div>
      <div class="world-card-body">
        <h2>${w.name}</h2>
        <p>${w.thesis}</p>
        <div class="swatches">${w.swatches.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
        <span class="enter">Enter</span>
      </div>
    </button>
  `).join("");
}

function renderLabChrome() {
  $("lab-worlds").innerHTML = WORLDS.map((w) =>
    `<button type="button" data-world="${w.id}" class="${state.world === w.id ? "is-on" : ""}">${w.name}</button>`
  ).join("");
  $("lab-screens").innerHTML = SCREENS.map(([id, label]) =>
    `<button type="button" data-screen="${id}" class="${state.screen === id ? "is-on" : ""}">${label}</button>`
  ).join("");
  $("plat-seg").querySelectorAll("button").forEach((b) => {
    b.classList.toggle("is-on", b.dataset.plat === state.plat);
  });
  renderDoctrine();
}

function renderDoctrine() {
  const w = WORLDS.find((x) => x.id === state.world);
  $("doctrine").hidden = !state.doctrine;
  $("doctrine").innerHTML = `
    <h3>${w.name}</h3>
    <p>${w.thesis}</p>
    <h4>Why this fits Oak</h4>
    <p>${w.why}</p>
    <h4>Type</h4>
    <p>${w.type}</p>
    <h4>Palette</h4>
    <div class="pal">${w.palette.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>
    <h4>Motion, down to the tick</h4>
    <ul>${w.motion.map((m) => `<li>${m}</li>`).join("")}</ul>
    <h4>Micro</h4>
    <ul>${w.micro.map((m) => `<li>${m}</li>`).join("")}</ul>
    <h4>Web</h4>
    <p>${w.web}</p>
    <h4>iOS</h4>
    <p>${w.ios}</p>
    <h4>Refuse</h4>
    <p>${w.refuse}</p>
    <h4>Fonts</h4>
    <p>${w.fonts}</p>
  `;
}

/* ---------- shells ---------- */
function webFrame(world, sky, html) {
  return `<div class="web-frame play" data-world="${world}" ${sky ? `data-sky="${sky}"` : ""}>${html}</div>`;
}
function phone(world, sky, html) {
  return `<div class="phone"><div class="phone-screen play" data-world="${world}" ${sky ? `data-sky="${sky}"` : ""}>
    <div class="island"></div>${html}<div class="home-bar"></div>
  </div></div>`;
}

function tabs(items, on, cls) {
  return `<nav class="${cls}">${items.map((t) => `<span class="${t === on ? "is-on on" : ""}">${t}</span>`).join("")}</nav>`;
}

/* ---------- NIGHT SHIFT ---------- */
function shiftComposer(ios) {
  return `<div class="shift-composer"><span class="prompt">FILE A QUERY${ios ? "" : "  ·  NAT-DEX DIV."} <i class="shift-cursor"></i></span><span class="shift-go">File</span></div>`;
}
function shiftEmpty() {
  return `<div class="shift-empty">
    <div class="k">Standby · Nat-Dex Div.</div>
    <h3>File a query.</h3>
    <p>Night shift is staffed. Mechanics, locations, and damage are on file. Media (anime, film, manga) is out of division.</p>
    <div class="shift-slips">
      <div class="shift-slip"><em>BTL-04</em><span>Does Fake Out work on Farigiraf?</span></div>
      <div class="shift-slip"><em>DEX-11</em><span>Where does Roaring Moon spawn?</span></div>
      <div class="shift-slip"><em>RUL-02</em><span>What changed in Gen 5 crits?</span></div>
      <div class="shift-slip"><em>MTA-01</em><span>What is using Stealth Rock in OU?</span></div>
    </div>
  </div>`;
}
function shiftAsk() {
  return `<div class="shift-note">${Q}<i></i></div>`;
}
function shiftStream() {
  return `${shiftAsk()}<div class="shift-ticker">
    <span>RESOLVING  FARIGIRAF</span>
    <span>PULLING    MOVE / FAKE OUT</span>
    <span>PULLING    ABILITY / ARMOR TAIL</span>
    <span>CROSS-REF  PRIORITY TABLE</span>
  </div>`;
}
function shiftAnswer() {
  return `${shiftAsk()}<article class="shift-report">
    <div class="shift-spine"></div>
    <div class="shift-report-body">
      <div class="shift-meta"><span>RPT-1842 · BATTLE</span><span>NAT-DEX · FILED 01:14</span></div>
      <h4>${A}</h4>
      <p class="why">${WHY}</p>
      <div class="shift-row">
        <img class="sprite" src="${S.farigiraf}" alt="" />
        <div>
          <b>Farigiraf</b> ${psychic}${normal}<br />
          <span class="shift-id">#0981 · Armor Tail · source SV index</span>
        </div>
        <div class="shift-stamps">
          <div class="shift-hanko">Inferred</div>
        </div>
      </div>
      <div class="shift-src">
        SRC-01  get_move / fake-out  priority +3, flinch<br />
        SRC-02  get_ability / armor-tail  blocks priority &gt; 0<br />
        SRC-03  get_pokemon / farigiraf  ability slot 1
      </div>
    </div>
  </article>`;
}
function shiftArt() {
  return `${shiftAnswer()}<aside class="shift-dossier">
    <div class="shift-meta"><span>DOSSIER</span><span>ABIL-044</span></div>
    <h4 style="font-family:var(--display);font-size:22px;margin:0 0 8px">Armor Tail</h4>
    <p style="color:var(--mute);font-size:13px;line-height:1.5">The Pokémon's overflowing tail blocks the opposing Pokémon from using priority moves against it or its allies.</p>
    <div class="shift-src">Filed against Fake Out, Extreme Speed, Aqua Jet, Grassy Glide. Does not block priority status that targets the user (Protect).</div>
  </aside>`;
}
function shiftTeams() {
  return `<div class="shift-meta"><span>FIELD UNIT 07</span><span>ACTIVE</span></div>
    <h4 style="font-family:var(--display);font-size:22px;margin:8px 0 12px">Swords / HO</h4>
    <div class="shift-unit">${PARTY.map((p) => `<div class="shift-badge"><img class="sprite-sm" src="${p.img}" alt="" style="margin:0 auto"/><b>${p.name}</b><small>${p.types}</small></div>`).join("")}</div>`;
}
function shiftHist() {
  return `<div class="shift-hist">
    <div>Fake Out vs Farigiraf <em>01:14 · BTL</em></div>
    <div>Roaring Moon spawns <em>00:41 · DEX</em></div>
    <div>Gen 5 crit table <em>YDAY · RUL</em></div>
    <div>OU Stealth Rock users <em>YDAY · MTA</em></div>
  </div>`;
}
function shiftAuth() {
  return `<div class="shift-auth">
    <div class="k" style="font:500 11px/1 var(--mono);letter-spacing:.18em;color:var(--stamp);text-transform:uppercase">Researcher access</div>
    <h3>Identify.</h3>
    <div class="shift-field">you@lab.org</div>
    <div class="shift-otp"><b>4</b><b>8</b><b>1</b><b></b><b></b><b></b></div>
  </div>`;
}
function shiftVoice() {
  return `<div class="shift-voice">
    <div>
      <div class="k" style="font:500 11px/1 var(--mono);letter-spacing:.18em;color:var(--amber)">INTERCOM OPEN</div>
      <div class="shift-vu">${"<i style='height:28px'></i>".repeat(12)}</div>
      <p style="color:var(--mute)">Listening on the desk line.</p>
    </div>
  </div>`;
}
function shiftWeb(screen) {
  const rail = `<aside class="shift-rail">
    <div class="shift-mark">Oak<small>Night research</small></div>
    <nav class="shift-nav">
      <span class="${["empty","streaming","answer","artifact","voice"].includes(screen) ? "is-on" : ""}">INQ</span>
      <span class="${screen === "history" ? "is-on" : ""}">BOX</span>
      <span class="${screen === "teams" ? "is-on" : ""}">UNIT</span>
      <span class="${screen === "auth" ? "is-on" : ""}">ID</span>
    </nav>
    <div class="shift-clock">SAFFRON<br/>01:14:22<br/>NAT-DEX DIV.</div>
  </aside>`;
  const body = {
    empty: shiftEmpty(),
    streaming: shiftStream(),
    answer: shiftAnswer(),
    artifact: shiftArt(),
    teams: shiftTeams(),
    history: shiftHist(),
    auth: shiftAuth(),
    voice: shiftVoice(),
  }[screen];
  return `<div class="shift-web">${rail}<div class="shift-main">
    <header class="shift-top"><span>Oak Research</span><span>Nat-Dex Div. · <b>REC</b></span></header>
    <div class="shift-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : shiftComposer(false)}
  </div></div>`;
}
function shiftIOS(screen) {
  const body = {
    empty: shiftEmpty(),
    streaming: shiftStream(),
    answer: shiftAnswer(),
    artifact: shiftArt(),
    teams: shiftTeams(),
    history: shiftHist(),
    auth: shiftAuth(),
    voice: shiftVoice(),
  }[screen];
  return `<div class="shift-ios ios-safe">
    <header class="shift-ios-head"><span>Oak Research</span><span>01:14</span></header>
    <div class="shift-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : shiftComposer(true)}
    ${tabs(["INQ", "BOX", "UNIT", "ID"], screen === "teams" ? "UNIT" : screen === "history" ? "BOX" : screen === "auth" ? "ID" : "INQ", "shift-ios-tabs")}
  </div>`;
}

/* ---------- CLIMATE ---------- */
function climateSky(screen) {
  return screen === "empty" || screen === "auth" || screen === "history" ? "clear" : "";
}
function climateComposer() {
  return `<div class="climate-composer"><span>Ask the sky</span><span>↑</span></div>`;
}
function climateEmpty() {
  return `<div class="climate-empty">
    <h3>What is in the air?</h3>
    <p>Ask a battle question and the climate will change. Clear skies until then.</p>
    <div class="climate-fronts">
      <div class="climate-front">Fake Out on Farigiraf</div>
      <div class="climate-front">Roaring Moon, where</div>
      <div class="climate-front">Gen 5 crits</div>
      <div class="climate-front">OU Stealth Rock</div>
    </div>
  </div>`;
}
function climateAsk() {
  return `<div class="climate-ask">${Q}</div>`;
}
function climateStream() {
  return `${climateAsk()}<div class="climate-clouds">
    <span>A front is building over Farigiraf</span>
    <span>Reading Fake Out in the pressure</span>
    <span>Armor Tail is the inversion</span>
  </div>`;
}
function climateAnswer() {
  return `${climateAsk()}<article class="climate-card">
    <div class="climate-flags">
      ${typeChip("Psychic", "#f85888", "flag")}
      ${typeChip("Normal", "#a8a878", "flag")}
    </div>
    <h4>${A}</h4>
    <p>${WHY}</p>
    <div class="climate-obs">
      <img class="sprite" src="${S.farigiraf}" alt="" />
      <div><b>Farigiraf</b><small>Observed under Armor Tail · National Dex</small></div>
    </div>
  </article>`;
}
function climateArt() {
  return `${climateAnswer()}<aside class="climate-glass">
    <div class="climate-flags">${typeChip("Psychic", "#f85888", "flag")}</div>
    <h4 style="font-family:var(--display);font-size:26px;margin:8px 0">Armor Tail</h4>
    <p>A still column of air. Priority cannot cross it. Fake Out, Extreme Speed, Aqua Jet all die at the edge.</p>
    <img class="sprite-lg" src="${S.farigiraf}" alt="" />
  </aside>`;
}
function climateTeams() {
  return `<div class="climate-team">${PARTY.map((p) => `<div class="climate-mon"><img class="sprite" src="${p.img}" alt="" /><div>${p.name}</div></div>`).join("")}</div>`;
}
function climateHist() {
  return `<div class="climate-fronts" style="flex-direction:column;align-items:flex-start">
    <div class="climate-front">Sandstorm · Fake Out / Farigiraf</div>
    <div class="climate-front">Clear · Roaring Moon</div>
    <div class="climate-front">Cold front · Gen 5 crits</div>
  </div>`;
}
function climateAuth() {
  return `<div class="climate-auth"><h3>Leave a mark.</h3><p>A code arrives on the wind.</p>
    <div class="climate-fronts"><div class="climate-front">you@route.org</div></div></div>`;
}
function climateVoice() {
  return `<div class="climate-voice"><div class="climate-pulse"></div><p>The sky is listening.</p></div>`;
}
function climateWeb(screen) {
  const body = { empty: climateEmpty(), streaming: climateStream(), answer: climateAnswer(), artifact: climateArt(), teams: climateTeams(), history: climateHist(), auth: climateAuth(), voice: climateVoice() }[screen];
  return `<div class="climate-web"><div class="climate-dust"></div>
    <header class="climate-horizon"><span class="loc">National Dex</span><span class="wx">${climateSky(screen) ? "CLEAR" : "SANDSTORM"}</span></header>
    <div class="climate-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : climateComposer()}
  </div>`;
}
function climateIOS(screen) {
  const body = { empty: climateEmpty(), streaming: climateStream(), answer: climateAnswer(), artifact: climateArt(), teams: climateTeams(), history: climateHist(), auth: climateAuth(), voice: climateVoice() }[screen];
  return `<div class="climate-ios ios-safe"><div class="climate-dust"></div>
    <header class="climate-horizon"><span class="loc">NatDex</span><span class="wx">${climateSky(screen) ? "CLEAR" : "SAND"}</span></header>
    <div class="climate-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : climateComposer()}
    ${tabs(["Ask", "Path", "Party", "You"], screen === "teams" ? "Party" : screen === "history" ? "Path" : screen === "auth" ? "You" : "Ask", "climate-ios-tabs")}
  </div>`;
}

/* ---------- PRESS BOX ---------- */
function pressComposer() {
  return `<div class="press-composer"><div class="prompt">Ask the desk</div><button type="button">GO</button></div>`;
}
function pressEmpty() {
  return `<div class="press-empty">
    <div class="press-live"><i></i>DESK OPEN</div>
    <h3>Tonight's card.</h3>
    <p>Mechanics, calcs, and the ladder. Oak writes the recap. You bring the question.</p>
    <div class="press-starts">
      <div>Fake Out<div><small>Does it hit Farigiraf?</small></div></div>
      <div>Spawns<div><small>Roaring Moon, Area Zero</small></div></div>
      <div>Rules<div><small>Gen 5 critical hits</small></div></div>
      <div>Usage<div><small>Stealth Rock in OU</small></div></div>
    </div>
  </div>`;
}
function pressStream() {
  return `<div class="press-q">Prompt filed</div><p>${Q}</p>
    <p class="press-live"><i></i>IN PLAY · resolving Farigiraf · Fake Out · Armor Tail</p>`;
}
function pressAnswer() {
  return `<div class="press-q">${Q}</div>
    <div class="press-recap">
      <div>
        <h4>Fake Out fails.</h4>
        <p>${WHY}</p>
        <div class="press-subj"><img class="sprite" src="${S.farigiraf}" alt="" /><div><b>Farigiraf</b><br/>Armor Tail · #981</div></div>
      </div>
      <div class="press-score">
        <div class="n">PRI <em>+3</em></div>
        <table>
          <tr><td>Fake Out</td><td>+3 priority</td></tr>
          <tr><td>Armor Tail</td><td>blocks &gt; 0</td></tr>
          <tr><td>Flinch</td><td>does not apply</td></tr>
          <tr><td>Call</td><td>inferred</td></tr>
        </table>
      </div>
    </div>`;
}
function pressArt() {
  return `${pressAnswer()}<aside class="press-card-art">
    <div class="press-live"><i></i>PLAYER CARD</div>
    <img class="sprite-lg" src="${S.farigiraf}" alt="" />
    <h4 style="font-family:var(--display);text-transform:uppercase;margin:8px 0 4px">Armor Tail</h4>
    <p style="color:var(--mute)">Blocks every priority move aimed at Farigiraf or its ally. Protect still works. First Impression does not.</p>
  </aside>`;
}
function pressTeams() {
  return `<div class="press-roster">${PARTY.map((p) => `<div class="press-player"><div class="num">${p.n}</div><img class="sprite-sm" src="${p.img}" alt="" /><div><b>${p.name}</b><br/><span style="color:var(--mute);font-size:12px">${p.types}</span></div></div>`).join("")}</div>`;
}
function pressHist() {
  return `<div class="press-row is-on"><b>Fake Out / Farigiraf</b><span>W</span></div>
    <div class="press-row"><b>Roaring Moon</b><span>W</span></div>
    <div class="press-row"><b>Gen 5 crits</b><span>W</span></div>
    <div class="press-row"><b>OU rocks</b><span>W</span></div>`;
}
function pressAuth() {
  return `<div class="press-auth"><h3>Press pass.</h3><p style="color:var(--mute)">Email for a credential. Six digits at the gate.</p>
    <div class="press-composer"><div class="prompt">you@desk.org</div><button type="button">SEND</button></div></div>`;
}
function pressVoice() {
  return `<div class="press-voice"><div><div class="press-live"><i></i>ON AIR</div><div class="n">-12</div><p>dB · desk mic</p></div></div>`;
}
function pressSide() {
  return `<aside class="press-side"><h6>FEED</h6>
    <div class="press-row is-on"><b>Farigiraf</b><span>live</span></div>
    <div class="press-row"><b>Roaring Moon</b><span>1h</span></div>
    <div class="press-row"><b>Gen 5 crits</b><span>1d</span></div>
  </aside>`;
}
function pressWeb(screen) {
  const body = { empty: pressEmpty(), streaming: pressStream(), answer: pressAnswer(), artifact: pressArt(), teams: pressTeams(), history: pressHist(), auth: pressAuth(), voice: pressVoice() }[screen];
  return `<div class="press-web"><div class="press-body">${pressSide()}<div class="press-main">
    <header class="press-top"><span class="lg">NAT DEX · NIGHT</span><span class="press-live"><i></i>${screen === "streaming" || screen === "voice" ? "LIVE" : "FINAL"}</span></header>
    <div class="press-thread">${body}${screen === "auth" || screen === "voice" ? "" : pressComposer()}</div>
  </div></div>
  <div class="press-ticker"><span>RESOLVE FARIGIRAF · GET MOVE FAKE OUT · GET ABILITY ARMOR TAIL · PRIORITY TABLE · SUBMIT</span></div></div>`;
}
function pressIOS(screen) {
  const body = { empty: pressEmpty(), streaming: pressStream(), answer: pressAnswer(), artifact: pressArt(), teams: pressTeams(), history: pressHist(), auth: pressAuth(), voice: pressVoice() }[screen];
  return `<div class="press-ios ios-safe">
    <header class="press-top"><span class="lg">NAT DEX</span><span class="press-live"><i></i>LIVE</span></header>
    <div class="press-thread">${body}${screen === "auth" || screen === "voice" ? "" : pressComposer()}</div>
    ${tabs(["FEED", "ROSTER", "BOX", "YOU"], screen === "teams" ? "ROSTER" : screen === "history" ? "BOX" : screen === "auth" ? "YOU" : "FEED", "press-ios-tabs")}
  </div>`;
}

/* ---------- NIGHT GARDEN ---------- */
function gardenComposer() {
  return `<div class="garden-basin"><span>What should we grow?</span><span style="color:var(--sap)">Plant</span></div>`;
}
function gardenEmpty() {
  return `<div class="garden-empty">
    <h3>What should we grow?</h3>
    <p>Ask a question. An answer will unfurl. The grove keeps every ring.</p>
    <div class="garden-seeds">
      <div class="garden-seed"><i></i>Does Fake Out work on Farigiraf?</div>
      <div class="garden-seed"><i></i>Where does Roaring Moon live?</div>
      <div class="garden-seed"><i></i>How did crits change in Gen 5?</div>
      <div class="garden-seed"><i></i>Who is setting rocks in OU?</div>
    </div>
  </div>`;
}
function gardenStream() {
  return `<div class="garden-ask">${Q}</div>
    <p style="color:var(--sap);font:400 12px/1.8 var(--mono)">sap rising<br/>finding Farigiraf<br/>tasting Fake Out<br/>Armor Tail is the old wood</p>`;
}
function gardenAnswer() {
  return `<div class="garden-ask">${Q}</div>
    <article class="garden-leaf">
      <div><span class="garden-tag">inferred</span><span class="garden-tag">nat dex</span></div>
      <h4>${A}</h4>
      <p>${WHY}</p>
      <div style="display:flex;gap:12px;align-items:center">
        <img class="sprite garden-breathe" src="${S.farigiraf}" alt="" />
        <div>Farigiraf · Armor Tail</div>
      </div>
    </article>`;
}
function gardenArt() {
  return `${gardenAnswer()}<aside class="garden-press">
    <span class="garden-tag">pressed</span>
    <h4 style="font-family:var(--display);font-style:italic;font-size:28px;margin:8px 0">Armor Tail</h4>
    <p style="color:var(--mute)">A leaf that will not let the fast wind through. Priority dies at the stem.</p>
    <img class="sprite-lg garden-breathe" src="${S.farigiraf}" alt="" />
  </aside>`;
}
function gardenTeams() {
  return `<div class="garden-bed">${PARTY.map((p) => `<div class="garden-plant"><img class="sprite garden-breathe" src="${p.img}" alt="" /><div>${p.name}</div></div>`).join("")}</div>`;
}
function gardenHist() {
  return `<div class="garden-seeds">
    <div class="garden-seed"><i></i>Fake Out and Farigiraf</div>
    <div class="garden-seed"><i></i>Roaring Moon</div>
    <div class="garden-seed"><i></i>The Gen 5 crit</div>
  </div>`;
}
function gardenAuth() {
  return `<div class="garden-auth"><h3>Leave your name in the bark.</h3><p style="color:var(--mute)">A six-digit ring will grow in your inbox.</p></div>`;
}
function gardenVoice() {
  return `<div class="garden-voice"><div><div class="moths"><i></i><i></i><i></i></div><p>The grove is listening.</p></div></div>`;
}
function gardenWeb(screen) {
  const body = { empty: gardenEmpty(), streaming: gardenStream(), answer: gardenAnswer(), artifact: gardenArt(), teams: gardenTeams(), history: gardenHist(), auth: gardenAuth(), voice: gardenVoice() }[screen];
  return `<div class="garden-web">
    <aside class="garden-rings"><i class="on"></i><i></i><i></i><i></i><i></i></aside>
    <div class="garden-path">
      <div class="garden-top">National Dex, under the moon</div>
      <div class="garden-thread">${body}</div>
      ${screen === "auth" || screen === "voice" ? "" : gardenComposer()}
    </div>
  </div>`;
}
function gardenIOS(screen) {
  const body = { empty: gardenEmpty(), streaming: gardenStream(), answer: gardenAnswer(), artifact: gardenArt(), teams: gardenTeams(), history: gardenHist(), auth: gardenAuth(), voice: gardenVoice() }[screen];
  return `<div class="garden-ios ios-safe">
    <header class="garden-ios-head"><span>Oak</span><div class="garden-moon"></div></header>
    <div class="garden-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : gardenComposer()}
    ${tabs(["grow", "rings", "bed", "mark"], screen === "teams" ? "bed" : screen === "history" ? "rings" : screen === "auth" ? "mark" : "grow", "garden-ios-tabs")}
  </div>`;
}

/* ---------- BOX ONE ---------- */
function boxComposer() {
  return `<div class="box-party"><span class="prompt">Ask Box 1</span><span class="box-send">↑</span></div>`;
}
function boxGrid(cursor) {
  const cells = [];
  const filled = { 0: S.garchomp, 2: S.dragapult, 5: S.farigiraf, 8: S.kingambit };
  for (let i = 0; i < 18; i++) {
    const cur = i === cursor ? " cursor" : "";
    const img = filled[i] ? `<img src="${filled[i]}" alt="" />` : "";
    cells.push(`<div class="slot${cur}">${img}</div>`);
  }
  return `<div class="box-grid">${cells.join("")}</div>`;
}
function boxEmpty() {
  return `<div class="box-empty-copy"><h3>The box is open.</h3><p>Four starters are already filed. Ask, and a summary writes itself.</p></div>${boxGrid(5)}`;
}
function boxStream() {
  return `<div class="box-bubble">${Q}</div>
    <p style="font:500 12px/1 var(--mono);color:var(--cursor);margin:0 0 10px">SEARCHING</p>
    ${boxGrid(11)}`;
}
function boxAnswer() {
  return `<div class="box-bubble">${Q}</div>
    <article class="box-summary">
      <div class="box-types">${typeChip("Psychic", "#f85888", "box")}${typeChip("Normal", "#a8a878", "box")}</div>
      <h4>${A}</h4>
      <p>${WHY}</p>
      <div style="display:flex;gap:10px;align-items:center">
        <img class="sprite" src="${S.farigiraf}" alt="" />
        <div><b>Farigiraf</b><br/><span style="color:var(--mute);font-size:12px">Slot 12 · Armor Tail</span></div>
      </div>
    </article>`;
}
function boxArt() {
  return `${boxAnswer()}<aside class="box-sheet">
    <img class="sprite-lg" src="${S.farigiraf}" alt="" />
    <div class="box-types">${typeChip("Psychic", "#f85888", "box")}${typeChip("Normal", "#a8a878", "box")}</div>
    <h4 style="margin:8px 0 4px">Armor Tail</h4>
    <p style="color:var(--mute)">Summary: priority moves aimed at this Pokémon fail. First Impression, Fake Out, Aqua Jet, Extreme Speed.</p>
    <div style="margin-top:10px">
      ${["HP","Atk","Def","SpA","SpD","Spe"].map((s, i) => `<div style="display:flex;gap:8px;align-items:center;font-size:11px;margin:4px 0"><span style="width:28px;color:var(--mute)">${s}</span><div style="flex:1;height:6px;background:#e7ecf4;border-radius:99px"><div style="width:${[70,80,72,90,72,60][i]}%;height:100%;background:var(--cursor);border-radius:99px"></div></div></div>`).join("")}
    </div>
  </aside>`;
}
function boxTeams() {
  return `<div class="box-party-grid">${PARTY.map((p) => `<div class="slot cursor"><img src="${p.img}" alt="" /></div>`).join("")}</div>
    <p style="color:var(--mute);margin:12px 0 0">Party · Swords HO · 6/6</p>`;
}
function boxHist() {
  return `<div>${[1, 2, 3, 4].map((n) => `<div class="mini-box ${n === 1 ? "is-on" : ""}"><div class="mini-wall"></div><div><b>Box ${n}</b><small>${["Farigiraf", "Roaring Moon", "Crits", "Rocks"][n - 1]}</small></div></div>`).join("")}</div>`;
}
function boxAuth() {
  return `<div class="box-auth"><h3>Register a trainer ID.</h3><p style="color:var(--mute)">Six box codes will land in your mail.</p>
    <div class="box-party"><span class="prompt">you@box.org</span><span class="box-send">→</span></div></div>`;
}
function boxVoice() {
  return `<div class="box-voice"><div>
    <div class="slot cursor" style="width:120px;height:120px;margin:0 auto 12px"><img src="${S.farigiraf}" alt="" /></div>
    <p>Farigiraf is listening from slot 12.</p>
  </div></div>`;
}
function boxWeb(screen) {
  const body = { empty: boxEmpty(), streaming: boxStream(), answer: boxAnswer(), artifact: boxArt(), teams: boxTeams(), history: boxHist(), auth: boxAuth(), voice: boxVoice() }[screen];
  return `<div class="box-web">
    <aside class="box-list">
      <h6>Boxes</h6>
      ${["Farigiraf", "Roaring Moon", "Crits", "Rocks"].map((t, i) => `<div class="mini-box ${i === 0 ? "is-on" : ""}"><div class="mini-wall"></div><div><b>Box ${i + 1}</b><small>${t}</small></div></div>`).join("")}
    </aside>
    <div class="box-main">
      <header class="box-top"><h3>Box 1</h3><span class="box-chip">NATIONAL DEX</span></header>
      <div class="box-thread">${body}</div>
      ${screen === "auth" || screen === "voice" ? "" : boxComposer()}
    </div>
  </div>`;
}
function boxIOS(screen) {
  const body = { empty: boxEmpty(), streaming: boxStream(), answer: boxAnswer(), artifact: boxArt(), teams: boxTeams(), history: boxHist(), auth: boxAuth(), voice: boxVoice() }[screen];
  return `<div class="box-ios ios-safe">
    <div class="box-ios-wall"></div>
    <header class="box-ios-head"><span>Box 1</span><span class="box-chip">NATDEX</span></header>
    <div class="box-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : boxComposer()}
    ${tabs(["Box", "Party", "Wall", "ID"], screen === "teams" ? "Party" : screen === "history" ? "Wall" : screen === "auth" ? "ID" : "Box", "box-ios-tabs")}
  </div>`;
}

/* ---------- compare ---------- */
function compareView() {
  const cards = {
    shift: `<div class="compare-mini play" data-world="shift">${shiftAnswer()}</div>`,
    climate: `<div class="compare-mini play" data-world="climate" style="position:relative;overflow:hidden"><div class="climate-dust"></div>${climateAnswer()}</div>`,
    press: `<div class="compare-mini play" data-world="press">${pressAnswer()}</div>`,
    garden: `<div class="compare-mini play" data-world="garden">${gardenAnswer()}</div>`,
    box: `<div class="compare-mini play" data-world="box">${boxAnswer()}</div>`,
  };
  return `<div class="compare-grid">${WORLDS.map((w) => `<div class="compare-col"><h5>${w.name}</h5>${cards[w.id]}</div>`).join("")}</div>`;
}

/* ---------- render stage ---------- */
const WEB = { shift: shiftWeb, climate: climateWeb, press: pressWeb, garden: gardenWeb, box: boxWeb };
const IOS = { shift: shiftIOS, climate: climateIOS, press: pressIOS, garden: gardenIOS, box: boxIOS };

function skyFor(world, screen) {
  return world === "climate" ? climateSky(screen) : "";
}

function renderStage() {
  const stage = $("stage");
  if (state.screen === "compare") {
    stage.innerHTML = compareView();
    return;
  }
  const w = state.world;
  const s = state.screen;
  const sky = skyFor(w, s);
  if (state.plat === "ios") {
    stage.innerHTML = phone(w, sky, IOS[w](s));
  } else {
    stage.innerHTML = webFrame(w, sky, WEB[w](s));
  }
}

function replay() {
  document.querySelectorAll(".play").forEach((el) => {
    el.classList.remove("play");
    void el.offsetWidth;
    el.classList.add("play");
  });
}

function showLab() {
  state.view = "lab";
  $("picker").hidden = true;
  $("lab").hidden = false;
  renderLabChrome();
  renderStage();
  writeHash();
}
function showPicker() {
  state.view = "picker";
  $("picker").hidden = false;
  $("lab").hidden = true;
  history.replaceState(null, "", location.pathname);
}

function bind() {
  $("picker-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-enter]");
    if (!btn) return;
    state.world = btn.dataset.enter;
    state.screen = "empty";
    showLab();
  });
  $("btn-back").addEventListener("click", showPicker);
  $("lab-worlds").addEventListener("click", (e) => {
    const b = e.target.closest("[data-world]");
    if (!b) return;
    state.world = b.dataset.world;
    renderLabChrome();
    renderStage();
    writeHash();
  });
  $("lab-screens").addEventListener("click", (e) => {
    const b = e.target.closest("[data-screen]");
    if (!b) return;
    state.screen = b.dataset.screen;
    renderLabChrome();
    renderStage();
    writeHash();
  });
  $("plat-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-plat]");
    if (!b) return;
    state.plat = b.dataset.plat;
    renderLabChrome();
    renderStage();
    writeHash();
  });
  $("btn-replay").addEventListener("click", replay);
  $("btn-doctrine").addEventListener("click", () => {
    state.doctrine = !state.doctrine;
    renderDoctrine();
  });
  document.addEventListener("keydown", (e) => {
    if ($("lab").hidden) return;
    const idx = WORLDS.findIndex((w) => w.id === state.world);
    if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4" || e.key === "5") {
      state.world = WORLDS[Number(e.key) - 1].id;
      renderLabChrome();
      renderStage();
      writeHash();
    }
    if (e.key === "w") { state.plat = "web"; renderLabChrome(); renderStage(); writeHash(); }
    if (e.key === "i") { state.plat = "ios"; renderLabChrome(); renderStage(); writeHash(); }
    if (e.key === "r") replay();
    if (e.key === "d") { state.doctrine = !state.doctrine; renderDoctrine(); }
    if (e.key === "ArrowRight") {
      const i = SCREENS.findIndex((s) => s[0] === state.screen);
      state.screen = SCREENS[(i + 1) % SCREENS.length][0];
      renderLabChrome();
      renderStage();
      writeHash();
    }
    if (e.key === "ArrowLeft") {
      const i = SCREENS.findIndex((s) => s[0] === state.screen);
      state.screen = SCREENS[(i - 1 + SCREENS.length) % SCREENS.length][0];
      renderLabChrome();
      renderStage();
      writeHash();
    }
    if (e.key === "[" && idx > 0) { state.world = WORLDS[idx - 1].id; renderLabChrome(); renderStage(); writeHash(); }
    if (e.key === "]" && idx < WORLDS.length - 1) { state.world = WORLDS[idx + 1].id; renderLabChrome(); renderStage(); writeHash(); }
    if (e.key === "Escape") showPicker();
  });
}

renderPicker();
bind();
readHash();
if (state.view === "lab") showLab();
