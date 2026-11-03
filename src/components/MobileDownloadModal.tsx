import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { 
  Smartphone, 
  X, 
  Download, 
  Share2, 
  QrCode, 
  Send, 
  Mail, 
  Check, 
  Copy, 
  Info,
  Sparkles,
  RotateCcw,
  Tablet
} from 'lucide-react';

interface MobileDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReturnHome?: () => void;
  fileName: string;
  fileBytes: Uint8Array;
  epubBytes?: Uint8Array;
  epubFileName?: string;
  kpfBytes?: Uint8Array;
  kpfFileName?: string;
  wavBytes?: Uint8Array;
  formatLabel: string;
  lang: 'fr' | 'en';
}

export const MobileDownloadModal: React.FC<MobileDownloadModalProps> = ({
  isOpen,
  onClose,
  onReturnHome,
  fileName,
  fileBytes,
  epubBytes,
  epubFileName,
  kpfBytes,
  kpfFileName,
  wavBytes,
  formatLabel,
  lang,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadedFormatName, setDownloadedFormatName] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);

  // Active files
  const activeEpubName = epubFileName || (fileName.endsWith('.epub') ? fileName : fileName.replace(/\.(kpf|pkf)$/i, '_Amazon_KDP.epub'));
  const activeEpubBytes = epubBytes || fileBytes;

  const activeKpfName = kpfFileName || (fileName.endsWith('.kpf') ? fileName : fileName.replace(/\.epub$/i, '.kpf'));
  const activeKpfBytes = kpfBytes || fileBytes;

  // Determine current app URL
  const appUrl = typeof window !== 'undefined' 
    ? (window.location.origin.includes('localhost') 
        ? 'https://ais-pre-yd4oelh7oyunouzuyvaob3-54545165468.europe-west2.run.app' 
        : window.location.origin)
    : 'https://ais-pre-yd4oelh7oyunouzuyvaob3-54545165468.europe-west2.run.app';

  const mobileUrl = `${appUrl}?mobile=1&file=${encodeURIComponent(activeEpubName)}`;

  // Check if browser supports Web Share API with files
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      setCanNativeShare(true);
    }
  }, []);

  // Handle countdown for automatic return to home after phone download
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (onReturnHome) {
        onReturnHome();
      } else {
        onClose();
      }
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onReturnHome, onClose]);

  // Generate QR Code
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        mobileUrl,
        {
          width: 200,
          margin: 1.5,
          color: {
            dark: '#f59e0b', // Amber-500 KDP
            light: '#0a0a0a'  // Neutral-950
          }
        },
        (error) => {
          if (error) console.error("QR Code error:", error);
        }
      );
    }
  }, [isOpen, mobileUrl]);

  if (!isOpen) return null;

  // Direct Mobile Download Trigger for EPUB (Amazon KDP Ready)
  const handleDownloadEpub = () => {
    const blob = new Blob([activeEpubBytes as ArrayBufferView<ArrayBuffer>], { type: 'application/epub+zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeEpubName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadedFormatName(activeEpubName);
    setDownloadSuccess(true);
    setCountdown(3);
  };

  // Direct Mobile Download Trigger for KPF
  const handleDownloadKpf = () => {
    const blob = new Blob([activeKpfBytes as ArrayBufferView<ArrayBuffer>], { type: 'application/x-kpf-package' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeKpfName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadedFormatName(activeKpfName);
    setDownloadSuccess(true);
    setCountdown(3);
  };

  // Web Share API (Triggers native phone sheet on mobile)
  const handleNativeShare = async () => {
    try {
      const file = new File([activeEpubBytes as ArrayBufferView<ArrayBuffer>], activeEpubName, { 
        type: 'application/epub+zip' 
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Livre Amazon KDP : ${activeEpubName}`,
          text: `Voici le livre ${activeEpubName} prêt pour votre Kindle ou Amazon KDP.`,
          files: [file]
        });
      } else {
        await navigator.share({
          title: `Livre Amazon KDP : ${activeEpubName}`,
          text: `Télécharger le livre ${activeEpubName} sur votre téléphone :`,
          url: mobileUrl
        });
      }

      setDownloadedFormatName(activeEpubName);
      setDownloadSuccess(true);
      setCountdown(3);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        handleDownloadEpub();
      }
    }
  };

  // Return to home immediately
  const handleTriggerReturnHome = () => {
    if (onReturnHome) {
      onReturnHome();
    } else {
      onClose();
    }
  };

  // Copy mobile link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(mobileUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Send via WhatsApp
  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(
      `Convertisseur PDF vers Amazon KDP : Voici mon livre ${activeEpubName} prêt à être téléchargé sur smartphone ou téléversé sur KDP : ${mobileUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // Send via Email
  const handleSendEmail = () => {
    const subject = encodeURIComponent(`Livre Amazon KDP / Kindle : ${activeEpubName}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nVoici le lien d'accès à votre livre Kindle prêt pour Amazon KDP :\n\n${mobileUrl}\n\nOuvrez ce lien sur votre smartphone pour l'importer directement dans l'application Amazon Kindle, Apple Livres ou sur votre compte kdp.amazon.com.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="fixed inset-0 z-[120] bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in">
      <div 
        className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl shadow-black relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          title={lang === 'fr' ? 'Fermer' : 'Close'}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3.5 pr-8">
          <div className="w-11 h-11 rounded-xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-neutral-100">
              {lang === 'fr' ? 'Télécharger votre livre sur Téléphone' : 'Download Book to Phone'}
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              {lang === 'fr' 
                ? 'Compatible iPhone, Android, App Amazon Kindle & Amazon KDP' 
                : 'Compatible with iPhone, Android, Amazon Kindle App & KDP'}
            </p>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="bg-neutral-950 rounded-xl p-4 sm:p-5 border border-neutral-800 flex flex-col sm:flex-row items-center gap-4">
          <div className="p-2 bg-neutral-950 rounded-xl border border-amber-900/40 shadow-inner shrink-0">
            <canvas ref={canvasRef} className="rounded-lg w-36 h-36 sm:w-40 sm:h-40 block" />
          </div>

          <div className="space-y-2.5 text-xs text-neutral-300">
            <div className="flex items-center gap-2 text-amber-400 font-semibold uppercase tracking-wider text-[11px]">
              <QrCode className="w-3.5 h-3.5" />
              <span>{lang === 'fr' ? 'Scanner avec la caméra' : 'Scan with Camera'}</span>
            </div>
            
            <ol className="space-y-1.5 text-neutral-400 leading-relaxed list-decimal list-inside text-[11px]">
              <li>{lang === 'fr' ? 'Ouvrez l’appareil photo de votre smartphone' : 'Open camera on your smartphone'}</li>
              <li>{lang === 'fr' ? 'Scannez le QR Code pour ouvrir le lien' : 'Scan QR code to open download link'}</li>
              <li>{lang === 'fr' ? 'Ouvrez dans l’app Kindle ou téléversez sur KDP' : 'Open in Kindle app or upload to KDP'}</li>
            </ol>

            <div className="pt-1 text-[11px] font-mono text-neutral-500 truncate max-w-[210px]">
              Livre : <span className="text-neutral-200">{activeEpubName}</span>
            </div>
          </div>
        </div>

        {/* Success & Auto-redirect Notification */}
        {downloadSuccess && (
          <div className="bg-emerald-950/90 border border-emerald-500/60 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2 animate-fade-in text-emerald-200 shadow-lg shadow-emerald-950/50">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
              <Check className="w-5 h-5 text-emerald-400" />
              <span>{lang === 'fr' ? 'Téléchargement réussi sur votre téléphone !' : 'Download successful!'}</span>
            </div>
            <p className="text-xs text-neutral-300">
              {downloadedFormatName}
              <br />
              {lang === 'fr' 
                ? `Redirection vers l'accueil dans ${countdown ?? 2}s...` 
                : `Returning to home screen in ${countdown ?? 2}s...`}
            </p>
            <button
              onClick={handleTriggerReturnHome}
              className="mt-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === 'fr' ? "Revenir à l'accueil maintenant" : "Return to home now"}</span>
            </button>
          </div>
        )}

        {/* Phone Download Action Buttons: EPUB & KPF */}
        <div className="space-y-2.5">
          
          {/* Button 1: Download EPUB (Amazon KDP 100% Guaranteed) */}
          <button
            onClick={handleDownloadEpub}
            className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-neutral-950 font-bold rounded-xl text-xs flex items-center justify-between transition-all shadow-md shadow-amber-950/50 cursor-pointer border border-amber-400/40"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neutral-900" />
              <span>{lang === 'fr' ? 'Télécharger pour Amazon KDP (.epub)' : 'Download for Amazon KDP (.epub)'}</span>
            </div>
            <span className="text-[10px] bg-black/30 text-amber-950 px-2 py-0.5 rounded font-extrabold uppercase tracking-wide">
              100% KDP
            </span>
          </button>

          {/* Button 2: Download KPF */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadKpf}
              className="py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold border border-neutral-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Tablet className="w-4 h-4 text-cyan-400" />
              <span>{lang === 'fr' ? 'Format .KPF (Kindle)' : '.KPF Format'}</span>
            </button>

            {/* Native Share button */}
            <button
              onClick={handleNativeShare}
              className="py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold border border-neutral-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span>{lang === 'fr' ? 'Partager mobile' : 'Share'}</span>
            </button>
          </div>
        </div>

        {/* Quick Send Options (WhatsApp & Mail) */}
        <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <span className="font-medium text-neutral-300">
            {lang === 'fr' ? 'Ou envoyez-le par messagerie :' : 'Or send via messaging:'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendWhatsApp}
              className="px-2.5 py-1.5 bg-neutral-800 hover:bg-emerald-950/60 hover:text-emerald-400 rounded-lg border border-neutral-700/80 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <Send className="w-3 h-3 text-emerald-400" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handleSendEmail}
              className="px-2.5 py-1.5 bg-neutral-800 hover:bg-sky-950/60 hover:text-sky-400 rounded-lg border border-neutral-700/80 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <Mail className="w-3 h-3 text-sky-400" />
              <span>Email</span>
            </button>
          </div>
        </div>

        {/* Return to Home Button */}
        <div>
          <button
            type="button"
            onClick={handleTriggerReturnHome}
            className="w-full py-2.5 px-4 bg-neutral-800/90 hover:bg-neutral-700 text-cyan-300 hover:text-cyan-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-neutral-700 hover:border-cyan-500/50 cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span>{lang === 'fr' ? "🏠 Revenir à l'accueil / Nouveau fichier" : "🏠 Return to Home / New File"}</span>
          </button>
        </div>

        {/* Note Amazon KDP */}
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3 text-[11px] text-neutral-300 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <strong className="text-amber-300 font-semibold">
              {lang === 'fr' ? 'Astuce Amazon KDP :' : 'Amazon KDP Tip:'}
            </strong>
            <p className="text-neutral-400">
              {lang === 'fr'
                ? 'Pour éviter l’erreur « fichier endommagé » sur Amazon KDP, choisissez le fichier .EPUB. Il est 100% accepté par KDP et converti automatiquement en livre Kindle.'
                : 'To avoid the "damaged file" error on Amazon KDP, choose the .EPUB file. It is 100% accepted by KDP.'}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
