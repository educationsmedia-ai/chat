import React from 'react';
import { X, ShieldCheck, Database, Server, Smartphone, CheckCircle2, Copy, Camera } from 'lucide-react';

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
              <p className="text-xs text-neutral-400">Grup hingga 20 Orang • Cloud Firestore • Real-Time</p>
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
              <Smartphone size={15} /> 1. Cara Menguji Real-Time Hingga 20 Pengguna
            </h3>
            <div className="bg-neutral-800/60 p-3.5 rounded-xl border border-neutral-700/60 space-y-2 text-xs leading-relaxed">
              <p><strong className="text-neutral-100">Masuk Langsung:</strong> Masukkan nama Anda dan langsung klik <strong className="text-emerald-400">Masuk ke Chat</strong>. Tidak perlu kode room apa pun.</p>
              <p><strong className="text-neutral-100">Peserta Lain (Hingga 20 Orang):</strong> Bagikan link web/aplikasi kepada rekan atau teman Anda. Mereka cukup membuka link, mengetik nama, dan otomatis berada di ruang obrolan yang sama secara real-time.</p>
              <p><strong className="text-neutral-100">Batas Kapasitas 20 Orang:</strong> Sistem dan aturan Firestore membatasi maksimal 20 orang aktif. Obrolan dilengkapi indikator status online, notifikasi mengetik, kirim foto, dan panggilan video WebRTC.</p>
            </div>
          </section>

          {/* Struktur Database */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Database size={15} /> 2. Struktur Cloud Firestore (Multi-User)
            </h3>
            <pre className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-300 overflow-x-auto">
{`rooms/
└── {roomCode} (contoh: "ABC123")
    ├── code: "ABC123"
    ├── name: "Ruang Tim Proyek"
    ├── status: "waiting" | "active" | "closed"
    ├── maxParticipants: 20
    ├── participantCount: 5
    ├── participantIds: ["uid_1", "uid_2", "uid_3", ...]
    ├── participants: {
    │     "uid_1": { uid, name, email, avatar, joinedAt, online, typing },
    │     "uid_2": { uid, name, email, avatar, joinedAt, online, typing },
    │     ...
    │   }
    └── messages/ (subcollection)
        └── {messageId}
            ├── senderId: "uid_1"
            ├── senderName: "Budi Pratama"
            ├── text: "Halo semua, rapat dimulai!"
            ├── imageUrl?: "data:image/jpeg;base64,..."
            ├── timestamp: timestamp
            └── read: boolean`}
            </pre>
          </section>

          {/* Security Rules */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <ShieldCheck size={15} /> 3. Keamanan (Firestore Security Rules)
            </h3>
            <ul className="list-disc list-inside space-y-1 text-xs text-neutral-300 pl-1">
              <li><strong className="text-neutral-200">20-User Strict Limit:</strong> Aturan keamanan database membatasi ukuran array <code className="text-neutral-200">participantIds.size() &lt;= 20</code>.</li>
              <li><strong className="text-neutral-200">Anti-Spoofing:</strong> <code className="text-neutral-200">senderId</code> pesan wajib sama persis dengan identitas pengguna terdaftar.</li>
              <li><strong className="text-neutral-200">Room Participants Only:</strong> Hanya anggota terdaftar di <code className="text-neutral-200">participantIds</code> yang memiliki hak akses pesan di room tersebut.</li>
              <li><strong className="text-neutral-200">Length Limiter:</strong> Pesan dibatasi maksimal 2000 karakter untuk mencegah spam atau eksploitasi beban database.</li>
            </ul>
          </section>

          {/* Kirim Foto & Video Call */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <Camera size={15} /> 4. Fitur Kirim Foto & Video Call
            </h3>
            <div className="bg-neutral-800/60 p-3.5 rounded-xl border border-neutral-700/60 space-y-2 text-xs leading-relaxed">
              <p>
                <strong className="text-neutral-100">Kirim Foto:</strong> Tekan tombol kamera di samping kolom input untuk memilih foto dari galeri atau kamera HP. Foto dikompresi otomatis tanpa membebani kuota, dan dapat diperbesar (zoom) dengan mengklik foto di bubble chat.
              </p>
              <p>
                <strong className="text-neutral-100">Video Call Real-Time (WebRTC):</strong> Tekan tombol hijau <strong className="text-emerald-400">Video Call</strong> di header setelah kedua pengguna terhubung. Lawan bicara akan menerima dering panggilan masuk dan dapat menerima atau menolak. Panggilan dilengkapi fitur bisukan audio (Mute), matikan kamera, dan ganti kamera depan/belakang di HP.
              </p>
            </div>
          </section>

          {/* Menjadikan Aplikasi Android (PWA & APK Capacitor) */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Smartphone size={15} /> 5. Cara Menjadikan Aplikasi Android (APK & PWA)
            </h3>
            <div className="space-y-3 text-xs">
              <div className="bg-neutral-800/60 p-3 rounded-xl border border-neutral-700/60 space-y-1.5">
                <span className="font-semibold text-emerald-400">Cara 1: Pasang Instan Tanpa Install APK (PWA)</span>
                <p className="text-neutral-300 leading-relaxed">
                  Buka link web aplikasi ini di Google Chrome di HP Android Anda. Tekan menu titik tiga (⋮) di pojok kanan atas Chrome &rarr; pilih <strong className="text-white">"Tambahkan ke Layar Utama" (Add to Home screen)</strong> atau <strong className="text-white">"Pasang Aplikasi"</strong>. Aplikasi akan terpasang di HP seperti aplikasi Android bawaan dengan ikon sendiri dan layar penuh (tanpa bilah URL browser).
                </p>
              </div>

              <div className="bg-neutral-800/60 p-3 rounded-xl border border-neutral-700/60 space-y-1.5">
                <span className="font-semibold text-emerald-400">Cara 2: Ekspor Menjadi File APK Resmi (Capacitor)</span>
                <p className="text-neutral-300 leading-relaxed">
                  Anda dapat mengubah project React/Vite ini langsung menjadi project Android Studio menggunakan Capacitor:
                </p>
                <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800 font-mono text-[11px] text-emerald-300 space-y-1 overflow-x-auto">
                  <div>npm install @capacitor/core @capacitor/cli @capacitor/android</div>
                  <div>npx cap init "Live Chat" "com.livechat.app" --web-dir dist</div>
                  <div>npm run build</div>
                  <div>npx cap add android</div>
                  <div>npx cap open android</div>
                </div>
                <p className="text-neutral-400 text-[11px]">
                  Android Studio akan terbuka otomatis. Dari sana Anda cukup klik menu <strong>Build &rarr; Build Bundle(s) / APK(s) &rarr; Build APK(s)</strong> untuk mendapatkan file <code className="text-neutral-300 font-mono">.apk</code> siap install di semua HP Android.
                </p>
              </div>
            </div>
          </section>

          {/* Deployment Guide */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <Server size={15} /> 6. Petunjuk Deployment (Firebase Hosting & Vercel)
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
