[![Twitter: @NorowaretaGemu](https://img.shields.io/badge/X-@NorowaretaGemu-blue.svg?style=flat)](https://x.com/NorowaretaGemu)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<a href="https://github.com/CursedPrograms/website-template/actions/workflows/proof-html.yml">
    <img class="workflow-badge workflow-success" src="https://github.com/CursedPrograms/website-template/actions/workflows/proof-html.yml/badge.svg" alt="Proof HTML Workflow">
</a>
<br>
<div align="center">
  <a href="https://ko-fi.com/cursedentertainment">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="ko-fi" style="width: 20%;"/>
  </a>
</div>
  <br>
<div align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/javascript%20-%23323330.svg?&style=for-the-badge&logo=javascript&logoColor=white"/>
  <img alt="HTML5" src="https://img.shields.io/badge/html5%20-%23323330.svg?&style=for-the-badge&logo=html5&logoColor=white"/>
  <img alt="CSS3" src="https://img.shields.io/badge/css3%20-%23323330.svg?&style=for-the-badge&logo=css3&logoColor=white"/>
</div>
<div align="center">
    <img alt="Git" src="https://img.shields.io/badge/git%20-%23323330.svg?&style=for-the-badge&logo=git&logoColor=white"/>
  <img alt="PowerShell" src="https://img.shields.io/badge/PowerShell-%23323330.svg?&style=for-the-badge&logo=powershell&logoColor=white"/>
  <img alt="Shell" src="https://img.shields.io/badge/Shell-%23323330.svg?&style=for-the-badge&logo=gnu-bash&logoColor=white"/>
  <img alt="Batch" src="https://img.shields.io/badge/Batch-%23323330.svg?&style=for-the-badge&logo=windows&logoColor=white"/>
  </div>
<br>

# Comet & Commander

A 3D space RTS that runs in the browser. Your Commander carrier sits at the centre of a sphere of space and the battle happens all around it: mine comets and asteroids, build a fleet, research upgrades and destroy the three enemy hives before their waves destroy you.

**Play it:** [cursedprograms.github.io/comet-and-commander](https://cursedprograms.github.io/comet-and-commander/)

## Gameplay

- **Economy:** harvesters mine comets and asteroids on their own and carry the ore back to the Commander. Spend ore on ships and upgrades, built one at a time in the Commander's queue.
- **Ships:** fighters (fast interceptors that dogfight), cruisers (heavy capital ships with turrets) and harvesters (industrial miners with a drill).
- **Upgrades:** weapons, armour and mining, three levels each.
- **Enemy:** three hives at the edge of the sphere guard themselves and send growing waves of raiders and destroyers.
- **Commander:** repairs ships near it, defends itself with turrets and can set a rally point for new ships.
- Explosions, sound effects and voice responses when you select or order ships.

## Controls

| | Mouse | Touch |
| --- | --- | --- |
| Select | Click a ship, drag a box, Shift adds, double-click picks every ship of that type | Tap a ship |
| Order | Right-click space to move, an enemy to attack, a comet to mine | Tap where to go |
| View | Right-drag turns the view 360 degrees round you, wheel zooms | Drag, pinch |

Keys: F/C/H build, X army, Z harvesters, B base, Ctrl+1-9 make a group and 1-9 pick it, WASD or arrows turn the view, Q/E zoom, P pause, M sound.

## Files

- `index.html` - the page
- `styles/style.css` - layout and colours
- `scripts/game.js` - game logic, input, HUD and radar
- `scripts/models.js` - ship models, backdrop and effects (three.js r128)
- `scripts/audio.js` - synthesised sound effects and voice playback
- `audio/voice/` - voice lines, generated with [Piper](https://github.com/rhasspy/piper) TTS (Amy and Ryan voices)

<br>
<div align="center">
© Cursed Entertainment
</div>
<br>
<div align="center">
<a href="https://cursed-entertainment.itch.io/" target="_blank">
    <img src="https://github.com/CursedPrograms/cursedentertainment/raw/main/images/logos/logo-wide-grey.png"
        alt="CursedEntertainment Logo" style="width:250px;">
</a>
</div>
