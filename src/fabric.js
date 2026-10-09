// Fabric presets: how a cloth moves (solver parameters) and how it reads
// (material). Density is areal, kg/m²; stiffnesses are per garment unit.
//   damp       damping of motion relative to the hanger (1/s)
//   kTop/kHem  shape memory, shoulders → hem (1/s²)
//   shear/bend XPBD compliance of the diagonal and skip-one links
//   vmax       air speed (garment units/s) where pressure stops growing
//   skin       tangential skin friction (1/s)

export const jersey = {
  density: 0.3, damp: 3.2, kTop: 260, kHem: 9, shear: 2e-6, bend: 6e-4, vmax: 2.2, skin: 0.25,
  look: { roughness: 0.95, sheen: 0.6, sheenRoughness: 0.7, sheenColor: 0x595959, bump: "knit", bumpScale: 0.35 },
};

export const fleece = {
  density: 0.45, damp: 3.6, kTop: 270, kHem: 12, shear: 2e-6, bend: 3e-4, vmax: 2.2, skin: 0.3,
  look: { roughness: 1, sheen: 0.8, sheenRoughness: 0.8, sheenColor: 0x5a5a5a, bump: "knit", bumpScale: 0.5 },
};

export const denim = {
  density: 0.55, damp: 4, kTop: 300, kHem: 14, shear: 1e-6, bend: 1.2e-4, vmax: 2.2, skin: 0.2,
  look: { roughness: 0.88, sheen: 0.3, sheenRoughness: 0.6, sheenColor: 0x6d7a99, bump: "twill", bumpScale: 0.6 },
};

export const poplin = {
  density: 0.18, damp: 3, kTop: 280, kHem: 10, shear: 1.5e-6, bend: 2e-4, vmax: 2.2, skin: 0.25,
  look: { roughness: 0.85, sheen: 0.35, sheenRoughness: 0.5, sheenColor: 0x6a6a6a, bump: "weave", bumpScale: 0.25 },
};

export const linen = {
  density: 0.22, damp: 2.8, kTop: 240, kHem: 7, shear: 3e-6, bend: 3e-4, vmax: 2.2, skin: 0.3,
  look: { roughness: 0.92, sheen: 0.4, sheenRoughness: 0.6, sheenColor: 0x7a7468, bump: "weave", bumpScale: 0.45 },
};

export const silk = {
  density: 0.12, damp: 1.9, kTop: 200, kHem: 4, shear: 6e-6, bend: 2.5e-3, vmax: 1.9, skin: 0.35,
  look: { roughness: 0.5, sheen: 1, sheenRoughness: 0.28, sheenColor: 0xa8a29a, bump: "weave", bumpScale: 0.06, anisotropy: 0.5 },
};

export const chiffon = {
  density: 0.07, damp: 1.7, kTop: 160, kHem: 2.5, shear: 1e-5, bend: 6e-3, vmax: 1.7, skin: 0.4,
  look: { roughness: 0.6, sheen: 0.7, sheenRoughness: 0.4, sheenColor: 0xd0d0d0, bump: "weave", bumpScale: 0.12, opacity: 0.84 },
};
