import {
  LANDING_DISCLAIMER,
  LANDING_FAQ,
  LANDING_FEATURES,
  LANDING_INTRO,
} from "@/components/landing/landing-content";

/**
 * FAQPage structured data for `LANDING_FAQ`, built once at module load. The
 * `<` escape hardens against the copy ever containing a literal `</script>`.
 */
const FAQ_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: LANDING_FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}).replace(/</g, "\\u003c");

/**
 * LandingSection — below-fold SEO content shown only in the chat empty state
 * (see `page.tsx`). Purely presentational: no hooks, no `"use client"` — it
 * is bundled into the client page but renders identically on the server, so
 * this crawlable copy is present in the initial HTML.
 */
export default function LandingSection() {
  return (
    <section className="landing" data-testid="landing" aria-label="About Oak">
      <div className="landing__inner">
        <h2 className="landing__heading">What is Oak?</h2>
        <p className="landing__blurb">{LANDING_INTRO}</p>

        <h2 className="landing__heading">What Oak can do</h2>
        <ul className="landing__features">
          {LANDING_FEATURES.map((feature) => (
            <li className="landing__feature" key={feature.title}>
              <h3 className="landing__feature-title">{feature.title}</h3>
              <p className="landing__feature-body">{feature.body}</p>
            </li>
          ))}
        </ul>

        <h2 className="landing__heading">FAQ</h2>
        {LANDING_FAQ.map((entry) => (
          <details className="landing__faq-item" key={entry.q}>
            <summary className="landing__faq-q">{entry.q}</summary>
            <p className="landing__faq-a">{entry.a}</p>
          </details>
        ))}
      </div>

      <footer className="landing__footer">
        © 2026 Oak
        <span className="landing__footer-sep" aria-hidden="true">
          ·
        </span>
        <span className="landing__footer-disclaimer">{LANDING_DISCLAIMER}</span>
        <span className="landing__footer-sep" aria-hidden="true">
          ·
        </span>
        <a href="/privacy">Privacy</a>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: FAQ_JSONLD }}
      />
    </section>
  );
}
