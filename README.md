# team-tanky

Asymmetrische 3D tank-arena voor mobiel: een team kleine tanks vecht samen tegen één grote **bully**-boss.
Zie **[GAME_DESIGN.md](./GAME_DESIGN.md)** voor het volledige ontwerp.

## Prototype spike (deze repo)

Een **client-only** single-player spike in Three.js — jij + AI-teamgenoten vs. een AI-bully.
Alles draait in de browser (game-AI = simpele state machine, geen server), dus het kan direct op GitHub Pages.

**Wat werkt:**
- Rijdende tank met omnidirectionele besturing
- Gekantelde, vaste 3rd-person camera die de speler volgt
- Terrein met hoogteverschil (gras / zand / water / rots)
- Auto-lock richten + schieten
- AI-teamgenoten en een AI-bully (benaderen, omcirkelen, schieten)
- Health-bars, respawn, username-onboarding (localStorage)
- Touch-joystick + vuurknop (mobiel) én toetsenbord (desktop)

**Besturing:**
- Desktop: `WASD` / pijltjes rijden · richten automatisch · vuurknop rechtsonder (of houd 'm ingedrukt)
- Mobiel: joystick links, vuurknop rechts

## Lokaal draaien

Statische bestanden — elke webserver werkt. Bijvoorbeeld:

```bash
python3 -m http.server 8000
# open http://127.0.0.1:8000
```

> Three.js is **gevendored** in `vendor/three.module.js`, dus er is geen internet of build-stap nodig.

## Deployen op GitHub Pages

1. **Settings → Pages**
2. **Source:** *Deploy from a branch*
3. **Branch:** `main` · map `/ (root)` → **Save**
4. Na een minuut staat het op `https://<owner>.github.io/team-tanky/`

> Let op: voor Pages op een **private** repo is meestal een betaald plan nodig — zet de repo op **public** voor het gratis plan.

## Structuur

```
index.html              # entrypoint + importmap + HUD
style.css               # HUD / overlay / touch-controls
src/main.js             # de game (Three.js)
vendor/three.module.js  # gevendorde Three.js r160
GAME_DESIGN.md          # volledig game-ontwerp
```

## Volgende stappen

- Escalatie-mechaniek voor lange potjes (map krimpt / sudden death)
- Locational damage (tracks / turret / hull apart) in de spike
- Multiplayer (stap 2): realtime backend (PartyKit / Colyseus / eigen WS), client blijft op Pages
