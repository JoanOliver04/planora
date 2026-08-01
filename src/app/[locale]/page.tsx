import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link, routing } from "@/i18n/routing";

const copy = {
  es: {
    nav: ["Producto", "Privacidad", "Capturas"],
    signIn: "Continuar con Google",
    demo: "Probar demo gratis",
    eyebrow: "Planificación que se adapta a ti",
    title: "Tu vida cambia. Tu planificación también.",
    lead: "Organiza estudios, trabajo, hábitos y vida personal sin forzarte a seguir un sistema rígido.",
    trust: "Sin registro para la demo · Datos aislados · Sin publicidad",
    benefitsTitle: "Menos fricción. Más claridad.",
    benefits: [
      [
        "Todo en su sitio",
        "Tareas, eventos y rutinas conviven en una vista clara de tu día y tu semana.",
      ],
      [
        "Realmente tuyo",
        "Adapta colores, densidad, navegación, horarios y comportamiento a tu forma de pensar.",
      ],
      [
        "Siempre contigo",
        "Tus cambios se sincronizan de forma segura entre dispositivos con tu cuenta.",
      ],
    ],
    previewEyebrow: "Producto real, datos de demostración",
    previewTitle: "Entiende tu semana de un vistazo",
    previewBody:
      "Explora todas las funciones con datos locales. Nada de lo que hagas en la demo modifica cuentas reales.",
    privacyTitle: "Tu agenda no es un producto",
    privacyBody:
      "Planora guarda únicamente lo necesario para darte el servicio. La demo vive en tu navegador y se elimina automáticamente.",
    privacyPoints: [
      "Acceso seguro con Google",
      "Datos separados por usuario",
      "Control para exportar o eliminar",
    ],
    finalTitle: "Empieza con una semana más tranquila",
    finalBody:
      "Entra en la demo en segundos o sincroniza tu espacio con Google.",
    desktopAlt: "Vista de escritorio de Planora con tareas y agenda del día",
    mobileAlt: "Vista móvil de Planora con la planificación semanal",
    language: "English",
  },
  en: {
    nav: ["Product", "Privacy", "Screenshots"],
    signIn: "Continue with Google",
    demo: "Try the free demo",
    eyebrow: "Planning that adapts to you",
    title: "Your life changes. Your planning should too.",
    lead: "Organize studies, work, habits and personal life without forcing yourself into a rigid system.",
    trust: "No sign-up for demo · Isolated data · No ads",
    benefitsTitle: "Less friction. More clarity.",
    benefits: [
      [
        "Everything in place",
        "Tasks, events and routines live together in a clear view of your day and week.",
      ],
      [
        "Truly yours",
        "Adapt colors, density, navigation, schedules and behavior to the way you think.",
      ],
      [
        "Always with you",
        "Your changes sync securely across devices through your account.",
      ],
    ],
    previewEyebrow: "Real product, demonstration data",
    previewTitle: "Understand your week at a glance",
    previewBody:
      "Explore every feature with local data. Nothing you do in the demo changes real accounts.",
    privacyTitle: "Your schedule is not a product",
    privacyBody:
      "Planora stores only what is needed to provide the service. Demo data stays in your browser and expires automatically.",
    privacyPoints: [
      "Secure Google sign-in",
      "User-isolated data",
      "Export and deletion controls",
    ],
    finalTitle: "Start building a calmer week",
    finalBody: "Enter the demo in seconds or sync your workspace with Google.",
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
    title: language === "es" ? "Planifica a tu manera" : "Plan your way",
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
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link
          href="/"
          locale={language}
          className="landing-brand"
          aria-label="Planora"
        >
          <Image src="/assets/logo.png" width={38} height={38} alt="" />
          <span>Planora</span>
        </Link>
        <nav aria-label="Principal">
          <a href="#product">{text.nav[0]}</a>
          <a href="#privacy">{text.nav[1]}</a>
          <a href="#screenshots">{text.nav[2]}</a>
        </nav>
        <div className="landing-nav-actions">
          <Link href="/" locale={otherLocale} className="landing-language">
            {text.language}
          </Link>
          <Link href="/login" locale={language} className="button secondary">
            {text.signIn}
          </Link>
        </div>
      </header>
      <section className="landing-hero" id="product">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="landing-lead">{text.lead}</p>
          <div className="landing-actions">
            <Link
              href="/demo/today"
              locale={language}
              className="button primary"
            >
              {text.demo}
            </Link>
            <Link href="/login" locale={language} className="button secondary">
              {text.signIn}
            </Link>
          </div>
          <p className="landing-trust">{text.trust}</p>
        </div>
        <div className="landing-hero-visual" aria-hidden="true">
          <div className="landing-orbit orbit-one" />
          <div className="landing-orbit orbit-two" />
          <Image
            src="/assets/logo.png"
            width={220}
            height={220}
            alt=""
            preload
          />
        </div>
      </section>
      <section className="landing-benefits" aria-labelledby="benefits-title">
        <h2 id="benefits-title">{text.benefitsTitle}</h2>
        <div className="landing-card-grid">
          {text.benefits.map(([title, body], index) => (
            <article className="landing-card" key={title}>
              <span aria-hidden="true">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
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
            href="/demo/week"
            locale={language}
            className="landing-text-link"
          >
            {text.demo} →
          </Link>
        </div>
        <div className="landing-screens">
          <div className="landing-desktop-shot">
            <Image
              src="/assets/planora-desktop.png"
              width={1440}
              height={900}
              sizes="(max-width: 900px) 92vw, 62vw"
              alt={text.desktopAlt}
            />
          </div>
          <div className="landing-mobile-shot">
            <Image
              src="/assets/planora-mobile.png"
              width={390}
              height={844}
              sizes="180px"
              alt={text.mobileAlt}
            />
          </div>
        </div>
      </section>
      <section className="landing-privacy" id="privacy">
        <div>
          <p className="landing-eyebrow">Privacy by design</p>
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
          <Link href="/demo/today" locale={language} className="button primary">
            {text.demo}
          </Link>
          <Link href="/login" locale={language} className="button secondary">
            {text.signIn}
          </Link>
        </div>
      </section>
      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Planora</span>
        <span>{text.trust}</span>
        <Link href="/privacy" locale={language}>{language === "es" ? "Privacidad" : "Privacy"}</Link>
        <Link href="/terms" locale={language}>{language === "es" ? "Condiciones" : "Terms"}</Link>
      </footer>
    </main>
  );
}
