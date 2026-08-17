/* Oak theme lab · Box One + four replacements */

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
    id: "sig",
    name: "Signal",
    thesis: "Daylight bones, Index facts, Pokéball red only where something acts.",
    hero: "css:linear-gradient(180deg,#f6f7f9 0%,#ffffff 55%,#fde8e3 100%)",
    swatches: ["#f6f7f9", "#ffffff", "#E3350D", "#1b2430", "#e3e8ef"],
    fonts: "Figtree + IBM Plex Mono",
    why: "Daylight felt like any calm SaaS app because the brand color was Box One indigo. Index felt like an admin table. Signal keeps Daylight's air, cards, and native iOS chrome, borrows Index's compact fact table for mechanics, and puts true Pokéball red (#E3350D) only on Send, the live pip, the active mark, and the wordmark. Not a red header. Not a clamshell. Not cream.",
    palette: [
      ["Day", "#F6F7F9"],
      ["Card", "#FFFFFF"],
      ["Pokéball red", "#E3350D"],
      ["Ink", "#1B2430"],
      ["Rule", "#E3E8EF"],
    ],
    type: "Figtree 400/600 like Daylight. Plex Mono only inside the fact table. Radius 12. Red is never a fill on a large surface.",
    motion: [
      "Same 8px / 280ms rise as Daylight.",
      "Streaming is a 2px red bar and a 6px red pip. No scanlines, no ding.",
      "Send is red. Press is 0.98 scale.",
      "Active nav is ink plus a 2px red mark, not a red pill.",
    ],
    micro: [
      "Wordmark Oak with a red period. That is the brand.",
      "Mechanics answers get a four-row fact table under the lead.",
      "Inferred is a single red-ink line, not a banner or a stamp.",
      "Scope is a quiet chip with a red LED dot.",
      "Type badges stay full chroma. They are the other color in the room.",
    ],
    web: "Daylight rail. Red mark on the active item. White answer plate. Fact table. Red Send.",
    ios: "Native tabs. Selected tab is red. No red status bar. Composer Send is red.",
    refuse: "Red header slab, red user bubbles, cream well, blue hardware buttons, indigo as brand, stadium crawl.",
  },
  {
    id: "box",
    name: "Box One",
    thesis: "Everything lives in a PC box. Scope is wallpaper. Teams are party slots.",
    hero: "assets/box-wallpaper.jpg",
    swatches: ["#e7ecf4", "#3d4c7a", "#5b8def", "#1b2430", "#f7f9fc"],
    fonts: "Outfit + IBM Plex Mono",
    why: "Kept from the first lab. Cool storage plastic, indigo wallpaper, the PC cursor. Conversations are boxes. A Pokémon is a cell. Chat is the summary screen writing itself.",
    palette: [
      ["Shell", "#E7ECF4"],
      ["Well", "#F7F9FC"],
      ["Cursor", "#5B8DEF"],
      ["Wallpaper", "#3D4C7A"],
      ["Ink", "#1B2430"],
    ],
    type: "Outfit at 400/600. Plex Mono for slot codes. Slot radius 16px. The PC cursor is a 3px rounded rect.",
    motion: [
      "PC cursor follows in 180ms and overshoots to 1.04, then settles.",
      "Slot land: sprites drop 12px in 200ms.",
      "Wallpaper crossfades 400ms on scope change.",
      "Answer is a summary page sliding up from the active slot.",
    ],
    micro: [
      "Empty box shows a slot grid. Four slots hold starter silhouettes.",
      "Auth is a trainer ID. OTP is six box codes.",
      "History is a wall of mini-boxes.",
      "Artifact is the official summary layout: art, types, stat bars.",
    ],
    web: "Box list on the left. Current box in the center. Composer sits in a party bar.",
    ios: "Wallpaper behind glass panels. Party-bar composer. Four-item storage tab.",
    refuse: "Night-only chrome, paper grain, hanko stamps, weather, stadium crawl.",
  },
  {
    id: "dex",
    name: "The Dex",
    thesis: "The phone is Oak's original Pokédex. Flip it open. It dings. It speaks the entry.",
    hero: "css:linear-gradient(165deg,#e23b32 0%,#c62828 42%,#9b1c1c 100%)",
    swatches: ["#c62828", "#f3ead6", "#3b82f6", "#111811", "#f2c14e"],
    fonts: "IBM Plex Sans + IBM Plex Mono",
    why: "In the original series, Professor Oak hands Ash a red clamshell. You flip it open, it dings, a two-frame sprite appears on a small LCD, and a robotic voice (Dexter, in the English dub) says the species, the category, then two sentences of fact. Height and weight sit on a yellow data strip. Blue round buttons, cream interior, red lid. Later regions change the hardware. The object people mean when they say 'a Pokédex from the show' is this one. Oak the app is named after the man who invented it. On iOS you are holding that device.",
    palette: [
      ["Lid red", "#C62828"],
      ["Cream well", "#F3EAD6"],
      ["Button blue", "#3B82F6"],
      ["LCD", "#111811"],
      ["Data yellow", "#F2C14E"],
    ],
    type: "Plex Sans for the spoken entry. Plex Mono for silkscreen labels (POKÉDEX, HT, WT, NO.). No display face. The sprite on the dark LCD is the hero, not the type.",
    motion: [
      "Empty iOS: the lid is closed. It hinges open 480ms (rotateX) to the cream well. That is the boot.",
      "Identify: a two-note ding (CSS flash on the yellow strip) then the LCD scanline draws the sprite.",
      "Entry types on in the Dexter cadence: name, then category ('The Long Neck Pokémon'), then the fact.",
      "Streaming is a scan, not a spinner. Horizontal line over the LCD, 900ms loop.",
      "Buttons depress 2px on tap, like plastic. No spring.",
      "Voice is Dexter. The yellow strip pulses. The LCD holds the last sprite.",
    ],
    micro: [
      "Lead of every species answer is the show formula: Name. The X Pokémon.",
      "HT 10'06\" / WT 352.7 lbs sit on the yellow strip, always tabular.",
      "Scope is which regional chip is seated (Kanto red, National as a second chip).",
      "Teams are six party lights under the LCD, the way the show implies a roster, not a sports card.",
      "History is the Pokédex list: number, sprite, name. Conversations, not caught marks.",
      "Auth: 'This Pokédex is registered to' plus an email and a six-digit ID.",
    ],
    web: "A quiet gray desk. The red device is the window. Left hinge rail. Cream well. LCD + entry + yellow strip composer.",
    ios: "The whole phone is the device. Red chassis. Cream well. LCD at the top. Blue hardware buttons replace the tab bar. No iOS-looking chrome inside the red.",
    refuse: "Rotom face, Alola yellow, smartphone-skin, pixel fonts, Game Boy green-on-green as the whole UI, merch plastic everywhere except the chassis.",
  },
  {
    id: "day",
    name: "Daylight",
    thesis: "A calm daylight app. White, one indigo, no metaphor. The content is the color.",
    hero: "css:linear-gradient(180deg,#f6f7f9 0%,#e8edf4 100%)",
    swatches: ["#f6f7f9", "#ffffff", "#3d4c7a", "#1b2430", "#5b8def"],
    fonts: "Figtree + IBM Plex Mono",
    why: "Box One's cool palette, stripped of the PC-box story. This is what Oak looks like if it is just a carefully made consumer app: lots of air, one indigo, type badges as the only saturation. For people who thought the first lab was costumed.",
    palette: [
      ["Day", "#F6F7F9"],
      ["Card", "#FFFFFF"],
      ["Indigo", "#3D4C7A"],
      ["Ink", "#1B2430"],
      ["Link", "#5B8DEF"],
    ],
    type: "Figtree 400/600. 15px body, 22px lead. Radius 12. Soft tinted shadow, no grain. Pills only for chips.",
    motion: [
      "Enter: 8px rise, 280ms, no blur.",
      "Send: the note settles. No bounce.",
      "Streaming: a thin indigo bar that inches. That's it.",
      "Hover is a 1px tighter shadow, not a lift.",
    ],
    micro: [
      "Empty is a short prompt and four text starters. No hero illustration.",
      "Uncertainty is a single line under the lead, not a banner.",
      "Teams are a quiet list with sprites, not a grid of worlds.",
      "iOS uses a standard tab bar. It should feel like a native app, not a skin.",
    ],
    web: "Slim left nav. Wide reading column. Composer as a simple field.",
    ios: "Large title. Native tab bar. White cards on pale gray.",
    refuse: "Background photos, display type, weather, stamps, hardware chrome, crawl tickers.",
  },
  {
    id: "index",
    name: "Index",
    thesis: "A quiet index. Hairlines, tabular numbers, no broadcast.",
    hero: "css:linear-gradient(180deg,#eef0f3 0%,#d9dee6 100%)",
    swatches: ["#eef0f3", "#111318", "#5b6570", "#ffffff", "#2f6fed"],
    fonts: "IBM Plex Sans + IBM Plex Mono",
    why: "The competitive half of Oak without a stadium. Damage, speed, usage, and teams are rows. Press Box was the loud version of this idea. Index is the same job spoken quietly, like a well-set reference table.",
    palette: [
      ["Paper", "#EEF0F3"],
      ["Ink", "#111318"],
      ["Mute", "#5B6570"],
      ["Rule", "#D0D5DC"],
      ["Mark", "#2F6FED"],
    ],
    type: "Plex Sans for prose. Plex Mono 13 for every number and source. Radius 2. No shadows. Rules do the work.",
    motion: [
      "Rows do not animate in. The page is just there.",
      "Streaming is three mono lines, 80ms apart.",
      "Active row: a 2px mark in indigo on the left. No fill.",
      "Numbers never flap or count up.",
    ],
    micro: [
      "Damage and priority live in a two-column table under the lead.",
      "Teams are a numbered list, 1-6, hairline between rows.",
      "History is an index: date, title, scope. Like a book's back matter.",
      "Auth is 'Sign in', nothing else.",
    ],
    web: "Narrow index rail. Wide article. Tables, not cards.",
    ios: "Plain navigation title. List rows. No large type.",
    refuse: "LIVE pips, crawls, jersey numbers as decoration, split-flap, night stadium.",
  },
  {
    id: "guide",
    name: "Guide",
    thesis: "A field guide. Chapters, plates, a short entry. Not a garden.",
    hero: "css:linear-gradient(180deg,#f4f1ea 0%,#e4dfd4 100%)",
    swatches: ["#f4f1ea", "#1f1c18", "#6b6358", "#ffffff", "#3d4c7a"],
    fonts: "Source Sans 3 + IBM Plex Mono",
    why: "The curiosity half of Oak, without moonlight or sap. A modern field guide: a plate for the sprite, a short entry, then the mechanics. Scope is the chapter (National Dex, Johto, Champions). Warm paper only as a quiet page color, no grain, no dashes, no stamps.",
    palette: [
      ["Page", "#F4F1EA"],
      ["Ink", "#1F1C18"],
      ["Caption", "#6B6358"],
      ["Plate", "#FFFFFF"],
      ["Chapter", "#3D4C7A"],
    ],
    type: "Source Sans 3. Lead is 22px, not italic display. Captions 12px in the mute. Plates have a 1px rule, radius 4.",
    motion: [
      "Plate fades 200ms. No unfurl, no breathe.",
      "Chapter chip slides 2px when scope changes.",
      "Streaming is a caption: 'Looking up Armor Tail.'",
    ],
    micro: [
      "Every species answer starts with a plate (sprite + name + types) then the entry.",
      "Citations are a caption list, not receipts.",
      "Teams are a page of six small plates.",
      "History is a table of contents.",
    ],
    web: "Chapter rail. Page column, measure about 62ch. Plate then prose.",
    ios: "Chapter name in the nav. Plate, then entry. Simple tab bar.",
    refuse: "Serif display, moths, moon disks, growth animations, dashed specimen plates, Fredoka.",
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
  ["compare", "All"],
];

const state = { world: "sig", screen: "answer", plat: "web", doctrine: false, view: "picker" };

const $ = (id) => document.getElementById(id);

function typeChip(name, hex, kind) {
  if (kind === "box") {
    return `<span class="box-type" style="--tc:${hex}">${name}</span>`;
  }
  if (kind === "quiet") {
    return `<span class="quiet-type" style="--tc:${hex}">${name}</span>`;
  }
  return `<span style="display:inline-block;padding:2px 7px;border-radius:3px;background:${hex};color:#fff;font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-right:4px">${name}</span>`;
}

const PARTY = [
  { n: "1", img: S.garchomp, name: "Garchomp", types: "Dragon / Ground" },
  { n: "2", img: S.dragapult, name: "Dragapult", types: "Dragon / Ghost" },
  { n: "3", img: S.kingambit, name: "Kingambit", types: "Dark / Steel" },
  { n: "4", img: S.greatTusk, name: "Great Tusk", types: "Ground / Fighting" },
  { n: "5", img: S.tingLu, name: "Ting-Lu", types: "Dark / Ground" },
  { n: "6", img: S.farigiraf, name: "Farigiraf", types: "Normal / Psychic" },
];

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

function renderPicker() {
  $("picker-grid").innerHTML = WORLDS.map((w) => {
    const bg = w.hero.startsWith("css:")
      ? `background:${w.hero.slice(4)}`
      : `background-image:url('${w.hero}')`;
    return `<button class="world-card" data-enter="${w.id}" type="button">
      <div class="world-card-hero" style="${bg}"></div>
      <div class="world-card-body">
        <h2>${w.name}</h2>
        <p>${w.thesis}</p>
        <div class="swatches">${w.swatches.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
        <span class="enter">Enter</span>
      </div>
    </button>`;
  }).join("");
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
    <h4>Motion</h4>
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

function webFrame(world, html) {
  return `<div class="web-frame play" data-world="${world}">${html}</div>`;
}
function phone(world, html) {
  return `<div class="phone"><div class="phone-screen play" data-world="${world}">
    <div class="island"></div>${html}<div class="home-bar"></div>
  </div></div>`;
}
function tabs(items, on, cls) {
  return `<nav class="${cls}">${items.map((t) => `<span class="${t === on ? "is-on on" : ""}">${t}</span>`).join("")}</nav>`;
}

/* ---------- BOX ONE (kept) ---------- */
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

/* ---------- THE DEX ---------- */
function dexLCD(kind) {
  if (kind === "blank") {
    return `<div class="dex-lcd"><div class="dex-scan"></div><div class="dex-lcd-label">STANDBY</div></div>`;
  }
  if (kind === "scan") {
    return `<div class="dex-lcd is-scan"><div class="dex-scan"></div><div class="dex-lcd-label">SEARCHING</div></div>`;
  }
  return `<div class="dex-lcd"><img src="${S.farigiraf}" alt="" /><div class="dex-lcd-no">NO. 0981</div></div>`;
}
function dexYellow(text, withStats) {
  const stats = withStats ? `<span>HT 10'06"</span><span>WT 352.7 lbs</span>` : "";
  return `<div class="dex-yellow">${stats}<span>${text}</span></div>`;
}
function dexEmpty() {
  return `<div class="dex-empty">
    <p class="dex-ready">Ready.</p>
    <p class="dex-hint">Point it at a question. It will identify what it can, then speak the entry.</p>
    <div class="dex-starters">
      <button type="button">Fake Out / Farigiraf</button>
      <button type="button">Roaring Moon, where</button>
      <button type="button">Gen 5 crits</button>
      <button type="button">OU Stealth Rock</button>
    </div>
  </div>`;
}
function dexStream() {
  return `<div class="dex-ask">${Q}</div>
    ${dexLCD("scan")}
    <p class="dex-speak">Identifying… Armor Tail. Fake Out. Priority table.</p>`;
}
function dexAnswer() {
  return `<div class="dex-ask">${Q}</div>
    ${dexLCD("sprite")}
    <article class="dex-entry">
      <h4>Farigiraf.</h4>
      <p class="dex-cat">The Long Neck Pokémon.</p>
      <p class="dex-fact">${A}</p>
      <p class="dex-why">${WHY}</p>
      <p class="dex-src">Inferred from move priority and Armor Tail. National Dex.</p>
    </article>`;
}
function dexArt() {
  return `${dexAnswer()}<aside class="dex-panel">
    <div class="dex-lcd-label">DATA</div>
    <h4>Armor Tail</h4>
    <p>Opposing Pokémon cannot use priority moves against this Pokémon or its allies. Fake Out, Extreme Speed, Aqua Jet, First Impression.</p>
    ${dexYellow("ABILITY")}
  </aside>`;
}
function dexTeams() {
  return `<div class="dex-party">${PARTY.map((p) => `<div class="dex-mon"><img src="${p.img}" alt="" /><b>${p.name}</b></div>`).join("")}</div>`;
}
function dexHist() {
  return `<ol class="dex-list">
    <li><em>0981</em> Farigiraf · Fake Out</li>
    <li><em>0967</em> Cyclizar · location</li>
    <li><em>—</em> Gen 5 critical hits</li>
    <li><em>—</em> OU Stealth Rock</li>
  </ol>`;
}
function dexAuth() {
  return `<div class="dex-auth">
    <div class="dex-lid-mark">POKÉDEX</div>
    <p>This Pokédex is registered to</p>
    <div class="dex-field">you@oak.app</div>
    <div class="dex-id">ID 4 8 1 — — —</div>
  </div>`;
}
function dexVoice() {
  return `<div class="dex-voice">
    ${dexLCD("sprite")}
    <p class="dex-cat">Dexter is speaking.</p>
    <div class="dex-yellow is-live"><span class="dex-pulse"></span> LISTENING</div>
  </div>`;
}
function dexButtons(screen) {
  const on = screen === "teams" ? "PARTY" : screen === "history" ? "LIST" : screen === "auth" ? "ID" : "DEX";
  return `<div class="dex-btns">
    ${["DEX", "LIST", "PARTY", "ID"].map((t) => `<button type="button" class="${t === on ? "is-on" : ""}">${t}</button>`).join("")}
  </div>`;
}
function dexWeb(screen) {
  const body = { empty: dexEmpty(), streaming: dexStream(), answer: dexAnswer(), artifact: dexArt(), teams: dexTeams(), history: dexHist(), auth: dexAuth(), voice: dexVoice() }[screen];
  return `<div class="dex-web">
    <aside class="dex-hinge">
      <div class="dex-hinge-red"></div>
      <div class="dex-hinge-label">OAK<br/>HANDY505</div>
    </aside>
    <div class="dex-well">
      <header class="dex-top"><span>POKÉDEX</span><span>NATIONAL</span></header>
      <div class="dex-thread">${body}</div>
      ${screen === "auth" || screen === "voice" ? "" : dexYellow("ASK", screen === "answer" || screen === "artifact")}
      ${dexButtons(screen)}
    </div>
  </div>`;
}
function dexIOS(screen) {
  const closed = screen === "empty";
  const body = { empty: dexEmpty(), streaming: dexStream(), answer: dexAnswer(), artifact: dexArt(), teams: dexTeams(), history: dexHist(), auth: dexAuth(), voice: dexVoice() }[screen];
  return `<div class="dex-ios ios-safe ${closed ? "is-closed" : ""}">
    <div class="dex-lid">${closed ? `<div class="dex-lid-face"><span>POKÉDEX</span><i></i></div>` : ""}</div>
    <header class="dex-top"><span>POKÉDEX</span><span>NAT</span></header>
    <div class="dex-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : dexYellow("ASK", screen === "answer" || screen === "artifact")}
    ${dexButtons(screen)}
  </div>`;
}

/* ---------- DAYLIGHT ---------- */
function dayComposer() {
  return `<div class="day-composer"><span>Ask Oak</span><span class="day-go">Send</span></div>`;
}
function dayEmpty() {
  return `<div class="day-empty">
    <h3>What do you want to know?</h3>
    <p>Mechanics, locations, teams, damage. Oak will show its work.</p>
    <div class="day-starts">
      <span>Does Fake Out work on Farigiraf?</span>
      <span>Where does Roaring Moon spawn?</span>
      <span>What changed in Gen 5 crits?</span>
      <span>Who is using Stealth Rock in OU?</span>
    </div>
  </div>`;
}
function dayStream() {
  return `<div class="day-q">${Q}</div>
    <div class="day-bar"></div>
    <p class="day-status">Looking up Farigiraf, Fake Out, Armor Tail</p>`;
}
function dayAnswer() {
  return `<div class="day-q">${Q}</div>
    <article class="day-card">
      <div class="day-types">${typeChip("Psychic", "#f85888", "quiet")}${typeChip("Normal", "#a8a878", "quiet")}</div>
      <h4>${A}</h4>
      <p>${WHY}</p>
      <p class="day-note">Inferred. National Dex.</p>
      <div class="day-subj"><img class="sprite" src="${S.farigiraf}" alt="" /><div><b>Farigiraf</b><br/>Armor Tail</div></div>
    </article>`;
}
function dayArt() {
  return `${dayAnswer()}<aside class="day-sheet">
    <h4>Armor Tail</h4>
    <p>Priority moves aimed at this Pokémon or its ally fail. Protect still works.</p>
    <img class="sprite-lg" src="${S.farigiraf}" alt="" />
  </aside>`;
}
function dayTeams() {
  return `<div class="day-list">${PARTY.map((p) => `<div class="day-row"><img class="sprite-sm" src="${p.img}" alt="" /><div><b>${p.name}</b><span>${p.types}</span></div></div>`).join("")}</div>`;
}
function dayHist() {
  return `<div class="day-list">
    <div class="day-row"><div><b>Fake Out / Farigiraf</b><span>Today</span></div></div>
    <div class="day-row"><div><b>Roaring Moon</b><span>Yesterday</span></div></div>
    <div class="day-row"><div><b>Gen 5 crits</b><span>Yesterday</span></div></div>
  </div>`;
}
function dayAuth() {
  return `<div class="day-empty"><h3>Sign in</h3><p>Email a six-digit code. History and teams stay with the account.</p>
    <div class="day-composer"><span>you@oak.app</span><span class="day-go">Send</span></div></div>`;
}
function dayVoice() {
  return `<div class="day-voice"><div class="day-dot"></div><p>Listening</p></div>`;
}
function dayWeb(screen) {
  const body = { empty: dayEmpty(), streaming: dayStream(), answer: dayAnswer(), artifact: dayArt(), teams: dayTeams(), history: dayHist(), auth: dayAuth(), voice: dayVoice() }[screen];
  return `<div class="day-web">
    <aside class="day-nav">
      <b>Oak</b>
      <span class="${["empty","streaming","answer","artifact","voice"].includes(screen) ? "is-on" : ""}">Chat</span>
      <span class="${screen === "history" ? "is-on" : ""}">History</span>
      <span class="${screen === "teams" ? "is-on" : ""}">Teams</span>
      <span class="${screen === "auth" ? "is-on" : ""}">Account</span>
    </aside>
    <div class="day-main">
      <header class="day-top"><span>National Dex</span></header>
      <div class="day-thread">${body}</div>
      ${screen === "auth" || screen === "voice" ? "" : dayComposer()}
    </div>
  </div>`;
}
function dayIOS(screen) {
  const body = { empty: dayEmpty(), streaming: dayStream(), answer: dayAnswer(), artifact: dayArt(), teams: dayTeams(), history: dayHist(), auth: dayAuth(), voice: dayVoice() }[screen];
  return `<div class="day-ios ios-safe">
    <header class="day-top"><span>Oak</span><span>NatDex</span></header>
    <div class="day-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : dayComposer()}
    ${tabs(["Chat", "Teams", "History", "You"], screen === "teams" ? "Teams" : screen === "history" ? "History" : screen === "auth" ? "You" : "Chat", "day-ios-tabs")}
  </div>`;
}

/* ---------- SIGNAL ---------- */
function sigComposer() {
  return `<div class="sig-composer"><span>Ask Oak</span><span class="sig-go">Send</span></div>`;
}
function sigEmpty() {
  return `<div class="sig-empty">
    <h3>What do you want to know?</h3>
    <p>Mechanics, locations, teams, damage. Oak will show its work.</p>
    <div class="sig-starts">
      <span>Does Fake Out work on Farigiraf?</span>
      <span>Where does Roaring Moon spawn?</span>
      <span>What changed in Gen 5 crits?</span>
      <span>Who is using Stealth Rock in OU?</span>
    </div>
  </div>`;
}
function sigStream() {
  return `<div class="sig-q">${Q}</div>
    <div class="sig-live"><i></i> Looking up Farigiraf, Fake Out, Armor Tail</div>
    <div class="sig-bar"></div>`;
}
function sigAnswer() {
  return `<div class="sig-q">${Q}</div>
    <article class="sig-card">
      <div class="sig-meta">
        ${typeChip("Psychic", "#f85888", "quiet")}${typeChip("Normal", "#a8a878", "quiet")}
      </div>
      <h4>${A}</h4>
      <p>${WHY}</p>
      <p class="sig-note"><em>Inferred</em> from move priority and Armor Tail.</p>
      <table class="sig-table">
        <tr><th>Move</th><td>Fake Out</td></tr>
        <tr><th>Priority</th><td>+3</td></tr>
        <tr><th>Ability</th><td>Armor Tail</td></tr>
        <tr><th>Result</th><td>Does not execute</td></tr>
      </table>
      <div class="sig-subj"><img class="sprite" src="${S.farigiraf}" alt="" /><div><b>Farigiraf</b><span>Armor Tail · #0981</span></div></div>
    </article>`;
}
function sigArt() {
  return `${sigAnswer()}<aside class="sig-sheet">
    <h4>Armor Tail</h4>
    <p>Priority moves aimed at this Pokémon or its ally fail. Protect still works.</p>
    <table class="sig-table">
      <tr><th>Blocks</th><td>priority &gt; 0</td></tr>
      <tr><th>Allies</th><td>yes</td></tr>
    </table>
    <img class="sprite-lg" src="${S.farigiraf}" alt="" />
  </aside>`;
}
function sigTeams() {
  return `<div class="sig-list">${PARTY.map((p) => `<div class="sig-row"><img class="sprite-sm" src="${p.img}" alt="" /><div><b>${p.name}</b><span>${p.types}</span></div></div>`).join("")}</div>`;
}
function sigHist() {
  return `<div class="sig-list">
    <div class="sig-row is-on"><div><b>Fake Out / Farigiraf</b><span>Today · NatDex</span></div></div>
    <div class="sig-row"><div><b>Roaring Moon</b><span>Yesterday · SV</span></div></div>
    <div class="sig-row"><div><b>Gen 5 crits</b><span>Yesterday · Gen 5</span></div></div>
  </div>`;
}
function sigAuth() {
  return `<div class="sig-empty"><h3>Sign in</h3><p>Email a six-digit code. History and teams stay with the account.</p>
    ${sigComposer()}</div>`;
}
function sigVoice() {
  return `<div class="sig-voice"><div class="sig-dot"></div><p>Listening</p></div>`;
}
function sigWeb(screen) {
  const body = { empty: sigEmpty(), streaming: sigStream(), answer: sigAnswer(), artifact: sigArt(), teams: sigTeams(), history: sigHist(), auth: sigAuth(), voice: sigVoice() }[screen];
  return `<div class="sig-web">
    <aside class="sig-nav">
      <b>Oak<span>.</span></b>
      <span class="${["empty","streaming","answer","artifact","voice"].includes(screen) ? "is-on" : ""}">Chat</span>
      <span class="${screen === "history" ? "is-on" : ""}">History</span>
      <span class="${screen === "teams" ? "is-on" : ""}">Teams</span>
      <span class="${screen === "auth" ? "is-on" : ""}">Account</span>
    </aside>
    <div class="sig-main">
      <header class="sig-top"><span class="sig-scope"><i></i>National Dex</span></header>
      <div class="sig-thread">${body}</div>
      ${screen === "auth" || screen === "voice" ? "" : sigComposer()}
    </div>
  </div>`;
}
function sigIOS(screen) {
  const body = { empty: sigEmpty(), streaming: sigStream(), answer: sigAnswer(), artifact: sigArt(), teams: sigTeams(), history: sigHist(), auth: sigAuth(), voice: sigVoice() }[screen];
  return `<div class="sig-ios ios-safe">
    <header class="sig-top"><b>Oak<span>.</span></b><span class="sig-scope"><i></i>NatDex</span></header>
    <div class="sig-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : sigComposer()}
    ${tabs(["Chat", "Teams", "History", "You"], screen === "teams" ? "Teams" : screen === "history" ? "History" : screen === "auth" ? "You" : "Chat", "sig-ios-tabs")}
  </div>`;
}

/* ---------- INDEX ---------- */
function idxComposer() {
  return `<div class="idx-composer"><span>Query</span><b>Enter</b></div>`;
}
function idxEmpty() {
  return `<div class="idx-empty">
    <h3>Index</h3>
    <p>Ask a mechanics, location, or team question. Answers come back as a lead plus a table.</p>
    <ul>
      <li>Fake Out on Farigiraf</li>
      <li>Roaring Moon location</li>
      <li>Gen 5 critical hits</li>
      <li>OU Stealth Rock users</li>
    </ul>
  </div>`;
}
function idxStream() {
  return `<div class="idx-q">${Q}</div>
    <pre class="idx-log">resolve  farigiraf
get_move  fake-out
get_ability  armor-tail</pre>`;
}
function idxAnswer() {
  return `<div class="idx-q">${Q}</div>
    <h4>${A}</h4>
    <p class="idx-why">${WHY}</p>
    <table class="idx-table">
      <tr><th>Move</th><td>Fake Out</td></tr>
      <tr><th>Priority</th><td>+3</td></tr>
      <tr><th>Ability</th><td>Armor Tail</td></tr>
      <tr><th>Result</th><td>Move does not execute</td></tr>
      <tr><th>Call</th><td>Inferred</td></tr>
    </table>
    <div class="idx-subj"><img class="sprite-sm" src="${S.farigiraf}" alt="" /> Farigiraf · #0981 · National Dex</div>`;
}
function idxArt() {
  return `${idxAnswer()}<aside class="idx-side">
    <h4>Armor Tail</h4>
    <table class="idx-table">
      <tr><th>Blocks</th><td>priority &gt; 0</td></tr>
      <tr><th>Allies</th><td>yes</td></tr>
      <tr><th>Protect</th><td>unaffected</td></tr>
    </table>
  </aside>`;
}
function idxTeams() {
  return `<table class="idx-table">${PARTY.map((p) => `<tr><th>${p.n}</th><td><img class="sprite-sm" src="${p.img}" alt="" /> ${p.name}</td><td>${p.types}</td></tr>`).join("")}</table>`;
}
function idxHist() {
  return `<table class="idx-table">
    <tr><th>15 Aug</th><td>Fake Out / Farigiraf</td><td>NatDex</td></tr>
    <tr><th>14 Aug</th><td>Roaring Moon</td><td>SV</td></tr>
    <tr><th>14 Aug</th><td>Gen 5 crits</td><td>Gen 5</td></tr>
  </table>`;
}
function idxAuth() {
  return `<div class="idx-empty"><h3>Sign in</h3><p>Email, then a six-digit code.</p><div class="idx-composer"><span>you@oak.app</span><b>Send</b></div></div>`;
}
function idxVoice() {
  return `<div class="idx-voice"><p>mic · open</p><h3>−18 dB</h3></div>`;
}
function idxWeb(screen) {
  const body = { empty: idxEmpty(), streaming: idxStream(), answer: idxAnswer(), artifact: idxArt(), teams: idxTeams(), history: idxHist(), auth: idxAuth(), voice: idxVoice() }[screen];
  return `<div class="idx-web">
    <aside class="idx-rail">
      <b>Oak</b>
      <span class="is-on">Chat</span>
      <span>History</span>
      <span>Teams</span>
    </aside>
    <div class="idx-main">
      <header class="idx-top">National Dex</header>
      <div class="idx-thread">${body}</div>
      ${screen === "auth" || screen === "voice" ? "" : idxComposer()}
    </div>
  </div>`;
}
function idxIOS(screen) {
  const body = { empty: idxEmpty(), streaming: idxStream(), answer: idxAnswer(), artifact: idxArt(), teams: idxTeams(), history: idxHist(), auth: idxAuth(), voice: idxVoice() }[screen];
  return `<div class="idx-ios ios-safe">
    <header class="idx-top">Oak · NatDex</header>
    <div class="idx-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : idxComposer()}
    ${tabs(["Chat", "Teams", "Index", "You"], screen === "teams" ? "Teams" : screen === "history" ? "Index" : screen === "auth" ? "You" : "Chat", "idx-ios-tabs")}
  </div>`;
}

/* ---------- GUIDE ---------- */
function guideComposer() {
  return `<div class="guide-composer"><span>Look up</span><span>Go</span></div>`;
}
function guideEmpty() {
  return `<div class="guide-empty">
    <p class="guide-ch">National Dex</p>
    <h3>Field guide</h3>
    <p>A short entry, then the mechanics. Scope is the chapter.</p>
    <ol>
      <li>Fake Out and Farigiraf</li>
      <li>Roaring Moon</li>
      <li>Critical hits, Gen 5</li>
      <li>Stealth Rock in OU</li>
    </ol>
  </div>`;
}
function guideStream() {
  return `<div class="guide-q">${Q}</div>
    <p class="guide-cap">Looking up Armor Tail.</p>`;
}
function guideAnswer() {
  return `<div class="guide-q">${Q}</div>
    <figure class="guide-plate">
      <img class="sprite-lg" src="${S.farigiraf}" alt="" />
      <figcaption>Farigiraf · Long Neck · Psychic / Normal · #0981</figcaption>
    </figure>
    <h4>${A}</h4>
    <p>${WHY}</p>
    <p class="guide-cap">Inferred. Sources: Fake Out priority, Armor Tail text.</p>`;
}
function guideArt() {
  return `${guideAnswer()}<aside class="guide-sheet">
    <figure class="guide-plate">
      <figcaption>Plate · Armor Tail</figcaption>
    </figure>
    <p>Priority moves against this Pokémon or its ally fail.</p>
  </aside>`;
}
function guideTeams() {
  return `<div class="guide-plates">${PARTY.map((p) => `<figure class="guide-plate sm"><img src="${p.img}" alt="" /><figcaption>${p.name}</figcaption></figure>`).join("")}</div>`;
}
function guideHist() {
  return `<ol class="guide-toc">
    <li>Fake Out and Farigiraf</li>
    <li>Roaring Moon</li>
    <li>Critical hits, Gen 5</li>
  </ol>`;
}
function guideAuth() {
  return `<div class="guide-empty"><h3>Your copy</h3><p>Sign in to keep chapters and teams.</p>
    <div class="guide-composer"><span>you@oak.app</span><span>Go</span></div></div>`;
}
function guideVoice() {
  return `<div class="guide-voice"><p class="guide-ch">Listening</p><h3>Speak a name.</h3></div>`;
}
function guideWeb(screen) {
  const body = { empty: guideEmpty(), streaming: guideStream(), answer: guideAnswer(), artifact: guideArt(), teams: guideTeams(), history: guideHist(), auth: guideAuth(), voice: guideVoice() }[screen];
  return `<div class="guide-web">
    <aside class="guide-rail">
      <span class="guide-ch">Ch.</span>
      <b>National Dex</b>
      <span>Scarlet / Violet</span>
      <span>Champions</span>
      <span>Johto</span>
    </aside>
    <div class="guide-page">
      <div class="guide-thread">${body}</div>
      ${screen === "auth" || screen === "voice" ? "" : guideComposer()}
    </div>
  </div>`;
}
function guideIOS(screen) {
  const body = { empty: guideEmpty(), streaming: guideStream(), answer: guideAnswer(), artifact: guideArt(), teams: guideTeams(), history: guideHist(), auth: guideAuth(), voice: guideVoice() }[screen];
  return `<div class="guide-ios ios-safe">
    <header class="guide-ios-head"><span>Oak</span><span class="guide-ch">NatDex</span></header>
    <div class="guide-thread">${body}</div>
    ${screen === "auth" || screen === "voice" ? "" : guideComposer()}
    ${tabs(["Guide", "Party", "Contents", "You"], screen === "teams" ? "Party" : screen === "history" ? "Contents" : screen === "auth" ? "You" : "Guide", "guide-ios-tabs")}
  </div>`;
}

/* ---------- compare + stage ---------- */
function compareView() {
  const cards = {
    sig: `<div class="compare-mini play" data-world="sig">${sigAnswer()}</div>`,
    box: `<div class="compare-mini play" data-world="box">${boxAnswer()}</div>`,
    dex: `<div class="compare-mini play" data-world="dex">${dexAnswer()}</div>`,
    day: `<div class="compare-mini play" data-world="day">${dayAnswer()}</div>`,
    index: `<div class="compare-mini play" data-world="index">${idxAnswer()}</div>`,
    guide: `<div class="compare-mini play" data-world="guide">${guideAnswer()}</div>`,
  };
  return `<div class="compare-grid six">${WORLDS.map((w) => `<div class="compare-col"><h5>${w.name}</h5>${cards[w.id]}</div>`).join("")}</div>`;
}

const WEB = { sig: sigWeb, box: boxWeb, dex: dexWeb, day: dayWeb, index: idxWeb, guide: guideWeb };
const IOS = { sig: sigIOS, box: boxIOS, dex: dexIOS, day: dayIOS, index: idxIOS, guide: guideIOS };

function renderStage() {
  const stage = $("stage");
  if (state.screen === "compare") {
    stage.innerHTML = compareView();
    return;
  }
  const w = state.world;
  const s = state.screen;
  stage.innerHTML = state.plat === "ios" ? phone(w, IOS[w](s)) : webFrame(w, WEB[w](s));
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
    if (e.key >= "1" && e.key <= "6") {
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
