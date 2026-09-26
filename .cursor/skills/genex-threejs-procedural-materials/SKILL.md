---
name: genex-threejs-procedural-materials
description: Author production procedural materials for Genex Three.js games. Use for PBR identity, terrain materials, atlas filtering, specular anti-aliasing, wetness, lava and hot emissive surfaces, raymarched material fields, biome surfaces, dissolves, procedural normals, roughness variation, and readable materials across gameplay distances.
---

# Genex Three.js Procedural Materials

Build a material from surface identity and causes. Color, roughness, metalness, normal, transmission, and emission should describe the same surface—not unrelated noise textures.

## Material graph order

```text
stable coordinates
  → structural fields
  → material identity weights
  → causal modifiers
  → filtered microstructure
  → PBR channels
  → lighting/shadow extensions
```

## Required controls

- real or perceptual texture scale;
- material identity weights;
- roughness range and micro-normal strength;
- the causal fields required by the selected material pattern;
- distance/derivative filtering;
- specular antialiasing;
- channel and mask debug modes;
- emissive-material debug modes when the material owns glow or volumetric
  accumulation.

## Failure conditions

- every PBR channel samples independent noise;
- roughness is a scalar afterthought;
- high-frequency normals survive below one pixel;
- triplanar projection has visible orientation or scale seams;
- atlas padding is ignored under mipmapping;
- custom lighting removes energy conservation without an explicit stylized goal;
- post-processing is used to hide unstable highlights.

## Routing boundary

Keep shared scalar/vector causes and complete world or planetary bodies in the
request's owning implementation. This skill owns the material response, not a
general field library or world generator.
