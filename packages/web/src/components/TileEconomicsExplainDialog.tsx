import type { GameState } from "@oligopoly/validation";
import type { TileEconomics } from "../lib/tileEconomics";
import { InfoDialog } from "./InfoDialog";
import {
  TileEconomicsExplainContent,
  type TileEconomicsExplainContentProps,
} from "./TileEconomicsExplainContent";

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

function explainProps(
  mode: ExplainMode,
  economics: TileEconomics,
  currencySettings: CurrencySettings,
  developmentTokensOnTile: number,
): TileEconomicsExplainContentProps {
  if (mode === "develop") {
    return {
      mode: "develop",
      economics,
      currencySettings,
      developmentTokensOnTile,
    };
  }
  if (mode === "mortgage") {
    return { mode: "mortgage", economics, currencySettings };
  }
  return { mode: "redeem", economics, currencySettings };
}

export function TileEconomicsExplainDialog({
  mode,
  tileName,
  economics,
  currencySettings,
  developmentTokensOnTile,
}: TileEconomicsExplainDialogProps) {
  const title =
    mode === "develop"
      ? `Develop ${tileName}`
      : mode === "mortgage"
        ? `Mortgage ${tileName}`
        : `Redeem ${tileName}`;
  const triggerLabel =
    mode === "develop"
      ? `Explain developing ${tileName}`
      : mode === "mortgage"
        ? `Explain mortgaging ${tileName}`
        : `Explain redeeming ${tileName}`;

  return (
    <InfoDialog title={title} triggerLabel={triggerLabel}>
      <TileEconomicsExplainContent
        {...explainProps(
          mode,
          economics,
          currencySettings,
          developmentTokensOnTile,
        )}
      />
    </InfoDialog>
  );
}
