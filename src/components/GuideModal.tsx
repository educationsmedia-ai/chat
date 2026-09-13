import React from 'react';
import { X, ShieldCheck, Database, Server, Smartphone, CheckCircle2, Copy } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-neutral-900 border border-neutral-800 text-neutral-100 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/20">
              LC
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100 leading-tight">Panduan & Arsitektur Live Chat</h2>
              <p className="text-xs text-neutral-400">Multiplayer 2 Orang • Cloud Firestore • Real-Time</p>
            </div>
          </div>
          <button
            id="close-guide-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto space-y-6 text-sm text-neutral-300">
          {/* Cara Pengujian Multiplayer */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Smartphone size={15} /> 1. Cara Menguji Real-Time 2 Pengguna
            </h3>
            <div className="bg-neutral-800/60 p-3.5 rounded-xl border border-neutral-700/60 space-y-2 text-xs leading-relaxed">
              <p><strong className="text-neutral-100">Perangkat 1 (Pengguna A):</strong> Buat Room baru, dapatkan kode 6 digit (contoh: <code className="bg-neutral-950 px-1.5 py-0.5 rounded text-emerald-300 font-mono">ABC123</code>).</p>
              <p><strong className="text-neutral-100">Perangkat 2 (Pengguna B):</strong> Buka link app di tab baru / browser HP / mode Incognito, masukkan nama dan kode room yang sama lalu klik Gabung.</p>
              <p><strong className="text-neutral-100">Batas 2 Orang:</strong> Jika ada Pengguna C yang mencoba bergabung ke kode tersebut, sistem langsung menolak dengan pesan: <span className="text-amber-400 font-medium">"Room sudah penuh. Maksimal 2 pengguna."</span></p>
            </div>
          </section>

          {/* Struktur Database */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Database size={15} /> 2. Struktur Cloud Firestore
            </h3>
            <pre className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-300 overflow-x-auto">
{`rooms/
└── {roomCode} (contoh: "ABC123")
    ├── code: "ABC123"
    ├── name: "Ruang Diskusi"
    ├── status: "waiting" | "active" | "closed"
    ├── createdAt: timestamp
    ├── createdBy: "user_uid_1"
    ├── user1: { uid, name, email, avatar, joinedAt }
    ├── user2: { uid, name, email, avatar, joinedAt } | null
    ├── user1Online: boolean
    ├── user2Online: boolean
    ├── user1Typing: boolean
    ├── user2Typing: boolean
    └── messages/ (subcollection)
        └── {messageId}
            ├── senderId: "user_uid_1"
            ├── senderName: "Budi"
            ├── text: "Halo apa kabar?"
            ├── timestamp: timestamp
            └── read: boolean (true jika lawan bicara sudah melihat)`}
            </pre>
          </section>

          {/* Security Rules */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <ShieldCheck size={15} /> 3. Keamanan (Firestore Security Rules)
            </h3>
            <ul className="list-disc list-inside space-y-1 text-xs text-neutral-300 pl-1">
              <li><strong className="text-neutral-200">Strict 2-User Limit:</strong> Aturan database menolak penambahan partisipan jika <code className="text-neutral-200">user2</code> sudah terisi.</li>
              <li><strong className="text-neutral-200">Anti-Spoofing:</strong> <code className="text-neutral-200">senderId</code> pesan wajib sama persis dengan UID pengguna yang terotentikasi.</li>
              <li><strong className="text-neutral-200">Private Messages:</strong> Subcollection <code className="text-neutral-200">messages</code> hanya bisa dibaca dan ditulis oleh partisipan terdaftar di room terkait.</li>
              <li><strong className="text-neutral-200">Length Limiter:</strong> Pesan dibatasi maksimal 2000 karakter untuk mencegah eksploitasi beban database.</li>
            </ul>
          </section>

          {/* Deployment Guide */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <Server size={15} /> 4. Petunjuk Deployment (Firebase Hosting & Vercel)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="bg-neutral-800/40 p-3 rounded-xl border border-neutral-800">
                <h4 className="font-semibold text-neutral-200 mb-1">Firebase Hosting</h4>
                <ol className="list-decimal list-inside space-y-0.5 text-neutral-400">
                  <li>Jalankan: <code className="text-neutral-300 font-mono">npm run build</code></li>
                  <li>Inisialisasi: <code className="text-neutral-300 font-mono">firebase init hosting</code></li>
                  <li>Pilih folder publik: <code className="text-emerald-400 font-mono">dist</code></li>
                  <li>Deploy: <code className="text-neutral-300 font-mono">firebase deploy</code></li>
                </ol>
              </div>
              <div className="bg-neutral-800/40 p-3 rounded-xl border border-neutral-800">
                <h4 className="font-semibold text-neutral-200 mb-1">Vercel</h4>
                <ol className="list-decimal list-inside space-y-0.5 text-neutral-400">
                  <li>Push kode ke GitHub repository</li>
                  <li>Import project di dashboard Vercel</li>
                  <li>Pilih Framework: <code className="text-cyan-400 font-mono">Vite</code></li>
                  <li>Output directory: <code className="text-emerald-400 font-mono">dist</code></li>
                  <li>Klik Deploy!</li>
                </ol>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-800 bg-neutral-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors"
          >
            Mengerti & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
