import { Link } from "@/i18n/routing";

export default async function Privacy({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const es = locale === "es";

  return (
    <main className="legal-page">
      <Link href="/">← Planora</Link>
      <h1>{es ? "Privacidad" : "Privacy"}</h1>
      <p>
        {es
          ? "Última actualización: 7 de agosto de 2026"
          : "Last updated: 7 August 2026"}
      </p>
      <h2>{es ? "Datos que tratamos" : "Data we process"}</h2>
      <p>
        {es
          ? "Google proporciona nombre, correo y foto para identificar la cuenta. Planora almacena la planificación que creas y las preferencias necesarias para prestar el servicio."
          : "Google provides name, email and photo to identify your account. Planora stores the planning data you create and the preferences required to provide the service."}
      </p>
      <h2>{es ? "Enfoque (sesiones y notas)" : "Focus (sessions and notes)"}</h2>
      <p>
        {es
          ? "Las sesiones de Enfoque, intervalos, presets, objetivos semanales, notas privadas y distracciones aparcadas se guardan en tu cuenta. Forman parte de la exportación JSON completa («Tus datos»). El CSV de análisis omite notas y distracciones por defecto y, si existen, las ofrece en un archivo aparte claramente marcado como privado. No enviamos títulos, notas ni contenido de sesión a la analítica de producto."
          : "Focus sessions, intervals, presets, weekly goals, private notes and parked distractions are stored in your account. They are included in the full JSON export (“Your data”). Analysis CSV omits notes and distractions by default and, when present, offers them in a separate file clearly marked private. We do not send session titles, notes or Focus content to product analytics."}
      </p>
      <p>
        {es
          ? "Al restaurar una copia de seguridad, las sesiones que estaban en curso se guardan como canceladas (con el tiempo ya acumulado) para no reactivar temporizadores ni avisos del sistema sin tu acción. Los permisos de notificación del navegador no se restauran automáticamente."
          : "When you restore a backup, sessions that were in progress are saved as cancelled (keeping any accumulated time) so timers and system alerts are not reactivated without your action. Browser notification permissions are never restored automatically."}
      </p>
      <h2>{es ? "Analítica de uso" : "Usage analytics"}</h2>
      <p>
        {es
          ? "Planora utiliza Vercel Web Analytics para conocer el uso general y mejorar la aplicación. Recopila métricas agregadas y anonimizadas, como páginas visitadas, procedencia general, país, navegador, sistema operativo y tipo de dispositivo, sin cookies de seguimiento. No enviamos a esta analítica el contenido personal de tareas, eventos, notas ni sesiones de Enfoque."
          : "Planora uses Vercel Web Analytics to understand general usage and improve the application. It collects aggregated, anonymized metrics such as visited pages, general referrers, country, browser, operating system and device type, without tracking cookies. We do not send the personal content of tasks, events, notes or Focus sessions to this analytics service."}
      </p>
      <h2>{es ? "Uso y conservación" : "Use and retention"}</h2>
      <p>
        {es
          ? "No vendemos datos ni mostramos publicidad. Puedes exportar tus datos o eliminar tu cuenta desde los ajustes."
          : "We do not sell data or show advertising. You can export your data or delete your account from settings."}
      </p>
      <h2>{es ? "Proveedores y contacto" : "Providers and contact"}</h2>
      <p>
        {es
          ? "Supabase aloja la autenticación y la base de datos; Vercel aloja la aplicación y proporciona la analítica web. Para consultas, abre una incidencia privada en el repositorio del proyecto."
          : "Supabase hosts authentication and the database; Vercel hosts the application and provides web analytics. For questions, open a private issue in the project repository."}
      </p>
    </main>
  );
}
