import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleCheck,
  Clock3,
  Timer,
} from "lucide-react";
import { createDemoState } from "@/features/demo/demo-store";
import { AuthLink } from "@/components/auth-link";
import { StudioCredit } from "@/components/studio-credit";
import { siteConfig } from "@/config/site";

const copy = {
  es: {
    nav: ["Producto", "Privacidad", "Vistas"],
    signIn: "Iniciar sesión",
    demo: "Probar demo gratis",
    eyebrow: "Agenda personal",
    title: "Haz sitio en tu día para concentrarte.",
    lead: "Reúne tareas, rutinas y citas en una agenda. Elige qué toca ahora y dedícale un rato de enfoque.",
    trust: "Prueba la agenda de ejemplo. Entra con Google para crear la tuya.",
    notebook: "Un día en Planora",
    moment: ["Mañana", "Tarde", "17:30"],
    benefitsTitle: "¿Qué te gustaría probar primero?",
    benefits: [
      [
        "Un plan para hoy",
        "Anota algo que tengas pendiente y márcalo al terminar. El progreso de tu día cambia contigo.",
        "Organizar mi día",
      ],
      [
        "Tiempo para una tarea",
        "Elige en qué concentrarte y prueba el temporizador de 15 segundos. Después podrás ver tu sesión en las estadísticas.",
        "Probar el enfoque",
      ],
      [
        "Una semana a la vista",
        "Encuentra el hueco entre tu rutina y la próxima cita. Añade un evento y comprueba dónde encaja.",
        "Explorar la semana",
      ],
    ],
    previewEyebrow: "En escritorio y móvil",
    previewTitle: "Tu agenda, también cuando sales de casa.",
    previewBody:
      "Consulta la semana desde el ordenador y revisa qué toca hoy desde el móvil. Con una cuenta, tu planificación se sincroniza entre dispositivos.",
    previewLink: "Abrir el calendario",
    privacyEyebrow: "Privacidad",
    privacyTitle: "Prueba con tranquilidad.",
    privacyBody:
      "Los cambios de la demo se guardan en este navegador durante 24 horas. Puedes empezar de nuevo desde Ajustes cuando quieras.",
    privacyPoints: [
      "Datos de ejemplo editables",
      "Reinicio de la demo desde Ajustes",
      "Exportación de tus datos de prueba",
    ],
    finalTitle: "¿Qué tienes pendiente hoy?",
    finalBody: "Abre la agenda de ejemplo y añade tu primera tarea.",
    desktopAlt: "Vista de escritorio de Planora con tareas y agenda del día",
    mobileAlt: "Vista móvil de Planora con la planificación semanal",
    language: "English",
  },
  en: {
    nav: ["Product", "Privacy", "Views"],
    signIn: "Sign in",
    demo: "Try the free demo",
    eyebrow: "Personal planner",
    title: "Make room in your day to focus.",
    lead: "Keep tasks, routines and appointments in one planner. Pick what comes next and give it your attention.",
    trust:
      "Explore the sample planner. Sign in with Google to create your own.",
    notebook: "A day in Planora",
    moment: ["Morning", "Afternoon", "17:30"],
    benefitsTitle: "What would you like to try first?",
    benefits: [
      [
        "A plan for today",
        "Write down something you need to do. Check it off and see your daily progress change.",
        "Plan my day",
      ],
      [
        "Time for one task",
        "Choose a task and try the 15-second focus timer. Your finished session shows up in Statistics.",
        "Try a focus session",
      ],
      [
        "Your week at a glance",
        "Find a gap between your routine and your next appointment. Add an event and see where it fits.",
        "Explore the week",
      ],
    ],
    previewEyebrow: "On desktop and mobile",
    previewTitle: "Take your planner with you.",
    previewBody:
      "Lay out the week on your computer and check what comes next on your phone. A personal account keeps your planner in sync across devices.",
    previewLink: "Open the calendar",
    privacyEyebrow: "Privacy",
    privacyTitle: "Make yourself at home.",
    privacyBody:
      "Your demo changes stay in this browser for 24 hours. You can start fresh at any time in Settings.",
    privacyPoints: [
      "Editable sample data",
      "Reset the demo in Settings",
      "Export your sample planner",
    ],
    finalTitle: "What’s on your list today?",
    finalBody: "Open the sample planner and add your first task.",
    desktopAlt: "Planora desktop view showing today's tasks and agenda",
    mobileAlt: "Planora mobile view showing the weekly plan",
    language: "Español",
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const language = locale === "en" ? "en" : "es";
  return {
    title: copy[language].title,
    description: copy[language].lead,
    alternates: { languages: { es: "/es", en: "/en" } },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "es" | "en")) notFound();
  const language = locale as "es" | "en";
  const text = copy[language];
  const otherLocale = language === "es" ? "en" : "es";
  const sample = createDemoState(new Date(), language);
  const moments = [
    { view: "today", title: sample.tasks[1].title, Icon: CircleCheck },
    { view: "focus", title: sample.tasks[2].title, Icon: Timer },
    { view: "week", title: sample.events[0].title, Icon: CalendarDays },
  ];
  const benefitViews = ["today", "focus", "week"];
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link
          href={`/${language}`}
          className="landing-brand"
          aria-label="Planora"
        >
          <Image src={siteConfig.logo.url} width={34} height={34} alt="" />
          <span>Planora</span>
        </Link>
        <nav aria-label={language === "es" ? "Principal" : "Main"}>
          <a href="#product">{text.nav[0]}</a>
          <a href="#privacy">{text.nav[1]}</a>
          <a href="#screenshots">{text.nav[2]}</a>
        </nav>
        <div className="landing-nav-actions">
          <Link
            href={`/${otherLocale}`}
            hrefLang={otherLocale}
            className="landing-language"
          >
            {text.language}
          </Link>
          <AuthLink href={`/${language}/login`} className="button secondary">
            {text.signIn}
          </AuthLink>
        </div>
      </header>
      <section className="landing-hero" id="product">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="landing-lead">{text.lead}</p>
          <div className="landing-actions">
            <Link
              href={`/${language}/demo/today`}
              prefetch={false}
              className="button primary"
            >
              {text.demo} <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
          <p className="landing-trust">{text.trust}</p>
          <StudioCredit locale={language} />
        </div>
        <div className="planner-stage">
          <div className="planner-sheet">
            <div className="planner-binding" aria-hidden="true" />
            <div className="planner-heading">
              <Clock3 size={22} aria-hidden />
              <span>Planora</span>
            </div>
            <h2>{text.notebook}</h2>
            <ul>
              {moments.map(({ view, title, Icon }, index) => (
                <li key={view}>
                  <Link href={`/${language}/demo/${view}`} prefetch={false}>
                    <span className="planner-icon">
                      <Icon size={21} aria-hidden />
                    </span>
                    <span>
                      <small>{text.moment[index]}</small>
                      <strong>{title}</strong>
                    </span>
                    <ArrowUpRight size={17} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="landing-benefits" aria-labelledby="benefits-title">
        <h2 id="benefits-title">{text.benefitsTitle}</h2>
        <div className="landing-card-grid">
          {text.benefits.map(([title, body, action], index) => (
            <article className="landing-card" key={title}>
              {index === 0 ? (
                <CircleCheck aria-hidden />
              ) : index === 1 ? (
                <Timer aria-hidden />
              ) : (
                <CalendarDays aria-hidden />
              )}
              <h3>{title}</h3>
              <p>{body}</p>
              <Link
                className="landing-card-link"
                prefetch={false}
                href={`/${language}/demo/${benefitViews[index]}`}
              >
                {action} <ArrowRight size={16} aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-preview" id="screenshots">
        <div className="landing-preview-copy">
          <p className="landing-eyebrow">{text.previewEyebrow}</p>
          <h2>{text.previewTitle}</h2>
          <p>{text.previewBody}</p>
          <Link
            href={`/${language}/demo/week`}
            prefetch={false}
            className="landing-text-link"
          >
            {text.previewLink} →
          </Link>
        </div>
        <div className="landing-screens">
          <div className="landing-desktop-shot">
            <Image
              src={
                language === "es"
                  ? "/assets/planora-desktop.png"
                  : "/assets/planora-desktop-en.webp"
              }
              width={1440}
              height={900}
              sizes="(max-width: 560px) calc(100vw - 28px), (max-width: 900px) calc(100vw - 40px), (max-width: 1220px) calc(64vw - 70px), 710px"
              alt={text.desktopAlt}
            />
          </div>
          <div className="landing-mobile-shot">
            <Image
              src={
                language === "es"
                  ? "/assets/planora-mobile.png"
                  : "/assets/planora-mobile-en.webp"
              }
              width={390}
              height={844}
              sizes="(max-width: 560px) 112px, 168px"
              alt={text.mobileAlt}
            />
          </div>
        </div>
      </section>
      <section className="landing-privacy" id="privacy">
        <div>
          <p className="landing-eyebrow">{text.privacyEyebrow}</p>
          <h2>{text.privacyTitle}</h2>
          <p>{text.privacyBody}</p>
        </div>
        <ul>
          {text.privacyPoints.map((point) => (
            <li key={point}>✓ {point}</li>
          ))}
        </ul>
      </section>
      <section className="landing-final">
        <h2>{text.finalTitle}</h2>
        <p>{text.finalBody}</p>
        <div className="landing-actions">
          <Link
            href={`/${language}/demo/today`}
            prefetch={false}
            className="button primary"
          >
            {text.demo} <ArrowRight size={18} aria-hidden />
          </Link>
          <AuthLink href={`/${language}/login`} className="button secondary">
            {text.signIn}
          </AuthLink>
        </div>
      </section>
      <footer className="landing-footer">
        <StudioCredit locale={language} copyright />
        <Link href={`/${language}/privacy`} prefetch={false}>
          {language === "es" ? "Política de privacidad" : "Privacy policy"}
        </Link>
        <Link href={`/${language}/terms`} prefetch={false}>
          {language === "es" ? "Condiciones de uso" : "Terms of use"}
        </Link>
      </footer>
    </main>
  );
}
