import { PageHeader } from './blocks'

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string
  intro: string
  sections: { heading: string; body: string }[]
}) {
  return (
    <>
      <PageHeader eyebrow="Legal" title={title} description={intro} />
      <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-xl font-bold">{s.heading}</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
          </section>
        ))}
      </article>
    </>
  )
}
