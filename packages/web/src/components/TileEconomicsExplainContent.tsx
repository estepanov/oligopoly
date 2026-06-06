import type { GameState } from "@oligopoly/validation";
import { formatCurrencyAmount } from "../lib/gameDisplay";
import {
  mortgageEconomicsLabels,
  type TileEconomics,
} from "../lib/tileEconomics";

type CurrencySettings = GameState["settings"];

type Base = {
  economics: TileEconomics;
  currencySettings: CurrencySettings;
};

export type TileEconomicsExplainContentProps =
  | (Base & {
      mode: "develop";
      developmentTokensOnTile: number;
    })
  | (Base & { mode: "mortgage" })
  | (Base & { mode: "redeem" })
  | (Base & {
      mode: "property_overview";
      developmentTokens: number;
      mortgaged: boolean;
    });

/** Shared Synthetic CDO mortgage uplift row for economics explainers. */
export function SyntheticCdoMortgageBonusRows({
  economics,
  currencySettings,
  requireUnmortgaged,
  mortgaged,
  appendThisRound = true,
}: {
  economics: TileEconomics;
  currencySettings: CurrencySettings;
  requireUnmortgaged?: boolean;
  mortgaged?: boolean;
  /** When true, append `" this round"` (mortgage action explainer copy). */
  appendThisRound?: boolean;
}) {
  const cur = currencySettings ?? { currencySymbol: "$" };
  if (
    !economics.syntheticCdoActive ||
    economics.availableMortgageValue === null ||
    economics.standardMortgageValue === null
  ) {
    return null;
  }
  if (requireUnmortgaged && mortgaged) return null;

  const delta =
    economics.availableMortgageValue - economics.standardMortgageValue;
  const suffix = appendThisRound ? " this round" : "";

  return (
    <>
      <dt className="muted">Synthetic CDO bonus</dt>
      <dd>
        +{formatCurrencyAmount(delta, cur)}
        {suffix}
      </dd>
    </>
  );
}

export function TileEconomicsExplainContent(
  props: TileEconomicsExplainContentProps,
) {
  const { economics } = props;

  if (props.mode === "develop") {
    return (
      <>
        <div className="economicsCallout">
          <span className="economicsLabel">
            Token {economics.nextDevelopmentToken} cost
          </span>
          <strong>{economics.formattedDevelopmentCost}</strong>
        </div>
        <dl className="detailsGrid">
          <dt className="muted">Tile value</dt>
          <dd>{economics.formattedTileCost}</dd>
          <dt className="muted">Current development</dt>
          <dd>
            {props.developmentTokensOnTile} of {economics.maxDevelopmentTokens}{" "}
            tokens
          </dd>
          <dt className="muted">Action cost</dt>
          <dd>2 action points</dd>
          <dt className="muted">Modifier</dt>
          <dd>
            {economics.hasLeanDiscount
              ? "Lean Manufacturing applied: 20% development discount."
              : "No visible development discount applies."}
          </dd>
        </dl>
        <p>
          This adds the next development token to an active sector tile so
          future rent uses the higher development rent tier.
        </p>
      </>
    );
  }

  if (props.mode === "mortgage") {
    return (
      <>
        <div className="economicsCallout">
          <span className="economicsLabel">You receive</span>
          <strong>{economics.formattedAvailableMortgageValue}</strong>
        </div>
        <dl className="detailsGrid">
          <dt className="muted">Tile value</dt>
          <dd>{economics.formattedTileCost}</dd>
          <dt className="muted">Mortgage rate</dt>
          <dd>{Math.round(economics.availableMortgageRate * 100)}%</dd>
          <SyntheticCdoMortgageBonusRows
            economics={economics}
            currencySettings={props.currencySettings}
          />
        </dl>
        <p>
          The tile stays yours, but it cannot collect rent, be traded, or
          receive development until redeemed.
        </p>
      </>
    );
  }

  if (props.mode === "redeem") {
    return (
      <>
        <div className="economicsCallout">
          <span className="economicsLabel">You pay</span>
          <strong>{economics.formattedRedemptionCost}</strong>
        </div>
        <dl className="detailsGrid">
          <dt className="muted">Tile value</dt>
          <dd>{economics.formattedTileCost}</dd>
          <dt className="muted">Stored mortgage value</dt>
          <dd>{economics.formattedStoredMortgageValue}</dd>
          <dt className="muted">Mortgage rate</dt>
          <dd>{Math.round(economics.storedMortgageRate * 100)}%</dd>
          <dt className="muted">Redemption rate</dt>
          <dd>
            {Math.round(economics.redemptionRate * 100)}% of stored mortgage
            value
          </dd>
          <dt className="muted">Modifier</dt>
          <dd>
            {economics.hasPropTechDiscount
              ? "PropTech Pioneer applied: lower redemption rate."
              : "No visible redemption discount applies."}
          </dd>
        </dl>
        <p>
          Redeeming restores rent collection and makes the tile eligible for
          development again.
        </p>
      </>
    );
  }

  const { developmentTokens, mortgaged } = props;
  const { label: mortgageLabel, formattedValue: formattedMortgageValue } =
    mortgageEconomicsLabels({
      mortgaged,
      formattedStoredMortgageValue: economics.formattedStoredMortgageValue,
      formattedAvailableMortgageValue:
        economics.formattedAvailableMortgageValue,
    });

  return (
    <>
      {economics.formattedTileCost && (
        <div className="economicsCallout">
          <span className="economicsLabel">Tile value</span>
          <strong>{economics.formattedTileCost}</strong>
        </div>
      )}
      <dl className="detailsGrid">
        <dt className="muted">Current development</dt>
        <dd>
          {developmentTokens} of {economics.maxDevelopmentTokens} tokens
        </dd>
        <dt className="muted">Next token</dt>
        <dd>
          {economics.formattedDevelopmentCost ??
            "Not available while mortgaged or capped"}
        </dd>
        <dt className="muted">{mortgageLabel}</dt>
        <dd>{formattedMortgageValue ?? "Not available"}</dd>
        <SyntheticCdoMortgageBonusRows
          economics={economics}
          currencySettings={props.currencySettings}
          requireUnmortgaged
          mortgaged={mortgaged}
          appendThisRound={false}
        />
        <dt className="muted">Mortgage rate</dt>
        <dd>
          {Math.round(
            (mortgaged
              ? economics.storedMortgageRate
              : economics.availableMortgageRate) * 100,
          )}
          %
        </dd>
        <dt className="muted">Redeem cost</dt>
        <dd>{economics.formattedRedemptionCost ?? "Not available"}</dd>
      </dl>
      <p>
        Mortgage and development values are calculated from this tile's current
        state and visible modifiers. Mortgaged tiles keep tokens visible but
        cannot collect rent or be developed until redeemed.
      </p>
    </>
  );
}
