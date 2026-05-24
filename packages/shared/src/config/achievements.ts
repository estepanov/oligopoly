export const ACHIEVEMENTS_REGISTRY = {
  first_steps: {
    id: "first_steps",
    name: "First Steps",
    description: "Complete your first game",
    rankPoints: 5,
  },
  full_house: {
    id: "full_house",
    name: "Full House",
    description: "Complete 10 games",
    rankPoints: 10,
  },
  century_club: {
    id: "century_club",
    name: "Century Club",
    description: "Complete 100 games",
    rankPoints: 50,
  },
  champion: {
    id: "champion",
    name: "Champion",
    description: "Win your first game",
    rankPoints: 10,
  },
  dynasty: {
    id: "dynasty",
    name: "Dynasty",
    description: "Win 10 games",
    rankPoints: 25,
  },
  monopolist: {
    id: "monopolist",
    name: "Monopolist",
    description:
      "Win a game while controlling all tiles in at least 2 full sectors",
    rankPoints: 30,
  },
  deal_maker: {
    id: "deal_maker",
    name: "Deal Maker",
    description: "Complete 10 successful trades",
    rankPoints: 10,
  },
  auctioneer: {
    id: "auctioneer",
    name: "Auctioneer",
    description: "Win 25 auctions",
    rankPoints: 15,
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    description: "Win an auction by exactly 1 Capital (highest bid by 1)",
    rankPoints: 20,
  },
  diagonal_shortcut: {
    id: "diagonal_shortcut",
    name: "Diagonal Shortcut",
    description: "Take the Diagonal Express Path 10 times",
    rankPoints: 10,
  },
  flash_survivor: {
    id: "flash_survivor",
    name: "Flash Survivor",
    description:
      "Land on or pass FLASH CRASH with under 50 Capital and survive",
    rankPoints: 25,
  },
  kingmaker: {
    id: "kingmaker",
    name: "Kingmaker",
    description: "Form or join a Syndicate that goes on to win the game",
    rankPoints: 15,
  },
  loan_shark: {
    id: "loan_shark",
    name: "Loan Shark",
    description: "Mortgage and redeem 5 or more tiles in a single game",
    rankPoints: 15,
  },
  oligarchs_gambit: {
    id: "oligarchs_gambit",
    name: "Oligarch's Gambit",
    description: "Use a rank-gated optional rule for the first time in a game",
    rankPoints: 20,
  },
  perfect_attendance: {
    id: "perfect_attendance",
    name: "Perfect Attendance",
    description: "Complete 5 consecutive games without a turn timeout",
    rankPoints: 15,
  },
} as const;
