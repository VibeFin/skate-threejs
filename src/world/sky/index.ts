// THE SKY VOLUMES — clouds that sit over a generated panorama without fighting
// it.
//
// The player asked for "maybe add some volumetric clouds", of map 1, and wanted
// them on both. `clouds.ts` carries the technique and its cost story; this file
// is the door and the two-line wiring.
//
// WHAT IT DOES NOT DO, said here because it is the question a reader of this
// game's rendering will ask first: it does not touch the lighting. Both maps
// load a generated equirectangular sky into `scene.background` AND
// `scene.environment` and take their image-based light from it. This is an
// ordinary transparent mesh in the scene graph — drawn after the background,
// after the opaque world, with the depth test on and depth writes off. The
// panorama still lights the game; the clouds are in the picture over it. That
// also means the sun disc painted into the panorama and these clouds have to
// agree about where the sun is, which is what `sun` is for: pass the map's own
// key-light direction and they will.
//
// WIRING, from a map's build step:
//
//   const clouds = createCloudSky({
//     tier,
//     sun: sunDirection,          // the DirectionalLight's own, normalised
//     sunColor: 0xfff2df,         // and its colour
//     haze: 0x94a4b2,             // the map's fog colour
//     coverage: 0.42,
//   });
//   scene.add(clouds.object);
//   // …once a frame, before the draw:
//   clouds.update(dt, camera);
//
// `update` is not optional: the dome is centred on the camera and sized off its
// far plane, so a sky that is never updated is a sky sitting at the origin at
// one unit across.

export { createCloudSky, CLOUD_STEPS, type CloudSky, type CloudSkyOptions } from "./clouds";
export { cloudNoise, type CloudNoise } from "./noise";
