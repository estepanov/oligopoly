import type { GameState } from "@oligopoly/validation";
import {
  canParticipateInAuction,
  hasSubmittedAuction,
  isAuctionPhase,
  isMyTurn,
} from "./gameUi";

export type GameActionAvailability = {
  canDrawMarketEvent?: boolean;
  canRollDice?: boolean;
  canResolvePurchase?: boolean;
  canChoosePath?: boolean;
  canEndTurn?: boolean;
};

export type GameStepDescriptor = {
  guidance: string | null;
  eyebrow: string;
  title: string;
  description: string;
  coaching: string;
};

const DEFAULT_GAME_STEP_DESCRIPTOR: GameStepDescriptor = {
  guidance: null,
  eyebrow: "Resolving",
  title: "Game state is updating",
  description:
    "A server-controlled step is being applied before the next player action.",
  coaching:
    "Watch the game log for the result, then the next available action will appear here.",
};

const PHASE_STEP_DESCRIPTORS: Partial<
  Record<NonNullable<GameState["phase"]>, GameStepDescriptor>
> = {
  waiting_for_market_event: {
    guidance: "Draw the market event to start the round.",
    eyebrow: "Recovery",
    title: "Retry the market event draw",
    description:
      "This legacy state needs one manual retry before the turn can continue.",
    coaching: "Normal turns draw market events automatically before the roll.",
  },
  waiting_for_roll: {
    guidance: "Roll the dice to move.",
    eyebrow: "Movement",
    title: "Roll to move",
    description:
      "The server rolls the dice and moves you to the next tile effect.",
    coaching:
      "Passing START collects capital. Doubles can give you another roll.",
  },
  rolling_doubles: {
    guidance: "You rolled doubles — roll again!",
    eyebrow: "Doubles",
    title: "Roll again",
    description:
      "You resolved the landing tile and earned another movement roll.",
    coaching:
      "Three doubles in a row sends you directly to the Regulation Zone.",
  },
  waiting_for_buy: {
    guidance: "Buy this tile or decline it (declining starts an auction).",
    eyebrow: "Right of first refusal",
    title: "Buy the tile or open an auction",
    description:
      "You landed on an unowned tile and get the first chance to buy it at face value.",
    coaching:
      "Buying adds the tile now. Declining starts an auction where every eligible player can compete.",
  },
  waiting_for_path_choice: {
    guidance: "Choose the perimeter or diagonal path.",
    eyebrow: "Route choice",
    title: "Choose your route",
    description:
      "Pick where your next movement should continue from the corner.",
    coaching:
      "Perimeter keeps you on the outer board. Diagonal is a shorter express route with different tile pressure.",
  },
  action: {
    guidance:
      "Develop or mortgage your tiles, make a deal, then end your turn.",
    eyebrow: "Action points",
    title: "Improve your position or end turn",
    description:
      "Your movement is resolved. Optional actions can develop, finance, negotiate, or set up auctions.",
    coaching:
      "Spend action points only when the payoff is clear; ending the turn is always valid when you are done.",
  },
  game_over: {
    guidance: null,
    eyebrow: "Complete",
    title: "Game over",
    description: "The table has a winner.",
    coaching: "Review the final standings and start a new lobby when ready.",
  },
};

function phaseStepDescriptor(phase: GameState["phase"]): GameStepDescriptor {
  return phase
    ? (PHASE_STEP_DESCRIPTORS[phase] ?? DEFAULT_GAME_STEP_DESCRIPTOR)
    : DEFAULT_GAME_STEP_DESCRIPTOR;
}

/**
 * Short, action-oriented guidance for the player whose turn it is, based on the
 * current phase. Returns null when there is no specific prompt (e.g. it is not
 * the player's turn, or a dedicated panel already covers the phase).
 */
export function turnGuidance(
  state: GameState,
  myPlayerId: string | null,
): string | null {
  if (!isMyTurn(state, myPlayerId)) return null;
  return describeGameStep(state, myPlayerId).guidance;
}

function auctionCoaching(state: GameState): string {
  const auctionType = state.pendingAuction?.auctionType;
  if (state.phase === "waiting_for_auction_settle") {
    return "Bids are locked. The result will reveal who won, what they paid, or whether the tile stayed unowned.";
  }
  if (auctionType === "live_bidding") {
    return "Live bids stay visible and the clock extends after higher bids, so bid only what you can afford to keep committed.";
  }
  if (auctionType === "open_bids") {
    return "Open bids are visible and cannot be retracted. Passing keeps your capital available for later turns.";
  }
  return "Sealed bids stay hidden until reveal. Bid your true limit or pass; ties can trigger another sealed round.";
}

function auctionGameStepDescriptor(
  state: GameState,
  myPlayerId: string | null,
): GameStepDescriptor {
  if (state.phase === "waiting_for_auction_settle") {
    return {
      guidance: null,
      eyebrow: "Auction reveal",
      title: "Waiting for auction results",
      description: "Bids are locked while the server resolves the winning bid.",
      coaching: auctionCoaching(state),
    };
  }

  const eligible = canParticipateInAuction(state, myPlayerId);
  const submitted = hasSubmittedAuction(state, myPlayerId);
  const auctionType = state.pendingAuction?.auctionType;

  if (!myPlayerId) {
    return {
      guidance: null,
      eyebrow: "Auction",
      title: "Auction in progress",
      description: "Players are competing for an unowned tile at the table.",
      coaching:
        "Sign in as a seated player to submit bids when you are eligible.",
    };
  }

  if (!eligible) {
    return {
      guidance: null,
      eyebrow: "Auction",
      title: "Watch the auction",
      description:
        "You are not eligible to bid in this auction, but the result can still change the board.",
      coaching:
        "Track who wins and how much capital they spend before your next turn.",
    };
  }

  if (auctionType !== "live_bidding" && submitted) {
    return {
      guidance: null,
      eyebrow: "Auction",
      title: "Bid submitted",
      description:
        auctionType === "open_bids"
          ? "Your open bid is locked in for this auction."
          : "Your sealed bid is submitted and hidden until reveal.",
      coaching:
        "No further action is needed unless the auction enters a tie-break round.",
    };
  }

  return {
    guidance: "Submit an auction bid or pass.",
    eyebrow:
      auctionType === "live_bidding"
        ? "Live auction"
        : auctionType === "open_bids"
          ? "Open auction"
          : "Sealed auction",
    title:
      auctionType === "live_bidding" && submitted
        ? "Raise your bid or hold"
        : "Decide your bid",
    description: "An eligible tile is open for competitive bidding.",
    coaching: auctionCoaching(state),
  };
}

export function describeGameStep(
  state: GameState,
  myPlayerId: string | null,
): GameStepDescriptor {
  if (isAuctionPhase(state)) {
    return auctionGameStepDescriptor(state, myPlayerId);
  }

  if (!myPlayerId) {
    return {
      guidance: null,
      eyebrow: "Viewing only",
      title: "Sign in as a player to act",
      description:
        "This game is visible, but only seated participants can submit turn actions.",
      coaching:
        "Once you are in a seat, this panel will show the exact next decision.",
    };
  }

  if (!isMyTurn(state, myPlayerId)) {
    return {
      guidance: null,
      eyebrow: "Stand by",
      title: "Another player is taking their turn",
      description:
        "The board and log will update automatically when the active player acts.",
      coaching:
        "Use this pause to scan cash, owned tiles, and any upcoming auction opportunities.",
    };
  }

  return phaseStepDescriptor(state.phase);
}

export function gameActionAvailability(
  state: GameState,
  myPlayerId: string | null,
): GameActionAvailability {
  if (!isMyTurn(state, myPlayerId) || isAuctionPhase(state)) {
    return {};
  }

  switch (state.phase) {
    case "waiting_for_market_event":
      return { canDrawMarketEvent: true };
    case "waiting_for_roll":
    case "rolling_doubles":
      return { canRollDice: true };
    case "waiting_for_buy":
      return { canResolvePurchase: true };
    case "waiting_for_path_choice":
      return { canChoosePath: true };
    case "action":
      return { canEndTurn: true };
    default:
      return {};
  }
}
