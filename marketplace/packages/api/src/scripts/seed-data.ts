// Dane do seeda marketplace'u z elektroniką (hackathon RFQ).
// Ceny katalogowe w PLN (jednostki główne, jak w Medusie v2). Druga waluta (EUR) liczona kursem EUR_RATE.

export const COUNTRIES = ["pl"];
export const CURRENCY = "pln";
export const EUR_RATE = 4.3;
export const SELLER_PASSWORD = "supersecret";
export const SHIPPING_PRICE_PLN = 20;

export const CATEGORY_TREE: Record<string, string[]> = {
  Laptopy: ["Ultrabooki", "Laptopy biznesowe", "Laptopy gamingowe"],
  Komputery: ["Komputery stacjonarne", "Mini PC", "Stacje robocze"],
  Monitory: ["Monitory biurowe", "Monitory gamingowe", "Monitory profesjonalne"],
  Peryferia: ["Klawiatury", "Myszy", "Słuchawki", "Kamery internetowe"],
  Podzespoły: ["Dyski SSD", "Pamięć RAM", "Karty graficzne"],
  Akcesoria: ["Stacje dokujące", "Torby i plecaki", "Kable i adaptery"],
};

export const COLOR_VALUES = ["Black", "Grey", "Silver", "White", "Blue", "Green"];
export const CONDITION_VALUES = ["New", "Refurbished"];

export type CatalogItem = {
  title: string;
  brand: string;
  category: string;
  price: number;
  color: string;
};

// [tytuł, podkategoria, cena katalogowa PLN, kolor]. Marka = pierwsze słowo tytułu.
const CATALOG_ROWS: [string, string, number, string][] = [
  ["Apple MacBook Air 13 M4 16 GB / 512 GB", "Ultrabooki", 4790, "Silver"],
  ["Apple MacBook Air 15 M3 16 GB / 512 GB", "Ultrabooki", 6999, "Grey"],
  ["Apple MacBook Pro 14 M4 16 GB / 512 GB", "Ultrabooki", 8499, "Black"],
  ["Apple MacBook Pro 16 M4 Pro 24 GB / 1 TB", "Ultrabooki", 12999, "Black"],
  ["Dell XPS 13 9340 16 GB / 512 GB", "Ultrabooki", 6499, "Silver"],
  ["ASUS Zenbook 14 OLED 16 GB / 1 TB", "Ultrabooki", 4799, "Blue"],
  ["Lenovo Yoga Slim 7 14 32 GB / 1 TB", "Ultrabooki", 5299, "Grey"],
  ["HP Spectre x360 14 16 GB / 1 TB", "Ultrabooki", 6999, "Black"],
  ["Lenovo ThinkPad T14 Gen 5 16 GB / 512 GB", "Laptopy biznesowe", 4390, "Black"],
  ["Lenovo ThinkPad X1 Carbon Gen 12 32 GB / 1 TB", "Laptopy biznesowe", 8999, "Black"],
  ["Lenovo ThinkPad E14 Gen 6 16 GB / 512 GB", "Laptopy biznesowe", 3799, "Black"],
  ["Lenovo ThinkBook 14 G7 16 GB / 512 GB", "Laptopy biznesowe", 3299, "Grey"],
  ["HP EliteBook 840 G11 16 GB / 512 GB", "Laptopy biznesowe", 4590, "Silver"],
  ["HP ProBook 450 G10 16 GB / 512 GB", "Laptopy biznesowe", 3699, "Silver"],
  ["HP 250 G10 8 GB / 512 GB", "Laptopy biznesowe", 2299, "Grey"],
  ["Dell Latitude 5450 16 GB / 512 GB", "Laptopy biznesowe", 4999, "Grey"],
  ["Dell Latitude 7450 32 GB / 1 TB", "Laptopy biznesowe", 6999, "Grey"],
  ["Fujitsu Lifebook U7413 16 GB / 512 GB", "Laptopy biznesowe", 4599, "Black"],
  ["ASUS ROG Strix G16 RTX 4070 32 GB / 1 TB", "Laptopy gamingowe", 7999, "Black"],
  ["Lenovo Legion 5 Pro RTX 4060 32 GB / 1 TB", "Laptopy gamingowe", 6999, "Grey"],
  ["MSI Katana 15 RTX 4060 16 GB / 1 TB", "Laptopy gamingowe", 4999, "Black"],
  ["Acer Nitro V 15 RTX 4050 16 GB / 512 GB", "Laptopy gamingowe", 3799, "Black"],
  ["HP Omen 16 RTX 4070 32 GB / 1 TB", "Laptopy gamingowe", 7499, "Black"],
  ["Dell OptiPlex 7020 Tower i5 16 GB / 512 GB", "Komputery stacjonarne", 3499, "Black"],
  ["HP Pro Tower 400 G9 i5 16 GB / 512 GB", "Komputery stacjonarne", 3199, "Black"],
  ["Lenovo ThinkCentre M70t Gen 5 i7 16 GB / 1 TB", "Komputery stacjonarne", 4299, "Black"],
  ["Apple Mac mini M4 16 GB / 512 GB", "Mini PC", 3799, "Silver"],
  ["Intel NUC 13 Pro i5 16 GB / 512 GB", "Mini PC", 2899, "Black"],
  ["Lenovo ThinkCentre M75q Tiny Gen 5 16 GB / 512 GB", "Mini PC", 2999, "Black"],
  ["HP Elite Mini 800 G9 i5 16 GB / 512 GB", "Mini PC", 3599, "Black"],
  ["Dell Precision 3680 Tower i9 64 GB / 2 TB", "Stacje robocze", 11999, "Black"],
  ["HP Z2 Tower G9 i7 32 GB / 1 TB", "Stacje robocze", 8999, "Black"],
  ["Apple Mac Studio M4 Max 36 GB / 1 TB", "Stacje robocze", 10999, "Silver"],
  ["Dell P2425H 24 IPS Full HD", "Monitory biurowe", 799, "Black"],
  ["Dell UltraSharp U2724D 27 QHD", "Monitory biurowe", 2199, "Silver"],
  ["LG 27UP650 27 4K", "Monitory biurowe", 1599, "White"],
  ["Philips 243V7QDAB 24 Full HD", "Monitory biurowe", 499, "Black"],
  ["Lenovo ThinkVision T27h-30 27 QHD", "Monitory biurowe", 1499, "Black"],
  ["HP E24 G5 24 Full HD", "Monitory biurowe", 749, "Black"],
  ["Samsung Odyssey G5 27 QHD 165 Hz", "Monitory gamingowe", 1199, "Black"],
  ["LG UltraGear 27GR75Q 27 QHD 165 Hz", "Monitory gamingowe", 1299, "Black"],
  ["ASUS TUF VG27AQ 27 QHD 165 Hz", "Monitory gamingowe", 1199, "Black"],
  ["AOC 24G2SPU 24 Full HD 165 Hz", "Monitory gamingowe", 649, "Black"],
  ["Apple Studio Display 27 5K", "Monitory profesjonalne", 7499, "Silver"],
  ["BenQ PD2706U 27 4K", "Monitory profesjonalne", 2499, "Grey"],
  ["Eizo FlexScan EV2795 27 QHD", "Monitory profesjonalne", 3499, "Black"],
  ["Logitech MX Keys S", "Klawiatury", 499, "Grey"],
  ["Logitech MX Mechanical", "Klawiatury", 699, "Grey"],
  ["Logitech K120", "Klawiatury", 59, "Black"],
  ["Apple Magic Keyboard z Touch ID", "Klawiatury", 749, "White"],
  ["Keychron K2 Pro", "Klawiatury", 549, "Grey"],
  ["Keychron Q1 Max", "Klawiatury", 999, "Black"],
  ["Razer BlackWidow V4", "Klawiatury", 799, "Black"],
  ["SteelSeries Apex Pro TKL", "Klawiatury", 999, "Black"],
  ["Microsoft Ergonomic Keyboard", "Klawiatury", 249, "Black"],
  ["Dell KB216", "Klawiatury", 69, "Black"],
  ["Lenovo ThinkPad TrackPoint Keyboard II", "Klawiatury", 499, "Black"],
  ["HP 230 Wireless Keyboard", "Klawiatury", 129, "Black"],
  ["Logitech MX Master 3S", "Myszy", 449, "Grey"],
  ["Logitech MX Anywhere 3S", "Myszy", 349, "Grey"],
  ["Logitech M185", "Myszy", 59, "Grey"],
  ["Apple Magic Mouse", "Myszy", 399, "White"],
  ["Razer DeathAdder V3", "Myszy", 349, "Black"],
  ["Microsoft Bluetooth Ergonomic Mouse", "Myszy", 179, "Black"],
  ["Jabra Evolve2 65", "Słuchawki", 999, "Black"],
  ["Sony WH-1000XM5", "Słuchawki", 1499, "Black"],
  ["Logitech Zone Vibe 100", "Słuchawki", 449, "Grey"],
  ["Poly Voyager Focus 2", "Słuchawki", 1099, "Black"],
  ["Logitech C920 HD Pro", "Kamery internetowe", 299, "Black"],
  ["Logitech Brio 4K", "Kamery internetowe", 899, "Black"],
  ["Razer Kiyo Pro", "Kamery internetowe", 699, "Black"],
  ["Samsung 990 PRO 2 TB NVMe", "Dyski SSD", 799, "Black"],
  ["WD Black SN850X 1 TB NVMe", "Dyski SSD", 449, "Black"],
  ["Crucial P3 Plus 1 TB NVMe", "Dyski SSD", 279, "Black"],
  ["Kingston KC3000 2 TB NVMe", "Dyski SSD", 649, "Black"],
  ["Kingston FURY Beast DDR5 32 GB 6000 MHz", "Pamięć RAM", 499, "Black"],
  ["Corsair Vengeance DDR5 32 GB 5600 MHz", "Pamięć RAM", 469, "Black"],
  ["Crucial SO-DIMM DDR5 16 GB 5600 MHz", "Pamięć RAM", 199, "Green"],
  ["MSI GeForce RTX 4070 SUPER Ventus 2X 12 GB", "Karty graficzne", 2899, "Black"],
  ["ASUS Dual GeForce RTX 4060 8 GB", "Karty graficzne", 1399, "Black"],
  ["Gigabyte Radeon RX 7800 XT Gaming OC 16 GB", "Karty graficzne", 2399, "Black"],
  ["Dell Dock WD19S USB-C", "Stacje dokujące", 899, "Black"],
  ["Lenovo ThinkPad Universal USB-C Dock", "Stacje dokujące", 999, "Black"],
  ["HP USB-C Dock G5", "Stacje dokujące", 899, "Black"],
  ["CalDigit TS4 Thunderbolt 4", "Stacje dokujące", 1799, "Grey"],
  ["Targus CityLite 15.6", "Torby i plecaki", 199, "Black"],
  ["Lenovo ThinkPad Professional Backpack 16", "Torby i plecaki", 299, "Black"],
  ["Dell Pro Briefcase 15", "Torby i plecaki", 249, "Black"],
  ["Anker USB-C Hub 7 w 1", "Kable i adaptery", 199, "Grey"],
  ["Ugreen Kabel USB-C 2 m 100 W", "Kable i adaptery", 49, "Black"],
  ["Apple Adapter USB-C Digital AV", "Kable i adaptery", 349, "White"],
  ["Belkin Kabel HDMI 2.1 2 m", "Kable i adaptery", 99, "Black"],
];

export const CATALOG: CatalogItem[] = CATALOG_ROWS.map(([title, category, price, color]) => ({
  title,
  brand: title.split(" ")[0],
  category,
  price,
  color,
}));

export type NegotiationStyle = "twardy" | "elastyczny" | "wolumenowy";

export type SellerConfig = {
  name: string;
  email: string;
  first_name: string;
  last_name: string;
  city: string;
  address_1: string;
  // Główne kategorie, które sprzedawca ma w ofercie. "*" = wszystko.
  categories: string[];
  max_discount_pct: number;
  negotiation_style: NegotiationStyle;
};

const seller = (
  name: string,
  handle: string,
  person: [string, string],
  location: [string, string],
  categories: string[],
  max_discount_pct: number,
  negotiation_style: NegotiationStyle
): SellerConfig => ({
  name,
  email: `${handle}@example.com`,
  first_name: person[0],
  last_name: person[1],
  city: location[0],
  address_1: location[1],
  categories,
  max_discount_pct,
  negotiation_style,
});

// Pierwszy sprzedawca służy też jako znacznik, że seed już był uruchomiony.
export const SELLERS: SellerConfig[] = [
  seller("TechHub Warszawa", "techhub", ["Anna", "Nowak"], ["Warszawa", "ul. Marszałkowska 100"], ["*"], 6, "twardy"),
  seller("Bajt Komputery", "bajt", ["Piotr", "Wiśniewski"], ["Kraków", "ul. Długa 15"], ["Laptopy", "Komputery", "Akcesoria"], 10, "elastyczny"),
  seller("ProDesk B2B", "prodesk", ["Katarzyna", "Wójcik"], ["Poznań", "ul. Półwiejska 8"], ["Laptopy", "Komputery", "Monitory", "Akcesoria"], 12, "wolumenowy"),
  seller("Kabel i Chip", "kabelichip", ["Tomasz", "Kamiński"], ["Wrocław", "ul. Świdnicka 40"], ["Podzespoły", "Peryferia", "Akcesoria"], 8, "elastyczny"),
  seller("Laptopownia", "laptopownia", ["Magdalena", "Lewandowska"], ["Łódź", "ul. Piotrkowska 120"], ["Laptopy", "Akcesoria"], 9, "wolumenowy"),
  seller("Klawiszownia", "klawiszownia", ["Michał", "Zieliński"], ["Katowice", "ul. Mariacka 5"], ["Peryferia"], 15, "elastyczny"),
  seller("Ekran i Spółka", "ekran", ["Agnieszka", "Szymańska"], ["Szczecin", "al. Niepodległości 22"], ["Monitory", "Akcesoria"], 10, "twardy"),
  seller("Serwerownia Plus", "serwerownia", ["Krzysztof", "Woźniak"], ["Lublin", "ul. Krakowskie Przedmieście 30"], ["Komputery", "Podzespoły"], 7, "twardy"),
  seller("Bałtyk IT Supply", "baltyk", ["Ewa", "Dąbrowska"], ["Gdańsk", "ul. Długi Targ 11"], ["*"], 8, "wolumenowy"),
  seller("Biuro Tech Rzeszów", "biurotech", ["Paweł", "Kozłowski"], ["Rzeszów", "ul. 3 Maja 14"], ["Peryferia", "Monitory", "Akcesoria"], 11, "elastyczny"),
  seller("GamerZone", "gamerzone", ["Jakub", "Jankowski"], ["Bydgoszcz", "ul. Gdańska 50"], ["Laptopy", "Peryferia", "Podzespoły", "Monitory"], 5, "twardy"),
  seller("Dobry Sprzęt", "dobrysprzet", ["Monika", "Mazur"], ["Białystok", "ul. Lipowa 9"], ["*"], 14, "elastyczny"),
];

// Scenariusz demo „20 MacBooków, 30 Lenovo, 10 HP" z docs/seed-plan.md. Ci sprzedawcy mają
// tylko oferty z DEMO_OFFERS, a produkty z DEMO_OFFERS nie dostają ofert losowych. Historia demo jest stała.
export const DEMO_SELLERS: SellerConfig[] = [
  seller("TechHurt", "techhurt", ["Marek", "Hurtowy"], ["Warszawa", "ul. Grzybowska 5"], [], 0, "twardy"),
  seller("LaptoPol", "laptopol", ["Ola", "Laptopowa"], ["Kraków", "ul. Wielicka 20"], [], 0, "wolumenowy"),
  seller("iStacja", "istacja", ["Igor", "Stacyjny"], ["Gdańsk", "ul. Grunwaldzka 82"], [], 0, "elastyczny"),
];

export type VolumeDiscount = { min_quantity: number; discount_pct: number };
export type DemoOffer = {
  seller: string; // część e-maila przed @
  price: number;
  min_price: number;
  stock: number;
  volume_discounts: VolumeDiscount[];
};

export const DEMO_OFFERS: Record<string, DemoOffer[]> = {
  "Apple MacBook Air 13 M4 16 GB / 512 GB": [
    { seller: "techhurt", price: 4690, min_price: 4390, stock: 25, volume_discounts: [{ min_quantity: 10, discount_pct: 2 }, { min_quantity: 20, discount_pct: 4 }] },
    { seller: "istacja", price: 4790, min_price: 4290, stock: 60, volume_discounts: [{ min_quantity: 10, discount_pct: 3 }, { min_quantity: 20, discount_pct: 6 }] },
  ],
  "Lenovo ThinkPad T14 Gen 5 16 GB / 512 GB": [
    { seller: "techhurt", price: 4290, min_price: 3990, stock: 15, volume_discounts: [{ min_quantity: 10, discount_pct: 3 }] },
    { seller: "laptopol", price: 4390, min_price: 3950, stock: 80, volume_discounts: [{ min_quantity: 10, discount_pct: 3 }, { min_quantity: 25, discount_pct: 7 }] },
  ],
  "HP EliteBook 840 G11 16 GB / 512 GB": [
    { seller: "techhurt", price: 4490, min_price: 4250, stock: 8, volume_discounts: [] },
    { seller: "laptopol", price: 4590, min_price: 4190, stock: 40, volume_discounts: [{ min_quantity: 10, discount_pct: 4 }] },
  ],
};

export const sellerHandle = (config: SellerConfig): string => config.email.split("@")[0];

// PRYWATNE reguły cenowe. Nie zapisujemy ich w metadata oferty ani sprzedawcy, bo /store/offers
// zwraca metadata publicznie (docs/seed-plan.md). Moduł RFQ (F03) bierze cenę minimalną stąd.
export function minPriceFor(seller: string, productTitle: string, offerPrice: number): number {
  const demo = DEMO_OFFERS[productTitle]?.find((offer) => offer.seller === seller);
  if (demo) {
    return demo.min_price;
  }
  const config = [...SELLERS, ...DEMO_SELLERS].find((candidate) => sellerHandle(candidate) === seller);
  return Math.floor(offerPrice * (1 - (config?.max_discount_pct ?? 0) / 100));
}

// Ilu sprzedawców (z pasujących) dostaje ofertę na dany produkt.
export const OFFERS_PER_PRODUCT = { min: 2, max: 5 };
// Rozrzut ceny sprzedawcy wokół ceny katalogowej: ±10%.
export const PRICE_JITTER = 0.1;
// Stan magazynowy na ofertę. Niski zakres, żeby duże RFQ wymagały kilku sprzedawców.
export const STOCK_RANGE = { min: 5, max: 120 };
