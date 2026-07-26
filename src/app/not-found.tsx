import Link from "next/link";
export default function NotFound() {
  return (
    <main className="login">
      <div className="empty surface" style={{ maxWidth: 540 }}>
        <div style={{ fontSize: 60 }}>🧭</div>
        <h1>404</h1>
        <p className="muted">This page could not be found.</p>
        <Link className="primary" href="/">
          Planora
        </Link>
      </div>
    </main>
  );
}
