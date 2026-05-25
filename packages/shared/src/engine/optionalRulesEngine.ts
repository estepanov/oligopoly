export function isOptionalRuleEnabled(
  settings: Record<string, unknown> | undefined,
  ruleId: string,
): boolean {
  const optionalRuleIds = settings?.optionalRuleIds;
  return Array.isArray(optionalRuleIds) && optionalRuleIds.includes(ruleId);
}

export function regulationPenaltiesEnabled(
  settings: Record<string, unknown> | undefined,
): boolean {
  return !isOptionalRuleEnabled(settings, "no_regulation");
}
