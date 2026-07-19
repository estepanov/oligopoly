type AiWatchingBannerProps = {
  open: boolean;
  name: string;
  summary?: string;
  onSkip: () => void;
};

export function AiWatchingBanner({
  open,
  name,
  summary,
  onSkip,
}: AiWatchingBannerProps) {
  if (!open) return null;

  return (
    <div className="aiWatchingBanner" role="status">
      <div className="aiWatchingCopy">
        <strong>Watching · {name}</strong>
        {summary && <span className="muted">{summary}</span>}
      </div>
      <button type="button" className="button buttonSecondary" onClick={onSkip}>
        Skip
      </button>
    </div>
  );
}
