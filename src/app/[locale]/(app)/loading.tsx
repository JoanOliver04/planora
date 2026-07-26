export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid-cards">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          className="surface"
          key={i}
          style={{ height: 110, opacity: 0.45 }}
        />
      ))}
    </div>
  );
}
