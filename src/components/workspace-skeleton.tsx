export function WorkspaceSkeleton() {
  return (
    <div className="workspace-skeleton" aria-busy="true" aria-label="Loading">
      <div className="skeleton-header">
        <div>
          <span className="skeleton-line skeleton-kicker" />
          <span className="skeleton-line skeleton-title" />
        </div>
        <span className="skeleton-button" />
      </div>
      <div className="skeleton-progress surface">
        <div>
          <span className="skeleton-line skeleton-kicker" />
          <span className="skeleton-line skeleton-heading" />
          <span className="skeleton-line skeleton-copy" />
        </div>
        <span className="skeleton-ring" />
      </div>
      <div className="skeleton-section">
        <span className="skeleton-line skeleton-heading" />
        {[0, 1, 2].map((item) => (
          <div className="skeleton-task surface" key={item}>
            <span className="skeleton-avatar" />
            <div>
              <span className="skeleton-line skeleton-copy" />
              <span className="skeleton-line skeleton-kicker" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
