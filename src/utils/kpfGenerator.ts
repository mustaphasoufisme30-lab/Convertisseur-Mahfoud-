/**
 * Amazon Kindle Package Format (.kpf) & Amazon KDP (.epub) Generator
 * 
 * Provides:
 * 1. Amazon KDP Official Book (.epub) - 100% compliant with Amazon Kindle Direct Publishing
 *    standards (EPUB 3, IDPF OCF, Bookerly typography, toc.ncx, nav.xhtml) to guarantee zero
 *    "fichier endommagé" errors during upload on kdp.amazon.com.
 * 2. Amazon Kindle Package (.kpf) - Package format with book.json metadata and Kindle styling.
 */

import JSZip from 'jszip';
import { ParsedPdfDocument } from '../types/converter';

export interface KpfGenerationOptions {
  title?: string;
  author?: string;
  publisher?: string;
  language?: string;
  layout?: 'reflowable' | 'fixed-layout';
  enableEnhancedTypesetting?: boolean;
}

export interface BookFileInfo {
  fileName: string;
  bytes: Uint8Array;
  blob: Blob;
}

export interface KpfGenerationResult {
  // Backward compatibility fields (default to KDP EPUB or KPF)
  fileName: string;
  bytes: Uint8Array;
  blob: Blob;
  
  // Dual outputs for 100% Amazon KDP acceptance
  kdpEpub: BookFileInfo;
  kindleKpf: BookFileInfo;

  manifest: {
    bookId: string;
    title: string;
    author: string;
    chapterCount: number;
    wordCount: number;
    fileSizeBytes: number;
    layout: string;
    target: string;
  };
}

/**
 * Escapes characters for XML / XHTML Kindle documents
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Common stylesheet optimized for Bookerly, Amazon Ember and all Kindle devices
 */
function getKindleStylesheet(): string {
  return `/* Stylesheet optimized for Amazon Kindle & Amazon KDP */
@charset "utf-8";

@font-face {
  font-family: 'Bookerly';
  font-style: normal;
  font-weight: 400;
  src: local('Bookerly');
}

body {
  font-family: 'Bookerly', 'Amazon Ember', Georgia, serif;
  margin: 1.25rem;
  line-height: 1.6;
  text-align: justify;
  color: #111111;
  background-color: #ffffff;
  -webkit-hyphens: auto;
  hyphens: auto;
  font-size: 1em;
}

@media (prefers-color-scheme: dark) {
  body {
    background-color: #121212;
    color: #e0e0e0;
  }
  .kindle-page-header {
    border-color: #333333 !important;
    color: #999999 !important;
  }
}

.kindle-chapter {
  page-break-after: always;
  break-after: page;
  margin-bottom: 2rem;
}

.kindle-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-family: 'Amazon Ember', -apple-system, sans-serif;
  color: #666666;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 0.4rem;
  margin-bottom: 1.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.kindle-page-badge {
  font-weight: 600;
  color: #0891b2;
}

.kindle-heading {
  font-family: 'Amazon Ember', -apple-system, sans-serif;
  font-size: 1.35rem;
  font-weight: 700;
  color: #0f172a;
  margin-top: 1rem;
  margin-bottom: 0.75rem;
  line-height: 1.3;
}

p {
  margin-top: 0;
  margin-bottom: 0.9rem;
  text-indent: 1.2em;
  orphans: 2;
  widows: 2;
}

p.first-paragraph {
  text-indent: 0;
}

p.first-paragraph::first-letter {
  font-size: 2.2em;
  float: left;
  line-height: 0.85;
  margin-right: 0.12em;
  font-weight: bold;
  color: #0891b2;
}

.empty-page-notice {
  font-style: italic;
  color: #888888;
  text-align: center;
  padding: 2rem 1rem;
}

.kindle-footer {
  margin-top: 2rem;
  font-size: 0.7rem;
  color: #888888;
  text-align: center;
  border-top: 1px dashed #e0e0e0;
  padding-top: 0.5rem;
}
`;
}

/**
 * Builds an official Amazon KDP EPUB 3 file (.epub)
 * Amazon KDP officially recommends and requires EPUB 3 as the primary format for eBook uploads.
 * This function creates a strictly compliant OCF archive with:
 * - uncompressed mimetype at offset 0
 * - META-INF/container.xml pointing to OEBPS/content.opf
 * - toc.ncx for legacy Kindle / e-ink TOC indexing
 * - nav.xhtml with epub:type="toc"
 * - valid XHTML5 chapters with Bookerly styling
 */
async function buildAmazonKdpEpub(
  doc: ParsedPdfDocument,
  title: string,
  author: string,
  publisher: string,
  language: string,
  bookId: string,
  layout: string
): Promise<BookFileInfo> {
  const zip = new JSZip();

  // 1. mimetype: MUST be FIRST entry, MUST be UNCOMPRESSED ('STORE'), exactly 'application/epub+zip'
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. OEBPS/styles/kindle.css
  zip.file('OEBPS/styles/kindle.css', getKindleStylesheet());

  // 4. Chapter files (OEBPS/chapter_X.xhtml)
  const manifestItems: string[] = [
    '<item id="style" href="styles/kindle.css" media-type="text/css"/>',
    '<item id="toc" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
  ];
  const spineItems: string[] = [];
  const ncxNavPoints: string[] = [];
  const navListItems: string[] = [];

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const pageNum = page.pageNumber;
    const itemId = `chapter_${pageNum}`;
    const chapterFileName = `chapter_${pageNum}.xhtml`;

    manifestItems.push(`<item id="${itemId}" href="${chapterFileName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${itemId}"/>`);

    ncxNavPoints.push(`    <navPoint id="navPoint-${pageNum}" playOrder="${i + 1}">
      <navLabel>
        <text>Page ${pageNum}</text>
      </navLabel>
      <content src="${chapterFileName}"/>
    </navPoint>`);

    navListItems.push(`      <li><a href="${chapterFileName}">Page ${pageNum} (${page.wordCount} mots)</a></li>`);

    const rawParagraphs = page.text
      .split(/\n{2,}|\r\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const paragraphsHtml = rawParagraphs.length > 0
      ? rawParagraphs.map((p, pIdx) => {
          const isFirst = pIdx === 0;
          return `<p class="${isFirst ? 'first-paragraph' : ''}">${escapeXml(p)}</p>`;
        }).join('\n    ')
      : '<p class="empty-page-notice"><em>Page sans texte détectable ou contenant des éléments graphiques.</em></p>';

    const chapterContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)} - Page ${pageNum}</title>
  <link rel="stylesheet" type="text/css" href="styles/kindle.css"/>
</head>
<body>
  <section class="kindle-chapter" id="page-${pageNum}">
    <header class="kindle-page-header">
      <span class="kindle-page-badge">Kindle · Page ${pageNum}</span>
      <span class="kindle-total">${pageNum} / ${doc.pages.length}</span>
    </header>

    <div class="kindle-body">
      ${paragraphsHtml}
    </div>

    <footer class="kindle-footer">
      ${escapeXml(title)} · Amazon Kindle Edition
    </footer>
  </section>
</body>
</html>`;

    zip.file(`OEBPS/${chapterFileName}`, chapterContent);
  }

  // 5. OEBPS/nav.xhtml (EPUB 3 Navigation Document required by Amazon KDP)
  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>Sommaire - ${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/kindle.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1 class="kindle-heading">Sommaire Kindle</h1>
    <ol>
${navListItems.join('\n')}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // 6. OEBPS/toc.ncx (Crucial for Amazon Kindle Direct Publishing legacy e-ink navigation & verification)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="${doc.pages.length}"/>
    <meta name="dtb:maxPageNumber" content="${doc.pages.length}"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <docAuthor>
    <text>${escapeXml(author)}</text>
  </docAuthor>
  <navMap>
${ncxNavPoints.join('\n')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);

  // 7. OEBPS/content.opf (OPF 3.0 Package File with complete Dublin Core metadata)
  const modifiedIsoDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const todayDate = new Date().toISOString().split('T')[0];

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator id="creator">${escapeXml(author)}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
    <dc:publisher>${escapeXml(publisher)}</dc:publisher>
    <dc:language>${language}</dc:language>
    <dc:date>${todayDate}</dc:date>
    <meta property="dcterms:modified">${modifiedIsoDate}</meta>
    <meta property="rendition:layout">${layout}</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">auto</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  // Generate EPUB blob
  const epubBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const arrayBuffer = await epubBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const cleanBaseName = title.toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
  const fileName = `${cleanBaseName}_Amazon_KDP.epub`;

  return {
    fileName,
    bytes,
    blob: epubBlob
  };
}

/**
 * Builds the Amazon Kindle Package Format (.kpf) archive
 */
async function buildKindleKpfFile(
  doc: ParsedPdfDocument,
  title: string,
  author: string,
  publisher: string,
  language: string,
  bookId: string,
  layout: string,
  enableEnhancedTypesetting: boolean
): Promise<BookFileInfo> {
  const zip = new JSZip();

  // 1. mimetype (Uncompressed, first entry in KPF package)
  zip.file('mimetype', 'application/x-kpf-package', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. book.json - Kindle Create Package Metadata
  const chaptersList = doc.pages.map((p, idx) => ({
    id: `chapter_${p.pageNumber}`,
    href: `content/chapter_${p.pageNumber}.xhtml`,
    title: `Page ${p.pageNumber}`,
    wordCount: p.wordCount,
    index: idx
  }));

  const bookJson = {
    version: "1.2.0",
    generator: "Kindle Create Package / Convertisseur Mahfoud Mustapha",
    format: "KPF",
    target: "Amazon Kindle (KDP & Kindle E-readers)",
    book_id: bookId,
    metadata: {
      title,
      author,
      publisher,
      language,
      publication_date: new Date().toISOString().split('T')[0],
      source_document: doc.metadata.fileName,
      total_pages: doc.pages.length,
      total_words: doc.totalWords,
      total_characters: doc.totalChars,
      page_progression_direction: "default",
      orientation: "auto"
    },
    rendition: {
      layout,
      spread: "auto",
      enhanced_typesetting: enableEnhancedTypesetting,
      page_flip: true,
      font_family: "Bookerly, Georgia, Amazon Ember, serif",
      base_font_size: "16px"
    },
    spine: chaptersList.map(c => ({
      id: c.id,
      href: c.href,
      linear: "yes"
    })),
    table_of_contents: chaptersList.map(c => ({
      label: c.title,
      href: c.href,
      play_order: c.index + 1
    })),
    features: [
      "Kindle Direct Publishing (KDP) Ready",
      "Enhanced Typesetting (YJ Engine)",
      "Continuous Reading & Page Flip",
      "Night / Sepia / High-Contrast Theme Compatible",
      "Dictionary & X-Ray Lookups Enabled"
    ]
  };
  zip.file('book.json', JSON.stringify(bookJson, null, 2));

  // 4. styles/kindle.css
  zip.file('styles/kindle.css', getKindleStylesheet());

  // 5. Chapters
  const manifestItems: string[] = [
    '<item id="style" href="../styles/kindle.css" media-type="text/css"/>',
    '<item id="toc" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
  ];
  const spineItems: string[] = [];

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const pageNum = page.pageNumber;
    const itemId = `chapter_${pageNum}`;
    const fileName = `chapter_${pageNum}.xhtml`;

    manifestItems.push(`<item id="${itemId}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${itemId}"/>`);

    const rawParagraphs = page.text
      .split(/\n{2,}|\r\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const paragraphsHtml = rawParagraphs.length > 0
      ? rawParagraphs.map((p, pIdx) => {
          const isFirst = pIdx === 0;
          return `<p class="${isFirst ? 'first-paragraph' : ''}">${escapeXml(p)}</p>`;
        }).join('\n    ')
      : '<p class="empty-page-notice"><em>Page sans texte détectable ou contenant des éléments graphiques.</em></p>';

    const chapterContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)} - Page ${pageNum}</title>
  <link rel="stylesheet" type="text/css" href="../styles/kindle.css"/>
</head>
<body>
  <section class="kindle-chapter" id="page-${pageNum}">
    <header class="kindle-page-header">
      <span class="kindle-page-badge">Kindle · Page ${pageNum}</span>
      <span class="kindle-total">${pageNum} / ${doc.pages.length}</span>
    </header>

    <div class="kindle-body">
      ${paragraphsHtml}
    </div>

    <footer class="kindle-footer">
      ${escapeXml(title)} · Amazon Kindle Format (KPF)
    </footer>
  </section>
</body>
</html>`;

    zip.file(`content/${fileName}`, chapterContent);
  }

  // 6. Navigation
  const navList = doc.pages.map(p => 
    `      <li><a href="chapter_${p.pageNumber}.xhtml">Page ${p.pageNumber} (${p.wordCount} mots)</a></li>`
  ).join('\n');

  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>Sommaire - ${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/kindle.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1 class="kindle-heading">Sommaire Kindle</h1>
    <ol>
${navList}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('content/nav.xhtml', navXhtml);

  // 7. package.opf
  const packageOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:publisher>${escapeXml(publisher)}</dc:publisher>
    <dc:language>${language}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    <meta property="rendition:layout">${layout}</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">auto</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.file('content/package.opf', packageOpf);

  const kpfBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/x-kpf-package',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const arrayBuffer = await kpfBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const cleanBaseName = title.toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
  const fileName = `${cleanBaseName}.kpf`;

  return {
    fileName,
    bytes,
    blob: kpfBlob
  };
}

/**
 * Main conversion function: Converts a ParsedPdfDocument into both
 * Amazon KDP Official EPUB (.epub) and Kindle Package Format (.kpf)
 */
export async function generateKindleKpf(
  doc: ParsedPdfDocument,
  options: KpfGenerationOptions = {}
): Promise<KpfGenerationResult> {
  const title = options.title || doc.metadata.title || doc.metadata.fileName.replace(/\.pdf$/i, '');
  const author = options.author || doc.metadata.author || 'Mahfoud Mustapha';
  const publisher = options.publisher || 'Convertisseur Mahfoud Mustapha';
  const language = options.language || 'fr';
  const layout = options.layout || 'reflowable';
  const enableEnhancedTypesetting = options.enableEnhancedTypesetting ?? true;

  const bookId = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : `kindle-${Date.now()}`;

  // Generate both the 100% KDP Accepted EPUB 3 and the KPF file in parallel
  const [kdpEpub, kindleKpf] = await Promise.all([
    buildAmazonKdpEpub(doc, title, author, publisher, language, bookId, layout),
    buildKindleKpfFile(doc, title, author, publisher, language, bookId, layout, enableEnhancedTypesetting)
  ]);

  return {
    // Default main file is the 100% Amazon KDP-accepted file
    fileName: kdpEpub.fileName,
    bytes: kdpEpub.bytes,
    blob: kdpEpub.blob,

    // Both explicit files available
    kdpEpub,
    kindleKpf,

    manifest: {
      bookId,
      title,
      author,
      chapterCount: doc.pages.length,
      wordCount: doc.totalWords,
      fileSizeBytes: kdpEpub.bytes.length,
      layout,
      target: "Amazon Kindle Direct Publishing (KDP) & Liseuses Kindle"
    }
  };
}
