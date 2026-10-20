import 'regenerator-runtime/runtime'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import fontkit, { type Font as FontkitFont } from '@pdf-lib/fontkit'
import { buildAbsoluteUrl } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: 'Account status could not be verified.' }, { status: 500 })
  if (profile?.account_status !== 'active') return NextResponse.json({ error: 'An active participant account is required.' }, { status: 403 })

  const { id } = await params
  const { data: certificate, error } = await supabase
    .from('certificates')
    .select('id, user_id, participant_id, recipient_name, event_name, certificate_number, verification_code, issued_at')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Certificate could not be loaded.' }, { status: 500 })
  if (!certificate) return NextResponse.json({ error: 'Eligible active certificate not found.' }, { status: 404 })

  try {
    const pdf = await PDFDocument.create()
    pdf.registerFontkit(fontkit)
    const fontRoot = join(process.cwd(), 'node_modules')
    const baseBytes = await readFile(join(fontRoot, 'next', 'dist', 'compiled', '@vercel', 'og', 'Geist-Regular.ttf'))
    const baseFontkit = fontkit.create(baseBytes)
    const baseFont = await pdf.embedFont(baseBytes, { subset: true })
    const scriptDefinitions = [
      { start: 0x0980, end: 0x09ff, packageName: 'noto-sans-bengali', filename: 'noto-sans-bengali-bengali-400-normal.woff' },
      { start: 0x0900, end: 0x097f, packageName: 'noto-sans-devanagari', filename: 'noto-sans-devanagari-devanagari-400-normal.woff' },
      { start: 0x0a00, end: 0x0a7f, packageName: 'noto-sans-gurmukhi', filename: 'noto-sans-gurmukhi-gurmukhi-400-normal.woff' },
      { start: 0x0a80, end: 0x0aff, packageName: 'noto-sans-gujarati', filename: 'noto-sans-gujarati-gujarati-400-normal.woff' },
      { start: 0x0b00, end: 0x0b7f, packageName: 'noto-sans-oriya', filename: 'noto-sans-oriya-oriya-400-normal.woff' },
      { start: 0x0b80, end: 0x0bff, packageName: 'noto-sans-tamil', filename: 'noto-sans-tamil-tamil-400-normal.woff' },
      { start: 0x0c00, end: 0x0c7f, packageName: 'noto-sans-telugu', filename: 'noto-sans-telugu-telugu-400-normal.woff' },
      { start: 0x0c80, end: 0x0cff, packageName: 'noto-sans-kannada', filename: 'noto-sans-kannada-kannada-400-normal.woff' },
      { start: 0x0d00, end: 0x0d7f, packageName: 'noto-sans-malayalam', filename: 'noto-sans-malayalam-malayalam-400-normal.woff' },
      { start: 0x0d80, end: 0x0dff, packageName: 'noto-sans-sinhala', filename: 'noto-sans-sinhala-sinhala-400-normal.woff' },
      { start: 0x0e00, end: 0x0e7f, packageName: 'noto-sans-thai', filename: 'noto-sans-thai-thai-400-normal.woff' },
    ]
    const certificateText = [
      certificate.recipient_name,
      certificate.event_name,
      certificate.participant_id,
      certificate.certificate_number,
    ].join(' ')
    const scriptFonts = new Map<string, { fontkit: FontkitFont; pdf: PDFFont }>()
    for (const definition of scriptDefinitions) {
      if (![...certificateText].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0
        return codePoint >= definition.start && codePoint <= definition.end
      })) continue
      const bytes = await readFile(join(fontRoot, '@fontsource', definition.packageName, 'files', definition.filename))
      scriptFonts.set(definition.packageName, {
        fontkit: fontkit.create(bytes),
        pdf: await pdf.embedFont(bytes, { subset: true }),
      })
    }
    const page = pdf.addPage([792, 612])
    const ink = rgb(0.12, 0.11, 0.08)
    const gold = rgb(0.78, 0.59, 0.17)
    const runsFor = (text: string) => {
      const runs: Array<{ font: PDFFont; fontkit: FontkitFont; text: string }> = []
      for (const character of text) {
        const codePoint = character.codePointAt(0) ?? 0
        const definition = scriptDefinitions.find((script) => codePoint >= script.start && codePoint <= script.end)
        const selected = definition ? scriptFonts.get(definition.packageName) : undefined
        const font = selected?.fontkit.hasGlyphForCodePoint(codePoint)
          ? selected
          : baseFontkit.hasGlyphForCodePoint(codePoint)
            ? { fontkit: baseFontkit, pdf: baseFont }
            : undefined
        if (!font) throw new Error(`Unsupported certificate character U+${codePoint.toString(16).toUpperCase()}`)
        const previous = runs[runs.length - 1]
        if (previous?.font === font.pdf) previous.text += character
        else runs.push({ font: font.pdf, fontkit: font.fontkit, text: character })
      }
      return runs
    }
    const drawCentered = (text: string, maxSize: number, y: number, color: ReturnType<typeof rgb>) => {
      const runs = runsFor(text)
      const maxWidth = 680
      const naturalWidth = runs.reduce((width, run) => width + run.font.widthOfTextAtSize(run.text, maxSize), 0)
      const size = naturalWidth > maxWidth ? maxSize * (maxWidth / naturalWidth) : maxSize
      let x = (page.getWidth() - naturalWidth * (size / maxSize)) / 2
      for (const run of runs) {
        page.drawText(run.text, { x, y, size, font: run.font, color })
        x += run.font.widthOfTextAtSize(run.text, size)
      }
    }

    const logoBytes = await readFile(join(process.cwd(), 'public', 'images', 'ultimate-events-logo.png'))
    const logo = await pdf.embedPng(logoBytes)
    const logoSize = 104
    page.drawImage(logo, {
      x: (page.getWidth() - logoSize) / 2,
      y: 476,
      width: logoSize,
      height: logoSize,
    })
    page.drawRectangle({ x: 22, y: 22, width: 748, height: 568, borderColor: gold, borderWidth: 2 })
    page.drawRectangle({ x: 31, y: 31, width: 730, height: 550, borderColor: gold, borderWidth: 0.5 })
    drawCentered('CERTIFICATE OF ACHIEVEMENT', 27, 442, gold)
    drawCentered('This certificate is proudly presented to', 15, 390, ink)
    drawCentered(certificate.recipient_name, 32, 338, ink)
    drawCentered(`Permanent participant ID: ${certificate.participant_id}`, 13, 296, ink)
    drawCentered('for successful participation in', 15, 248, ink)
    drawCentered(certificate.event_name, 22, 208, ink)
    drawCentered(`Certificate number: ${certificate.certificate_number}`, 12, 124, ink)
    drawCentered(`Issued ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(new Date(certificate.issued_at))}`, 12, 98, ink)
    const verificationUrl = buildAbsoluteUrl('/verify-certificate', { certificate: certificate.certificate_number })
    drawCentered(`Verify: ${verificationUrl}`, 9, 60, ink)
    const bytes = await pdf.save()
    const safeName = certificate.recipient_name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'participant'
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}-${certificate.certificate_number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Certificate PDF generation failed', error)
    const message = error instanceof Error && error.message.startsWith('Unsupported certificate character')
      ? 'This participant name or event title contains a script not yet included in the certificate fonts. Contact the administrator for an accessible copy.'
      : 'The certificate PDF could not be generated.'
    return NextResponse.json({ error: message }, { status: message.includes('not yet included') ? 422 : 500 })
  }
}
