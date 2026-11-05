// Zdjęcia produktów z seeda: ściąga je z Wikimedia Commons (wolne licencje) do
// marketplace/packages/api/static/products/ i przypina produktom przez Admin API.
// Backend musi chodzić. Po ./scripts/setup-marketplace.sh --reset puść jeszcze raz.
//
//   bun scripts/product-images.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../marketplace/packages/api/src/scripts/seed-data.ts";

const API = process.env.MEDUSA_URL ?? "http://localhost:9000";
const STATIC_DIR = join(import.meta.dir, "../marketplace/packages/api/static/products");
const PUBLIC_BASE = `${API}/static/products`;
const UA = "rfq-hackathon-seed/1.0 (local demo marketplace; product images)";
const THUMB_WIDTH = 800;

// klucz pliku -> nazwa pliku na Wikimedia Commons
const IMAGES: Record<string, string> = {
  "macbook-air": "Macbook_Air_15_inch_-_2_(blurred).jpg",
  "macbook-pro": "M3_Macbook_Pro_14_inch_Space_Grey_model_(cropped).jpg",
  "dell-xps": "DELL_XPS_13_and_15_(37080596413).jpg",
  ultrabook: "Asus_x21_ultrabook.jpg",
  "lenovo-yoga": "Lenovo_YOGA_3_Pro_(15356226748).jpg",
  "thinkpad-x1": "Lenovo_ThinkPad_X1_Ultrabook.jpg",
  "thinkpad-t14": "ThinkPad_T14.jpg",
  "thinkpad-e": "Lenovo_ThinkPad_Edge_E430_013_(8339833707).jpg",
  thinkbook: "ThinkBook_14s_-_1.jpg",
  elitebook: "HP_Elitebook_820_G4.png",
  probook: "HP_ProBook_6560b.png",
  latitude: "Dell_Latitude_E6540.jpg",
  lifebook: "20190606_140544_Fujitsu_LIFEBOOK_U759.jpg",
  "gaming-laptop": "Lenovo_Legion_Y520_(1).jpg",
  ideapad: "Lenovo_IdeaPad_320.jpg",
  "pc-tower": "Gabinete99.jpg",
  "mac-mini": "Mac_mini_2024_(cropped).jpg",
  "mini-pc": "Intel_NUC8.jpg",
  workstation: "VR_Workstation.jpg",
  "hp-z": "HP_Z820_Workstation.jpg",
  "mac-studio": "Mac_Studio_(2022)_front.jpg",
  "monitor-office": "Standing-desk-with-computer.jpg",
  "monitor-office-2": "New_office_setup_(November_2020)_(51381527760).jpg",
  "monitor-gaming": "Gaming-Monitor_ausgestellt_20190202_185511_Kopie.jpg",
  "monitor-pro": "New_office_setup_(November_2020)_(51379754517).jpg",
  "magic-keyboard": "Magic_Keyboard_Black_and_Touch_ID_model.jpg",
  keyboard: "QWERTY_keyboard.jpg",
  "keyboard-mechanical": "IBM_Model_M_Spanish_Keyboard.jpg",
  trackpoint: "Mouse_pointing_stick.jpeg",
  "magic-mouse": "Magic_Mouse.jpg",
  mouse: "Microsoft-wireless-mouse.jpg",
  "mouse-2": "3-Tasten-Maus_Microsoft.jpg",
  headphones: "Bose_QuietComfort_25_Acoustic_Noise_Cancelling_Headphones_with_Carry_Case.jpg",
  headset: "Plantronics_headset.jpg",
  webcam: "Logicool_StreamCam_(cropped).jpg",
  ssd: "NVMe_SSd.jpg",
  ram: "DDR5_SDRAM_IMGP6304_smial_wp.jpg",
  "ram-sodimm": "168_pin_and_184_pin_DIMM.jpg",
  gpu: "Leistungsanalyse_NVIDIA_GeForce_RTX_4090_(Geekerwan)_02_cropped.jpg",
  dock: "ThinkPad_Ultra_docking_station.JPG",
  backpack: "Rucksack1.jpg",
  briefcase: "Briefcase-photo.jpg",
  hdmi: "HDMI-Connector.jpg",
  "usb-c": "USB-C_plug,_focus_stacked.jpg",
};

// Najpierw konkretny model (tytuł), potem podkategoria z seeda.
const TITLE_RULES: [RegExp, string][] = [
  [/MacBook Air/, "macbook-air"],
  [/MacBook Pro/, "macbook-pro"],
  [/XPS/, "dell-xps"],
  [/Yoga/, "lenovo-yoga"],
  [/ThinkPad X1/, "thinkpad-x1"],
  [/ThinkPad T14/, "thinkpad-t14"],
  [/ThinkPad E/, "thinkpad-e"],
  [/ThinkBook/, "thinkbook"],
  [/EliteBook|Spectre/, "elitebook"],
  [/ProBook|HP 250/, "probook"],
  [/Latitude/, "latitude"],
  [/Lifebook/i, "lifebook"],
  [/Katana|Omen/, "ideapad"],
  [/Mac mini/, "mac-mini"],
  [/Mac Studio/, "mac-studio"],
  [/HP Z2/, "hp-z"],
  [/Magic Keyboard/, "magic-keyboard"],
  [/Keychron|BlackWidow|Apex|MX Mechanical/, "keyboard-mechanical"],
  [/TrackPoint/, "trackpoint"],
  [/Magic Mouse/, "magic-mouse"],
  [/Logitech M|Razer/, "mouse-2"],
  [/Sony|Bose/, "headphones"],
  [/SO-DIMM/, "ram-sodimm"],
  [/Backpack|Plecak/i, "backpack"],
  [/HDMI/, "hdmi"],
];

const CATEGORY_DEFAULTS: Record<string, string[]> = {
  Ultrabooki: ["ultrabook"],
  "Laptopy biznesowe": ["thinkpad-t14"],
  "Laptopy gamingowe": ["gaming-laptop"],
  "Komputery stacjonarne": ["pc-tower"],
  "Mini PC": ["mini-pc"],
  "Stacje robocze": ["workstation"],
  "Monitory biurowe": ["monitor-office", "monitor-office-2"],
  "Monitory gamingowe": ["monitor-gaming"],
  "Monitory profesjonalne": ["monitor-pro"],
  Klawiatury: ["keyboard"],
  Myszy: ["mouse"],
  Słuchawki: ["headset"],
  "Kamery internetowe": ["webcam"],
  "Dyski SSD": ["ssd"],
  "Pamięć RAM": ["ram"],
  "Karty graficzne": ["gpu"],
  "Stacje dokujące": ["dock"],
  "Torby i plecaki": ["briefcase"],
  "Kable i adaptery": ["usb-c"],
};

const categoryByTitle = new Map(CATALOG.map((item) => [item.title, item.category]));

const hasFile = (key: string): boolean => existsSync(join(STATIC_DIR, fileNameFor(key)));

// Konkretny model, a gdy jego zdjęcia nie ma na dysku: zdjęcie podkategorii.
function imageKeyFor(title: string, index: number): string | undefined {
  const rule = TITLE_RULES.find(([pattern]) => pattern.test(title));
  if (rule && hasFile(rule[1])) return rule[1];
  const defaults = (CATEGORY_DEFAULTS[categoryByTitle.get(title) ?? ""] ?? []).filter(hasFile);
  return defaults.length ? defaults[index % defaults.length] : undefined;
}

const fileNameFor = (key: string): string => `${key}${IMAGES[key].match(/\.(png|jpe?g)$/i)?.[0].toLowerCase() ?? ".jpg"}`;

async function thumbUrls(): Promise<Map<string, string>> {
  const titles = Object.values(IMAGES).map((file) => `File:${file}`);
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url" +
    `&iiurlwidth=${THUMB_WIDTH}&titles=${encodeURIComponent(titles.join("|"))}`;
  const json = (await fetch(url, { headers: { "user-agent": UA } }).then((r) => r.json())) as {
    query: { normalized?: { from: string; to: string }[]; pages: Record<string, { title: string; imageinfo?: { thumburl: string }[] }> };
  };
  const fromNormalized = new Map((json.query.normalized ?? []).map((n) => [n.to, n.from]));
  const result = new Map<string, string>();
  for (const page of Object.values(json.query.pages)) {
    const original = (fromNormalized.get(page.title) ?? page.title).replace(/^File:/, "");
    const thumb = page.imageinfo?.[0]?.thumburl;
    if (thumb) result.set(original, thumb);
  }
  return result;
}

async function download(url: string, target: string): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, { headers: { "user-agent": UA } });
    if (response.ok) {
      writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (response.status !== 429 || attempt === 4) throw new Error(`${response.status} ${url}`);
    await Bun.sleep(5000 * attempt);
  }
}

async function downloadAll(): Promise<void> {
  mkdirSync(STATIC_DIR, { recursive: true });
  const missing = Object.keys(IMAGES).filter((key) => !existsSync(join(STATIC_DIR, fileNameFor(key))));
  if (missing.length === 0) return console.log("Zdjęcia już są w static/products.");
  const urls = await thumbUrls();
  for (const key of missing) {
    const url = urls.get(IMAGES[key]);
    if (!url) {
      console.warn(`brak pliku na Commons: ${IMAGES[key]}`);
      continue;
    }
    try {
      await download(url, join(STATIC_DIR, fileNameFor(key)));
      console.log(`ściągnięte: ${fileNameFor(key)}`);
    } catch (error) {
      console.warn(`pominięte (${(error as Error).message.slice(0, 60)}), puść skrypt jeszcze raz później`);
    }
    await Bun.sleep(1200);
  }
}

async function adminToken(): Promise<string> {
  const response = await fetch(`${API}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "supersecret" }),
  });
  const { token } = (await response.json()) as { token?: string };
  if (!token) throw new Error(`logowanie admina nie wyszło (${response.status}). Backend chodzi?`);
  return token;
}

async function attachImages(): Promise<void> {
  const headers = { authorization: `Bearer ${await adminToken()}`, "content-type": "application/json" };
  const { products } = (await fetch(`${API}/admin/products?limit=500&fields=id,title`, { headers }).then((r) => r.json())) as {
    products: { id: string; title: string }[];
  };
  const perCategoryIndex = new Map<string, number>();
  let updated = 0;
  for (const product of products) {
    const category = categoryByTitle.get(product.title) ?? "";
    const index = perCategoryIndex.get(category) ?? 0;
    perCategoryIndex.set(category, index + 1);
    const key = imageKeyFor(product.title, index);
    if (!key) {
      console.warn(`bez zdjęcia: ${product.title}`);
      continue;
    }
    const url = `${PUBLIC_BASE}/${fileNameFor(key)}`;
    const response = await fetch(`${API}/admin/products/${product.id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ thumbnail: url, images: [{ url }] }),
    });
    if (!response.ok) {
      console.warn(`nie zapisane (${response.status}): ${product.title} ${(await response.text()).slice(0, 160)}`);
      continue;
    }
    updated++;
  }
  console.log(`Zdjęcia przypięte do ${updated}/${products.length} produktów.`);
}

await downloadAll();
await attachImages();
