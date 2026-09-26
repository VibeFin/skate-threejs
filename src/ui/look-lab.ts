// THE LOOK LAB — a temporary tuning panel, built because the player asked for
// one in so many words: *"Could you create a temporary in-game panel for
// post-effects that I can tweak in the editor to adjust lighting and
// post-effects for AAA-quality graphics? Then I can copy the settings and share
// them with you, and we can remove the panel afterwards."*
//
// ── THIS IS NOT DEBUG CODE, AND THE DIFFERENCE MATTERS ─────────────────────
//
// The project's build contract forbids debug-only code — hidden test modes,
// secret URL parameters, forced-visible flags, key combinations only the
// builder knows. None of that is here. There is no query string, no key chord
// and no build flag: this thing is opened by calling `open()`, and the boot
// hangs that off a row the player can SEE. It is a tool he asked for out loud,
// it is reached the way every other screen in the game is reached, and it is
// the only way the number he wants can come out of his hands instead of out of
// a guess made on someone else's monitor.
//
// ── IT IS BUILT TO BE DELETED ──────────────────────────────────────────────
//
// One file, one import, one call site. When the numbers come back they go into
// `PRESET_SPECS` and `COLOUR` in `src/render/` and into the light rig in
// `src/world/field.ts`, and then this file, its import, its call site, and the
// handful of members marked TEMPORARY in `look.ts`, `metering.ts`,
// `ps2-grade.ts` and `field.ts` all go together. Nothing else in the tree has
// been allowed to grow a dependency on any of it — the panel reaches INTO the
// render chain and the chain does not know it exists.
//
// ── WHAT IS LIVE AND WHAT IS NOT ───────────────────────────────────────────
//
// Nearly everything is a uniform, a light property or a shadow-camera number,
// so dragging it changes the very next frame. Four things genuinely cannot be:
// the tap counts on the shutter, the defocus and the god rays, and the AO's
// sample count, are compiled into their shaders as `#define`s — a preset that
// asked for eight taps runs an eight-iteration loop, which is the whole reason
// they are cheap. Those rows say REBUILD on them and swap the preset to take
// effect. A stage a preset never compiled at all (the fringe and the god rays
// on `low`, the defocus anywhere but the showcase) says OFF HERE, because a
// slider that writes a uniform no program contains would be a lie.
//
// ── THE OUTPUT ─────────────────────────────────────────────────────────────
//
// COPY is the point of the whole panel. It emits a flat, named block — one
// `name = value` a line, grouped, with the quality rung it was tuned on at the
// top — so what comes back can be read straight into the preset tables without
// anybody having to work out which slider was which.

import * as THREE from "three";
import type { LookStack, PresetName } from "../render/look";

/** The bits of a mounted map this panel can reach. Structural on purpose: it
 *  takes anything with a key light, which is both maps and no import cycle. */
export interface LookLabField {
  sun: THREE.DirectionalLight;
  setSunAngles?(azimuthDeg: number, elevationDeg: number): void;
  setShadowReach?(metres: number): void;
}

export interface LookLabDeps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  look: LookStack;
  /** The mounted map, for the sun rows. Re-point it on a spot change. */
  field?: LookLabField;
}

export interface LookLab {
  open(): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  /** A spot change built a new key light — hand the panel the new map. */
  setField(field: LookLabField | undefined): void;
  dispose(): void;
}

type Row =
  | {
      kind: "range";
      label: string;
      note?: string;
      min: number;
      max: number;
      step: number;
      get(): number;
      set(v: number): void;
    }
  | { kind: "color"; label: string; note?: string; get(): string; set(v: string): void }
  | { kind: "toggle"; label: string; note?: string; get(): boolean; set(v: boolean): void }
  | {
      kind: "choice";
      label: string;
      note?: string;
      options: readonly string[];
      get(): string;
      set(v: string): void;
    }
  | { kind: "dead"; label: string; note: string };

interface Group {
  title: string;
  rows: Row[];
}

const CSS = `
.looklab{position:fixed;top:0;right:0;bottom:0;width:352px;max-width:96vw;z-index:9000;
  display:flex;flex-direction:column;background:#12131a;color:#dfe3ec;
  font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  border-left:1px solid #2c3040;box-shadow:-14px 0 40px rgba(0,0,0,.55)}
.looklab[hidden]{display:none}
.looklab header{display:flex;align-items:baseline;gap:8px;padding:10px 12px;
  border-bottom:1px solid #2c3040;background:#171926;flex:0 0 auto}
.looklab header b{font-size:13px;letter-spacing:.08em;color:#ffd15c}
.looklab header span{color:#7d859c;font-size:11px}
.looklab header button{margin-left:auto}
.looklab .body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 14px}
.looklab .grp{margin:10px 0 0}
.looklab .grp>h4{margin:0;padding:5px 12px;font-size:11px;letter-spacing:.12em;
  color:#8fd0ff;background:#191c28;border-top:1px solid #262a38;border-bottom:1px solid #262a38}
.looklab .row{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:5px 12px;align-items:center}
.looklab .row:hover{background:#171a24}
.looklab .row label{color:#c3c9d8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.looklab .row output{color:#ffd15c;font-variant-numeric:tabular-nums;text-align:right;min-width:64px}
.looklab .row .wide{grid-column:1/3;display:flex;gap:6px;align-items:center}
.looklab .note{grid-column:1/3;color:#707892;font-size:10.5px;letter-spacing:.04em}
.looklab input[type=range]{width:100%;accent-color:#ffd15c;height:16px}
.looklab input[type=color]{width:44px;height:22px;padding:0;border:1px solid #333849;background:#0e0f15}
.looklab input[type=checkbox]{accent-color:#ffd15c;width:15px;height:15px}
.looklab select{background:#0e0f15;color:#dfe3ec;border:1px solid #333849;font:inherit;padding:2px 4px}
.looklab button{background:#242a3a;color:#e8ecf5;border:1px solid #3a4256;font:inherit;
  padding:4px 10px;cursor:pointer;letter-spacing:.06em}
.looklab button:hover{background:#2f3648}
.looklab footer{flex:0 0 auto;border-top:1px solid #2c3040;background:#171926;padding:8px 12px;
  display:flex;flex-direction:column;gap:6px}
.looklab footer .btns{display:flex;gap:6px}
.looklab textarea{width:100%;height:96px;background:#0b0c11;color:#9fb4cf;border:1px solid #2c3040;
  font:11px/1.35 ui-monospace,Menlo,monospace;resize:vertical;white-space:pre}
.looklab .dead{color:#6b7288;font-style:italic}
`;

const hex = (c: THREE.Color): string => `#${c.getHexString()}`;
const vecHex = (v: THREE.Vector3): string =>
  `#${new THREE.Color(v.x, v.y, v.z).getHexString()}`;

/** Read a shader uniform as a number, tolerating a stage a preset left out. */
function num(u: Record<string, THREE.IUniform> | undefined, name: string): number {
  const v = u?.[name]?.value;
  return typeof v === "number" ? v : 0;
}

export function createLookLab(deps: LookLabDeps): LookLab {
  const { renderer, scene, look } = deps;
  let field = deps.field;
  let open = false;

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("aside");
  root.className = "looklab";
  root.hidden = true;
  root.innerHTML = `
    <header><b>LOOK LAB</b><span id="ll-rung"></span><button id="ll-x">CLOSE</button></header>
    <div class="body" id="ll-body"></div>
    <footer>
      <div class="btns">
        <button id="ll-copy">COPY SETTINGS</button>
        <button id="ll-reset">RESET</button>
      </div>
      <textarea id="ll-out" readonly placeholder="Press COPY — the settings land here and on the clipboard."></textarea>
    </footer>`;
  document.body.appendChild(root);

  const body = root.querySelector<HTMLDivElement>("#ll-body")!;
  const out = root.querySelector<HTMLTextAreaElement>("#ll-out")!;
  const rung = root.querySelector<HTMLSpanElement>("#ll-rung")!;

  // The ride listens on `window` for WASD / Space / Shift / X / E / R and the
  // quest card listens for T, and every one of those would fire while the
  // player is typing into or dragging inside this panel. Stopping propagation
  // at the panel's own root is what keeps a slider from also being a trick:
  // `window` is the last stop in the bubble path, so nothing that starts in
  // here ever reaches it. The pointer events go with them — the free-look
  // camera reads raw mouse movement, and a cursor dragging a slider is not the
  // player looking around.
  const swallow = (e: Event): void => {
    e.stopPropagation();
  };
  for (const type of [
    "keydown",
    "keyup",
    "keypress",
    "pointerdown",
    "pointermove",
    "pointerup",
    "mousedown",
    "mousemove",
    "mouseup",
    "wheel",
    "contextmenu",
  ]) {
    root.addEventListener(type, swallow);
  }
  // …except Escape, which closes the panel rather than pausing behind it.
  root.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") api.close();
  });

  // ── THE SHIPPED VALUES, snapshotted at construction ────────────────────────
  //
  // RESET restores THESE and not a table of literals: the panel is built while
  // the game is already running its own preset, so whatever the chain came up
  // holding is by definition what the game ships. It survives a preset swap
  // because it is read before the first slider ever moves.
  const shipped = new Map<string, number | string | boolean>();
  let snapshotted = false;

  /** Every light this panel can reach, found in the scene rather than handed
   *  in — which is what lets it work on either map without a second wire. */
  function lights(): {
    key: THREE.DirectionalLight | null;
    bounce: THREE.DirectionalLight | null;
    hemi: THREE.HemisphereLight | null;
  } {
    const dir: THREE.DirectionalLight[] = [];
    let hemi: THREE.HemisphereLight | null = null;
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight & THREE.HemisphereLight;
      if (l.isDirectionalLight) dir.push(l as THREE.DirectionalLight);
      else if (l.isHemisphereLight && !hemi) hemi = l as THREE.HemisphereLight;
    });
    dir.sort((a, b) => b.intensity - a.intensity);
    return { key: dir[0] ?? field?.sun ?? null, bounce: dir[1] ?? null, hemi };
  }

  /** Sun bearing and height, in degrees, off wherever the light actually is. */
  let sunAz = -160;
  let sunEl = 22;
  function readSunAngles(sun: THREE.DirectionalLight): void {
    const d = sun.position.clone().sub(sun.target.position);
    if (d.lengthSq() < 1e-6) return;
    d.normalize();
    sunAz = (Math.atan2(d.z, d.x) * 180) / Math.PI;
    sunEl = (Math.asin(Math.min(1, Math.max(-1, d.y))) * 180) / Math.PI;
  }

  function buildGroups(): Group[] {
    const p = look.passes;
    const g = p.grade.uniforms as Record<string, THREE.IUniform>;
    const { key, bounce, hemi } = lights();
    const groups: Group[] = [];

    // ── QUALITY RUNG ────────────────────────────────────────────────────────
    groups.push({
      title: "QUALITY RUNG — what the machine is asked to do",
      rows: [
        {
          kind: "choice",
          label: "preset",
          note: "REBUILD — swaps MSAA, AO, bloom resolution and every tap count.",
          options: ["low", "medium", "high"],
          get: () => look.preset,
          set: (v) => {
            look.setPreset(v as PresetName);
            render();
          },
        },
        {
          kind: "choice",
          label: "internal render scale",
          note: "1 is off. 0.55 is the PS2's own 640×448 and the softness with it.",
          options: ["1", "0.75", "0.55"],
          get: () => String(look.renderScale),
          set: (v) => look.setRenderScale(Number(v)),
        },
      ],
    });

    // ── THE LIGHT RIG ───────────────────────────────────────────────────────
    const lightRows: Row[] = [];
    if (key) {
      readSunAngles(key);
      lightRows.push(
        {
          kind: "range",
          label: "sun intensity",
          min: 0,
          max: 8,
          step: 0.02,
          get: () => key.intensity,
          set: (v) => (key.intensity = v),
        },
        {
          kind: "color",
          label: "sun colour",
          note: "Warmer than 3200 K turns grey concrete to terracotta — measured.",
          get: () => hex(key.color),
          set: (v) => key.color.set(v),
        },
      );
      if (field?.setSunAngles) {
        lightRows.push(
          {
            kind: "range",
            label: "sun bearing °",
            note: "Turns the sky panorama with it, so the shadows never disagree with the picture.",
            min: -180,
            max: 180,
            step: 1,
            get: () => sunAz,
            set: (v) => {
              sunAz = v;
              field?.setSunAngles?.(sunAz, sunEl);
            },
          },
          {
            kind: "range",
            label: "sun height °",
            note: "22° is measured off the west block's own shadow. Lower rakes harder and darkens more of the plaza.",
            min: 2,
            max: 80,
            step: 0.5,
            get: () => sunEl,
            set: (v) => {
              sunEl = v;
              field?.setSunAngles?.(sunAz, sunEl);
            },
          },
        );
      } else {
        lightRows.push({
          kind: "dead",
          label: "sun bearing / height",
          note: "This map does not hand the panel its sun angles.",
        });
      }
      if (key.castShadow) {
        const sh = key.shadow;
        lightRows.push(
          {
            kind: "range",
            label: "shadow darkness",
            note: "How much light a shadow actually takes away. 1 is full; under it the fill 'sees into' the shade without touching any other surface.",
            min: 0,
            max: 1,
            step: 0.01,
            get: () => key.shadow.intensity,
            set: (v) => (key.shadow.intensity = v),
          },
          {
            kind: "range",
            label: "shadow depth bias",
            note: "Pushes the receiver toward the light. Too much and the board's shadow slides out from under it. Re-derived if you move the sun or the reach.",
            min: -0.004,
            max: 0,
            step: 0.00002,
            get: () => sh.bias,
            set: (v) => (sh.bias = v),
          },
          {
            kind: "range",
            label: "shadow normal bias (m)",
            note: "The grazing-angle tool. About one world texel is right. Also re-derived by the two rows below.",
            min: 0,
            max: 0.16,
            step: 0.002,
            get: () => sh.normalBias,
            set: (v) => (sh.normalBias = v),
          },
          {
            kind: "range",
            label: "shadow softness",
            note: "The tap disc, in texels. Under 1 it stops filtering and edges stair-step; past ~3 the five taps start to band.",
            min: 0,
            max: 5,
            step: 0.1,
            get: () => sh.radius,
            set: (v) => (sh.radius = v),
          },
          // Through the MAP and not through the camera. The box's height, its
          // clip planes, both biases and the texel the follow snaps to are all
          // derived from this one number — see `Field.setShadowReach`. Writing
          // `camera.left`/`right` here (which is what this row used to do) moved
          // the frustum out from under the snap and put the crawl back.
          field?.setShadowReach
            ? {
                kind: "range",
                label: "shadow reach (m)",
                note: "How far from you the shadows go. Smaller is sharper and stops sooner — this is the sharpness knob.",
                min: 12,
                max: 90,
                step: 1,
                get: () => (sh.camera.right - sh.camera.left) / 2,
                set: (v) => field?.setShadowReach?.(v),
              }
            : {
                kind: "dead",
                label: "shadow reach (m)",
                note: "This map does not hand the panel its shadow box.",
              },
          {
            kind: "dead",
            label: "shadow map side",
            note: `REBUILD — ${sh.mapSize.x} px, set by the quality rung. ${(
              ((sh.camera.right - sh.camera.left) / Math.max(1, sh.mapSize.x)) *
              100
            ).toFixed(2)} cm across per texel, ${(
              ((sh.camera.top - sh.camera.bottom) / Math.max(1, sh.mapSize.y)) *
              100
            ).toFixed(2)} cm down.`,
          },
        );
      }
    }
    if (hemi) {
      const h = hemi as THREE.HemisphereLight;
      lightRows.push(
        {
          kind: "range",
          label: "sky fill level",
          note: "Flat, diffuse-only, no specular. Trade it against the environment below.",
          min: 0,
          max: 2,
          step: 0.01,
          get: () => h.intensity,
          set: (v) => (h.intensity = v),
        },
        {
          kind: "color",
          label: "sky fill colour",
          get: () => hex(h.color),
          set: (v) => h.color.set(v),
        },
        {
          kind: "color",
          label: "ground bounce colour",
          get: () => hex(h.groundColor),
          set: (v) => h.groundColor.set(v),
        },
      );
    }
    if (bounce) {
      lightRows.push(
        {
          kind: "range",
          label: "wall bounce level",
          note: "The light off the facade opposite. It shapes the shaded side; the hemisphere cannot.",
          min: 0,
          max: 2,
          step: 0.01,
          get: () => bounce.intensity,
          set: (v) => (bounce.intensity = v),
        },
        {
          kind: "color",
          label: "wall bounce colour",
          get: () => hex(bounce.color),
          set: (v) => bounce.color.set(v),
        },
      );
    }
    lightRows.push({
      kind: "range",
      label: "environment (sky IBL)",
      note: "The only fill that also reflects — it is what gives metal and glass a highlight.",
      min: 0,
      max: 2,
      step: 0.01,
      get: () => scene.environmentIntensity,
      set: (v) => (scene.environmentIntensity = v),
    });
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    if (fog) {
      lightRows.push(
        {
          kind: "range",
          label: "haze starts (m)",
          note: "Too near and the whole block pre-mixes to one colour before post ever sees it.",
          min: 0,
          max: 140,
          step: 1,
          get: () => fog.near,
          set: (v) => (fog.near = v),
        },
        {
          kind: "range",
          label: "haze full (m)",
          min: 30,
          max: 700,
          step: 5,
          get: () => fog.far,
          set: (v) => (fog.far = v),
        },
        {
          kind: "color",
          label: "haze colour",
          get: () => hex(fog.color),
          set: (v) => fog.color.set(v),
        },
      );
    }
    groups.push({ title: "LIGHT RIG — the scene, before any post", rows: lightRows });

    // ── EXPOSURE ────────────────────────────────────────────────────────────
    const m = p.meter;
    groups.push({
      title: "EXPOSURE — the camera's own stop",
      rows: [
        {
          kind: "range",
          label: "base exposure",
          min: 0.2,
          max: 3,
          step: 0.01,
          get: () => renderer.toneMappingExposure,
          set: (v) => (renderer.toneMappingExposure = v),
        },
        {
          kind: "range",
          label: "metering target",
          note: "The scene brightness the game is exposed FOR. Lower = a brighter picture.",
          min: 0.02,
          max: 0.4,
          step: 0.002,
          get: () => num(m, "uKey"),
          set: (v) => (m.uKey!.value = v),
        },
        {
          kind: "range",
          label: "adaptation strength",
          note: "1 renders every corner of the block at the same brightness — its own kind of flat.",
          min: 0,
          max: 1,
          step: 0.02,
          get: () => num(m, "uStrength"),
          set: (v) => (m.uStrength!.value = v),
        },
        {
          kind: "range",
          label: "darkest the meter may go",
          min: 0.1,
          max: 1,
          step: 0.01,
          get: () => num(m, "uMin"),
          set: (v) => (m.uMin!.value = v),
        },
        {
          kind: "range",
          label: "brightest the meter may go",
          min: 1,
          max: 4,
          step: 0.02,
          get: () => num(m, "uMax"),
          set: (v) => (m.uMax!.value = v),
        },
        {
          kind: "range",
          label: "stop-down time (s)",
          min: 0.05,
          max: 3,
          step: 0.05,
          get: () => num(m, "uTauDown"),
          set: (v) => (m.uTauDown!.value = v),
        },
        {
          kind: "range",
          label: "open-up time (s)",
          min: 0.05,
          max: 4,
          step: 0.05,
          get: () => num(m, "uTauUp"),
          set: (v) => (m.uTauUp!.value = v),
        },
      ],
    });

    // ── BLOOM ───────────────────────────────────────────────────────────────
    groups.push({
      title: "BLOOM — the glow off anything hot",
      rows: [
        {
          kind: "range",
          label: "strength",
          min: 0,
          max: 1.5,
          step: 0.01,
          get: () => p.bloom.strength,
          set: (v) => (p.bloom.strength = v),
        },
        {
          kind: "range",
          label: "radius",
          min: 0,
          max: 1,
          step: 0.01,
          get: () => p.bloom.radius,
          set: (v) => (p.bloom.radius = v),
        },
        {
          kind: "range",
          label: "starts at",
          note: "Where a pixel counts as a light source. The god rays read the same number.",
          min: 0.3,
          max: 1.6,
          step: 0.01,
          get: () => look.tuning.bloomKnee,
          set: (v) => (look.tuning.bloomKnee = v),
        },
        {
          kind: "toggle",
          label: "lens dirt",
          get: () => num(g, "uDirt") > 0,
          set: (v) => look.setLensDirt(v),
        },
        p.defines.DIRT
          ? {
              kind: "range",
              label: "lens dirt strength",
              min: 0,
              max: 2,
              step: 0.01,
              get: () => num(g, "uDirt"),
              set: (v) => (g.uDirt!.value = v),
            }
          : { kind: "dead", label: "lens dirt strength", note: "OFF HERE — this preset did not compile it." },
      ],
    });

    // ── AMBIENT OCCLUSION ───────────────────────────────────────────────────
    groups.push({
      title: "CONTACT DARKENING (AO) — showcase rung only",
      rows: p.ao
        ? [
            {
              kind: "range",
              label: "strength",
              min: 0,
              max: 2,
              step: 0.02,
              get: () => p.ao!.blendIntensity,
              set: (v) => (p.ao!.blendIntensity = v),
            },
            {
              kind: "range",
              label: "radius (m)",
              note: "A kerb is 0.15 m and a ledge 0.4 — past about 1.2 it stops reading as contact.",
              min: 0.1,
              max: 3,
              step: 0.05,
              get: () => (p.ao!.pdMaterial.uniforms.radius?.value as number) ?? 0.9,
              set: (v) => p.ao!.updateGtaoMaterial({ radius: v }),
            },
          ]
        : [{ kind: "dead", label: "ambient occlusion", note: "OFF HERE — only the showcase rung draws it." }],
    });

    // ── MOTION / DEFOCUS ────────────────────────────────────────────────────
    const mb = p.motion?.pass.uniforms as Record<string, THREE.IUniform> | undefined;
    groups.push({
      title: "MOTION BLUR — the shutter",
      rows: mb
        ? [
            {
              kind: "range",
              label: "shutter",
              note: "0.5 is the film convention's 180° at 60 fps.",
              min: 0,
              max: 1,
              step: 0.01,
              get: () => num(mb, "uShutter"),
              set: (v) => (mb.uShutter!.value = v),
            },
            {
              kind: "range",
              label: "longest streak",
              note: "A soft knee, not a ceiling. 0.011 is about 14 px across a 1280 frame.",
              min: 0,
              max: 0.05,
              step: 0.0005,
              get: () => num(mb, "uMaxBlur"),
              set: (v) => (mb.uMaxBlur!.value = v),
            },
            { kind: "dead", label: "taps", note: "REBUILD — 5 on medium, 8 on high; compiled in." },
          ]
        : [{ kind: "dead", label: "motion blur", note: "OFF HERE — this preset did not compile it." }],
    });

    const db = p.blur?.pass.uniforms as Record<string, THREE.IUniform> | undefined;
    groups.push({
      title: "DISTANCE BLUR — the far end going soft",
      rows: db
        ? [
            {
              kind: "range",
              label: "defocus radius",
              min: 0,
              max: 0.12,
              step: 0.001,
              get: () => num(db, "uRadius"),
              set: (v) => (db.uRadius!.value = v),
            },
            {
              kind: "toggle",
              label: "on",
              get: () => p.blur!.pass.enabled,
              set: (v) => look.setDistanceBlur(v),
            },
            { kind: "dead", label: "taps", note: "REBUILD — 6 on the showcase rung; compiled in." },
          ]
        : [{ kind: "dead", label: "distance blur", note: "OFF HERE — it rides the AO's depth pass." }],
    });

    // ── GOD RAYS ────────────────────────────────────────────────────────────
    groups.push({
      title: "GOD RAYS — shafts out of the low sun",
      rows: p.defines.SHAFTS
        ? [
            {
              kind: "range",
              label: "strength",
              note: "Past about 2 a backlit skater picks up a rim of sky along his whole silhouette.",
              min: 0,
              max: 3,
              step: 0.05,
              get: () => num(g, "uShafts"),
              set: (v) => (g.uShafts!.value = v),
            },
            {
              kind: "dead",
              label: "taps",
              note: "REBUILD — 10 on medium, 16 on high; compiled in. Strength is re-aimed every frame.",
            },
          ]
        : [{ kind: "dead", label: "god rays", note: "OFF HERE — this preset did not compile them." }],
    });

    // ── THE GRADE ───────────────────────────────────────────────────────────
    const lift = g.uShadeLift!.value as THREE.Vector3;
    groups.push({
      title: "GRADE — the tone curve and the era",
      rows: [
        {
          kind: "range",
          label: "black point",
          min: 0,
          max: 0.06,
          step: 0.001,
          get: () => num(g, "uBlack"),
          set: (v) => (g.uBlack!.value = v),
        },
        {
          kind: "range",
          label: "shadow gamma",
          note: "Under 1 both lifts the dark end and steepens it — detail, not just paleness.",
          min: 0.5,
          max: 1.5,
          step: 0.01,
          get: () => num(g, "uShadowGamma"),
          set: (v) => (g.uShadowGamma!.value = v),
        },
        {
          kind: "range",
          label: "contrast",
          min: 0.7,
          max: 2,
          step: 0.01,
          get: () => num(g, "uContrast"),
          set: (v) => (g.uContrast!.value = v),
        },
        {
          kind: "range",
          label: "saturation",
          min: 0,
          max: 2,
          step: 0.01,
          get: () => num(g, "uSaturation"),
          set: (v) => (g.uSaturation!.value = v),
        },
        {
          kind: "range",
          label: "vibrance",
          note: "Extra chroma handed to whatever has least of it — grey concrete, not the brick.",
          min: 0,
          max: 1,
          step: 0.01,
          get: () => num(g, "uVibrance"),
          set: (v) => (g.uVibrance!.value = v),
        },
        {
          kind: "color",
          label: "shade tint (lift ×8)",
          note: "The colour a shadow is MADE of. Shown ×8 so the picker is usable.",
          get: () => vecHex(lift.clone().multiplyScalar(8).clampScalar(0, 1)),
          set: (v) => {
            const c = new THREE.Color(v);
            lift.set(c.r / 8, c.g / 8, c.b / 8);
          },
        },
        {
          kind: "color",
          label: "highlight target",
          get: () => vecHex(g.uSunTarget!.value as THREE.Vector3),
          set: (v) => {
            const c = new THREE.Color(v);
            (g.uSunTarget!.value as THREE.Vector3).set(c.r, c.g, c.b);
          },
        },
        {
          kind: "range",
          label: "highlight bleach",
          min: 0,
          max: 0.8,
          step: 0.01,
          get: () => num(g, "uBleach"),
          set: (v) => (g.uBleach!.value = v),
        },
        {
          kind: "range",
          label: "shade desaturate",
          min: 0,
          max: 0.8,
          step: 0.01,
          get: () => num(g, "uShadeDesat"),
          set: (v) => (g.uShadeDesat!.value = v),
        },
        {
          kind: "range",
          label: "sun desaturate",
          min: 0,
          max: 0.8,
          step: 0.01,
          get: () => num(g, "uSunDesat"),
          set: (v) => (g.uSunDesat!.value = v),
        },
        {
          kind: "range",
          label: "corner falloff",
          min: 0,
          max: 0.6,
          step: 0.01,
          get: () => num(g, "uVignette"),
          set: (v) => (g.uVignette!.value = v),
        },
        {
          kind: "range",
          label: "edge crispness",
          min: 0,
          max: 1.6,
          step: 0.01,
          get: () => num(g, "uSharpen"),
          set: (v) => (g.uSharpen!.value = v),
        },
        p.defines.DEFINITION
          ? {
              kind: "range",
              label: "material definition",
              note: "The wide ring — aggregate, brick courses, slab staining.",
              min: 0,
              max: 1,
              step: 0.01,
              get: () => num(g, "uDefinition"),
              set: (v) => (g.uDefinition!.value = v),
            }
          : { kind: "dead", label: "material definition", note: "OFF HERE — this preset did not compile it." },
        p.defines.FRINGE
          ? {
              kind: "range",
              label: "composite fringing",
              min: 0,
              max: 0.012,
              step: 0.0001,
              get: () => num(g, "uFringe"),
              set: (v) => (g.uFringe!.value = v),
            }
          : { kind: "dead", label: "composite fringing", note: "OFF HERE — this preset did not compile it." },
        {
          kind: "range",
          label: "film grain",
          min: 0,
          max: 0.06,
          step: 0.001,
          get: () => num(g, "uGrain"),
          set: (v) => (g.uGrain!.value = v),
        },
        {
          kind: "range",
          label: "colour steps",
          note: "The console's own framebuffer. 32 is the period-accurate 5-bit; 64 is what ships.",
          min: 8,
          max: 255,
          step: 1,
          get: () => num(g, "uLevels"),
          set: (v) => (g.uLevels!.value = Math.round(v)),
        },
      ],
    });

    return groups;
  }

  // ── RENDERING THE PANEL ───────────────────────────────────────────────────

  let groups: Group[] = [];

  function keyOf(group: Group, row: Row): string {
    return `${group.title.split(" —")[0]}/${row.label}`;
  }

  function render(): void {
    groups = buildGroups();
    rung.textContent = `${look.preset} · scale ${look.renderScale}`;
    body.textContent = "";
    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "grp";
      const h = document.createElement("h4");
      h.textContent = group.title;
      section.appendChild(h);
      for (const row of group.rows) {
        section.appendChild(rowEl(row));
      }
      body.appendChild(section);
    }
    if (!snapshotted) {
      for (const group of groups) {
        for (const row of group.rows) {
          if (row.kind !== "dead") shipped.set(keyOf(group, row), row.get());
        }
      }
      snapshotted = true;
    }
  }

  function rowEl(row: Row): HTMLElement {
    const el = document.createElement("div");
    el.className = "row";
    const label = document.createElement("label");
    label.textContent = row.label;
    el.appendChild(label);

    if (row.kind === "dead") {
      const v = document.createElement("output");
      v.className = "dead";
      v.textContent = "—";
      el.appendChild(v);
      el.appendChild(note(row.note));
      return el;
    }

    if (row.kind === "range") {
      const value = document.createElement("output");
      const fmt = (n: number): string =>
        row.step >= 1 ? String(Math.round(n)) : n.toFixed(row.step < 0.001 ? 5 : row.step < 0.01 ? 4 : 2);
      value.textContent = fmt(row.get());
      el.appendChild(value);
      const wide = document.createElement("div");
      wide.className = "wide";
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(row.min);
      input.max = String(row.max);
      input.step = String(row.step);
      input.value = String(row.get());
      input.addEventListener("input", () => {
        const v = Number(input.value);
        row.set(v);
        value.textContent = fmt(v);
      });
      wide.appendChild(input);
      el.appendChild(wide);
    } else if (row.kind === "color") {
      const input = document.createElement("input");
      input.type = "color";
      input.value = row.get();
      input.addEventListener("input", () => row.set(input.value));
      el.appendChild(input);
    } else if (row.kind === "toggle") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = row.get();
      input.addEventListener("change", () => row.set(input.checked));
      el.appendChild(input);
    } else {
      const select = document.createElement("select");
      for (const o of row.options) {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        select.appendChild(opt);
      }
      select.value = row.get();
      select.addEventListener("change", () => row.set(select.value));
      el.appendChild(select);
    }
    if (row.note) el.appendChild(note(row.note));
    return el;
  }

  function note(text: string): HTMLElement {
    const n = document.createElement("div");
    n.className = "note";
    n.textContent = text;
    return n;
  }

  // ── COPY ──────────────────────────────────────────────────────────────────

  function settingsText(): string {
    const lines: string[] = [];
    lines.push("# SKATE — look lab settings");
    lines.push(`# quality rung: ${look.preset}   internal render scale: ${look.renderScale}`);
    // The sun is repeated at the top as well as in its group on purpose: it is
    // the number the player is most likely to be handing back ("put the sun
    // HERE"), and the one that has to survive being read out of a chat message
    // rather than pasted. Everything else is a shade of a shade; this is where
    // the light comes from.
    lines.push(`# SUN: bearing ${sunAz.toFixed(1)}°   height ${sunEl.toFixed(1)}°`);
    lines.push(`# captured: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    for (const group of groups) {
      lines.push("");
      lines.push(`[${group.title.split(" —")[0]}]`);
      for (const row of group.rows) {
        if (row.kind === "dead") {
          lines.push(`  ${row.label} = (${row.note})`);
          continue;
        }
        const v = row.get();
        lines.push(`  ${row.label} = ${typeof v === "number" ? Number(v.toFixed(5)) : v}`);
      }
    }
    return lines.join("\n");
  }

  root.querySelector<HTMLButtonElement>("#ll-copy")!.addEventListener("click", () => {
    const text = settingsText();
    out.value = text;
    out.select();
    // The textarea is the fallback and the receipt at once: if the clipboard is
    // blocked (an insecure origin, a browser that wants a different gesture)
    // the text is still on screen, already selected, and Cmd-C works.
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  });

  /** Put one group's rows back to the values snapshotted at construction. */
  function restore(group: Group): void {
    for (const row of group.rows) {
      if (row.kind === "dead") continue;
      const was = shipped.get(keyOf(group, row));
      if (was === undefined) continue;
      if (row.kind === "range" && typeof was === "number") row.set(was);
      else if (row.kind === "color" && typeof was === "string") row.set(was);
      else if (row.kind === "toggle" && typeof was === "boolean") row.set(was);
      else if (row.kind === "choice" && typeof was === "string") row.set(was);
    }
  }

  // RESET IS TWO PASSES, and the order is the whole of why it works.
  //
  // The quality rung goes back FIRST and alone, because `setPreset` throws the
  // entire composer away and builds another one — every `get`/`set` closure in
  // every group below it is bound to the OLD chain's passes and uniforms. A
  // single-pass reset would therefore write the shipped bloom strength, the
  // shipped grade and the shipped shutter onto objects that had just been
  // disposed, and the picture would come back on the new chain's defaults with
  // the panel showing numbers nothing is reading. Re-rendering between the two
  // passes is what re-binds them.
  root.querySelector<HTMLButtonElement>("#ll-reset")!.addEventListener("click", () => {
    const isRung = (g: Group): boolean => g.title.startsWith("QUALITY RUNG");
    for (const group of groups) if (isRung(group)) restore(group);
    render();
    for (const group of groups) if (!isRung(group)) restore(group);
    render();
  });

  root.querySelector<HTMLButtonElement>("#ll-x")!.addEventListener("click", () => api.close());

  const api: LookLab = {
    open() {
      if (open) return;
      open = true;
      root.hidden = false;
      // The ride owns the pointer while you are riding; the panel needs a
      // cursor to drag with, so it hands the pointer back on the way in.
      document.exitPointerLock?.();
      render();
    },
    close() {
      open = false;
      root.hidden = true;
    },
    toggle() {
      if (open) api.close();
      else api.open();
    },
    get isOpen() {
      return open;
    },
    setField(next) {
      field = next;
      if (open) render();
    },
    dispose() {
      root.remove();
      style.remove();
    },
  };

  return api;
}
