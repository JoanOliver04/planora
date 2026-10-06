"use client";

import { useEffect } from "react";
import { recoverClientError } from "@/lib/recover-client-error";

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  retry?: () => void;
}) {
  useEffect(() => {
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "error",
        path: location.pathname,
        message: error.name,
        context: { digest: error.digest },
      }),
    });
  }, [error]);

  function recover() {
    // Drop the toast burst and any preview before rendering again.
    // Neither is stored, so this does not repeat the click that failed.
    recoverClientError();
    const retryRender = retry ?? reset;
    if (retryRender) retryRender();
    else location.reload();
  }

  return (
    <html lang="es">
      <body>
        <main className="login">
          <section className="surface empty" role="alert">
            <h1>Algo ha salido mal</h1>
            <p className="muted">No se ha perdido ningún cambio guardado.</p>
            <button className="primary" type="button" onClick={recover}>
              Volver a intentarlo
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
