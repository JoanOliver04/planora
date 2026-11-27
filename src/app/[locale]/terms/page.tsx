import { siteConfig } from "@/config/site";
import { LegalBackLink } from "@/components/legal-back-link";
import { StudioCredit } from "@/components/studio-credit";
export default async function Terms({
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
      <h1>{es ? "Condiciones de uso" : "Terms of use"}</h1>
      <p>
        {es
          ? "Última actualización: 27 de noviembre de 2026"
          : "Last updated: 27 November 2026"}
      </p>
      <h2>
        {es ? "Acceso y uso de la agenda" : "Access and use of the planner"}
      </h2>
      <p>
        {es
          ? "Planora es una herramienta de organización personal de JVOR Studios. Puedes explorar sus funciones con la agenda de ejemplo. Para crear tu agenda personal y sincronizarla entre dispositivos, regístrate con Google. En visitas posteriores utiliza la misma cuenta."
          : "Planora is a personal planning tool by JVOR Studios. You can explore its features with the sample planner. To create your personal planner and sync it across devices, register with Google. Use the same account on later visits."}
      </p>
      <h2>{es ? "Tu cuenta y tus contenidos" : "Your account and content"}</h2>
      <p>
        {es
          ? "Protege el acceso a tu cuenta de Google. Utiliza el servicio de forma lícita, respeta la privacidad de otras personas y guarda únicamente contenido que tengas derecho a utilizar. Conservas tus derechos sobre las tareas, notas y demás material que añadas."
          : "Keep your Google account secure. Use the service lawfully, respect other people’s privacy and store only content you have the right to use. You retain your rights to the tasks, notes and other material you add."}
      </p>
      <h2>{es ? "Disponibilidad y copias" : "Availability and backups"}</h2>
      <p>
        {es
          ? "El servicio se proporciona sin garantía de disponibilidad ininterrumpida. No debe utilizarse como sistema crítico médico, financiero o de emergencias. Exporta copias periódicas de los datos importantes."
          : "The service is provided without a guarantee of uninterrupted availability. It must not be used as a medical, financial, or emergency-critical system. Export important data regularly."}
      </p>
      <p>
        {es
          ? "Puedes dejar de usar Planora y eliminar tu cuenta en cualquier momento. Estas condiciones pueden actualizarse cuando cambie el servicio."
          : "You may stop using Planora and delete your account at any time. These terms may be updated when the service changes."}
      </p>
      <h2>{es ? "Contacto" : "Contact"}</h2>
      <p>
        {es
          ? "Para cualquier consulta sobre estas condiciones, escribe a "
          : "For questions about these terms, email "}
        <a href={"mailto:" + siteConfig.supportEmail}>
          {siteConfig.supportEmail}
        </a>
        .
      </p>
      <footer className="legal-credit">
        <StudioCredit locale={locale} copyright />
      </footer>
    </main>
  );
}
