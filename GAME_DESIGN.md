# team-tanky — Game Design Document

> Levend document. Vastgelegd tijdens brainstorm. Nog niet definitief — open vragen staan onderaan.

## Pitch (één zin)
Een asymmetrische 3D tank-arena voor mobiel: een team kleine tanks vecht samen tegen één grote **bully**-tank (baas), die je in delen moet slopen — terwijl camouflage, terrein en hoogteverschil bepalen wie wie eerst ziet.

## Kernconcept
- **Asymmetrisch, 1-vs-veel** ("boss battle"): 1 bully vs. een team kleine tanks.
- **Spelersaantal**: max **8** (1 bully + tot 7 team); AI vult aan bij tekort.
- **Potjeduur**: **10–15 min**, bewust met diepgang & spanning → vraagt om **escalatie** (map krimpt / gevarenzones groeien / sudden death) om de spanning over de hele duur vast te houden.
- Platform: **browser op mobiel first**, later native mobile als het aanslaat.
- Engine: **Three.js**.
- Doelgroep: **13 jaar en ouder**.
- Tone: oorlog / dark, maar **speels**.
- Camera: **3rd person, hoge hoek, behoorlijk uitgezoomd** voor overzicht (camera volgt speler, map scrollt, Brawl-Stars-achtig maar gekanteld i.p.v. plat top-down). Speelveld **iets groter** dan Brawl Stars. De gekantelde hoek toont hoogteverschil vanzelf (lost leesbaarheid op). **Vaste camerahoek** (geen meedraaien). **Dynamische zoom** (uit voor overzicht, in tijdens gevecht) + **damage-state iconen** boven tanks (track kapot / turret weg).

## Match-flow
1. **Loterij** — het lot wijst 1 deelnemer aan als de **bully** (kan speler óf AI zijn). Rest = team. Iedereen ziet direct wie.
2. **Loadout-fase** (kort, klok tikt):
   - Team kiest: **main-wapen** + **subwapen** (sterker, moet opladen) + **defense** (shield / extra armour / revive-upgrade / …).
   - Keuze ná de loterij → je kunt counteren op wie de bully is.
   - **Draft-fase**: **gelijktijdig kiezen met live-overzicht** — spelers zien **elkaars keuzes live** → balanceren het team zelf uit. Timer; loopt die af → **auto-assign vult het ontbrekende gat** (balans, geen random).
   - **Camo/livery**: kies je schutkleuren (zie Camouflage).
3. **Gevecht** — team sloopt de bully in delen; bully jaagt op tanks.
4. **Winst**:
   - **Bully wint**: alle teamtanks tegelijk uitgeschakeld vóór de klok afloopt.
   - **Team wint**: bully volledig in delen gesloopt.
   - Klok als vangnet tegen eeuwig cirkelen.

## Rollen

### Bully (de baas)
- Groter dan de rest.
- **Locational damage**: onderdelen apart kapot:
  - **Tracks** kapot → kan niet meer rijden (1 track over → alleen bochten).
  - **Turret** kapot → kan niet meer richten.
  - **Hull** kapot → kill (bully verslagen).
- **Bully-loadout** (vooraf): kiest z'n **zwaar wapen** (bijv. traag-dodelijke boog-mortier vs. korte-afstand-shotgun) + **1 perk** (extra armour / sneller herladen / …). Zwaar wapen = erg gevaarlijk maar **traag herladen**. Team ziet dit **niet** vooraf → in-match scouten (past bij informatie-oorlog).
- Scoort punten per gesloopte teamtank.
- **Execute**: kan met het zware wapen een wrak **definitief** vernietigen (grote explosie) zodat reviven niet meer kan → maar dit moet **moeilijk** zijn (keuze: jagen óf opruimen).

### Team-tanks
- Klein, wendbaar, in aantal.
- **Basis-revive voor iedereen**: rijd naar een wrak, houd de **energie-revive-straal** vast (sta stil = kwetsbaar) → teamgenoot terug in het spel, reviver krijgt punten.
- Gesloopt = **wrak / spectator** dat om hulp roept (geen dood scherm).
- Loadout-defense kan een **upgrade-revive** zijn (sneller / op afstand).

## Camouflage & expressie (twee lagen)
- **Camo-basislaag** (tactisch): patroon/kleur → bepaalt zichtbaarheid/stealth. Kies uit presets.
- **Decal/teken-laag** (cosmetisch): naam, tekening, stickers — **vrij tekenen met de vinger**, telt NIET mee voor zichtbaarheid.
  → Kind krijgt én z'n coole tekening én goede camo.
- Elke tank kan er anders uitzien.
- **1 garage-tank** = je persoonlijke tank (draagt tekening/decals/identiteit). **Camo-basislaag kies je per potje** in de loadout-fase (ná mapreveal) → nooit vast met verkeerde camo. Meer tanks verzamelen = later te verzinnen.
- **Moderatie**: vrij tekenen mag en is zichtbaar voor anderen, mét **rapporteren/melden**.
- **Vrijspelen = horizontaal**: coolere decals/patronen/kleuren/effecten unlock je naarmate je beter wordt → **status & expressie, geen kracht**. De tactische camo-basislaag blijft **gratis voor iedereen** (anders power-creep voor goede spelers).

## Stealth & zichtbaarheid
- Er zijn **twee soorten "verbergen"** (bewust onderscheiden):
  1. **Camouflage-concealment** (visueel): camo die matcht met terrein → moeilijker te zien/locken.
  2. **Fysieke dekking / line-of-sight**: rotsen, gebouwen, muren blokkeren schoten & zicht (ongeacht camo).
- **Lock-on / aim-assist schaalt met zichtbaarheid**: goed verborgen = lock duurt langer; heel goed verborgen = **geen lock** (alleen handmatig mikken).
- Voorgesteld model — "visibility"-waarde per tank (0–100), beïnvloed door: camo-match met huidig terrein (−), bewegen (+), schieten/mondingsvuur (+), hoogte/silhouet (+), onder bladerdek/dekking (−). Lock-tijd schaalt mee; onder drempel = niet lockbaar.
- **Occlusie-model (camera)**: hoge blokkers (bergen/gebouwen/grote rotsen) blokkeren zicht écht → wie erachter zit is weg. Lage begroeiing (struiken/muurtjes) vervaagt zodat je tanks erachter ziet, MAAR een goed-verborgen tank (camo-match + stil) blijft daarin **echt onzichtbaar**.

## Terrein (top-down, meerdere lagen)
Elk terrein heeft een eigen rol voor stealth/mobiliteit:
- **Bos**: tank onder bomen → verborgen van bovenaf (bladerdek). Sterke stealth.
- **Water / moeras**: tank half in het water → trager, deels verborgen.
- **Zand**: open, weinig dekking; beweging maakt stofwolken (tijdelijke sluier / verraadt beweging).
- **Rotsen**: harde dekking (blokkeert schoten & zicht).
- **Lava**: gevaarzone, schade, no-go / dynamisch.
- **Stedelijk**: gebouwen = line-of-sight-blokkers, hoeken, hinderlagen, krap.
- **Bergen**: hoogteverschil (zie Hoogte).

## Procedurale maps (gedeeltelijk)
Maps zijn **procedureel maar begrensd** — niet volledig willekeurig (dat breekt PvP-balans).
- **Seed-gebaseerd & deterministisch**: elke map komt uit één seed. Multiplayer stuurt alleen de **seed** → elke client genereert exact dezelfde wereld (geen zware geometrie-sync).
- **Procedureel binnen authored grenzen**: generator vult hoogte (fBm-noise), biomes en begroeiing; regels bewaken vaste arena-grenzen, veilige spawnzones en een gegarandeerde mix van dekking/camo/hoogte.
- **Features rule-based gestrooid**: bomen (bos/camo) op gras, rotsen (dekking) op hoogte, buiten spawn-buffer en water.
- **Meta-bonus**: elke map anders → camo-keuze-per-potje blijft elke match vers.
- *Prototype-status*: geïmplementeerd in de spike (seeded fBm-terrein + rotsen + bomen in **dichte groves** + "nieuwe map"-knop; `?seed=` reproduceerbaar). **Dekking**: rotsen blokkeren schoten. **Camo**: stil in het bos = verborgen (bully negeert je behalve van dichtbij, geen soft-lock, half-transparant + HP-balk weg).

## Hoogteverschil
- Tanks kunnen wat **hoger/lager** rijden.
- **Hoog terrein** = schietvoordeel + **lastiger te locken/raken**.
- **Trade-off (bevestigd)**: hoog = ook **beter zichtbaar** (silhouet) → offensief voordeel vs. stealth-nadeel.
- Gekantelde camera toont hoogte vanzelf.

## Diepgang / skill-lagen ("easy to learn, hard to master")
Diepte zit in **beslissingen die iets kosten**, niet in meer knoppen:
1. **Locational damage = focus-fire puzzel**: volgorde kiezen (tracks eerst = immobiel maar nog dodelijk op afstand; turret eerst = blind maar mobiel). Team moet vuur concentreren. Bully verdedigt via **armour-angling** (dikke voorkant naar grootste dreiging, beschadigde kant achter dekking).
2. **Complementaire rollen** (kern van "team-tanky"), **emergent** — geen harde klassen: rollen ontstaan uit vrije loadout-combo's. Voorbeelden: Bruiser (armour, tankt) / Sniper (lange dracht + hoogte, pikt onderdelen) / Medic (revive-upgrade + shield) / Scout (snel + camo, spot & hinderlaag). Game **labelt** je build zacht ("speelt als een Scout") zodat teamwork leesbaar blijft. Winnen = combineren, niet klonen. Zie draft-fase (spelers balanceren zelf).
   - **Speler-combo's = ruimtelijk & automatisch** (geen combo-knoppen): Scout spot zwakke plek → licht op voor hele team; reviven binnen Medic-shield = beschermd; Bruiser trekt aandacht → bully toont zwakke kant aan Sniper. Diepte via plek & timing, niet knoppenkennis.
3. **Schieten verraadt je** → ritme van verbergen → hinderlaag → verplaatsen. Baiten mogelijk (één lokt, rest flankt).
4. **Bully skill-ceiling**: zware schot timen, team naar lava/open terrein drijven, executen-vs-jagen, onderdelen beschermen.
5. **Vuur-model (echt 3D, geen "altijd raak")**:
   - **Kleine tanks = direct vuur in 3D**: kogel richt op de werkelijke 3D-positie (mét hoogteverschil); een heuvel ertussen blokkeert het schot, een rots is dekking.
   - **Bully = artillerie met echte boog**: ballistische oplossing (zwaartekracht) → hij **lobt** de granaat over dekking heen en die komt naar beneden op het voorspelde inslagpunt, met **splash**. Team moet **spreiden**, niet in een kringetje rijden.
   - **Lead + spreiding** die groeit met doelsnelheid, afstand en eigen beweging → stilstaan = makkelijk te raken, bewegen = ontwijken.
   - **Swept-sphere collision** (traject i.p.v. punt) zodat snelle/boog-kogels niet door tanks tunnelen.

## Progressie / retentie
- **Camo-unlocks** (horizontaal, cosmetisch) naarmate je beter wordt = status-haak.
- Verder meta nog open (ladder? seizoenen?).

## AI
- **AI-tanks vullen aan** bij te weinig spelers (lost lege-lobby op).
- Bully kan ook AI zijn (uit de loterij).

## Sfeer / detail
- Tijdelijke **tanksporen** blijven zichtbaar (leesbaarheid slagveld).
- Interactieve maps.

## Besturing (touch) — ARTILLERIE-AIM
Manuele aim voor meer skill-expressie (doelgroep 13+). UI-taal = **Engels**.
- **Linkerduim = rij-joystick, omnidirectioneel** (à la Brawl Stars).
- **Rechterduim = richt-joystick**: zet de **richting** (turret yaw). (Desktop: muis zet richting.)
- **RANGE-slider**: zet de **afstand** waar de granaat landt. Richting × afstand = het richtpunt (vierkant vizier).
- **Boog-granaat**: de speler-tank **lobt** een bombshell die een curve volgt naar het richtpunt (ballistisch, met splash). Gaat dus over dekking heen.
- **FIRE-knop (of Space)**: schieten is **handmatig**, niet automatisch bij het richten.
- **Camera volgt de afstand**: grotere range → camera kijkt verder vooruit en zoomt iets uit, zodat je het landingsgebied ziet.
- **Kleine soft-lock**: staat een vijand vlak bij het richtpunt, dan snapt het vizier erop (rood).
- **Tanks rijden bewust langzamer** → positioneel, minder twitchy.
- **Revive**: rij naar wrak → "hou vast"-knop → je staat stil (= het risico).
- **Bully**: eigen ballistische boog + splash (artillerie).
- *Prototype-status*: richting+range-slider+FIRE-knop, boog-granaten, camera-op-afstand, locational damage, camo/dekking, landscape/fullscreen — geïmplementeerd in de spike. UI volledig in het Engels.

## Onboarding (prototype)
- Wie de URL opent en nog **geen sessie** heeft, maakt een **username** aan. Laagdrempelig: geen accounts/wachtwoorden in prototype-fase.
- Client-only fase: username in **localStorage** (geen backend). Zodra multiplayer erbij komt moet de server de username kennen.

## Hosting / tech-prototype
- **GitHub Pages = statisch only** → kan de Three.js **client** hosten, **niet** een multiplayer-server.
- **Stap 1 (nu)**: client-only spike op Pages — één tank rijden/richten/schieten + evt. AI-bully (client-side). Test besturing & camera zonder backend.
- **Stap 2 (later)**: multiplayer via lichte realtime-host (PartyKit / Colyseus / eigen WS op Fly.io/Render); client blijft op Pages.
- **Let op**: private repo + Pages vereist meestal een betaald plan; voor prototype repo evt. **publiek** maken.

## Tech / constraints
- Three.js, mobiele browser, touch-besturing.
- Gekantelde 3rd-person camera lost hoogte-leesbaarheid op (geen plat top-down probleem meer).
- **Uitgezoomd overzicht vs. kleine tanks** → leunt op damage-state iconen boven tanks i.p.v. 3D-detail.

## Open vragen
- [ ] **Escalatie-mechaniek** om spanning over 10–15 min vast te houden (map krimpt / gevaren groeien / sudden death) — uitwerken.
- [ ] **Multiplayer-backend** keuze (PartyKit / Colyseus / eigen WS) — voor stap 2.
- [ ] **Retentie/meta**: ladder, seizoenen (camo-unlock is er al)?
- [ ] **Patstelling-rem** definitief (execute + klok voldoende?).
