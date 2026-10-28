import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Info } from "lucide-react";
import {
  ANATOMY_ATTRIBUTION,
  manifestArchiveList,
  manifestSourceFileCount,
  manifestTreeList,
} from "@/lib/anatomy-attribution";

export const metadata: Metadata = {
  title: "Anatomy Lab model sources and licences - Lor Mentor",
  description:
    "Attribution, source provenance, and licence information for the Lor Mentor Anatomy Lab models.",
};

export default function AnatomyAttributionPage() {
  const sharedLicense = ANATOMY_ATTRIBUTION[0]?.manifest.license;

  return (
    <main className="min-h-screen bg-base">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <Link
          href="/anatomy"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Anatomy Lab
        </Link>

        <p className="mt-8 text-[11px] font-medium uppercase tracking-wide text-accent">
          Anatomy Lab
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-primary">
          Model sources and licences
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
          Anatomy Lab ships {ANATOMY_ATTRIBUTION.length} BodyParts3D 4.0-derived
          models. Each model has its own provenance manifest and detail page.
          This index links to the required credit, source archives, changes, and
          current licence status for each one.
        </p>

        <section className="mt-8 space-y-4" aria-labelledby="models-heading">
          <h2
            id="models-heading"
            className="font-display text-lg font-semibold text-primary"
          >
            Shipped models
          </h2>
          <ul className="space-y-4">
            {ANATOMY_ATTRIBUTION.map((entry) => {
              const manifest = entry.manifest;
              return (
                <li key={entry.slug}>
                  <Link
                    href={`/attribution/anatomy/${entry.slug}`}
                    className="glass-panel group block p-6 transition-colors hover:border-border-accent"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h3 className="font-display text-lg font-semibold text-primary">
                        {entry.name}
                      </h3>
                      <span
                        className={
                          entry.status === "live"
                            ? "rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
                            : "rounded-full border border-warning/20 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning"
                        }
                      >
                        {entry.status === "live" ? "Live" : "Draft"}
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs text-muted sm:grid-cols-2">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-secondary">Model:</dt>
                        <dd className="break-all font-mono">
                          {manifest.model.file}
                        </dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-secondary">
                          Structures:
                        </dt>
                        <dd>
                          {manifest.model.structures} mesh +{" "}
                          {manifest.model.textOnlyStructures} text-only (
                          {manifest.model.totalStructures} total)
                        </dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-secondary">Triangles:</dt>
                        <dd>{manifest.model.triangles.toLocaleString("en-US")}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-secondary">
                          Source files:
                        </dt>
                        <dd>{manifestSourceFileCount(manifest)}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2 sm:col-span-2">
                        <dt className="font-medium text-secondary">Trees:</dt>
                        <dd>
                          {manifestTreeList(manifest)} (
                          {manifestArchiveList(manifest)})
                        </dd>
                      </div>
                    </dl>

                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors group-hover:text-accent-hover">
                      Read source and licence details
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {sharedLicense && (
          <section className="glass-panel mt-6 p-6">
            <h2 className="font-display text-lg font-semibold text-primary">
              Required attribution
            </h2>
            <p className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm leading-relaxed text-secondary">
              {sharedLicense.notice}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              All shipped models use the same BodyParts3D source and licence
              statement. See each model&apos;s detail page for its archives and
              change record. Licence page:{" "}
              <a
                href={sharedLicense.licenseUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                BodyParts3D licence (CC BY 4.0)
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </section>
        )}

        <section className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-elevated p-5">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-secondary">
            The written anatomy content is pending faculty review. Structures
            marked &ldquo;Pending review&rdquo; in the viewer have not yet been
            signed off by a member of faculty and must not be treated as
            clinical guidance. The urinary model is an unpublished draft.
          </p>
        </section>

        <p className="mt-8 text-[11px] text-muted">
          See also the repository&apos;s <code>THIRD_PARTY_NOTICES.md</code> and{" "}
          <code>docs/anatomy/provenance/README.md</code>.
        </p>
      </div>
    </main>
  );
}
