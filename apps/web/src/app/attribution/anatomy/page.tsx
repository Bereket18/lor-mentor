import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import manifest from "../../../../public/models/anatomy/manifest.json";

export const metadata: Metadata = {
  title: "Anatomy Lab model sources and licence - Lor Mentor",
  description:
    "Attribution, source provenance, and licence information for the Lor Mentor Anatomy Lab heart model.",
};

const CREDIT =
  "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International";

export default function AnatomyAttributionPage() {
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
          Model sources and licence
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
          The heart model in Anatomy Lab is built from the BodyParts3D 4.0
          dataset. This page records the required credit, what was changed, and
          the current licence status.
        </p>

        <section className="glass-panel mt-8 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            Required attribution
          </h2>
          <p className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm leading-relaxed text-secondary">
            {CREDIT}
          </p>
          <dl className="mt-4 space-y-2 text-xs text-muted">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Dataset:</dt>
              <dd>{manifest.source.dataset}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Archive:</dt>
              <dd className="break-all">{manifest.source.archive}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-secondary">Licence page:</dt>
              <dd>
                <a
                  href={manifest.source.licenseUrl}
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
          </dl>
        </section>

        <section className="glass-panel mt-6 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            Licence status
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            The BodyParts3D licence page and README state CC BY 4.0. The header
            of every distributed BodyParts3D 4.0 OBJ file states CC BY-SA 2.1
            Japan. Which licence applies is being clarified with the Database
            Center for Life Science (DBCLS). In the meantime we credit the
            source as both licences require, describe our changes below, and
            offer the adapted model file under the same terms as the stricter
            statement, CC BY-SA 2.1 Japan. Licence page:{" "}
            <a
              href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent hover:underline"
            >
              https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
            </a>
          </p>
        </section>

        <section className="glass-panel mt-6 p-6">
          <h2 className="font-display text-lg font-semibold text-primary">
            What we changed
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-secondary">
            <li>
              Selected only the source meshes that represent the 14 structures
              in this release.
            </li>
            <li>
              Merged each structure&apos;s source parts into one selectable
              mesh, converted millimetres and the Z-up axis to metres and Y-up,
              and centred the combined model.
            </li>
            <li>
              Recomputed vertex normals and exported a single GLB with stable
              mesh names. No colours or textures from the source dataset are
              used; surface colours are ours.
            </li>
            <li>
              Teaching notes, quizzes and interface text are LOR Mentor content
              and are pending faculty review. They are not part of the
              BodyParts3D dataset.
            </li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The downloaded archive is not committed to this repository. The
            reproducible build script, source file map, and provenance manifest
            are. See <code>docs/anatomy/provenance/README.md</code> in the
            repository.
          </p>
        </section>

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
              Drake RL, Vogl AW, Mitchell AWM. <em>Gray&apos;s Anatomy for Students</em>.
              4th ed. Elsevier; 2020.
            </li>
            <li>
              Standring S, ed.{" "}
              <em>Gray&apos;s Anatomy: The Anatomical Basis of Clinical Practice</em>.
              42nd ed. Elsevier; 2020.
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
          Model built from {manifest.structures.length} selectable structures
          and {manifest.model.triangles.toLocaleString("en-US")} triangles. See
          also the repository&apos;s <code>THIRD_PARTY_NOTICES.md</code>.
        </p>
      </div>
    </main>
  );
}
