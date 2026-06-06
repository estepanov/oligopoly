# Oligopoly Online — Game Overview & Complete Rules

> *A game of markets, alliances, and permanent commitment*

Loosely based on the ULTRA-famous board game where players roll dice and move along a square board buying/trading properties and paying rent — now set in the world of modern industry, with syndicates, negotiations, and strategic market control layered on top.

---

## What Is Oligopoly Online?

Oligopoly Online is a multiplayer strategy game for 2–6 players (plus optional AI players) where victory requires coalition. You cannot win alone — but the players you commit to are permanent, and the terms you agree to before joining will define everything that follows.

The game models real economic forces: comparative advantage, oligopoly pricing, supply and demand, externalities, and the fragile dynamics of cartel governance. Players move around a board of industry tiles, acquiring assets, collecting rent, and building Syndicates that control entire market sectors. Every alliance is binding. Every negotiation matters.

---

## The Lobby

Before a game begins, all players gather in a **lobby**. The player who creates the lobby is the **game admin**. The admin configures the game and starts play when everyone is ready.

### Game Admin Responsibilities

The game admin can:
- Edit all game settings (mode, turn timeout, auction timing, voice/video, spectator settings)
- Customize the Market Event deck (add or remove specific event cards from the active deck)
- Invite players by username, email, or shareable invite link
- Add and configure AI player slots (choosing personality)
- Promote co-admins from among the other players
- Kick players from the lobby
- Start the game once all human players are marked ready

Co-admins share the admin's lobby controls for the lifetime of the game.

### Joining a Lobby

Players join via direct invite (username or email), a shareable invite link, or an 8-character invite code. All invite links expire after 24 hours and are single-use.

**Concurrent Lobby Limit:** A player may be in at most **2 waiting lobbies** at the same time. To create or join another waiting lobby, the player must first leave one of their existing waiting lobbies.

**Lobby Visibility:** Lobbies are **private by default** and require an invite to join. Game admins can toggle a lobby to **public** in the lobby settings, making it discoverable on the lobby discovery page.

**Public Lobbies:** When a lobby is public, it appears on the lobby discovery page showing:
- Game name
- Number of players joined vs. maximum
- Rule customization status: "Default Rules" or "Custom Rules" (with a concise breakdown of what has been modified)
- Lobby age (time since creation)
- Admin's player name

**Leaving a Lobby:** If the final player leaves a waiting lobby, the lobby is deleted immediately instead of remaining idle. If the host leaves while other players remain, host ownership transfers deterministically to the longest-tenured remaining admin; if no admin remains, the longest-tenured remaining player is promoted to admin and becomes host.

**Lobby Disbandment:** A lobby that has not started within **24 hours** of creation is automatically **disbanded** by the system. All members receive a notification. Disbanded lobbies are immediately removed from the discovery page.

**Voice & Video in Lobby:** Voice and video chat is now available in the lobby (same as in-game), enabling players to coordinate and discuss strategy before the game officially begins.

**Admin Kick Authority:** Game admins (including co-admins) may **kick any player** from the lobby at any time, or during the game. Kicking is **permanent and irreversible**. A player kicked mid-game is replaced by an AI player for the remainder of the game. The kicked player's game history shows the game status as "kicked" rather than loss or abandon. Kicked players **cannot rejoin** that lobby or game. Before confirming a kick action, the admin must explicitly acknowledge in a confirmation dialog that the action is permanent and cannot be undone.


### Game Settings (configured in lobby)

| Setting | Options |
|---|---|
| Mode | Live or Async |
| Turn timeout | 1 min / 5 min / 30 min / 2h / 8h / 24h / 48h / 7 days / None |
| Auction bid window | 30 sec / 1 min / 5 min / 10 min / 30 min |
| Auction settle delay | 10 sec / 30 sec / 1 min / 5 min |
| Voice & video | Enabled / Disabled |
| Spectator mode | See Spectator Mode section |
| Market Event deck | Full deck (30 cards) / Admin custom selection |
| Lobby visibility | Public / Private (default: Private) |
| Auction type | Open bids / Sealed bids / Live bidding (default: Sealed) |
| Currency name | Customizable text field (default: Capital) |
| Currency symbol | Customizable symbol (default: $) |
| Optional rules | Toggle individual optional rules on/off (all off by default; some require minimum rank) |
| Optional event cards | Toggle individual optional market event cards on/off (all off by default; some require minimum rank) |

Once the game starts, settings are permanent.

### Solo vs AI and AI-filled lobbies

Solo vs AI is a standard lobby configuration, not a separate rule set. The lobby contains exactly one human player and one or more AI player slots, and the total seat count still follows the 2-6 player table. A one-human lobby may start only when AI slots bring the total seat count to at least 2.

Mixed games may include any combination of human and AI seats up to the lobby maximum. AI seats are configured before start and become server-controlled players for the entire game unless they are temporary timeout takeovers for a disconnected human.

When a game starts, each AI seat receives a friendly generated display name that remains stable for that game. If a kicked human seat is replaced by AI control, the replacement also receives a friendly display name for all in-game UI and action logs.

---

## Capital Currency

The in-game currency is called **Capital** by default and is displayed with the symbol **$**.

**Currency Customization:** Game admins can customize the currency name, symbol, and display multiplier in the lobby settings before the game starts. For example, a lobby might rename Capital to "Credits" with the symbol "$", or "Coins" with "🪙".

**Cosmetic Only:** All customisation is purely cosmetic — it does not affect any game mechanics, rent calculations, or monetary values. All rules, tables, and effects in this document use the default notation of "Capital" / $.

**Display Multiplier:** Admins may also choose a display multiplier via a dropdown:

| Multiplier | Base 120 Capital displays as |
|---|---|
| ×1 (default) | 120 Capital |
| ×10 | 1,200 Capital |
| ×100 | 12,000 Capital |
| ×1,000 | 120,000 Capital |
| ×10,000 | 1,200,000 Capital |
| ×100,000 | 12,000,000 Capital |

All stored values remain in base units internally. The multiplier is applied only at display time.


---

## The Board

The board has two distinct zones: the **Perimeter Track** (40 tiles arranged in a square loop) and the **Diagonal Express Path** (5 tiles cutting through the interior from START to FREE MARKET). All tile data, rent tables, and sector definitions are defined server-side and served to all clients — changes automatically apply on all platforms without requiring a client release.

### Sector Overview

| Sector | Color | Character |
|---|---|---|
| **Emerging Tech** | Light Blue | Cheapest tiles. Low rent ceiling. Excellent early-game footholds. |
| **Big Tech** | Pink | Mid-tier cost. Dominant rent once developed. |
| **Finance** | Orange | Mid-tier. Enables capital loans when sector-controlled. |
| **Healthcare** | Red | Mid-expensive. Stable income. Resistant to crashes. |
| **Energy** | Yellow | Expensive. Subject to regulatory events. High development ceiling. |
| **Defense & Media** | Green | Expensive. Multiplies income from adjacent Sector Hubs when controlled. |
| **Elite Tech** | Dark Blue | Most expensive. Highest rent ceiling in the game. Two tiles only. |
| **Fast Track** | Purple/Gold | **Diagonal-only sector.** Three tiles accessible only via the Express Path. Sector control grants diagonal navigation advantage. |

---

## Perimeter Track (40 Tiles)

| Position | Name | Type | Sector | Cost |
|---|---|---|---|---|
| 0 | **START** | Corner | — | — |
| 1 | Digital Content Co. | Sector Tile | Emerging Tech | 60 |
| 2 | **MARKET EVENT** | Special | — | — |
| 3 | Mobile Gaming Inc. | Sector Tile | Emerging Tech | 80 |
| 4 | **CORPORATE TAX I** | Special | — | — |
| 5 | Silicon Valley Hub | Sector Hub | — | 200 |
| 6 | Search Engine Corp. | Sector Tile | Big Tech | 140 |
| 7 | **DISRUPTION CARD** | Special | — | — |
| 8 | Social Media Platform | Sector Tile | Big Tech | 160 |
| 9 | Cloud Infrastructure | Sector Tile | Big Tech | 180 |
| 10 | **REGULATION ZONE** | Corner | — | — |
| 11 | AI Startup Collective | Sector Tile | Emerging Tech | 100 |
| 12 | **OIL PIPELINE** | Utility | — | 150 |
| 13 | Crypto Exchange | Sector Tile | Finance | 200 |
| 14 | Investment Bank | Sector Tile | Finance | 220 |
| 15 | Wall Street Hub | Sector Hub | — | 200 |
| 16 | Central Bank Reserve | Sector Tile | Finance | 240 |
| 17 | **MARKET EVENT** | Special | — | — |
| 18 | Pharmaceutical Giant | Sector Tile | Healthcare | 240 |
| 19 | Hospital Network | Sector Tile | Healthcare | 260 |
| 20 | **FREE MARKET** | Corner | — | — |
| 21 | Biotech Research Corp. | Sector Tile | Healthcare | 280 |
| 22 | **DISRUPTION CARD** | Special | — | — |
| 23 | Coal Terminal | Sector Tile | Energy | 300 |
| 24 | Wind Farm Array | Sector Tile | Energy | 320 |
| 25 | Industrial Hub | Sector Hub | — | 200 |
| 26 | **MARKET EVENT** | Special | — | — |
| 27 | Solar Grid Network | Sector Tile | Energy | 340 |
| 28 | **CLEAN WATER AUTHORITY** | Utility | — | 150 |
| 29 | Broadcast Network | Sector Tile | Defense & Media | 360 |
| 30 | **GO TO REGULATION** | Corner | — | — |
| 31 | Aerospace Contractor | Sector Tile | Defense & Media | 380 |
| 32 | Defense Systems Corp. | Sector Tile | Defense & Media | 400 |
| 33 | **DISRUPTION CARD** | Special | — | — |
| 34 | **GOVERNMENT GRANT** | Special | — | — |
| 35 | Media City Hub | Sector Hub | — | 200 |
| 36 | **MARKET EVENT** | Special | — | — |
| 37 | **CORPORATE TAX II** | Special | — | — |
| 38 | Quantum Computing Corp. | Sector Tile | Elite Tech | 380 |
| 39 | AI Singularity Labs | Sector Tile | Elite Tech | 400 |

---

## The Diagonal Express Path

A fifth path cuts diagonally through the interior of the board, connecting **START (position 0)** to **FREE MARKET (position 20)**. This express route is shorter than travelling the perimeter, but the tiles along it are high-stakes and expensive.

The diagonal runs in one direction only: **from START toward FREE MARKET**. It cannot be travelled in reverse.

### Diagonal Tiles (in travel order, from corner 0 toward corner 20)

| Diagonal Position | Name | Type | Sector | Cost |
|---|---|---|---|---|
| D1 | Offshore Capital Corp. | Sector Tile | Fast Track | 320 |
| D2 | **FLASH CRASH** | Special | — | — |
| D3 | Dark Pool Exchange | Sector Tile | Fast Track | 340 |
| D4 | **BLACK MARKET RELAY** | Special | — | — |
| D5 | Algorithmic Trading Co. | Sector Tile | Fast Track | 360 |

**FLASH CRASH** — Every player (including you) loses 5% of their current Capital. You collect 10% of the total losses as a short-selling windfall.

**BLACK MARKET RELAY** — Draw 2 Disruption cards. Keep 1 and resolve it immediately. Discard the other face-down without revealing it.

### Fast Track Sector

The three Fast Track sector tiles (Offshore Capital Corp., Dark Pool Exchange, Algorithmic Trading Co.) form a unique sector. **Sector control bonus:** When you or your Syndicate controls all three Fast Track tiles, diagonal paths become **navigable at will** — you choose to take the diagonal without needing to roll at corners (see routing below). Additionally, all Fast Track tiles pay double rent to their owner when the controller also owns Silicon Valley Hub or Wall Street Hub (this standalone 2× multiplier replaces rather than stacks with the standard sector-control bonus) (the "money routes" bonus).

---

## Corner Routing — How Path Decisions Work

Corners are the four positions at 0, 10, 20, and 30. Corner 0 (START) is the **branch point** where the diagonal diverges from the perimeter. Corner 20 (FREE MARKET) is the **merge point** where diagonal travelers arrive.

### Landing Exactly on Corner 0 (START)

You collect 200 Capital for landing on START. Then you **choose** which path to take with your remaining movement (if any). If you have no moves remaining, you sit on START until your next turn. On your next turn, when you roll and begin moving, you again **choose** the diagonal or the perimeter at the start of your movement.

### Passing Through Corner 0 (Your Roll Carries You Past It)

You collect 200 Capital for passing through START. Then you **roll one additional die** to determine your path:
- **Odd result (1, 3, 5):** Continue along the perimeter (clockwise toward tiles 1, 2, 3…)
- **Even result (2, 4, 6):** Take the Diagonal Express Path (toward D1, D2, D3…)

Your remaining movement continues along whichever path the die selected. You do not get to re-roll or override this result unless you control all three Fast Track tiles (see sector control bonus above). **Fast Track control override:** If you or your Syndicate controls all three Fast Track tiles AND the Fast Track Hub, you declare 'Take Diagonal' at any corner instead of rolling the path-choice die — no roll is required. This declaration is made before any die roll for that corner. If you do not control the Fast Track sector, the die roll is mandatory.

### Landing Exactly on Corner 20 (FREE MARKET)

Whether you arrived via the perimeter or the diagonal, you collect the Free Market pool (minimum 100 Capital from bank if pool is empty) and continue your turn normally (optional actions phase).

### Corner 10 and Corner 30

These corners do not connect to the diagonal. Movement through them is straightforward — no extra roll required.

### Diagonal with Doubles

Rolling doubles on the diagonal works the same as the perimeter: you resolve the tile you land on, then roll again. If you roll off the end of the diagonal (past D5), you arrive at FREE MARKET (corner 20) and collect the pool. Any remaining movement after FREE MARKET continues clockwise along the perimeter.

---

## Special Tile Effects

| Tile | Effect |
|---|---|
| **START** | Collect **200 Capital** each time you pass or land on this tile. |
| **REGULATION ZONE** | No effect if passing through. If sent here, you skip optional actions on your next turn. You still roll and move. **Syndicate note:** Only the individual player whose token landed here is penalised — other Syndicate members' turns are unaffected. |
| **FREE MARKET** | Collect the entire accumulated **Free Market pool**. Minimum 100 Capital from bank if pool is empty. |
| **GO TO REGULATION** | Move directly to position 10 (Regulation Zone). You are in regulation. |
| **CORPORATE TAX I** | Pay **75 Capital** into the Free Market pool. |
| **CORPORATE TAX II** | Pay **100 Capital** into the Free Market pool. |
| **GOVERNMENT GRANT** | Collect **100 Capital** from the bank. |
| **MARKET EVENT** | Draw and resolve a Market Event card immediately. |
| **DISRUPTION CARD** | Draw and resolve a Disruption card immediately. |
| **FLASH CRASH** | Everyone loses 5% capital. You collect 10% of total losses. |
| **BLACK MARKET RELAY** | Draw 2 disruption cards. Keep 1 (resolve immediately), discard 1 unseen. |

---

## Rent Structure

### Sector Tiles (Perimeter and Diagonal)

| Situation | Rent |
|---|---|
| No development, no sector control | Base Rent |
| Sector control only (own all tiles in sector) | 2× Base Rent |
| 1 development token | 5× Base Rent |
| 2 development tokens | 10× Base Rent |
| 3 development tokens | 15× Base Rent |
| 4 development tokens (maximum) | 20× Base Rent |

Sector control doubles base rent even without development. Development costs: face value for first token, 1.5× face value for each subsequent token (max 4 tokens per tile). Non-integer results round down (floor); redemption costs round up (ceiling).

### Sector Hub Rent

| Hubs Controlled | Rent |
|---|---|
| 1 Hub | 25 Capital |
| 2 Hubs | 50 Capital |
| 3 Hubs | 100 Capital |
| 4 Hubs | 200 Capital |

### Utility Rent

| Utilities Controlled | Rent |
|---|---|
| 1 Utility | **6×** the visiting player's dice roll |
| Both Utilities | **15×** the visiting player's dice roll |

Utilities are dangerous to land on. A roll of 10 when both Utilities are controlled by one player/Syndicate means **150 Capital** in rent. If arriving via card or special effect, the visiting player re-rolls to determine Utility rent.

### Base Rent Quick Reference

| Tile | Cost | Base Rent |
|---|---|---|
| Digital Content Co. | 60 | 2 |
| Mobile Gaming Inc. | 80 | 4 |
| AI Startup Collective | 100 | 6 |
| Search Engine Corp. | 140 | 10 |
| Social Media Platform | 160 | 12 |
| Cloud Infrastructure | 180 | 14 |
| Crypto Exchange | 200 | 16 |
| Investment Bank | 220 | 18 |
| Central Bank Reserve | 240 | 20 |
| Pharmaceutical Giant | 240 | 20 |
| Hospital Network | 260 | 22 |
| Biotech Research Corp. | 280 | 24 |
| Coal Terminal | 300 | 26 |
| Wind Farm Array | 320 | 28 |
| Solar Grid Network | 340 | 30 |
| Broadcast Network | 360 | 32 |
| Aerospace Contractor | 380 | 34 |
| Defense Systems Corp. | 400 | 36 |
| Quantum Computing Corp. | 380 | 34 |
| AI Singularity Labs | 400 | 36 |
| Offshore Capital Corp. *(diagonal)* | 320 | 28 |
| Dark Pool Exchange *(diagonal)* | 340 | 30 |
| Algorithmic Trading Co. *(diagonal)* | 360 | 32 |



---

## Mortgage & Tile Financing

At any point during their action phase, a player (or Syndicate jointly owning tiles) may **mortgage** one or more of their tiles to raise immediate Capital.

### Mortgaging a Tile

- **Process:** The player declares the tile(s) to mortgage. The tile status immediately changes to **mortgaged**. The player receives **50% of the tile's acquisition cost** immediately from the bank as Capital.
- **Example:** Mortgaging "Cloud Infrastructure" (cost 180 Capital) yields 90 Capital to the player.

### Effects of Mortgaging

While a tile is mortgaged:
- **No rent collection:** The tile cannot collect rent from any player landing on it. Landing players pay nothing.
- **No development:** No development tokens may be added to a mortgaged tile. Existing development tokens on the tile remain placed (and visible) but do not generate rent effects while mortgaged.
- **Cannot be traded:** The tile remains in the owner's (or Syndicate's) possession but cannot be traded or transferred while mortgaged.
- **Visible status:** The mortgage status of every tile is always visible to all players on the board and in player panels.

### Redemption

The tile's owner may **redeem** (un-mortgage) a mortgaged tile at any time during their action phase:
- **Cost:** The player pays **110% of the mortgage value** back to the bank — that is, 55% of the tile's original acquisition cost. (For a tile with acquisition cost 180: mortgage value = 90; redemption cost = ⌈90 × 1.1⌉ = 99 Capital.) Non-integer redemption costs always round up (ceiling).
- **Restoration:** Upon redemption, any development tokens that were on the tile before mortgaging are immediately restored to active status, and the tile resumes collecting rent normally.

### Foreclosure

If a player lands on rent they cannot pay and has no Capital remaining:
- **Mortgaged tiles may be auctioned:** The bank initiates an immediate auction of the player's mortgaged tiles. Auction proceeds reduce the debt.
- **Shortfall absorption:** If auction proceeds are insufficient to cover the full debt, the remaining shortfall is absorbed by the bank. The player is **not eliminated** from debt alone — elimination only occurs when a player has no tiles, no capital, and no outstanding auctions to resolve.
- **Auction reserve:** Mortgaged tiles auctioned due to foreclosure have a minimum reserve price of 1 Capital.

---

## Setup

1. Shuffle the Market Event deck and place it face-down.
2. Shuffle the Disruption deck and place it face-down.
3. Each player receives starting Capital based on player count:
   - 2–3 players: 1,500 Capital
   - 4–5 players: 1,200 Capital
   - 6 players: 1,000 Capital
4. Each player draws one **Industry Affinity card** secretly from the shuffled Affinity deck. Cards are dealt randomly at game start and kept hidden from other players.
5. All tiles begin unowned. The Free Market pool starts empty.
6. Randomise turn order. The first player begins Round 1.

---

## Economic Principles

### Comparative Advantage
Each player's Industry Affinity makes them more efficient in one sector. Syndicates that pool complementary affinities consistently outperform those that overlap.

## Industry Affinity Cards

There are **12 Affinity cards** in the deck (one per sector, plus two wildcards). Each player holds exactly one for the entire game. Effects activate automatically unless marked **Active**. Cards marked **Active** are one-time-use and cost 0 Action Points unless stated otherwise.

| # | Card Name | Sector | Effect |
|---|---|---|---|
| 1 | **AI Pioneer** | Silicon Valley | Your acquisition cost for all Silicon Valley sector tiles is reduced by 15% (applies to direct purchase, auction bids, and Hostile Takeover offers). |
| 2 | **Quantitative Analyst** | Wall Street | When you collect rent from any Wall Street sector tile, the bank pays you an additional 10% on top of the standard rent. The payer is charged the normal amount only. |
| 3 | **ESG Fund Manager** | Energy | When any player lands on one of your Energy sector tiles, the bank credits you an additional 15% of the rent paid — on top of the standard rent you already collect from the landing player. |
| 4 | **Biotech IP** | Healthcare | **Active (once per game):** Nullify one Disruption Card effect that targets you. The card is discarded with no effect. Announce immediately when the card is drawn. |
| 5 | **Streaming Pioneer** | Media | Rent you collect from all Media sector tiles is increased by 15%. The bank subsidises the bonus; the paying player pays standard rent. |
| 6 | **Last Mile Logistics** | Transport | Each time your token traverses the Diagonal Express (enters at a corner and exits at the far end), collect 30 Capital from the bank as a route optimisation bonus. |
| 7 | **Consumer Insights** | Consumer / Retail | **Active (once per game, 0 AP):** Reveal one opponent's current Capital total to all players. The target is chosen by you; the reveal is immediate and broadcast to the full table. |
| 8 | **Lean Manufacturing** | Industrial | Development token installation on all your tiles costs 20% less Capital. |
| 9 | **Spectrum Holder** | Utilities | If you own both Utility tiles simultaneously, each Utility tile's rent is calculated at 1.5× the standard utility rent rate (instead of the standard 1×). |
| 10 | **PropTech Pioneer** | Real Estate | Your mortgage redemption rate is 105% of mortgage value instead of the standard 110%. You also save on early redemption. |
| 11 | **Crypto Arbitrageur** | Wildcard | When you land on Free Market and collect the pool, the bank pays you an additional 25% of the collected pool value as a bonus. If the pool is empty, you collect only the standard 100 Capital floor. |
| 12 | **Founding Partner** | Wildcard | Forming a Syndicate costs you 0 Action Points (instead of 1). Additionally, your Contribution Score starts with a 5% baseline — equivalent to having already contributed a small share before the game begins. |

**Revealing cards:** Affinity cards are revealed publicly when a player uses an Active card or when the game ends (all cards are revealed during the final score tally). During the game, other players know only that you hold a card, not which one.

**Syndicate strategy:** Syndicates that pool complementary sector affinities (e.g., one AI Pioneer + one Quantitative Analyst controlling both Tech and Finance sectors) compound their advantages significantly. Recruiting a player with a complementary card is a legitimate Syndicate formation strategy.

### Supply & Demand
Tile acquisition costs reflect current market conditions. Market Event cards force sudden corrections no single player can predict.

### Oligopoly Pricing

When a Syndicate controls **all tiles in a sector AND owns that sector's Sector Hub**, it may post a **Rate Card** — overriding the calculated rent on every tile in that sector with a custom multiplier.

#### When Rate Cards Become Available
A Rate Card becomes available in any round where the Syndicate meets both conditions:
1. Owns all sector tiles (full perimeter + diagonal tiles in that sector)
2. Owns the Sector Hub for that sector

If the Syndicate loses either condition (tile traded away, mortgaged, or taken by Hostile Takeover), the Rate Card is immediately revoked and rent returns to the standard calculated rate. **If any single tile in the qualifying sector or its Sector Hub becomes mortgaged, the Rate Card is revoked in its entirety** — even if the other tiles remain owned and unmortgaged. The Rate Card can only be reinstated once all disqualifying conditions are resolved and the Syndicate admin posts a new Rate Card again while qualified (see below).

#### Setting a Rate
While you are the **active player** on your own turn (**Action Phase**, including between doubles when you are still rolling), the **Syndicate admin** may set or adjust the Rate Card multiplier for any sector in which the Syndicate currently qualifies. The change applies **immediately** to the next rent resolution in that sector. The multiplier is a percentage of the **fully calculated rent** (base × all applicable multipliers before the Rate Card is applied):

| Multiplier | Effect |
|---|---|
| 50% | Floor — minimum allowed rate |
| 100% | Default — no change from calculated rent |
| 200% | Ceiling — maximum allowed rate |

Any value between 50% and 200% (in 5% increments) is valid.

#### Rate Card Visibility
All active Rate Cards are **public** and visible to every player via the board overlay and the Player Summary Panel. No hidden pricing is permitted.

#### Market Pressure Reset
If **no opposing player** lands on any tile in the sector for **three consecutive rounds**, the Rate Card multiplier resets automatically to 100%. This models competitive market pressure: artificially elevated prices attract no customers and are unsustainable.

> **"Lands on" definition:** A player's token must finish movement on the tile. Passing through (e.g., during doubles re-rolls) does not count. Turns by Syndicate members who own the Rate Card do not count toward the reset timer — only opposing players' landings reset the counter. The three-round counter tracks independently per sector.

#### Example
- Tile base rent: 120 Capital
- Syndicate sector-control multiplier: ×2 → 240 Capital
- Rate Card applied at 150% → **360 Capital** charged to the landing player

### Externalities
Aggressive monopolisation imposes costs on all players. Some Market Event cards are triggered by concentrated control, modelling regulatory responses.

---

## Turn Structure

Each full round has two player-facing phases. **Between rounds** (after the last player ends their turn and before the next turn-start market event), the server applies bookkeeping automatically (debt interest when enabled, negotiation expiry, rate-card market-pressure ticks, and similar) — there is no separate pause for table acknowledgement.

---

### Turn-Start Market Event

At the start of each player's turn, the server automatically draws and resolves one Market Event card before the player rolls. The drawn card and its outcome are shown in the game log. Players do not manually draw this mandatory turn-start card.

---

### Action phase

Each player takes their turn in order. A turn consists of a mandatory **Movement Step** followed by optional **Action Points**.

#### Movement Step (Mandatory)

**1. Roll the dice** — two standard six-sided dice. Move your token that many spaces.

- **Rolling doubles**: Resolve the landing tile, then roll again. Three consecutive doubles = sent directly to Regulation Zone; do not resolve the third tile. **This rule takes absolute precedence** — if you are on the Diagonal Express and your third consecutive double would roll you past tile D5, you go to Regulation Zone rather than Free Market. The diagonal's 'roll off end → Free Market' rule does not override the three-doubles rule.
- **Passing START**: Collect 200 Capital. If the roll would carry you through corner 0, also resolve the path-choice die (see Corner Routing).
- **Passing Corner 0**: Roll the path-choice die — odd continues on perimeter, even enters the diagonal.

**2. Resolve the tile you landed on** — see tile type effects above.

#### Tile Acquisition & Auction System

When landing on an **unowned** Sector Tile, Hub, or Utility:

**Step 1 — Right of First Refusal:** The landing player has an exclusive window (configurable: 30s to 30min) to buy at face value. If they buy: tile acquired. If they decline or let the window expire: the tile goes to auction.

**You may only acquire a Sector Tile, Sector Hub, or Utility by:**
1. **Landing on it** — exercising right of first refusal
2. **Trade / negotiation** — receiving it in an agreed deal
3. **Winning an auction** — bidding successfully

**Step 2 — Auction (if declined):** All players (including the lander) may bid. The auction proceeds according to the **Auction Type** configured in lobby settings (see below). Minimum bid: 1 Capital. Tie-break by dice roll. No bids: tile stays unowned.

### Auction Types

The admin selects one of three auction modes in the lobby settings before the game starts:

**Open Bidding** — All bids are visible to all players as they are placed in real-time. Players see each bid arrive and can plan their responses. Once a bid is placed, it cannot be retracted. When the bid window closes (timer expires), the highest bid wins the tile immediately. This mode is transparent and favours experienced bidders who read opponents well.

**Sealed Bidding** — All bids are kept hidden until the bid window closes. Each player submits their bid secretly without seeing others' bids. When the window closes, all bids are revealed simultaneously. The highest bid wins. **Tie-break:** If two or more players submit the same highest bid, those tied players enter a second sealed-bid round; bids must be ≥ the tied amount. Additional rounds continue until the tie is broken. All bids in each round are revealed simultaneously to all players. If all players decline to bid, the tile remains unowned.

**Live Bidding** — A fast-paced, real-time auction mode where all players see each other's bids the moment they are submitted. Any player can immediately outbid another. Each time a new highest bid is placed, the auction timer **extends by the configured extension window** (10, 15, or 30 seconds — default 15 seconds). The auction ends when the timer expires without a new highest bid being placed. No bids may be withdrawn in live mode. **If the timer expires with no bids placed, the tile remains unowned** — future players who land on it may trigger a new auction. This mode is most exciting for shorter, high-energy sessions and favours aggressive, fast-thinking players.

#### Action Points (Optional, After Landing)

After resolving tile effects, spend **2 Action Points:**

| Action | Cost |
|---|---|
| Develop a tile you own (add development token, max 4) | 2 pts |
| Initiate a negotiation | 1 pt |
| Call a Syndicate vote | 1 pt |
| Initiate an auction (any unowned tile) | 1 pt |
| Initiate an auction (one of your own tiles, with reserve price) | 1 pt |

**Player-Initiated Tile Auctions:** During your turn you may spend 1 Action Point to place any un-mortgaged tile you own up for auction. You set the reserve price (minimum you will accept); the default is 50% of the tile's original acquisition cost. The auction uses the same mode (open/sealed/live) configured for the game. You as seller cannot bid on your own tile. If no other player meets the reserve price, the auction closes with no sale and the tile stays with you. The seller collects proceeds directly; they do not pass through the bank.

---

### Between-round housekeeping (automatic)

At the end of each full lap of turns, before the next player’s turn-start market draw, the server resolves bookkeeping that does not require player input:

- Joint sector acquisitions from the prior round are fully reflected on the board state
- Syndicate revenue and charter obligations continue to apply as written elsewhere
- **Oligopoly pricing (Rate Cards)** set during turns remain in force unless revoked by loss of control, mortgage, or market-pressure reset
- Market Control tracker updates and winning-threshold checks run as implemented in the live ruleset
- Regulation effects reset for players who completed their Regulation turn

Players do not wait on a separate “coordination” step; syndicate admins adjust Rate Cards on **their own** turns when qualified.

---

## Negotiations

Any player may spend 1 action point to open a negotiation.

### What Can Be Negotiated
- Sector tiles, Sector Hubs, Utilities, or partial stakes
- Capital payments and future revenue shares
- Pricing agreements, non-aggression pacts
- Syndicate formation terms, charter details, admission terms

### Binding vs. Handshake Agreements
**Binding contracts** — mechanically enforced through two layers:
1. **UI lock** — any action that would violate an active binding contract is disabled in the interface and cannot be selected. The UI renders such actions as greyed out with a tooltip explaining the active contract.
2. **Server validation** — the game engine rejects any action that contradicts a binding contract with a typed error, regardless of how the request was made. This prevents API-level circumvention.

Once two parties sign a binding contract, neither party can take any action that violates its terms until the contract period expires or is mutually fulfilled.

**Handshake agreements** — recorded publicly in the Action Log but not enforced. Breaking one drops your **Trustworthiness** score by 2 permanently.

### Trustworthiness (range 0–10, starting at 7)
- **8–10:** May offer binding contracts freely.
- **5–7:** Standard terms.
- **0–4:** Handshakes only. Other players may demand a Capital deposit before accepting.

Negotiations expire after **3 rounds** without resolution (Trustworthiness −1 for both parties).

---

## Syndicates

A Syndicate forms when two or more players ratify a **Founding Charter** (each spending 1 action point). Membership is **permanent**.

### The Founding Charter
At formation, all members agree on:
1. **Governance Model** — Asset-Weighted or Equal Voting
2. **Deadlock Resolution** — Tied votes resolved by public dice roll
3. **Revenue Split** — Percentage to each member, must sum to 100%
4. **Contribution Weighting** — How endgame points are split across Asset Score, Revenue Score, and Negotiation Credit (must sum to 100%)
5. **Dissolution Clause** — Agreed penalty terms

### Joining, Permanence, Dissolution
- **Joining**: 1 AP to apply. Existing members vote. Terms negotiated first.
- **Permanence**: No leaving once admitted.
- **Dissolution**: Unanimous vote only. Trustworthiness −2 per member. Assets split by contribution.

---

## Market Events

30 cards total. Admin can include/exclude any card in the lobby. Four Market Event spaces (positions 2, 17, 26, 36) trigger additional draws mid-turn on top of the automatic turn-start draw.

*(Full list of all 30 cards with effects is defined in the game configuration served from the backend. The canonical card text is the server-authoritative version.)*

**Card categories:**
- **Positive** (8 cards): Tech Boom, Green New Deal, Stimulus Package, Bull Market, Sector Dividend, Infrastructure Bill, Merger Wave, Innovation Grant
- **Negative** (10 cards): Regulatory Crackdown, Market Crash, Antitrust Investigation, Supply Chain Crisis, Cyber Attack, Energy Crisis, Healthcare Scandal, Data Breach Fine, Financial Meltdown, Recession
- **Variable/Roll-based** (4 cards): Election Outcome, OPEC Decision, Trade Liberalization, Debt Crisis
- **Targeted** (8 cards): Hostile Takeover Alert, Whistleblower, Sovereign Wealth Fund, Economic Sanctions, Boom Town, Windfall Tax, IPO Windfall, Climate Legislation

---

## Disruption Cards

15 cards. Drawn when landing on DISRUPTION CARD spaces or when BLACK MARKET RELAY is resolved.

**Card list:** Patent Troll, Golden Parachute, Insider Trading, Leveraged Buyout, Bankruptcy Protection, Angel Investor, Antitrust Exemption, Market Manipulation, Whistleblower Payoff, Bridge Loan, Corporate Espionage, Regulatory Capture, Lobbying Win, Short Squeeze, Go to Regulation.

*(Full effect text for all cards is served from the backend configuration.)*

---

## In-Game Chat & Private Messages

The in-game chat supports **three communication scopes**:

**Global Chat** — Messages visible to all players and all spectators in the game. Use this for public coordination, jokes, or general conversation. Global messages are logged in the action log.

The Action Log also records the visible consequences of game actions, including changes to a player's Capital, owned tiles, mortgaged tiles, development tokens, Action Points, trustworthiness, debt, board position, regulation status, and Syndicate membership. When a game ends, the log records why the win was reached and how it was calculated, and the same explanation is shown in the in-game game-over message.

**Syndicate Chat** — Messages visible only to members of your Syndicate. Use this for private syndicate strategy and decision-making. Spectators cannot see syndicate chat. Non-members see only that a syndicate message was sent, not its content.

**Direct Messages** — Private one-on-one messages to a specific player. Direct messages are never visible to other players or spectators, including those in your Syndicate. Players receive notifications for new direct messages based on their notification settings.

---

## Spectator Mode

Admin-enabled. Spectators see the board, action log, dice rolls, path decisions, and auction events in real time. They do not see private negotiations, syndicate chat, or direct messages. **Spectators are subject to the same information rules as players** — sealed auction bids are hidden from spectators until they are revealed to all players simultaneously at settlement. Spectators can view global chat but cannot send messages. Anonymous and authenticated spectators are tracked separately.

---

## Turn Timeout & AI Takeover

If a player's turn times out, the AI plays on their behalf: rolls dice, moves, resolves the tile (buys if strategically beneficial, otherwise declines and the tile auctions), participates in active auctions if warranted, and ends the turn conservatively. All AI actions are marked in the Action Log. The player receives a notification summarising what happened.

---

## Player Online Status

The game continuously tracks each player's connection status. Players who are actively connected appear as **online**. Players who have disconnected are shown as **offline** with a timestamp indicating when they were last seen.

Two separate timestamps are maintained for each player:
- **Last seen online:** Most recent moment the player was connected to the platform
- **Last seen in-game:** Most recent action (turn, bid, etc.) taken by the player in this specific game

These timestamps help other players assess whether a disconnect is temporary network hiccup or a more extended absence.

---

## Winning the Game

### Thresholds
- **Syndicate win**: 60% of total market value (the sum of acquisition costs of all board tiles, fixed at game start). Coalition required.
- **Solo win**: 35% of total market value (the sum of acquisition costs of all board tiles, fixed at game start) individually.
- **Last standing win**: if only one non-eliminated player remains, that player wins. The game-over message and Action Log explain the exact winning condition.

### The Final Round
When a Syndicate crosses 60%, every other player and Syndicate gets one last full turn to disrupt it below the threshold.

### Internal Distribution

Members split the Syndicate's shared tile equity and victory points by **Contribution Score** — a weighted composite of four metrics tracked throughout the game.

#### The Four Metrics

| Metric | Default Weight | What It Measures |
|---|---|---|
| **Asset Score** | 35% | Your share of the Syndicate's total tile acquisition costs at game end |
| **Revenue Score** | 35% | Your share of the Syndicate's total rent collected across the entire game |
| **Negotiation Credit** | 30% | Your share of completed deal value within the Syndicate — rewards active deal-making |

**Negotiation Credit** counts every completed deal (binding contract or handshake agreement that successfully settles) in which you were a party. Deal value is the Capital equivalent of all transferred assets at their acquisition cost plus any Capital payments in the deal. Your Negotiation Credit is your total deal value as a proportion of all deal value transacted within the Syndicate during the game. Higher-value deals contribute more; closing many small deals still helps. This metric deliberately incentivises active deal-making over passive tile holding.

#### Contribution Score Formula

```
ContribScore(player) =
    0.35 × (player_tile_cost / syndicate_total_tile_cost)
  + 0.35 × (player_rent_collected / syndicate_total_rent)
  + 0.30 × (player_deal_value / syndicate_total_deal_value)
```

Each player's raw score is normalised so all members' scores sum to exactly 100%. Normalisation uses floor rounding on all but the highest scorer, who receives any remainder. The Syndicate's shared payout is then divided in those proportions.

#### Worked Example (3-player Syndicate)

| | Alice | Bob | Carol |
|---|---|---|---|
| Tile acquisition cost share | 45% | 35% | 20% |
| Rent collected share | 50% | 30% | 20% |
| Deal value share | 60% | 30% | 10% |

```
Alice:  0.35×0.45 + 0.35×0.50 + 0.30×0.60 = 0.1575 + 0.175 + 0.180 = 51.25%
Bob:    0.35×0.35 + 0.35×0.30 + 0.30×0.30 = 0.1225 + 0.105 + 0.090 = 31.75%
Carol:  0.35×0.20 + 0.35×0.20 + 0.30×0.10 = 0.0700 + 0.070 + 0.030 = 17.00%
```
Sum = 100.00% ✓

If the Syndicate's shared payout is **1,200 Capital**:
- Alice receives **615 Capital** (51.25%)
- Bob receives **381 Capital** (31.75%)
- Carol receives **204 Capital** (17.00%)

#### Charter Weighting Override
The Founding Charter may redistribute the default 35/35/30 weights at Syndicate formation — e.g., valuing revenue more heavily in a trading-focused strategy. Charter weights must sum to exactly 100% and must be agreed unanimously. Once set, they cannot be changed without dissolving and re-forming the Syndicate.

### Asset Absorption

After the winning Syndicate is confirmed, it may **absorb tiles** from eliminated or losing players before the final score tallies.

#### Absorption Rules
- The winning Syndicate may acquire **up to 3 tiles per losing player** (not per Syndicate — per individual).
- Absorption price: **60% of the tile's original acquisition cost**, paid from Syndicate funds to the losing player.
- The losing player **chooses which tiles** to surrender if they hold more tiles than the winning Syndicate wants.
- Mortgaged tiles cannot be absorbed until the mortgage is redeemed first (paid by the absorbing Syndicate at the full redemption cost, then absorbed at the 60% rate).
- The losing player cannot refuse absorption; it is automatic upon the win condition being confirmed.
- Absorbed tiles count toward the winning Syndicate's total asset score for final rank point calculations.

---

## AI Players

AI players are server-controlled participants. They obey the same turn order, action legality, auction rules, win conditions, and syndicate commitments as human players.

AI decisions are always applied by the server's authoritative rules engine. An AI may use deterministic rules or an optional OpenRouter-assisted decision pass, but provider output can only choose among server-provided candidate actions and is discarded if it is invalid or illegal.

Available AI personalities:

- **Loyalist:** favors cooperation, honors handshake agreements, and prefers syndicate outcomes.
- **Opportunist:** balances solo and coalition incentives, buying and bidding aggressively when expected value is favorable.
- **Disruptor:** pursues solo-win pressure, blocks rivals in auctions, and avoids permanent commitments unless strongly beneficial.

If a human times out, an AI may take the required legal actions for that turn. If a human is kicked mid-game, an AI replacement controls that seat for the remainder of the game and the kicked player's history shows `kicked`.



---

## Optional Rules

Game admins may enable any of the following **optional house rules** in the lobby settings before the game starts. All optional rules are **disabled by default**. Some rules require the admin to have reached a certain **Player Rank** (see Player Ranks section below).

### Standard Optional Rules (Available to All Ranks)

**Double Rent District** — When a player or Syndicate controls all tiles in a full sector **AND** owns the Sector Hub adjacent to that sector, they collect **3× base rent** (instead of 2×) from unowned-sector players who land on tiles in that sector.

**Speed Market** — Each player begins the game with **30% more Capital** than normal (e.g., 1,950 instead of 1,500 for 2–3 players; 1,560 instead of 1,200 for 4–5 players; 1,300 instead of 1,000 for 6 players). Games progress faster, encouraging aggressive early play.

**No Regulation** — The Regulation Zone (position 10) has no effect. Players who land on or are sent to the Regulation Zone experience no penalties — they do not skip optional actions on the following turn.

**Disruption Blitz** — When a player lands on a DISRUPTION CARD space or resolves BLACK MARKET RELAY, they **draw 2 Disruption cards** instead of 1. Resolve both immediately (or follow the specific card's instructions, e.g., BLACK MARKET RELAY's "keep 1, discard 1").

**Auction Everything** — When a player lands on any unowned sector tile, hub, or utility, it bypasses right-of-first-refusal and goes directly to auction. Reserve price: 1 Capital.

**Open Negotiation** — All negotiation proposals, counter-proposals, and agreements are visible to all players in the game (not just the parties involved). Transparency may encourage or discourage negotiation; use with caution.

**Debt Spiral** — If a player cannot pay rent immediately and has no available Capital, they owe the debt as an interest-bearing obligation. The debt accrues **10% simple interest per round** until fully paid (applied to the original debt amount only — not compounding). Interest is calculated on the principal at the **end of each full player round** (immediately before the next round’s first turn-start market event). A player may pay off debt at any time.

### Rank-Gated Optional Rules (Requires Capital Baron Rank or Above)

These rules may only be enabled if the game admin has achieved **Capital Baron** rank or higher (see Player Ranks section).

**Hostile Takeover** — Once per game, a player may forcibly purchase one sector tile from another player who is **not** in their Syndicate. The purchase price is **150% of the tile's acquisition cost**. The target player cannot refuse or negotiate—the transaction is forced through immediately. This rule is powerful and should be used strategically.

**Market Manipulation** — Once per round (during the admin's turn in Phase 2), a player may pay $50 to **freeze one opponent's tile** for the remainder of that round. A frozen tile cannot collect rent from any player landing on it this round, regardless of the owner's game state. The freeze affects only one round.

**Insider Trading** — Before each automatic turn-start Market Event card is drawn, the player whose turn is starting may **peek** at the top card of the Market Event deck without revealing it to others. They may then choose to discard that card and draw the next card instead. The peeked card (if not drawn) is returned to the bottom of the deck face-down.

---

## Optional Market Event Cards

Game admins may add any of the following optional Market Event cards to the active deck in the lobby settings. All optional cards are **disabled by default**. When enabled, they are shuffled into the 30-card standard deck, increasing deck size. Some cards require a minimum **Player Rank**.

### Standard Optional Cards (Available to All Ranks)

**Leveraged Buyout** — The player currently controlling the fewest tiles must immediately place one of their most expensive tiles up for auction. All players may bid. Minimum bid: 1 Capital. Auction proceeds go to the auctioned player (not the bank).

**Corporate Espionage** — Each player pays $10 for every development token on tiles currently owned by opponents. Total cost = (sum of opponents' development tokens) × 10. This models industrial espionage overhead.

**Short Squeeze** — The player controlling the most tiles in any single sector immediately collects $30 per tile in that sector from all other players. Example: if a player controls 4 tiles in the Healthcare sector, they collect 4 × 30 = 120 Capital from each other player.

**Supply Chain Crisis** — All utilities (Oil Pipeline and Clean Water Authority) collect **double rent** for the next **2 rounds** (both opponents' turns and the owner's turns). After 2 complete rounds, rent returns to normal.

**Sovereign Wealth Fund** — The bank distributes $200 equally among all players, rounded down. Example: in a 4-player game, each player receives 50 Capital (4 × 50 = 200).

**Venture Capital Boom** — Each player currently controlling **fewer than 3 tiles** receives $100 from the bank as startup funding. Only qualifying players receive the boost.

**Algorithmic Flash Trade** — All players simultaneously roll a single die. Each player collects that result × $10 from the bank. Example: rolling a 4 yields 40 Capital. Different rolls are possible.

**Regulatory Amnesty** — All players currently positioned in the Regulation Zone (position 10) are immediately released. They do not lose their next turn's optional actions. Any players not in Regulation are unaffected.

### Rank-Gated Optional Cards (Requires Sector Investor Rank or Above)

These cards may only be active if the game admin has achieved **Sector Investor** rank or higher.

**Dark Pool Transfer** — One random player (selected by the game) may secretly transfer one of their tiles to any other player without public announcement. The transfer is recorded in the action log but no notification is broadcast to other players. Other players see the ownership change only when they check the board state.

**Synthetic CDO** — Each player may mortgage any number of their tiles simultaneously this round. When doing so via this card, players receive **60% of acquisition cost** per mortgaged tile (instead of the standard 50%). This window remains available through the current round.

**Black Swan Event** — All players lose **25% of their current Capital** immediately (rounded down). After this loss, the player with the **least total Capital** receives all the Capital lost by other players combined as compensation, modelling "disaster socialism." Example: Players A (500), B (300), C (200) lose 125, 75, 50 = 250 total. C receives 250, ending at 450.



---

## Player Ranks

Players earn **Rank Points** through game activity and achievement, accumulating toward permanent account-wide ranks. Rank is a career progression system that does not reset per game.

### Rank Thresholds

| Rank | Title | Rank Points Required |
|---|---|---|
| 1 | Market Novice | 0 |
| 2 | Sector Investor | 100 |
| 3 | Capital Baron | 500 |
| 4 | Market Mogul | 1,500 |
| 5 | Oligarch | 5,000 |

### Rank Point Acquisition

Players earn Rank Points in the following ways:

- **Completing a game:** +10 points (awarded when the game concludes, regardless of outcome)
- **Winning a game:** +25 points (for being in the winning Syndicate or winning solo)
- **Achieving full sector control:** +5 points per sector controlled at end of game (maximum +40 from all 8 sectors)
- **Completing a successful trade:** +2 points per trade (both trading parties earn points)
- **Winning an auction:** +2 points per auction won
- **Unlocking an achievement:** +5 to +50 points (varies by achievement rarity; see Achievements section)
- **Playing against higher-ranked opponents:** Bonus multiplier of up to 1.5× applied to all earned points in that game if you play with or against players of significantly higher rank

### Rank Display

A player's current rank and rank icon are displayed:
- On their player profile page
- In-game in player panels (showing name, capital, tiles, rank icon)
- In the game lobby
- On the leaderboard for human players. AI players are not ranked as individual leaderboard entries; leaderboards instead show aggregate human-win and AI-win totals.

---

## Achievements

Achievements are permanent account-wide milestones that recognize player accomplishments. Similar to gaming platform achievements (e.g., Xbox, Steam), each achievement is earned once and displayed on the player's profile, in the lobby, and in-game. Unlocking achievements grants Rank Points.

### Sample Achievements

| Achievement | Description | Rank Points |
|---|---|---|
| First Steps | Complete your first game | 5 |
| Full House | Complete 10 games | 10 |
| Century Club | Complete 100 games | 50 |
| Champion | Win your first game | 10 |
| Dynasty | Win 10 games | 25 |
| Monopolist | Win a game while controlling all tiles in at least 2 full sectors | 30 |
| Deal Maker | Complete 10 successful trades | 10 |
| Auctioneer | Win 25 auctions | 15 |
| Sniper | Win an auction by exactly 1 Capital (highest bid by 1) | 20 |
| Diagonal Shortcut | Take the Diagonal Express Path 10 times | 10 |
| Flash Survivor | Land on or pass FLASH CRASH with under 50 Capital and survive | 25 |
| Kingmaker | Form or join a Syndicate that goes on to win the game | 15 |
| Loan Shark | Mortgage and redeem 5 or more tiles in a single game | 15 |
| Oligarch's Gambit | Use a rank-gated optional rule for the first time in a game | 20 |
| Perfect Attendance | Complete 5 consecutive games without a turn timeout | 15 |

The achievement system is extensible — the backend may introduce additional achievements over time without requiring client updates.



---

## Spectator & Player Summary Panel

All players and spectators have access to a dynamic **Player Summary Panel** showing the current state of every player in the game. This panel is always visible (sidebar or tabbed view, depending on client layout) and updates in real-time.

### Information Shown to All (Players & Spectators)

- **Player name and rank** (with rank icon)
- **Current Capital total** (always visible, updated in real-time)
- **Tiles owned:** Total count and breakdown by sector
- **Mortgaged tiles:** Count of currently mortgaged tiles (with mortgage status visible on each tile on the board)
- **Development tokens:** Total count across all tiles
- **Online/offline status:** Whether the player is currently connected. If offline, timestamp of when they were last seen (separated into "last seen online" on the platform and "last seen in-game" in this specific game)
- **Current regulation status:** Whether the player is currently in the Regulation Zone

### Private Information (Players Only)

Additionally, each player sees their own private information in their summary panel:
- Outstanding negotiation proposals and counter-proposals
- Sealed auction bid amounts (hidden from all players and spectators until the bid window closes and bids are revealed simultaneously)
- Syndicate membership and role (if applicable)
- Debt balance (if Debt Spiral rule is active)

Spectators see the public information only — they cannot view sealed bids, private negotiations, or syndicate details.

---

## Quick Reference

| Rule | Detail |
|---|---|
| Starting capital | 1,500 (2–3p) / 1,200 (4–5p) / 1,000 (6p) |
| Pass START | Collect 200 Capital |
| Doubles | Roll again; third doubles = go to Regulation |
| Corner 0 path choice | Land = free choice; pass through = roll 1 die (odd = perimeter, even = diagonal) |
| Fast Track sector control | Choose diagonal at will, no die roll needed |
| Diagonal direction | One-way: START → FREE MARKET only |
| Tile acquisition | Only by landing, trade, or winning auction |
| Right-of-first-refusal | Landing player gets exclusive buy window first |
| Declined purchase | Goes to open auction immediately |
| Player-initiated auction | 1 AP; any unowned or own tile |
| Utility rent (1 utility) | **6×** visiting player's dice roll |
| Utility rent (2 utilities) | **15×** visiting player's dice roll |
| Sector Hub rent | 25 / 50 / 100 / 200 (by hubs owned) |
| Fast Track "money routes" bonus | 2× Fast Track rent when controller also owns Silicon Valley or Wall Street Hub. This 2× **replaces** the standard sector-control bonus (does not stack with it). A player controlling all Fast Track tiles but without Silicon Valley or Wall Street Hub earns only the standard sector-control rent. |
| Regulation Zone | Skip optional actions next turn; still roll & move |
| Syndicate membership | Permanent |
| Dissolution | Unanimous vote only |
| Binding contracts | Mechanically enforced — cannot be broken |
| Market Event deck | 30 cards; admin-configurable |
| Syndicate win threshold | 60% of total market value (the sum of acquisition costs of all board tiles, fixed at game start) |
| Solo player threshold | 35% of total market value (the sum of acquisition costs of all board tiles, fixed at game start) |
| All game config | Served from backend — updated without client releases |

---

## Glossary

**Auction** — Competitive bidding triggered by declined right-of-first-refusal, player action, or market event.

**Diagonal Express Path** — Interior shortcut connecting START (corner 0) to FREE MARKET (corner 20) through 5 unique tiles.

**Fast Track Sector** — Diagonal-only sector with three tiles. Controlling all three grants diagonal navigation advantage.

**Binding Contract** — Mechanically enforced agreement. Cannot be broken.

**Contribution Score** — Weighted endgame metric (35% Asset Score, 35% Revenue Score, 30% Negotiation Credit) that determines each Syndicate member's share of the collective payout.

**Development Token** — Marker increasing a tile's rent multiplier. Max 4 per tile.

**Disruption Card** — Short-deck card with targeted immediate effects.

**Free Market Pool** — Shared pool fed by tax tiles. Collected by landing on FREE MARKET.

**Founding Charter** — Governance document agreed at Syndicate formation.

**Game Admin** — Lobby creator. Controls game settings, deck, auction config, and game start.

**Oligopoly Pricing** — Sector-majority Syndicate's ability to set rents.

**Regulation Zone** — Corner at position 10. Players sent here skip optional actions for one round.

**Right of First Refusal** — Landing player's exclusive window to buy an unowned tile before auction.

**Sector Control** — Owning all tiles in a sector. Doubles base rent. Enables Oligopoly Pricing.

**Sector Hub** — One of four anchor tiles at corners of each board quadrant. Rent scales with hubs owned.

**Syndicate** — Permanent coalition with shared ledger and founding charter.

**Trustworthiness** — Public score (0–10) reflecting handshake agreement history.

**Utility** — Oil Pipeline (pos. 12) or Clean Water Authority (pos. 28). Rent = multiplier × dice roll.

---

## Engine Parity Notes (Negotiation, Trustworthiness, Charter)

This section defines normative behavior that the engine and API contracts must implement. These rules are cross-referenced by the technical plan and must stay consistent.

### Negotiation Expiry

- Negotiations start when a player spends 1 AP to open a thread.
- A negotiation thread expires after 3 rounds if unresolved.
- On expiry, every participating player loses 1 Trustworthiness.

### Binding vs Handshake

- Binding contracts are enforced by both UI guardrails and server validation.
- Handshake agreements are logged but not server-enforced.
- Breaking a handshake applies a permanent `-2` Trustworthiness penalty to the breaking player.

### Trustworthiness Bands

- Range is `0..10`.
- Starting value is `7`.
- `8..10`: no restrictions.
- `5..7`: standard behavior.
- `0..4`: cannot offer new binding contracts.

### Founding Charter Validation

- Governance model is `asset_weighted` or `equal_vote`.
- Deadlock resolution is public dice roll.
- Revenue split percentages must sum to `100`.
- Contribution weight percentages must sum to `100`.
- Dissolution requires unanimous vote and applies a `-2` Trustworthiness penalty per member.

---

## Canonical ID Appendix (Machine-Mappable)

This appendix defines immutable canonical IDs used across config, APIs, persistence, analytics, and localization.

### Optional Rule IDs

| ID | Name |
|---|---|
| `double_rent_district` | Double Rent District |
| `speed_market` | Speed Market |
| `no_regulation` | No Regulation |
| `disruption_blitz` | Disruption Blitz |
| `auction_everything` | Auction Everything |
| `open_negotiation` | Open Negotiation |
| `debt_spiral` | Debt Spiral |
| `hostile_takeover` | Hostile Takeover |
| `market_manipulation` | Market Manipulation |
| `insider_trading` | Insider Trading |

### Optional Market Event Card IDs

| ID | Name |
|---|---|
| `optional_leveraged_buyout` | Leveraged Buyout |
| `optional_corporate_espionage` | Corporate Espionage |
| `optional_short_squeeze` | Short Squeeze |
| `optional_supply_chain_crisis` | Supply Chain Crisis |
| `optional_sovereign_wealth_fund` | Sovereign Wealth Fund |
| `optional_venture_capital_boom` | Venture Capital Boom |
| `optional_algorithmic_flash_trade` | Algorithmic Flash Trade |
| `optional_regulatory_amnesty` | Regulatory Amnesty |
| `optional_dark_pool_transfer` | Dark Pool Transfer |
| `optional_synthetic_cdo` | Synthetic CDO |
| `optional_black_swan_event` | Black Swan Event |

### Achievement IDs

| ID | Name |
|---|---|
| `first_steps` | First Steps |
| `full_house` | Full House |
| `century_club` | Century Club |
| `champion` | Champion |
| `dynasty` | Dynasty |
| `monopolist` | Monopolist |
| `deal_maker` | Deal Maker |
| `auctioneer` | Auctioneer |
| `sniper` | Sniper |
| `diagonal_shortcut` | Diagonal Shortcut |
| `flash_survivor` | Flash Survivor |
| `kingmaker` | Kingmaker |
| `loan_shark` | Loan Shark |
| `oligarchs_gambit` | Oligarch's Gambit |
| `perfect_attendance` | Perfect Attendance |

### Market Event Deck IDs (30 Cards)

| ID | Name | Category |
|---|---|---|
| `tech_boom` | Tech Boom | Positive |
| `green_new_deal` | Green New Deal | Positive |
| `stimulus_package` | Stimulus Package | Positive |
| `bull_market` | Bull Market | Positive |
| `sector_dividend` | Sector Dividend | Positive |
| `infrastructure_bill` | Infrastructure Bill | Positive |
| `merger_wave` | Merger Wave | Positive |
| `innovation_grant` | Innovation Grant | Positive |
| `regulatory_crackdown` | Regulatory Crackdown | Negative |
| `market_crash` | Market Crash | Negative |
| `antitrust_investigation` | Antitrust Investigation | Negative |
| `supply_chain_crisis` | Supply Chain Crisis | Negative |
| `cyber_attack` | Cyber Attack | Negative |
| `energy_crisis` | Energy Crisis | Negative |
| `healthcare_scandal` | Healthcare Scandal | Negative |
| `data_breach_fine` | Data Breach Fine | Negative |
| `financial_meltdown` | Financial Meltdown | Negative |
| `recession` | Recession | Negative |
| `election_outcome` | Election Outcome | Variable |
| `opec_decision` | OPEC Decision | Variable |
| `trade_liberalization` | Trade Liberalization | Variable |
| `debt_crisis` | Debt Crisis | Variable |
| `hostile_takeover_alert` | Hostile Takeover Alert | Targeted |
| `whistleblower` | Whistleblower | Targeted |
| `sovereign_wealth_fund` | Sovereign Wealth Fund | Targeted |
| `economic_sanctions` | Economic Sanctions | Targeted |
| `boom_town` | Boom Town | Targeted |
| `windfall_tax` | Windfall Tax | Targeted |
| `ipo_windfall` | IPO Windfall | Targeted |
| `climate_legislation` | Climate Legislation | Targeted |

### Disruption Deck IDs (15 Cards)

| ID | Name |
|---|---|
| `disruption_patent_troll` | Patent Troll |
| `disruption_golden_parachute` | Golden Parachute |
| `disruption_insider_trading` | Insider Trading |
| `disruption_leveraged_buyout` | Leveraged Buyout |
| `disruption_bankruptcy_protection` | Bankruptcy Protection |
| `disruption_angel_investor` | Angel Investor |
| `disruption_antitrust_exemption` | Antitrust Exemption |
| `disruption_market_manipulation` | Market Manipulation |
| `disruption_whistleblower_payoff` | Whistleblower Payoff |
| `disruption_bridge_loan` | Bridge Loan |
| `disruption_corporate_espionage` | Corporate Espionage |
| `disruption_regulatory_capture` | Regulatory Capture |
| `disruption_lobbying_win` | Lobbying Win |
| `disruption_short_squeeze` | Short Squeeze |
| `disruption_go_to_regulation` | Go to Regulation |

### Affinity Card IDs (12 Cards)

| ID | Name |
|---|---|
| `ai_pioneer` | AI Pioneer |
| `quantitative_analyst` | Quantitative Analyst |
| `esg_fund_manager` | ESG Fund Manager |
| `biotech_ip` | Biotech IP |
| `streaming_pioneer` | Streaming Pioneer |
| `last_mile_logistics` | Last Mile Logistics |
| `consumer_insights` | Consumer Insights |
| `lean_manufacturing` | Lean Manufacturing |
| `spectrum_holder` | Spectrum Holder |
| `proptech_pioneer` | PropTech Pioneer |
| `crypto_arbitrageur` | Crypto Arbitrageur |
| `founding_partner` | Founding Partner |

ID policy:

- IDs are immutable after release.
- Rename display labels without changing IDs.
- Deprecate old IDs explicitly; do not reuse deleted IDs.

---

*Version 0.8 - Game Overview and Complete Rules - Oligopoly Online*
