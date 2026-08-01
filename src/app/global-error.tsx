"use client";

import { useEffect } from "react";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { void fetch("/api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "error", path: location.pathname, message: error.name, context: { digest: error.digest } }) }); }, [error]);
  return (
    <html lang="es">
      <body>
        <main className="login">
          <section className="surface empty" role="alert">
            <h1>Algo ha salido mal</h1>
            <p className="muted">No se ha perdido ningún cambio guardado.</p>
            <button className="primary" type="button" onClick={reset}>
              Volver a intentarlo
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
