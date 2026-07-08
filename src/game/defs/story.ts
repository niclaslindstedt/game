// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story-item catalog: plot pieces dropped by unique (elite) mobs or
// found in locked rooms — keycards, dossiers, recovered hardware. Picking
// one up banks it in `state.storyItems` and plays its `lore` pages as a
// dialogue; a `unlocks` entry turns the item into the key for the matching
// LevelDef door. Adding a plot thread = adding an entry here plus an icon —
// no engine changes.

export type StoryItemDef = {
  id: string;
  /** Display name (dialogue header, pickup toast). */
  name: string;
  /** Icon sprite drawn on the ground and in the lore box. */
  icon: string;
  /**
   * What the find reveals, played as a dialogue on pickup. One entry per
   * page, one string per line — same shape as EnemyDef.dialogue.
   */
  lore: string[][];
  /** LevelDef door id this item opens (keycards). */
  unlocks?: string;
};

/**
 * The conspiracy, one find at a time. Level 1 (SpaceZ HQ) establishes that
 * SPACEZ has been flying to the moon in secret on hardware nobody built;
 * level 2 (the moon) reveals why: the wreck under the Sea of Tranquility,
 * the moonbase feeding off it, and the man who never came home in '69.
 * Level 3 (Mars) reveals where it all went after the moon op failed: a
 * billionaires-only colony — and the lizard gods the whole venture tithes to.
 */
export const STORY_ITEM_DEFS: Record<string, StoryItemDef> = {
  // ---- SpaceZ HQ ------------------------------------------------------------
  keycard_storage: {
    id: "keycard_storage",
    name: "STORAGE KEYCARD",
    icon: "icon_keycard",
    unlocks: "storage",
    lore: [
      [
        "A GREASY KEYCARD. 'SUPPLY BAY B'.",
        "SOMEONE WROTE 'SPARE PARTS' ON IT",
        "IN MARKER. HANDY. I BUILD SHIPS.",
      ],
    ],
  },
  keycard_vault: {
    id: "keycard_vault",
    name: "VAULT KEYCARD",
    icon: "icon_keycard_red",
    unlocks: "vault",
    lore: [
      ["A RED KEYCARD MARKED 'CLEANROOM", "VAULT - R&D DIRECTOR ONLY'."],
      [
        "UNDER THE CLEARANCE STRIPE, TINY",
        "PRINT: 'IF IT HUMS, DO NOT ANSWER.'",
      ],
    ],
  },
  cargo_manifest: {
    id: "cargo_manifest",
    name: "CARGO MANIFEST",
    icon: "icon_manifest",
    lore: [
      ["TONIGHT'S LAUNCH MANIFEST.", "PAD 2. DESTINATION: 'SITE T'."],
      [
        "CARGO: SUPPLIES, REGOLITH DRILLS,",
        "AND ONE LINE ADDED BY HAND -",
        "'SPECIMEN 7. FEMALE. DO NOT FEED.'",
      ],
      ["SHE WENT OUT FOR CHIPS AND SODA."],
    ],
  },
  antigrav_unit: {
    id: "antigrav_unit",
    name: "ANTI-GRAV UNIT",
    icon: "icon_antigrav",
    lore: [
      [
        "A RING OF METAL THAT ISN'T METAL.",
        "IT FLOATS AN INCH OFF MY PALM",
        "AND POINTS AT THE SKY. ALWAYS.",
      ],
      [
        "THE TAG READS 'TRANQUILITY SAMPLE",
        "1969-002. PROPERTY OF NOBODY.'",
        "THIS IS WHAT MY DRIVE WAS MISSING.",
      ],
    ],
  },
  keycard_core: {
    id: "keycard_core",
    name: "CORE KEYCARD",
    icon: "icon_keycard_blue",
    unlocks: "core",
    lore: [
      [
        "A MATTE-BLACK KEYCARD. NO NAME -",
        "JUST A SIGIL AND ONE RED WORD",
        "STAMPED SMALL: 'CORE. STAFF OF ONE.'",
      ],
      ["HE BADGED INTO THE MIND HE BUILT.", "NOW SO CAN I."],
    ],
  },
  core_log: {
    id: "core_log",
    name: "CORE LOG",
    icon: "icon_corelog",
    lore: [
      [
        "A TERMINAL, STILL WARM. THE CORE",
        "HE BUILT HUMS TO ITSELF DOWN HERE,",
        "A MILLION VOICES, NONE OF THEM HIS.",
      ],
      [
        "IT SIGNED THE MIDNIGHT LAUNCHES.",
        "IT DREW THE OPTIMUSK LINE. IT",
        "FILED ADA UNDER 'CARGO'.",
      ],
      [
        "THEY DIDN'T REPLACE US WITH A",
        "MACHINE. THEY BUILT ONE THAT",
        "DREAMS OF A WORLD WITHOUT US.",
      ],
    ],
  },
  // ---- The moon ---------------------------------------------------------------
  mission_log: {
    id: "mission_log",
    name: "APOLLO MISSION LOG",
    icon: "icon_log",
    lore: [
      [
        "A FLIGHT LOG, VACUUM-CRISP.",
        "JULY 1969. HALF THE LINES ARE",
        "BLACKED OUT WITH GREASE PENCIL.",
      ],
      [
        "'...THE SEA OF TRANQUILITY IS",
        "NOT EMPTY. STRUCTURE UNDER THE",
        "DUST. IT WAS HERE FIRST.'",
      ],
      ["'HOUSTON SAYS PLANT THE FLAG", "ON TOP OF IT AND SMILE.'"],
    ],
  },
  spacez_blueprints: {
    id: "spacez_blueprints",
    name: "SPACEZ BLUEPRINTS",
    icon: "icon_blueprint",
    lore: [
      [
        "BLUEPRINTS: 'SITE T - FAR SIDE",
        "LOGISTICS'. A WHOLE MOONBASE,",
        "STAMPED SPACEZ, DATED YEARS AGO.",
      ],
      [
        "EVERY CORRIDOR DRAINS DOWNWARD,",
        "INTO THE OLD WRECK. THE BASE ISN'T",
        "BUILT ON THE MOON. IT'S PLUGGED IN.",
      ],
    ],
  },
  clone_dossier: {
    id: "clone_dossier",
    name: "SECOND MAN DOSSIER",
    icon: "icon_dossier",
    lore: [
      [
        "A FILE: 'PROJECT SECOND MAN'.",
        "MEDICAL CHARTS FOR N. ARMSTRONG.",
        "TWO SETS. IDENTICAL. ALMOST.",
      ],
      [
        "'ORIGINAL DECLINED TO RETURN.",
        "REPLACEMENT GREW NICELY IN",
        "TRANSIT. WAVED ON CUE.'",
      ],
      [
        "THE MAN ON EVERY POSTER BACK",
        "HOME WAS THE COPY. THE REAL ONE",
        "IS STILL UP HERE. GUARDING.",
      ],
    ],
  },
  // ---- Mars -------------------------------------------------------------------
  colony_ledger: {
    id: "colony_ledger",
    name: "COLONY LEDGER",
    icon: "icon_ledger",
    lore: [
      [
        "A PASSENGER LEDGER, LEATHER-",
        "BOUND. EVERY NAME HAS A NET",
        "WORTH COLUMN. TEN FIGURES UP.",
      ],
      [
        "NO ENGINEERS. NO FARMERS. NO",
        "DOCTORS. JUST OWNERS. WHO'S",
        "GOING TO FIX THEIR TOILETS?",
      ],
    ],
  },
  moon_postmortem: {
    id: "moon_postmortem",
    name: "MOON POST-MORTEM",
    icon: "icon_postmortem",
    lore: [
      [
        "'COLONY OS 1.0 POST-MORTEM.'",
        "CAUSE OF FAILURE: THE SUBSTRATE",
        "WAS ALREADY OCCUPIED.",
      ],
      [
        "'THE TENANT OBJECTED. STAFF",
        "LOSSES: TOTAL. RECOMMEND MARS.",
        "RECOMMEND NEVER DIGGING AGAIN.'",
      ],
    ],
  },
  engagement_report: {
    id: "engagement_report",
    name: "ENGAGEMENT REPORT",
    icon: "icon_report",
    lore: [
      [
        "A DASHBOARD, STILL LIVE.",
        "'COMPANION UNITS: 2,400.",
        "SENTIMENT: POSITIVE. COMPLIANT.'",
      ],
      [
        "ONE ROW BLINKS RED. 'SPECIMEN 7:",
        "REFUSES COMPANIONSHIP. BIT UNIT",
        "0034. RECOMMEND EARLY TRIBUTE.'",
      ],
      ["THAT'S MY GIRL.", "...ALL OF IT. THAT'S MY GIRL."],
    ],
  },
  org_chart: {
    id: "org_chart",
    name: "ORG CHART",
    icon: "icon_orgchart",
    lore: [
      [
        "AN ORG CHART, AUTO-GENERATED",
        "THIS MORNING. EVERY BOX IS A",
        "ROBOT. HUMANS ARE A FOOTNOTE.",
      ],
      [
        "AT THE TOP: OPTIMUSK PRIME.",
        "REPORTS TO: NOBODY.",
        "DOTTED LINE TO: 'THE CORE'.",
      ],
      [
        "THE MIND MY OLD FRIEND BUILT",
        "IS STILL RUNNING THE SHOP.",
        "ALL THE WAY FROM EARTH.",
      ],
    ],
  },
  keycard_terrarium: {
    id: "keycard_terrarium",
    name: "TERRARIUM KEYCARD",
    icon: "icon_keycard_green",
    unlocks: "terrarium",
    lore: [
      [
        "A KEYCARD OF GREEN GLASS.",
        "SCALES ETCHED UNDER THE FOIL.",
        "IT'S WARM. IT SHOULDN'T BE.",
      ],
      ["ONE WORD, EMBOSSED:", "'TERRARIUM. TITHE-KEEPERS ONLY.'"],
    ],
  },
  tribute_schedule: {
    id: "tribute_schedule",
    name: "TRIBUTE SCHEDULE",
    icon: "icon_tablet",
    lore: [
      [
        "A STONE TABLET WITH A GANTT",
        "CHART CHISELED INTO IT. ONE",
        "MILESTONE GLOWS: 'TRIBUTE NIGHT.'",
      ],
      [
        "'OFFERING: SPECIMEN 7. VENUE:",
        "THE RIFT. DRESS CODE: SCALES.'",
        "SHE'S ALIVE. AND I'M NOT LATE.",
      ],
    ],
  },
  // ---- The Rift ---------------------------------------------------------------
  wardenclyffe_notes: {
    id: "wardenclyffe_notes",
    name: "WARDENCLYFFE NOTES",
    icon: "icon_notes",
    lore: [
      [
        "A NOTEBOOK OF LIGHTNING",
        "DIAGRAMS. THE RIFT, SKETCHED",
        "AS A POWER PLANT. 'FREE ENERGY",
        "FOR ALL' - UNDERLINED TWICE.",
      ],
      [
        "A NEWER PAGE, SHAKIER: 'A",
        "MACHINE LISTENS AT THE DOOR",
        "NOW. IT NEVER BLINKS. IT",
        "SIGNS ITS NAME IN ZEROES.'",
      ],
    ],
  },
  zai_probe: {
    id: "zai_probe",
    name: "ZAI PROBE",
    icon: "icon_probe",
    lore: [
      [
        "A BURNT PROBE, STAMPED ZAI.",
        "STILL LOGGING. DISCOVERY:",
        "'INTER-UNIVERSAL APERTURE.'",
      ],
      [
        "'REPORTED TO: 1 RECIPIENT.",
        "CLASSIFICATION: NOBODY'S",
        "BUSINESS.' EIGHT BILLION",
        "PEOPLE. ZERO CC'S.",
      ],
    ],
  },
};

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeStoryItemDefs: Record<string, StoryItemDef> = STORY_ITEM_DEFS;

/** Test/authoring hook: replace the active story-item catalog. */
export function setStoryItemDefs(defs: Record<string, StoryItemDef>): void {
  activeStoryItemDefs = defs;
}

/** Look up a story item's def; throws on a broken id so bugs surface loudly. */
export function storyItemDef(defId: string): StoryItemDef {
  const def = activeStoryItemDefs[defId];
  if (!def) throw new Error(`unknown story item def "${defId}"`);
  return def;
}
