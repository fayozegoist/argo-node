<div align="center">
  <h1><span style="color: white;">MEDIA</span><span style="color: #0088FF;">FAIRY</span> GATEWAY CORE</h1>
  <p><strong>Advanced Hybrid Web Panel & VPN Tunneling (VLESS, VMESS, TROJAN)</strong></p>
  <p>Gateway Core berbasis Node.js dengan antarmuka macOS-inspired. Menggabungkan routing Xray-core, Cloudflared (Argo Tunnel), dan Web Dashboard dalam satu environment yang ringan.</p>
</div>

---

## ⚡ Fitur Utama
* **Dashboard:** Antarmuka UI premium (macOS-inspired).
* **Hybrid Mode:** Mendukung konfigurasi Bug CDN & SNI.
* **Multi-Protocol:** VLESS, VMESS, dan TROJAN via protokol WebSocket (WS).
* **Zero Trust Integration:** Terhubung otomatis ke Cloudflare Tunnels tanpa perlu membuka *inbound ports* di server asal.
* **Auto-Fallback:** Distribusi *traffic* cerdas ke port 8001 (Xray) dan 3000 (Node.js).

---

## 🛠️ Environment Variables
Sebelum melakukan *deployment*, pastikan variabel berikut disiapkan:

| Variable | Deskripsi | Default / Wajib |
| :--- | :--- | :--- |
| `PORT` | Port utama untuk menjalankan Web Dashboard | `3000` |
| `UUID` | Password / UUID untuk klien VPN (VLESS/VMESS/Trojan) | Wajib diisi (format UUIDv4) |
| `ARGO_DOMAIN` | Domain publik Cloudflare Zero Trust (contoh: `vpn.domain.com`) | Wajib (untuk mode CDN) |
| `ARGO_AUTH` | Token Cloudflare Tunnel (dari dashboard Zero Trust) | Wajib (untuk mode CDN) |
| `CFIP` | Bug IP CDN / SNI spesifik untuk bypass *provider* | `saas.sin.fan` |
| `NAME` | Nama alias untuk tag konfigurasi yang di-generate | `MEDIAFAIRY` |

---

## 🚂 Deployment via Railway

Platform Railway adalah cara termudah dan tercepat untuk menjalankan Gateway Core ini tanpa perlu menyewa VPS.

### Langkah 1: Hubungkan GitHub ke Railway
1. Lakukan **Fork** pada repositori ini ke akun GitHub kamu.
2. Buka [Railway.app](https://railway.app/) dan *login* menggunakan akun GitHub.
3. Klik tombol **New Project** pada *dashboard* utama.
4. Pilih opsi **Deploy from GitHub repo**.
5. Cari dan pilih repositori `argo-node` yang baru saja kamu *fork*.
6. Klik **Deploy Now**. *(Catatan: Proses deploy awal mungkin akan gagal atau berjalan tanpa VPN karena variabel belum diisi, biarkan saja).*

### Langkah 2: Tambahkan Environment Variables
Agar mesin Xray dan tunnel Argo dapat berjalan, kamu wajib memasukkan konfigurasinya:
1. Klik kotak aplikasi kamu di *dashboard* Railway.
2. Pindah ke tab **Variables**.
3. Klik **New Variable** (atau *RAW Editor* untuk *paste* massal) dan tambahkan variabel berikut satu per satu:
   * `UUID` : *(Isi dengan UUID V4 milikmu, contoh: `9afd1229-b893-40c1-84dd-51e7ce204913`)*
   * `ARGO_DOMAIN` : *(Isi dengan domain Zero Trust kamu, contoh: `tes.domainkamu.com`)*
   * `ARGO_AUTH` : *(Isi dengan token dari tunnel Cloudflare `ey********`, tanpa cloudflared.exe service install)*
   * `CFIP` : *(Opsional, isi dengan Bug IP CDN jika ingin mengganti default `saas.sin.fan`)*
4. Setelah variabel dimasukkan, Railway akan mendeteksi perubahan dan melakukan **Redeploy** secara otomatis. Tunggu hingga proses *build* selesai.

### Langkah 3: Akses Web Dashboard
Untuk melihat tampilan "Dashboard" dan memantau *traffic* server:
1. Masuk ke tab **Settings** di aplikasi Railway kamu.
2. Gulir ke bawah hingga menemukan bagian **Networking** > **Public Networking**.
3. Klik tombol **Generate Domain** **Port 8080**.
4. Klik URL yang dihasilkan oleh Railway tersebut untuk membuka Web Panel.

---

## 🐳 Deployment via Docker Image (ghcr.io)

Alternatif selain deploy dari repo: gunakan image siap-pakai yang di-build otomatis oleh GitHub Actions setiap kali branch `main` di-update.

### Pull Image
```bash
docker pull ghcr.io/fayozegoist/argo-node:latest
docker run -d \
  -p 3000:3000 \
  -e UUID=<uuid-v4-kamu> \
  -e ARGO_DOMAIN=vpn.domain.com \
  -e ARGO_AUTH=<token-tunnel> \
  --name argo-node \
  ghcr.io/fayozegoist/argo-node:latest
```

### Agar Pull Tanpa Token (Ubah Visibility Package)
Image di-registry default **private**. Agar bisa di-pull tanpa login/token ghcr:
1. Setelah workflow **Build & Push Docker Image** selesai run pertama kali, buka halaman profil GitHub kamu → tab **Packages**.
2. Klik package `argo-node`.
3. Masuk **Package settings** → scroll ke bagian **Danger Zone** → **Change visibility** → pilih **Public**.
4. Ketik nama package untuk konfirmasi, lalu simpan.

> Catatan: Repo tetap **private**, hanya image-nya yang public. Aman karena semua kredensial (`UUID`, `ARGO_AUTH`, `ARGO_DOMAIN`) di-inject via environment variables saat runtime, tidak pernah tersimpan di dalam image.

---

## 🚀 Panduan Networking Tunnels

Agar koneksi VPN via Cloudflare Argo berjalan lancar (Status: Healthy) dan bisa digunakan untuk *internetan*, kamu **wajib** mengatur sisi jaringan Cloudflare dengan tepat.

### Langkah 1: Pengaturan Cloudflare Tunnels 
1. Buka **Cloudflare** > **Networks** > **Tunnels**.
2. Klik **Create a tunnel** (atau pilih tunnel yang sudah ada) dan salin **Token** instalasinya (masukkan ke variabel `ARGO_AUTH` di Railway).
3. Masuk ke tab **Public Hostname**, lalu tambahkan rute baru:
   * **Public hostname:** Isi dengan domain milikmu (sama persis dengan variabel `ARGO_DOMAIN`).
   * **Service Type:** Pilih `HTTP`
   * **Service URL:** Ketik `http://localhost:8001` (Wajib menggunakan awalan `http://` dan mengarah ke port Xray).
4. Simpan rute.

### Langkah 2: Loloskan Traffic WebSocket di Cloudflare DNS
Koneksi VPN menggunakan protokol WebSocket. Jika fitur ini mati atau terhalang sistem keamanan, VPN tidak akan terhubung.
1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com) > Pilih Domain kamu.
2. Buka menu **Network** dan pastikan *toggle* **WebSockets** diatur ke **ON**.
3. Buka menu **Security > Bots**, dan matikan (**OFF**) **Bot Fight Mode**.
4. Buka menu **Security > WAF** > **Settings**, dan matikan (**OFF**) **Browser Integrity Check**.

### Langkah 3: Verifikasi DNS Record
1. Buka menu **DNS > Records**.
2. Cari *record* `CNAME` yang mengarah ke subdomain milikmu (sesuai `ARGO_DOMAIN`).
3. Pastikan kolom **Target** mengarah ke `[Tunnel-ID].cfargotunnel.com` dan Proxy Status menyala dengan logo **Awan Oranye (Proxied)**.
