import "./style.css";
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import type { AdbSync } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";

// ---------- Konfigurasi ----------
const PHONE_DCIM_CANDIDATES = ["/sdcard/DCIM/Camera", "/storage/emulated/0/DCIM/Camera"];
const PREVIEW_INTERVAL_MS = 1200;
const FILENAME_RE = /^foto_(\d{4})\.\w+$/i;

// ---------- Elemen UI ----------
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const connectionStatus = document.getElementById("connection-status") as HTMLSpanElement;
const folderBtn = document.getElementById("folder-btn") as HTMLButtonElement;
const folderLabel = document.getElementById("folder-label") as HTMLSpanElement;
const previewWrap = document.getElementById("preview-wrap") as HTMLDivElement;
const previewImg = document.getElementById("preview-img") as HTMLImageElement;
const previewPlaceholder = document.getElementById("preview-placeholder") as HTMLDivElement;
const shutterBtn = document.getElementById("shutter-btn") as HTMLButtonElement;
const counterLabel = document.getElementById("counter-label") as HTMLDivElement;
const logOutput = document.getElementById("log-output") as HTMLDivElement;

// ---------- State ----------
let adb: Adb | null = null;
let syncClient: AdbSync | null = null;
let dcimPath: string | null = null;
let dirHandle: FileSystemDirectoryHandle | null = null;
let previewTimer: number | null = null;
let previewUrl: string | null = null;
let busy = false;

// ---------- Util UI ----------
function log(msg: string, kind: "info" | "ok" | "error" = "info") {
  const line = document.createElement("div");
  const ts = new Date().toLocaleTimeString("id-ID", { hour12: false });
  line.textContent = `[${ts}] ${msg}`;
  if (kind === "ok") line.classList.add("log-ok");
  if (kind === "error") line.classList.add("log-error");
  logOutput.appendChild(line);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function setConnectionStatus(text: string, kind: "status-disconnected" | "status-connected" | "status-busy") {
  connectionStatus.textContent = text;
  connectionStatus.className = `status ${kind}`;
}

function setPreview(blob: Blob) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  previewImg.src = previewUrl;
  previewImg.classList.add("active");
  previewPlaceholder.style.display = "none";
  previewWrap.classList.add("show-hint");
}

function showFocusReticle(clientX: number, clientY: number) {
  const rect = previewWrap.getBoundingClientRect();
  const reticle = document.createElement("div");
  reticle.className = "focus-reticle";
  reticle.style.left = `${clientX - rect.left}px`;
  reticle.style.top = `${clientY - rect.top}px`;
  previewWrap.appendChild(reticle);
  reticle.addEventListener("animationend", () => reticle.remove());
}

/** Konversi posisi klik di elemen <img> (object-fit: contain) ke koordinat piksel layar HP. */
function mapClickToPhoneCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const naturalW = previewImg.naturalWidth;
  const naturalH = previewImg.naturalHeight;
  if (!naturalW || !naturalH) return null;

  const rect = previewImg.getBoundingClientRect();
  const containerW = rect.width;
  const containerH = rect.height;

  // hitung area gambar sesungguhnya di dalam elemen (object-fit: contain bisa menyisakan letterbox)
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const renderedW = naturalW * scale;
  const renderedH = naturalH * scale;
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;

  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;

  // klik di area letterbox (di luar gambar) diabaikan
  if (localX < 0 || localY < 0 || localX > renderedW || localY > renderedH) return null;

  const x = Math.round((localX / renderedW) * naturalW);
  const y = Math.round((localY / renderedH) * naturalH);
  return { x, y };
}

// ---------- Cek WebUSB tersedia ----------
if (!("usb" in navigator)) {
  setConnectionStatus("Browser tidak mendukung WebUSB", "status-disconnected");
  connectBtn.disabled = true;
  log("Browser ini tidak mendukung WebUSB. Gunakan Chrome atau Edge versi terbaru.", "error");
}

// ---------- Sambungkan HP ----------
connectBtn.addEventListener("click", async () => {
  try {
    connectBtn.disabled = true;
    setConnectionStatus("Menghubungkan...", "status-busy");

    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) throw new Error("WebUSB tidak tersedia di browser ini.");

    const device = await manager.requestDevice();
    if (!device) {
      log("Tidak ada perangkat dipilih.");
      setConnectionStatus("Belum tersambung", "status-disconnected");
      connectBtn.disabled = false;
      return;
    }

    log(`Perangkat dipilih: ${device.name}`);
    const connection = await device.connect();
    const credentialStore = new AdbWebCredentialStore("Tethered Capture");

    log("Melakukan autentikasi ADB... (cek layar HP jika ada popup izin)");
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore,
    });

    adb = new Adb(transport);
    syncClient = await adb.sync();

    // cari folder DCIM/Camera yang valid
    for (const candidate of PHONE_DCIM_CANDIDATES) {
      try {
        if (await syncClient.isDirectory(candidate)) {
          dcimPath = candidate;
          break;
        }
      } catch {
        // lanjut coba kandidat berikutnya
      }
    }

    if (!dcimPath) {
      log("⚠ Tidak menemukan folder DCIM/Camera di HP.", "error");
    } else {
      log(`Folder kamera HP ditemukan: ${dcimPath}`, "ok");
    }

    setConnectionStatus(`Tersambung: ${device.name}`, "status-connected");
    log("HP berhasil tersambung.", "ok");
    connectBtn.textContent = "✅ Tersambung";
    folderBtn.disabled = false;

    startPreview();
  } catch (err) {
    console.error(err);
    log(`Gagal menyambungkan: ${(err as Error).message}`, "error");
    setConnectionStatus("Gagal tersambung", "status-disconnected");
    connectBtn.disabled = false;
  }
});

// ---------- Pilih folder tujuan ----------
folderBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    dirHandle = handle;
    folderLabel.textContent = handle.name;
    const next = await getNextLocalNumber(handle);
    counterLabel.textContent = `Foto berikutnya: foto_${pad(next)}`;
    shutterBtn.disabled = false;
    log(`Folder tujuan diset: ${handle.name}`, "ok");
  } catch (err) {
    log(`Pemilihan folder dibatalkan atau gagal: ${(err as Error).message}`);
  }
});

// ---------- Preview loop ----------
function startPreview() {
  if (previewTimer !== null) return;
  const tick = async () => {
    if (!busy && adb) {
      try {
        const data = await adb.subprocess.noneProtocol.spawnWait(["screencap", "-p"]);
        setPreview(new Blob([data.buffer as ArrayBuffer], { type: "image/png" }));
      } catch (err) {
        console.warn("Preview gagal:", err);
      }
    }
    previewTimer = window.setTimeout(tick, PREVIEW_INTERVAL_MS);
  };
  tick();
}

// ---------- Shutter ----------
shutterBtn.addEventListener("click", async () => {
  if (busy || !adb || !syncClient || !dirHandle) return;
  if (!dcimPath) {
    log("Tidak bisa memotret: folder DCIM HP tidak ditemukan.", "error");
    return;
  }

  busy = true;
  shutterBtn.disabled = true;
  setConnectionStatus("Mengambil foto...", "status-busy");

  try {
    const before = new Set((await syncClient.readdir(dcimPath)).map((e) => e.name));

    await adb.subprocess.noneProtocol.spawnWaitText(["input", "keyevent", "27"]);
    log("Perintah shutter terkirim.");

    let newFile: string | null = null;
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const after = await syncClient.readdir(dcimPath);
      const diff = after.map((e) => e.name).filter((n) => !before.has(n));
      if (diff.length > 0) {
        diff.sort();
        newFile = diff[diff.length - 1];
        break;
      }
    }

    if (!newFile) {
      log("⚠ Tidak ada file baru terdeteksi. Pastikan aplikasi Kamera HP terbuka.", "error");
      return;
    }

    const remotePath = `${dcimPath}/${newFile}`;
    const ext = newFile.includes(".") ? newFile.slice(newFile.lastIndexOf(".")) : ".jpg";

    log(`Menarik file ${newFile} dari HP...`);
    const stream = syncClient.read(remotePath);
    const blob = await streamToBlob(stream, mimeFromExt(ext));

    const nextNum = await getNextLocalNumber(dirHandle);
    const localName = `foto_${pad(nextNum)}${ext}`;
    const fileHandle = await dirHandle.getFileHandle(localName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    log(`✅ Tersimpan sebagai ${localName}`, "ok");
    counterLabel.textContent = `Foto berikutnya: foto_${pad(nextNum + 1)}`;
  } catch (err) {
    console.error(err);
    log(`❌ Gagal memotret: ${(err as Error).message}`, "error");
  } finally {
    busy = false;
    shutterBtn.disabled = false;
    setConnectionStatus("Tersambung", "status-connected");
  }
});

// ---------- Tap-to-focus ----------
previewImg.addEventListener("click", async (ev) => {
  if (!adb || busy || !previewImg.classList.contains("active")) return;

  const coords = mapClickToPhoneCoords(ev.clientX, ev.clientY);
  if (!coords) return;

  showFocusReticle(ev.clientX, ev.clientY);

  try {
    await adb.subprocess.noneProtocol.spawnWaitText(["input", "tap", String(coords.x), String(coords.y)]);
    log(`Fokus diatur ke (${coords.x}, ${coords.y})`);
  } catch (err) {
    log(`Gagal atur fokus: ${(err as Error).message}`, "error");
  }
});

// ---------- Helper ----------
function pad(n: number): string {
  return String(n).padStart(4, "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".heic" || e === ".heif") return "image/heic";
  return "image/jpeg";
}

async function streamToBlob(stream: unknown, mime: string): Promise<Blob> {
  const reader = (stream as { getReader: () => ReadableStreamDefaultReader<Uint8Array> }).getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new Blob(chunks as BlobPart[], { type: mime });
}

async function getNextLocalNumber(handle: FileSystemDirectoryHandle): Promise<number> {
  let max = 0;
  for await (const [name] of handle.entries()) {
    const m = FILENAME_RE.exec(name);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}
