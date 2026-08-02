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
          ? "Última actualización: 2 de agosto de 2026"
          : "Last updated: 2 August 2026"}
      </p>
      <h2>{es ? "Datos que tratamos" : "Data we process"}</h2>
      <p>
        {es
          ? "Google proporciona nombre, correo y foto para identificar la cuenta. Planora almacena la planificación que creas y las preferencias necesarias para prestar el servicio."
          : "Google provides name, email and photo to identify your account. Planora stores the planning data you create and the preferences required to provide the service."}
      </p>
      <h2>{es ? "Analítica de uso" : "Usage analytics"}</h2>
      <p>
        {es
          ? "Planora utiliza Vercel Web Analytics para conocer el uso general y mejorar la aplicación. Recopila métricas agregadas y anonimizadas, como páginas visitadas, procedencia general, país, navegador, sistema operativo y tipo de dispositivo, sin cookies de seguimiento. No enviamos a esta analítica el contenido personal de tareas, eventos o notas."
          : "Planora uses Vercel Web Analytics to understand general usage and improve the application. It collects aggregated, anonymized metrics such as visited pages, general referrers, country, browser, operating system and device type, without tracking cookies. We do not send the personal content of tasks, events or notes to this analytics service."}
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
