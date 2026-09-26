// Compatibility re-export — the touch primitives moved to the shared touch kit
// (../touch/touch-joystick.ts) so games without a character controller can install
// them via `genex controller touch`. Existing imports of this path keep working;
// new code should import from "./controllers/touch/touch-joystick.ts".
export * from "../touch/touch-joystick.ts";
