import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import {
  ANATOMY_ATTRIBUTION,
  getAnatomyAttribution,
  manifestArchiveList,
  manifestSourceFileCount,
  manifestTreeList,
} from "@/lib/anatomy-attribution";

export const dynamicParams = false;

export function generateStaticParams() {
  return ANATOMY_ATTRIBUTION.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getAnatomyAttribution(slug);
  if (!entry) {
    return { title: "Anatomy model not found - Lor Mentor" };
  }

  return {
    title: `${entry.name} model sources and licence - Lor Mentor`,
    description: `Attribution, source provenance, and licence information for the Lor Mentor Anatomy Lab ${entry.name.toLowerCase()} model.`,
  };
}

export default async function AnatomyAttributionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getAnatomyAttribution(slug);
  if (!entry) notFound();

  const { manifest } = entry;
  const sourceFileCount = manifestSourceFileCount(manifest);
  const dataset = manifest.sources[0]?.dataset ?? "BodyParts3D 4.0";
  const polygonReduction = manifest.sources[0]?.polygonReduction;

  return (
    <main className="min-h-screen bg-base">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <Link
          href="/attribution/anatomy"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-secondary transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Anatomy Lab model sources
        </Link>

        <p className="mt-8 text-[11px] font-medium uppercase tracking-wide text-accent">
          Anatomy Lab · {entry.status === "live" ? "Live model" : "Draft model"}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-primary">
          {entry.name}: model sources and licence
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
          The {entry.name.toLowerCase()} model in Anatomy Lab is built from the{" "}
          {dataset} dataset. This page records the required credit, what was
          changed, and the current licence status for{" "}
          <code>{manifest.model.file}</code>.
        </p>

        <section className="glass-panel mt-8 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            Required attribution
          </h2>
          <p className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm leading-relaxed text-secondary">
            {manifest.license.notice}
          </p>
          <dl className="mt-4 space-y-2 text-xs text-muted">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Dataset:</dt>
              <dd>
                {dataset}, {manifestTreeList(manifest)} trees
                {polygonReduction ? `, ${polygonReduction} polygon reduction` : ""}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Archives:</dt>
              <dd className="break-all">{manifestArchiveList(manifest)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Licence page:</dt>
              <dd>
                <a
                  href={manifest.license.licenseUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  BodyParts3D licence (CC BY 4.0)
                  <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Model version:</dt>
              <dd>{manifest.model.file}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Model size:</dt>
              <dd>{manifest.model.bytes.toLocaleString("en-US")} bytes</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Model SHA-256:</dt>
              <dd className="break-all font-mono">{manifest.model.sha256}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Model structures:</dt>
              <dd>
                {manifest.model.structures} mesh nodes +{" "}
                {manifest.model.textOnlyStructures} text-only structures (
                {manifest.model.totalStructures} total)
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Model triangles:</dt>
              <dd>{manifest.model.triangles.toLocaleString("en-US")}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Source files used:</dt>
              <dd>{sourceFileCount}</dd>
            </div>
            {manifest.orientation?.viewer && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-secondary">Orientation:</dt>
                <dd>{manifest.orientation.viewer}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="glass-panel mt-6 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            Source archives
          </h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-secondary">
            {manifest.sources.map((source) => (
              <li key={`${source.tree}-${source.archive}`}>
                <p className="font-medium text-primary">
                  {source.tree} · {source.archive}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {source.usedFor} The archive contains{" "}
                  {source.extractedObjFiles.toLocaleString("en-US")} OBJ files.{" "}
                  <a
                    href={source.archiveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    Archive URL
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel mt-6 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            Licence status
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            {manifest.license.status} {manifest.license.adaptedModelTerms}
          </p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
            {manifest.license.statements.map((statement) => (
              <li key={statement.source}>
                <span className="font-medium text-secondary">
                  {statement.source}:
                </span>{" "}
                {statement.statement}
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel mt-6 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            What we changed
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-secondary">
            {manifest.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          {manifest.adaptations && manifest.adaptations.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold text-primary">
                Model-specific adaptations
              </h3>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-secondary">
                {manifest.adaptations.map((adaptation) => (
                  <li key={adaptation}>{adaptation}</li>
                ))}
              </ul>
            </>
          )}
          {manifest.sharedStructures &&
            manifest.sharedStructures.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold text-primary">
                  Shared structures
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  These structures also belong to another system. The canonical
                  owner is recorded so a future whole-body view can avoid
                  drawing them twice.
                </p>
                <ul className="mt-2 space-y-2 text-xs leading-relaxed text-secondary">
                  {manifest.sharedStructures.map((structure) => (
                    <li key={structure.slug}>
                      <code>{structure.meshName}</code> · shared with{" "}
                      {structure.sharedWith.join(", ")} · canonical owner{" "}
                      {structure.canonicalOwner}
                    </li>
                  ))}
                </ul>
              </>
            )}
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The downloaded archives are not committed to this repository. The
            reproducible build script, source file map, and provenance manifest
            are. See <code>docs/anatomy/provenance/README.md</code> in the
            repository.
          </p>
        </section>

        {manifest.textOnly && manifest.textOnly.length > 0 && (
          <section className="glass-panel mt-6 p-6">
            <h2 className="font-display text-lg font-semibold text-primary">
              Text-only structures
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              {manifest.textOnly.length} structures have no independent
              BodyParts3D 4.0 mesh. They show &ldquo;No 3D model&rdquo; in the
              viewer while keeping their teaching text.
            </p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
              {manifest.textOnly.map((structure) => (
                <li key={structure.slug}>
                  <code>{structure.slug}</code> ({structure.layer}):{" "}
                  {structure.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="glass-panel mt-6 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            Anatomical references
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Mesh selection is traceable to the Foundational Model of Anatomy
            (FMA) concepts recorded in each source file header. The teaching
            notes cite standard anatomy texts:
          </p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
            <li>
              Drake RL, Vogl AW, Mitchell AWM.{" "}
              <em>Gray&apos;s Anatomy for Students</em>. 4th ed. Elsevier; 2020.
            </li>
            <li>
              Standring S, ed.{" "}
              <em>
                Gray&apos;s Anatomy: The Anatomical Basis of Clinical Practice
              </em>
              . 42nd ed. Elsevier; 2020.
            </li>
            <li>
              Moore KL, Dalley AF, Agur AMR.{" "}
              <em>Clinically Oriented Anatomy</em>. 8th ed. Wolters Kluwer;
              2018.
            </li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            FMA identifiers are used for traceability. FMA is developed by the
            Structural Informatics Group at the University of Washington.
          </p>
        </section>

        <section className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-elevated p-5">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-secondary">
            The written anatomy content is pending faculty review. Structures
            marked &ldquo;Pending review&rdquo; in the viewer have not yet been
            signed off by a member of faculty and must not be treated as
            clinical guidance.
          </p>
        </section>

        <p className="mt-8 text-[11px] text-muted">
          Model built from {manifest.model.structures} selectable structures,{" "}
          {manifest.model.textOnlyStructures} text-only structures, and{" "}
          {manifest.model.triangles.toLocaleString("en-US")} triangles. See also
          the repository&apos;s <code>THIRD_PARTY_NOTICES.md</code>.
        </p>
      </div>
    </main>
  );
}
