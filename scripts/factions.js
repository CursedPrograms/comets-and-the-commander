// Comets and the Commander - the ten enemy factions, one per sector, easiest first.
// Each has its own colours, ship designs (shapes in models.js) and behaviour (game.js).
window.CC = window.CC || {};
(function (CC) {
  'use strict';

  const LIST = [
    { name: 'Rust Drones',     glow: 0xff9a3c, hull: 0x4a3a2e, hull2: 0x2a201a, lightShape: 'dart',   heavyShape: 'block',    hive: 'blocks', behaviour: 'swarm',
      special: 'Scrap Mother', specialAbout: 'launches drones as it fights',
      about: 'Cheap scrap drones that come in numbers. Weak alone.' },
    { name: 'Verdant Swarm',   glow: 0x8cff2e, hull: 0x424a40, hull2: 0x232821, lightShape: 'claw',   heavyShape: 'wedge',    hive: 'spikes', behaviour: 'orbit',
      special: 'Brood Queen', specialAbout: 'fast, and hatches claws',
      about: 'Agile claws that circle their prey.' },
    { name: 'Ice Wraiths',     glow: 0xbff4ff, hull: 0x5c6f7a, hull2: 0x2c3a44, lightShape: 'saucer', heavyShape: 'crescent', hive: 'smooth', behaviour: 'harass',
      special: 'Frost Matriarch', specialAbout: 'freezes ships near her to half speed',
      about: 'They hunt your harvesters first. Guard the miners.' },
    { name: 'Crimson Reavers', glow: 0xff3b3b, hull: 0x4a2a2a, hull2: 0x2a1515, lightShape: 'spiky',  heavyShape: 'wedge',    hive: 'spikes', behaviour: 'ram',
      special: 'Bloodhammer', specialAbout: 'charges and rams for huge damage',
      about: 'Their light ships ram you and explode. Shoot them early.' },
    { name: 'Void Lancers',    glow: 0x9b5cff, hull: 0x2e2a40, hull2: 0x18142a, lightShape: 'dart',   heavyShape: 'crescent', hive: 'smooth', behaviour: 'snipe',
      special: 'Void Spear', specialAbout: 'a lance that hits from very far',
      about: 'Long-range lances that keep their distance. Close in fast.' },
    { name: 'Gold Sentinels',  glow: 0xffd23c, hull: 0x5a5030, hull2: 0x302a18, lightShape: 'orb',    heavyShape: 'block',    hive: 'blocks', behaviour: 'regen',
      special: 'Golden Colossus', specialAbout: 'repairs itself fast',
      about: 'Self-repairing hulls. Focus fire to finish them.' },
    { name: 'Teal Menders',    glow: 0x2effc8, hull: 0x2a4a44, hull2: 0x152a26, lightShape: 'saucer', heavyShape: 'block',    hive: 'pods',   behaviour: 'heal',
      special: 'Life Warden', specialAbout: 'heals every ship around it',
      about: 'Their heavy ships heal the others. Kill the healers first.' },
    { name: 'Amber Splitters', glow: 0xffb000, hull: 0x4a3a20, hull2: 0x2a2010, lightShape: 'orb',    heavyShape: 'wedge',    hive: 'pods',   behaviour: 'split',
      special: 'Fission Titan', specialAbout: 'bursts into three heavies',
      about: 'Light ships burst into two smaller ones when destroyed.' },
    { name: 'Obsidian Guard',  glow: 0xff5577, hull: 0x1c1c22, hull2: 0x0c0c10, lightShape: 'claw',   heavyShape: 'block',    hive: 'blocks', behaviour: 'shield',
      special: 'Obsidian Bastion', specialAbout: 'shrugs off three quarters of every hit',
      about: 'Heavy shields soak up a third of every hit.' },
    { name: 'The Pale Choir',  glow: 0xffffff, hull: 0x30343a, hull2: 0x101216, lightShape: 'spiky',  heavyShape: 'crescent', hive: 'spikes', behaviour: 'mixed',
      special: 'The Choir Master', specialAbout: 'every trick at once',
      about: 'The last sector. Every trick the others had, all at once.' }
  ];

  let made = false;
  function get(i) {
    if (!made) {
      LIST.forEach((f, id) => { f.id = id; f.mats = CC.models.factionMats(f.hull, f.hull2, f.glow); });
      made = true;
    }
    return LIST[i];
  }

  CC.factions = { count: LIST.length, get: get, list: LIST };
})(window.CC);
