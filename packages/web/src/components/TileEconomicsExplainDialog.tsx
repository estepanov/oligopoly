import type { GameState } from "@oligopoly/validation";
import { formatCurrencyAmount } from "../lib/gameDisplay";
import type { TileEconomics } from "../lib/tileEconomics";
import { InfoDialog } from "./InfoDialog";

type CurrencySettings = GameState["settings"];

type ExplainMode = "develop" | "mortgage" | "redeem";

type TileEconomicsExplainDialogProps = {
  mode: ExplainMode;
  tileName: string;
  economics: TileEconomics;
  currencySettings: CurrencySettings;
  /** Current on-tile token count; used only when mode is `"develop"`. */
  developmentTokensOnTile: number;
};

export function TileEconomicsExplainDialog({
  mode,
  tileName,
  economics,
  currencySettings,
  developmentTokensOnTile,
}: TileEconomicsExplainDialogProps) {
  const cur = currencySettings ?? { currencySymbol: "$" };
  if (mode === "develop") {
    return (
      <InfoDialog
        title={`Develop ${tileName}`}
        triggerLabel={`Explain developing ${tileName}`}
      >
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
            {developmentTokensOnTile} of {economics.maxDevelopmentTokens} tokens
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
      </InfoDialog>
    );
  }

  if (mode === "mortgage") {
    return (
      <InfoDialog
        title={`Mortgage ${tileName}`}
        triggerLabel={`Explain mortgaging ${tileName}`}
      >
        <div className="economicsCallout">
          <span className="economicsLabel">You receive</span>
          <strong>{economics.formattedAvailableMortgageValue}</strong>
        </div>
        <dl className="detailsGrid">
          <dt className="muted">Tile value</dt>
          <dd>{economics.formattedTileCost}</dd>
          <dt className="muted">Mortgage rate</dt>
          <dd>{Math.round(economics.availableMortgageRate * 100)}%</dd>
          {economics.syntheticCdoActive &&
            economics.availableMortgageValue !== null &&
            economics.standardMortgageValue !== null && (
              <>
                <dt className="muted">Synthetic CDO bonus</dt>
                <dd>
                  +
                  {formatCurrencyAmount(
                    economics.availableMortgageValue -
                      economics.standardMortgageValue,
                    cur,
                  )}{" "}
                  this round
                </dd>
              </>
            )}
        </dl>
        <p>
          The tile stays yours, but it cannot collect rent, be traded, or
          receive development until redeemed.
        </p>
      </InfoDialog>
    );
  }

  return (
    <InfoDialog
      title={`Redeem ${tileName}`}
      triggerLabel={`Explain redeeming ${tileName}`}
    >
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
          {Math.round(economics.redemptionRate * 100)}% of stored mortgage value
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
    </InfoDialog>
  );
}
