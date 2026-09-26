// THE GAME AROUND THE RIDE — free-roam, the guy who starts a run, the minute
// itself, and the board that minute goes on.
//
// One object, because the four are one behaviour: the NPC's trigger is the only
// thing that starts a run, the run is the only thing that counts a score, and
// the board is where that score goes when the clock stops. The boot builds this,
// tells it where the player is each frame, and tells it when the world changed.
//
// WHAT DOES NOT CHANGE INSIDE A RUN: the ride, the tricks, the combo rule, the
// camera, R, the pause. Free-roam is the default state of this game and a run
// is a minute laid over it — a player who never goes near the NPC still has
// both maps and every trick in them, and a player whose minute just ran out is
// already free-roaming again with the results still on screen.

import type * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Hud } from "../ui/hud";
import { mountRunNpc, type RunNpc } from "../world/npc";
import type { SurfaceProvider } from "../world/surface";
import { fetchLeaders, postRunScore } from "./leaderboard";
import { OneMinuteRun, type RunPhase } from "./run";

/**
 * Keys that put the results readout away, because pressing one of them means
 * the player has stopped reading and started skating. ENTER is the other half —
 * it starts the next run — and it is handled with the gate, not here.
 */
const RIDE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyV",
  "KeyE",
  "KeyQ",
  "KeyF",
  "KeyG",
  "KeyC",
  "KeyR",
  // Both halves of the 2026-07-29 swap. The two Shifts were here as the grab
  // and stay valid as the grind; `KeyX` is new because it is a gameplay hold
  // now rather than a spare letter, and riding away from a results card is
  // exactly as much "riding" when the hold is a grab.
  "KeyX",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export interface RunGameOptions {
  scene: THREE.Scene;
  hud: Hud;
  /** Plays the NPC's voice line — the game's audio layer, if it has an entry
   *  point for a spoken line. Without it he uses an element of his own. */
  speak?: (url: string) => void;
  /** The boot's decoder-wired GLTFLoader, so the NPC's rig takes the same
   *  quality rungs everything else does. */
  loader?: GLTFLoader;
}

export class RunGame {
  readonly run: OneMinuteRun;

  private scene: THREE.Scene;
  private hud: Hud;
  private opts: RunGameOptions;
  private npc: RunNpc | null = null;
  private phaseWas: RunPhase = "free";
  /** Counts up with every run so a board read that comes back late for a run
   *  the player has already replaced can tell, and drop itself. */
  private runId = 0;

  constructor(opts: RunGameOptions) {
    this.opts = opts;
    this.scene = opts.scene;
    this.hud = opts.hud;

    this.run = new OneMinuteRun({
      onStart: () => {
        this.runId++;
        this.hud.hideRunResults();
      },
      onEnd: (score) => {
        // The readout goes up on the FRAME the clock stops — the number is the
        // point of the minute and it must not wait on a network round trip.
        // The board and the player's standing fill themselves in behind it.
        this.hud.showRunResults(score);
        void this.settle(score, this.runId);
      },
      onCancel: () => this.hud.hideRunResults(),
    });

    // Everything that BANKS is what a minute is worth. The HUD owns the scoring
    // rule and announces the payout; the run just counts what lands inside it.
    this.hud.onBank = (points) => this.run.add(points);
    this.hud.onRepeatRun = () => this.startRun();
    document.addEventListener("keydown", this.onKey);
  }

  /**
   * A map was mounted. The NPC is planted from the new spot's own spawn point,
   * so this file never learns which block it is standing on — and a run that
   * was live is thrown away, because the minute it was being ridden for is on a
   * map that no longer exists.
   */
  setWorld(surface: SurfaceProvider): void {
    this.run.cancel();
    this.npc?.dispose();
    this.npc = mountRunNpc(this.scene, surface, {
      onApproach: () => this.startRun(),
      speak: this.opts.speak,
      loader: this.opts.loader,
    });
  }

  /**
   * Once a frame, while the game is actually playing — the boot's `!paused`
   * branch. Behind the pause and at the title nothing here should tick: a clock
   * that runs through a pause screen spends the player's minute for them.
   */
  update(dt: number, playerPos: THREE.Vector3): void {
    this.run.update(dt);
    const phase = this.run.phase;
    if (phase !== this.phaseWas) {
      this.phaseWas = phase;
      if (phase === "free") this.hud.hideRunResults();
    }
    this.hud.setRunClock(phase === "running" ? this.run.timeLeft : null);
    // The big number belongs to the minute for as long as the minute is being
    // read — through the results and not only through the clock.
    this.hud.setRunScore(phase === "free" ? null : this.run.score);
    this.npc?.setAvailable(phase !== "running");
    this.npc?.update(dt, playerPos);
  }

  dispose(): void {
    document.removeEventListener("keydown", this.onKey);
    this.npc?.dispose();
    this.npc = null;
    this.hud.onBank = null;
    this.hud.onRepeatRun = null;
  }

  /**
   * THE ONE DOOR INTO A RUN. Every way in goes through it — rolling up to the
   * NPC, GO AGAIN, the ENTER key — so the rule that a run cannot be repeated
   * mid-run is enforced once, by `OneMinuteRun.start`, and not three times.
   */
  private startRun(): boolean {
    return this.run.start();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.run.phase !== "over") return;
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      this.startRun();
      e.preventDefault();
      return;
    }
    if (RIDE_KEYS.has(e.code)) this.run.dismiss();
  };

  /**
   * Post the minute and read the world back. Never awaited by anything the
   * frame loop touches, and every path checks that the run it belongs to is
   * still the one on screen — a board that arrives after the player has already
   * pressed GO AGAIN belongs to a minute that is over.
   */
  private async settle(score: number, id: number): Promise<void> {
    const posted = await postRunScore(score);
    const board = await fetchLeaders();
    if (id !== this.runId || this.run.phase !== "over") return;
    this.hud.setRunOutcome(board, posted);
  }
}

export { OneMinuteRun, RUN_SECONDS } from "./run";
