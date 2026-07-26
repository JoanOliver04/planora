"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
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
