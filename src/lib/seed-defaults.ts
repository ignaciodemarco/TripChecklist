// Default packing items seeded for specific users on first sign-in.
// Sourced from the original "Ropa para Viajes.xlsx" master list.

import type { DefaultItem } from "./types";

export const SEED_USER_EMAILS = new Set<string>([
  "ignacio.demarco@bairesdev.com",
  "magui.jpc@gmail.com",
]);

// label = English; spanish kept in parens to preserve the original
export const SEED_DEFAULTS: DefaultItem[] = [
  // Footwear
  { itemKey: "flipflops",    label: "Flip-flops (Ojotas)",            category: "Footwear",   qty: 1 },
  { itemKey: "sneakers",     label: "Sneakers / shoes (Zapatillas)",  category: "Footwear",   qty: 1 },

  // Clothing — basics
  { itemKey: "socks",        label: "Socks (Medias)",                 category: "Clothing — Basics", qty: 1 },
  { itemKey: "underwear",    label: "Underwear (Calzoncillos)",       category: "Clothing — Basics", qty: 1 },
  { itemKey: "pajamas",      label: "Pajamas (Pijama)",               category: "Clothing — Basics", qty: 1 },

  // Bottoms
  { itemKey: "pants",        label: "Pants (Pantalones)",             category: "Clothing — Bottoms", qty: 1 },
  { itemKey: "belt",         label: "Belt (Cinturón)",                category: "Clothing — Bottoms", qty: 1 },
  { itemKey: "shorts",       label: "Shorts & swimsuit (Shorts/Traje de baño)", category: "Clothing — Bottoms", qty: 1 },

  // Tops & outerwear
  { itemKey: "tshirts",      label: "T-shirts / button-ups (Remeras/Camisas)", category: "Clothing — Tops", qty: 1 },
  { itemKey: "sweater",      label: "Sweater / hoodie (Sweater/Buzo)", category: "Clothing — Outerwear", qty: 1 },

  // Sports
  { itemKey: "sportsKit",    label: "Sports kit (Remeras + medias + shorts)", category: "Sports", qty: 1 },

  // Accessories
  { itemKey: "sunglasses",   label: "Sunglasses (Lentes de sol)",     category: "Accessories", qty: 1 },

  // Toiletries
  { itemKey: "toothbrush",   label: "Toothbrush (Cepillo de dientes)", category: "Toiletries", qty: 1 },
  { itemKey: "toothpaste",   label: "Toothpaste (Pasta de dientes)",  category: "Toiletries", qty: 1 },
  { itemKey: "razor",        label: "Razor (Afeitadora / Gillette)",  category: "Toiletries", qty: 1 },
  { itemKey: "talc",         label: "Talcum powder (Talco)",          category: "Toiletries", qty: 1 },
  { itemKey: "nailClipper",  label: "Nail clipper (Corta uñas)",      category: "Toiletries", qty: 1 },
  { itemKey: "hairGel",      label: "Hair gel (Gel)",                 category: "Toiletries", qty: 1 },
  { itemKey: "deodorant",    label: "Deodorant (Desodorante)",        category: "Toiletries", qty: 1 },
  { itemKey: "perfume",      label: "Perfume",                        category: "Toiletries", qty: 1 },
  { itemKey: "moisturizer",  label: "Moisturizer (Crema humectante)", category: "Toiletries", qty: 1 },
  { itemKey: "soap",         label: "Bar soap (Jabón DOVE)",          category: "Toiletries", qty: 1 },
  { itemKey: "comb",         label: "Comb (Peine)",                   category: "Toiletries", qty: 1 },
  { itemKey: "noseTrim",     label: "Nose hair trimmer (Corta pelos)", category: "Toiletries", qty: 1 },
  { itemKey: "nailPolish",   label: "Nail polish (Esmalte uñas)",     category: "Toiletries", qty: 1 },
  { itemKey: "sunscreen",    label: "Sunscreen (Protector solar)",    category: "Toiletries", qty: 1 },

  // Health
  { itemKey: "azithro",      label: "Azithromycin (Azitromicina)",    category: "Health", qty: 1 },
  { itemKey: "cipro",        label: "Ciprofloxacin (Ciprofloxa)",     category: "Health", qty: 1 },
  { itemKey: "aspirin",      label: "Aspirin",                        category: "Health", qty: 1 },
  { itemKey: "antiAging",    label: "Anti-aging pills",               category: "Health", qty: 1 },
  { itemKey: "proteinShake", label: "Protein shake",                  category: "Health", qty: 1 },
  { itemKey: "lubricant",    label: "Lubricant & derivatives",        category: "Health", qty: 1 },

  // Documents
  { itemKey: "id",           label: "Driver's license (Registro)",    category: "Documents", qty: 1 },
  { itemKey: "passport",     label: "Passport (Pasaporte)",           category: "Documents", qty: 1 },
  { itemKey: "cards",        label: "Credit card (Tarjeta de crédito)", category: "Documents", qty: 1 },
  { itemKey: "cash",         label: "Cash (Dinero)",                  category: "Documents", qty: 1 },
  { itemKey: "businessCards",label: "Business cards (Tarjetas Personales)", category: "Documents", qty: 1 },
  { itemKey: "houseCheck",   label: "Notify house-sitter / mail",     category: "Documents", qty: 1 },

  // Electronics
  { itemKey: "laptop",       label: "Laptop",                         category: "Electronics", qty: 1 },
  { itemKey: "phoneCharger", label: "Phone charger (Cargador celular)", category: "Electronics", qty: 1 },
  { itemKey: "adapter",      label: "Plug adapter (Adaptador enchufe)", category: "Electronics", qty: 1 },
  { itemKey: "batteries",    label: "Batteries (Pilas)",              category: "Electronics", qty: 1 },
  { itemKey: "hdmi",         label: "HDMI cable",                     category: "Electronics", qty: 1 },
  { itemKey: "btMask",       label: "Bluetooth night mask",           category: "Electronics", qty: 1 },

  // Misc / lifestyle
  // Note: towel and hand warmers used to live here as auto-defaults, but they
  // are highly trip-dependent (towel = camping/hostel; hand warmers = freezing
  // weather or skiing) so they are now generated conditionally by the rule
  // engine in lib/packing.ts and the AI prompt in lib/ai.ts instead.
  { itemKey: "plasticBags",  label: "Plastic bags (Bolsas de nylon)", category: "Misc", qty: 1 },
  { itemKey: "pen",          label: "Pen (Birome)",                   category: "Misc", qty: 1 },
  { itemKey: "boardGames",   label: "Board games",                    category: "Misc", qty: 1 },
  { itemKey: "itBag",        label: "IT bag (Bolsito de IT)",         category: "Misc", qty: 1 },
  { itemKey: "bidet",        label: "Portable bidet",                 category: "Misc", qty: 1 },
  { itemKey: "skiPasses",    label: "Ski passes",                     category: "Documents", qty: 1 },

  // Suits (depends, but kept in defaults for completeness)
  { itemKey: "suit",         label: "Suit (Trajes)",                  category: "Clothing — Formal", qty: 1 },
];
