import { siteConfig } from "@/config/site";
import { LegalBackLink } from "@/components/legal-back-link";
import { StudioCredit } from "@/components/studio-credit";

export default async function Privacy({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ locale }, { from }] = await Promise.all([params, searchParams]);
  const es = locale === "es";

  return (
    <main className="legal-page">
      <LegalBackLink locale={locale} from={from} />
      <h1>{es ? "Política de privacidad" : "Privacy policy"}</h1>
      <p>
        {es
          ? "Última actualización: 27 de noviembre de 2026"
          : "Last updated: 27 November 2026"}
      </p>
      <h2>{es ? "Quién gestiona Planora" : "Who runs Planora"}</h2>
      <p>
        {es
          ? "Planora es un proyecto de JVOR Studios. Para consultas sobre tus datos, escribe a "
          : "Planora is a JVOR Studios project. For questions about your data, email "}
        <a href={"mailto:" + siteConfig.supportEmail}>
          {siteConfig.supportEmail}
        </a>
        .
      </p>
      <h2>{es ? "La agenda de demostración" : "The demo planner"}</h2>
      <p>
        {es
          ? "La demo usa datos de ejemplo. Los cambios se guardan en el almacenamiento local del navegador y la agenda de muestra caduca a las 24 horas. Puedes reiniciarla antes desde los ajustes de la demo. Tu agenda personal se guarda por separado."
          : "The demo uses sample data. Changes are saved in browser storage and the sample planner expires after 24 hours. You can reset it sooner in demo settings. Your personal planner is stored separately."}
      </p>
      <h2>
        {es
          ? "Tu cuenta y tu agenda personal"
          : "Your account and personal planner"}
      </h2>
      <p>
        {es
          ? "La primera vez que continúas con Google se crea tu cuenta de Planora. Utilizamos tu identificador y correo para darte acceso, además del nombre y la foto si Google los facilita. Las cookies de sesión te mantienen identificado. Para prestarte el servicio que solicitas, guardamos tus tareas, rutinas, eventos y preferencias y los sincronizamos entre tus dispositivos."
          : "Continuing with Google for the first time creates your Planora account. We use your identifier and email to give you access, along with your name and photo if Google provides them. Session cookies keep you signed in. To provide the service you request, we store your tasks, routines, events and preferences and sync them across your devices."}
      </p>
      <h2>
        {es ? "Enfoque (sesiones y notas)" : "Focus (sessions and notes)"}
      </h2>
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
      <h2>
        {es ? "Recordatorios en tus dispositivos" : "Reminders on your devices"}
      </h2>
      <p>
        {es
          ? "Si activas las notificaciones push, guardamos la dirección de entrega y las claves de la suscripción de ese navegador para enviarte los avisos que elijas. Puedes desactivar la suscripción en Planora o retirar el permiso en tu navegador."
          : "If you enable push notifications, we store the delivery address and subscription keys for that browser to send the reminders you choose. You can disable the subscription in Planora or revoke permission in your browser."}
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
          ? "Conservamos tu agenda para que puedas seguir utilizándola mientras mantengas la cuenta. Desde Ajustes puedes descargar una copia o eliminar la cuenta y sus datos. La eliminación requiere que hayas iniciado sesión recientemente. Los archivos ya exportados siguen en el dispositivo donde los guardaste. No vendemos datos ni mostramos publicidad."
          : "We keep your planner available while you have an account. In Settings you can download a copy or delete your account and its data. Deletion requires a recent sign-in. Previously exported files stay on the device where you saved them. We do not sell data or show advertising."}
      </p>
      <h2>{es ? "Proveedores del servicio" : "Service providers"}</h2>
      <p>
        {es
          ? "Google permite identificarte. Supabase gestiona la sesión y aloja la base de datos. Vercel sirve la aplicación y proporciona la analítica web. Para mantener el servicio y diagnosticar fallos se procesan datos técnicos de las solicitudes y de los errores."
          : "Google provides sign-in. Supabase manages sessions and hosts the database. Vercel serves the application and provides web analytics. Technical request and error data is processed to run the service and diagnose problems."}
      </p>
      <h2>
        {es ? "Cómo ejercer tus derechos" : "How to exercise your rights"}
      </h2>
      <p>
        {es
          ? "Puedes pedir acceso, rectificación, supresión, limitación, oposición o portabilidad, según corresponda. Escribe al correo de privacidad indicando la cuenta y lo que necesitas. Si consideras que el tratamiento vulnera tus derechos, puedes reclamar ante la "
          : "You can request access, correction, deletion, restriction or portability, or object to processing, as applicable. Email the privacy contact with the account concerned and your request. If you believe your rights have been infringed, you can lodge a complaint with the "}
        <a href="https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos">
          {es
            ? "Agencia Española de Protección de Datos"
            : "Spanish Data Protection Agency"}
        </a>
        .
      </p>
      <footer className="legal-credit">
        <StudioCredit locale={locale} copyright />
      </footer>
    </main>
  );
}
