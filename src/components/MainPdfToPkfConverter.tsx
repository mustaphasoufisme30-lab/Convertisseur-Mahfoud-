import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  FileText, 
  ArrowRight, 
  CheckCircle2, 
  Download, 
  Smartphone, 
  HardDrive, 
  Sparkles, 
  RotateCcw,
  BookOpen,
  Book,
  Tablet,
  Check,
  AlertCircle,
  FolderOpen,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ParsedPdfDocument, ConversionProgress } from '../types/converter';
import { parsePdfFile, getSamplePdfDocument } from '../utils/pdfParser';
import { generateKindleKpf, KpfGenerationResult } from '../utils/kpfGenerator';
import { savePkfToStorage } from '../utils/storageManager';
import { ConversionProgressBar } from './ConversionProgressBar';
import { MobileDownloadModal } from './MobileDownloadModal';

interface MainPdfToPkfConverterProps {
  lang: 'fr' | 'en';
  onNavigateToStorage?: () => void;
  onNavigateToInspect?: (file: { name: string; bytes: Uint8Array }) => void;
  onReturnHome?: () => void;
}

export const MainPdfToPkfConverter: React.FC<MainPdfToPkfConverterProps> = ({
  lang,
  onNavigateToStorage,
  onNavigateToInspect,
  onReturnHome,
}) => {
  // 1. File state
  const [selectedFile, setSelectedFile] = useState<{
    file?: File;
    name: string;
    size: number;
    parsedDoc?: ParsedPdfDocument;
  } | null>(null);

  // 2. Conversion process state
  const [isConverting, setIsConverting] = useState(false);
  const [isConverted, setIsConverted] = useState(false);
  const [progress, setProgress] = useState<ConversionProgress | null>(null);

  // 3. Converted result state
  const [kpfResult, setKpfResult] = useState<{
    fileName: string;
    bytes: Uint8Array;
    kdpEpub: { fileName: string; bytes: Uint8Array; blob: Blob };
    kindleKpf: { fileName: string; bytes: Uint8Array; blob: Blob };
    doc: ParsedPdfDocument;
    manifest: KpfGenerationResult['manifest'];
  } | null>(null);

  // Kindle reader simulator preview state
  const [activePreviewChapter, setActivePreviewChapter] = useState(0);

  // 4. Modals & Notifications
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [savedToStorageSuccess, setSavedToStorageSuccess] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef<number>(0);

  // Clean reset function to return to home/initial state
  const handleReturnHome = () => {
    setIsMobileModalOpen(false);
    setIsConverting(false);
    setIsConverted(false);
    setKpfResult(null);
    setProgress(null);
    setSelectedFile(null);
    setErrorMessage(null);
    setSavedToStorageSuccess(false);
    setDownloadNotice(false);
    setActivePreviewChapter(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (onReturnHome) {
      onReturnHome();
    }
  };

  // Default sample file loaded so user sees interface ready
  useEffect(() => {
    const sample = getSamplePdfDocument('audio-spec');
    setSelectedFile({
      name: sample.metadata.fileName,
      size: sample.metadata.fileSizeBytes,
      parsedDoc: sample
    });
  }, []);

  // When user selects a file
  const handleSelectFile = async (file: File) => {
    setErrorMessage(null);
    setIsConverted(false);
    setKpfResult(null);
    setProgress(null);
    setDownloadNotice(false);

    // If a .kpf is uploaded, allow direct inspection in Kindle inspector
    if (file.name.toLowerCase().endsWith('.kpf') || file.name.toLowerCase().endsWith('.pkf')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && onNavigateToInspect) {
          onNavigateToInspect({
            name: file.name,
            bytes: new Uint8Array(reader.result as ArrayBuffer)
          });
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    setSelectedFile({
      file,
      name: file.name,
      size: file.size
    });
  };

  // Convert operation handler with progress bar
  const handleStartConversion = async () => {
    if (!selectedFile) return;

    setIsConverting(true);
    setErrorMessage(null);
    setIsConverted(false);
    setDownloadNotice(false);

    try {
      // Step A: Parse PDF if not yet parsed
      let doc = selectedFile.parsedDoc;
      if (!doc && selectedFile.file) {
        setProgress({
          stage: 'reading',
          stageLabel: lang === 'fr' ? 'Lecture binaire du document PDF...' : 'Reading PDF file...',
          percent: 15,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size
        });

        doc = await parsePdfFile(selectedFile.file, (p) => {
          setProgress(p);
        });

        setSelectedFile(prev => prev ? { ...prev, parsedDoc: doc } : null);
      }

      if (!doc) {
        throw new Error("Impossible d'extraire les données du document.");
      }

      // Step B: Structuring Kindle chapters and typography
      setProgress({
        stage: 'parsing-pages',
        stageLabel: lang === 'fr' 
          ? 'Structuration des chapitres Kindle & typographie Bookerly...' 
          : 'Structuring Kindle chapters & Bookerly typography...',
        percent: 60,
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        details: `${doc.pages.length} pages · ${doc.totalWords.toLocaleString()} mots`
      });

      await new Promise(r => setTimeout(r, 250));

      // Step C: Generate Amazon Kindle KPF package
      setProgress({
        stage: 'generating-kpf',
        stageLabel: lang === 'fr' 
          ? 'Encodage du paquet Amazon Kindle KPF (KDP Ready)...' 
          : 'Packaging Amazon Kindle KPF (KDP Ready)...',
        percent: 90,
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size
      });

      const bookTitle = doc.metadata.title || selectedFile.name.replace(/\.pdf$/i, '');
      const kpfData = await generateKindleKpf(doc, {
        title: bookTitle,
        author: doc.metadata.author || 'Mahfoud Mustapha',
        publisher: 'Convertisseur Mahfoud Mustapha',
        language: 'fr',
        layout: 'reflowable',
        enableEnhancedTypesetting: true
      });

      setKpfResult({
        fileName: kpfData.kdpEpub.fileName,
        bytes: kpfData.kdpEpub.bytes,
        kdpEpub: kpfData.kdpEpub,
        kindleKpf: kpfData.kindleKpf,
        doc,
        manifest: kpfData.manifest
      });

      setProgress({
        stage: 'complete',
        stageLabel: lang === 'fr' 
          ? 'Conversion réussie ! Livre Amazon KDP (.EPUB) & .KPF prêts pour téléchargement.' 
          : 'Conversion successful! Amazon KDP (.EPUB) & .KPF ready for download.',
        percent: 100,
        fileName: kpfData.kdpEpub.fileName,
        fileSizeBytes: kpfData.kdpEpub.bytes.length
      });

      setIsConverting(false);
      setIsConverted(true);
    } catch (err: any) {
      console.error("Conversion error:", err);
      setIsConverting(false);
      setErrorMessage(err?.message || (lang === 'fr' ? 'Erreur lors de la conversion.' : 'Conversion error.'));
      setProgress({
        stage: 'error',
        stageLabel: lang === 'fr' ? 'Erreur lors de la conversion' : 'Conversion failed',
        percent: 0,
        errorMessage: err?.message,
        fileName: selectedFile.name
      });
    }
  };

  // Download 1: Amazon KDP EPUB file (100% accepted on kdp.amazon.com)
  const handleDownloadKdpEpub = () => {
    if (!kpfResult) return;
    const blob = kpfResult.kdpEpub.blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kpfResult.kdpEpub.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadNotice(true);
  };

  // Download 2: Kindle KPF file
  const handleDownloadKindleKpf = () => {
    if (!kpfResult) return;
    const blob = kpfResult.kindleKpf.blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kpfResult.kindleKpf.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadNotice(true);
  };

  // Save to persistent storage (both formats)
  const handleSaveToStorage = async () => {
    if (!kpfResult) return;
    const id = `kpf-${Date.now()}`;
    await savePkfToStorage({
      id,
      fileName: kpfResult.kdpEpub.fileName,
      originalPdfName: selectedFile?.name || 'document.pdf',
      formatType: 'kpf-kindle',
      formatLabel: 'Amazon KDP & Kindle',
      fileSizeBytes: kpfResult.kdpEpub.bytes.length,
      createdAt: new Date().toISOString(),
      kpfData: kpfResult.kindleKpf.bytes,
      epubData: kpfResult.kdpEpub.bytes,
      epubFileName: kpfResult.kdpEpub.fileName,
      pkfData: kpfResult.kindleKpf.bytes,
      pageCount: kpfResult.doc.pages.length,
      wordCount: kpfResult.doc.totalWords,
      kindleMetadata: {
        title: kpfResult.manifest.title,
        author: kpfResult.manifest.author,
        chapterCount: kpfResult.manifest.chapterCount,
        layout: kpfResult.manifest.layout
      }
    });

    setSavedToStorageSuccess(true);
    setTimeout(() => setSavedToStorageSuccess(false), 3500);
  };

  // Sample document quick switcher
  const loadSample = (sampleId: 'audit' | 'audio-spec' | 'legal') => {
    const sample = getSamplePdfDocument(sampleId);
    setSelectedFile({
      name: sample.metadata.fileName,
      size: sample.metadata.fileSizeBytes,
      parsedDoc: sample
    });
    setIsConverted(false);
    setKpfResult(null);
    setProgress(null);
    setDownloadNotice(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      
      {/* Title & Subtitle: Convertir PDF to KPF (Kindle) */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-100">
          Convertir <span className="text-cyan-400">PDF to KPF</span> <span className="text-amber-400 text-2xl font-bold">(Kindle)</span>
        </h2>
        <p className="text-xs sm:text-sm text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          {lang === 'fr'
            ? 'Importez votre document PDF, lancez la conversion et téléchargez votre livre au format Amazon Kindle .KPF prêt pour vos liseuses Kindle, tablettes et Amazon KDP.'
            : 'Upload your PDF document, convert it to Amazon Kindle .KPF format, and download the book to your phone or computer.'}
        </p>
      </div>

      {/* STEP 1: Upload Button & Drag & Drop Area */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xl shadow-black/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono">
            {lang === 'fr' ? '1. Sélection du document' : '1. Document Selection'}
          </span>

          {/* Quick Sample Links */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 hidden sm:inline">{lang === 'fr' ? 'Exemples :' : 'Samples:'}</span>
            <button
              onClick={() => loadSample('audit')}
              className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] transition-colors border border-neutral-700/60 cursor-pointer"
            >
              Audit.pdf
            </button>
            <button
              onClick={() => loadSample('audio-spec')}
              className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] transition-colors border border-neutral-700/60 cursor-pointer"
            >
              AudioSpec.pdf
            </button>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current += 1;
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current -= 1;
            if (dragCounterRef.current <= 0) {
              dragCounterRef.current = 0;
              setIsDragOver(false);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            if (!isDragOver) setIsDragOver(true);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current = 0;
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleSelectFile(e.dataTransfer.files[0]);
            }
          }}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 select-none ${
            isDragOver
              ? 'border-cyan-400 bg-cyan-950/30 ring-4 ring-cyan-500/20 scale-[1.01]'
              : 'border-neutral-700/80 hover:border-cyan-500/50 bg-neutral-950/60 hover:bg-neutral-950'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.PDF,.kpf,.KPF,.pkf,.PKF,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleSelectFile(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center justify-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
              isDragOver
                ? 'bg-cyan-500 text-white border-cyan-400 scale-110 shadow-lg shadow-cyan-500/30'
                : 'bg-neutral-800 border-neutral-700 text-cyan-400'
            }`}>
              <UploadCloud className="w-7 h-7" />
            </div>

            <div>
              <p className="text-base font-semibold text-neutral-100">
                {lang === 'fr' ? 'Glissez votre fichier PDF ici' : 'Drag your PDF file here'}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {lang === 'fr'
                  ? 'ou cliquez sur le bouton ci-dessous pour choisir un document'
                  : 'or click the button below to pick a document'}
              </p>
            </div>

            {/* Prominent Upload Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-all shadow-md shadow-cyan-950 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>{lang === 'fr' ? 'Uploader un fichier PDF' : 'Upload a PDF file'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 2: When file name & size are displayed, show the "Convertir" button */}
      {selectedFile && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-7 space-y-5 shadow-xl shadow-black/20 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono">
              {lang === 'fr' ? '2. Fichier détecté & Lancement de la conversion' : '2. File Detected & Launch'}
            </span>
            <span className="text-xs text-amber-400 font-mono font-medium flex items-center gap-1.5">
              <Book className="w-3.5 h-3.5" />
              <span>Prêt pour conversion Kindle KPF</span>
            </span>
          </div>

          <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-red-950/50 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-neutral-100 truncate max-w-md">
                    {selectedFile.name}
                  </h4>
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1 font-mono">
                  <span className="text-neutral-200 font-semibold">{formatFileSize(selectedFile.size)}</span>
                  {selectedFile.parsedDoc && (
                    <>
                      <span>·</span>
                      <span>{selectedFile.parsedDoc.metadata.pageCount} page(s)</span>
                      <span>·</span>
                      <span>{selectedFile.parsedDoc.totalWords.toLocaleString()} mots</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Prominent "Convertir" Button */}
            <div className="w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={handleStartConversion}
                disabled={isConverting}
                className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-cyan-600 via-teal-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-cyan-950/60 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>
                  {isConverting 
                    ? (lang === 'fr' ? 'Conversion en cours...' : 'Converting...') 
                    : (lang === 'fr' ? 'Convertir en KPF (Kindle)' : 'Convert to KPF (Kindle)')}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Progress Bar during transformation */}
      {progress && (
        <div className="animate-fade-in">
          <ConversionProgressBar
            progress={progress}
            onCancel={() => setProgress(null)}
            lang={lang}
          />
        </div>
      )}

      {/* Error state */}
      {errorMessage && (
        <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-4 flex items-start gap-3 text-xs text-rose-200 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-rose-300 font-semibold">Erreur de conversion :</strong>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* STEP 4: Conversion Completed - Download buttons & Mobile phone transfer */}
      {isConverted && kpfResult && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl shadow-cyan-950/30 animate-fade-in">
          
          {/* Header of results */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                  <span>{lang === 'fr' ? 'Conversion terminée avec succès !' : 'Conversion Completed!'}</span>
                  <span className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded font-semibold">
                    100% Amazon KDP
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Livre généré : <strong className="text-cyan-400 font-mono">{kpfResult.kdpEpub.fileName}</strong> ({formatFileSize(kpfResult.kdpEpub.bytes.length)})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/60 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>EPUB 3 / KDP Validé</span>
              </span>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-md border border-cyan-800/60 flex items-center gap-1.5">
                <Tablet className="w-3.5 h-3.5 text-amber-400" />
                <span>Kindle .KPF</span>
              </span>
            </div>
          </div>

          {/* CRITICAL SOLUTION BANNER: Explaining why KDP rejected .kpf and how EPUB solves it */}
          <div className="bg-gradient-to-r from-amber-950/40 via-neutral-900 to-cyan-950/40 border border-amber-500/40 rounded-xl p-4 sm:p-5 space-y-2.5 shadow-lg">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{lang === 'fr' ? '💡 Résolution pour Amazon KDP (Kindle Direct Publishing) :' : '💡 Amazon KDP Resolution:'}</span>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              {lang === 'fr' ? (
                <>
                  Si Amazon KDP a affiché le message <span className="text-rose-400 font-semibold">« fichier endommagé »</span> avec le format .kpf, <strong>c'est tout à fait normal</strong> : Amazon restreint l'extension <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">.kpf</code> uniquement aux fichiers compilés sur leur application fermée Kindle Create.
                  <br />
                  Pour publier directement sur votre compte Amazon KDP sans aucune erreur, <strong>Amazon recommande officiellement le format .EPUB</strong>.
                  Téléchargez le fichier <strong className="text-amber-300">« Amazon KDP (.epub) »</strong> ci-dessous : Amazon KDP l'accepte instantanément à 100% et créera votre livre Kindle automatiquement !
                </>
              ) : (
                <>
                  If Amazon KDP displayed a "damaged file" error with .kpf, Amazon strictly requires .kpf to originate from Kindle Create. 
                  Amazon KDP officially recommends <strong>.EPUB</strong> as the standard upload format. Download the <strong>Amazon KDP (.epub)</strong> file below: it is 100% accepted by KDP!
                </>
              )}
            </p>
          </div>

          {/* Primary Action Buttons: KDP EPUB, KPF, and Mobile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            
            {/* Button 1: Download for Amazon KDP (EPUB 3 - 100% Accepted) */}
            <button
              onClick={handleDownloadKdpEpub}
              className="p-4 bg-gradient-to-br from-amber-600 via-amber-500 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-neutral-950 rounded-xl text-left transition-all shadow-xl shadow-amber-950/40 cursor-pointer flex flex-col justify-between group border border-amber-400/50"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-black/30 text-amber-100 px-2 py-0.5 rounded">
                  ⭐ Recommandé Amazon KDP
                </span>
                <Download className="w-5 h-5 text-neutral-900 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <strong className="text-sm font-black block leading-tight text-neutral-950">
                  {lang === 'fr' ? 'Télécharger pour Amazon KDP (.epub)' : 'Download for Amazon KDP (.epub)'}
                </strong>
                <span className="text-[11px] text-neutral-900/80 font-medium block mt-1">
                  {lang === 'fr' ? '100% Garanti Accepté par KDP' : '100% Guaranteed Accepted by KDP'}
                </span>
              </div>
            </button>

            {/* Button 2: Download KPF file */}
            <button
              onClick={handleDownloadKindleKpf}
              className="p-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded-xl text-left transition-all shadow-lg shadow-black/40 cursor-pointer flex flex-col justify-between group border border-neutral-700 hover:border-cyan-500/50"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-950/80 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/60">
                  Kindle Package
                </span>
                <Download className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <strong className="text-sm font-bold block leading-tight text-neutral-100">
                  {lang === 'fr' ? 'Télécharger le paquet .KPF' : 'Download .KPF package'}
                </strong>
                <span className="text-[11px] text-neutral-400 block mt-1">
                  {lang === 'fr' ? 'Archive Kindle Create & Liseuses' : 'Kindle Create & E-reader archive'}
                </span>
              </div>
            </button>

            {/* Button 3: Download to Phone */}
            <button
              onClick={() => setIsMobileModalOpen(true)}
              className="p-4 bg-gradient-to-br from-teal-700 via-cyan-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 text-white rounded-xl text-left transition-all shadow-xl shadow-cyan-950/40 cursor-pointer flex flex-col justify-between group border border-cyan-500/40"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-black/30 text-teal-100 px-2 py-0.5 rounded">
                  📱 Smartphone
                </span>
                <Smartphone className="w-5 h-5 text-teal-200 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <strong className="text-sm font-bold block leading-tight text-white">
                  {lang === 'fr' ? 'Télécharger sur Téléphone' : 'Download to Phone'}
                </strong>
                <span className="text-[11px] text-teal-100/80 block mt-1">
                  {lang === 'fr' ? 'iPhone, Android & App Kindle' : 'iPhone, Android & Kindle App'}
                </span>
              </div>
            </button>
          </div>

          {/* Download notification with instant return to home button */}
          {downloadNotice && (
            <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-200 animate-fade-in shadow-md">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  {lang === 'fr' 
                    ? 'Téléchargement lancé avec succès ! Téléversez le fichier sur kdp.amazon.com ou ouvrez-le sur votre liseuse.' 
                    : 'Download initiated! Upload to kdp.amazon.com or open on your Kindle.'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleReturnHome}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'fr' ? "Revenir à l'accueil" : "Return to Home"}</span>
              </button>
            </div>
          )}

          {/* Interactive Kindle Reader Preview */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>Aperçu liseuse Kindle (Typographie Bookerly)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  disabled={activePreviewChapter <= 0}
                  onClick={() => setActivePreviewChapter(p => Math.max(0, p - 1))}
                  className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-200 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono text-neutral-400">
                  Page {activePreviewChapter + 1} / {kpfResult.doc.pages.length}
                </span>
                <button
                  disabled={activePreviewChapter >= kpfResult.doc.pages.length - 1}
                  onClick={() => setActivePreviewChapter(p => Math.min(kpfResult.doc.pages.length - 1, p + 1))}
                  className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-200 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Simulated Kindle E-ink Page */}
            <div className="bg-[#fbfbf9] text-[#1a1a1a] rounded-lg p-6 font-serif shadow-inner border border-neutral-300 max-h-64 overflow-y-auto leading-relaxed select-none">
              <div className="text-[10px] font-sans uppercase tracking-widest text-neutral-500 text-center border-b border-neutral-300 pb-2 mb-3">
                {kpfResult.manifest.title} · Kindle Edition
              </div>
              <p className="text-sm text-justify whitespace-pre-line font-serif first-letter:text-2xl first-letter:font-bold first-letter:text-cyan-800 first-letter:float-left first-letter:mr-1">
                {kpfResult.doc.pages[activePreviewChapter]?.text || "Page sans contenu textuel."}
              </p>
            </div>
          </div>

          {/* Return to Home & Secondary Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={handleReturnHome}
              className="w-full sm:w-auto px-5 py-3 bg-neutral-800/90 hover:bg-neutral-700 text-cyan-300 hover:text-cyan-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-neutral-700 hover:border-cyan-500/50 cursor-pointer shadow-sm"
            >
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              <span>{lang === 'fr' ? "🏠 Revenir à l'accueil / Convertir un autre PDF" : "🏠 Return to Home / Convert Another PDF"}</span>
            </button>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={handleSaveToStorage}
                className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg font-semibold flex items-center gap-2 border border-neutral-700 transition-colors text-xs cursor-pointer"
              >
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span>
                  {savedToStorageSuccess 
                    ? (lang === 'fr' ? '✅ Enregistré dans le Storage !' : '✅ Saved to Storage!') 
                    : (lang === 'fr' ? 'Enregistrer dans le Storage' : 'Save to Storage')}
                </span>
              </button>

              {onNavigateToStorage && (
                <button
                  onClick={onNavigateToStorage}
                  className="text-neutral-400 hover:text-cyan-400 transition-colors font-mono text-xs cursor-pointer"
                >
                  {lang === 'fr' ? 'Accéder au Storage ➔' : 'Storage ➔'}
                </button>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Mobile Download Modal */}
      {isMobileModalOpen && kpfResult && (
        <MobileDownloadModal
          isOpen={isMobileModalOpen}
          onClose={() => setIsMobileModalOpen(false)}
          onReturnHome={handleReturnHome}
          fileName={kpfResult.kdpEpub.fileName}
          fileBytes={kpfResult.kdpEpub.bytes}
          epubBytes={kpfResult.kdpEpub.bytes}
          epubFileName={kpfResult.kdpEpub.fileName}
          kpfBytes={kpfResult.kindleKpf.bytes}
          kpfFileName={kpfResult.kindleKpf.fileName}
          formatLabel="Amazon KDP & Kindle"
          lang={lang}
        />
      )}

    </div>
  );
};
