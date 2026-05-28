// Nice Classification — the 45-class international system for trademark
// goods and services. Source of truth: WIPO Nice Classification, 12th
// edition. Heading text below is a condensed paraphrase suitable for UI
// display + keyword detection. NOT a legal substitute for the full WIPO
// class headings.

export type NiceClass = {
  number: number;
  kind: "goods" | "services";
  heading: string;
  // Keywords for the auto-detector. Lowercase; matched as whole words.
  keywords: string[];
  // Classes considered closely related for risk-spread purposes — e.g.
  // class 32 (non-alc drinks) is close to 33 (alcoholic) and 30 (coffee/tea).
  related: number[];
};

export const NICE_CLASSES: NiceClass[] = [
  { number: 1, kind: "goods", heading: "Chemicals for industry, science, agriculture", keywords: ["chemical", "fertiliser", "fertilizer", "resin"], related: [2, 4, 5] },
  { number: 2, kind: "goods", heading: "Paints, varnishes, anti-rust preparations", keywords: ["paint", "varnish", "lacquer", "dye"], related: [1, 17] },
  { number: 3, kind: "goods", heading: "Cosmetics, soaps, perfumery, cleaning preparations", keywords: ["cosmetic", "soap", "perfume", "shampoo", "lotion", "cream", "skincare", "makeup", "fragrance"], related: [5, 21] },
  { number: 4, kind: "goods", heading: "Industrial oils, fuels, candles", keywords: ["oil", "fuel", "candle", "wax", "lubricant"], related: [1] },
  { number: 5, kind: "goods", heading: "Pharmaceuticals, medical supplies, dietary supplements", keywords: ["pharma", "medicine", "medical", "supplement", "vitamin", "drug", "ointment", "bandage"], related: [3, 10] },
  { number: 6, kind: "goods", heading: "Common metals and their alloys, ironmongery", keywords: ["metal", "iron", "steel", "aluminium", "aluminum", "hardware"], related: [7, 8] },
  { number: 7, kind: "goods", heading: "Machines and machine tools, motors and engines", keywords: ["machine", "engine", "motor", "tool"], related: [6, 12] },
  { number: 8, kind: "goods", heading: "Hand tools, cutlery, razors", keywords: ["hand tool", "cutlery", "knife", "razor", "scissors"], related: [21] },
  { number: 9, kind: "goods", heading: "Electronics, software, scientific apparatus", keywords: ["software", "app", "computer", "electronic", "phone", "headphone", "speaker", "camera", "battery", "ai", "platform"], related: [42, 38] },
  { number: 10, kind: "goods", heading: "Medical apparatus, surgical instruments", keywords: ["surgical", "orthopedic", "orthopaedic", "dental"], related: [5] },
  { number: 11, kind: "goods", heading: "Lighting, heating, cooking, refrigerating apparatus", keywords: ["light", "lamp", "heater", "oven", "fridge", "refrigerator", "kettle", "cooker"], related: [9, 21] },
  { number: 12, kind: "goods", heading: "Vehicles, apparatus for locomotion", keywords: ["car", "vehicle", "bike", "bicycle", "motor", "boat", "scooter"], related: [7] },
  { number: 13, kind: "goods", heading: "Firearms, ammunition, fireworks", keywords: ["firearm", "ammunition", "firework"], related: [] },
  { number: 14, kind: "goods", heading: "Jewellery, precious metals, watches", keywords: ["jewellery", "jewelry", "watch", "ring", "necklace", "earring", "bracelet"], related: [25] },
  { number: 15, kind: "goods", heading: "Musical instruments", keywords: ["guitar", "piano", "instrument", "musical"], related: [9] },
  { number: 16, kind: "goods", heading: "Paper, stationery, printed matter, books", keywords: ["paper", "book", "magazine", "stationery", "pen", "card", "poster"], related: [41] },
  { number: 17, kind: "goods", heading: "Rubber, plastics, insulating materials", keywords: ["rubber", "plastic", "insulating", "hose"], related: [2] },
  { number: 18, kind: "goods", heading: "Leather, luggage, bags, umbrellas", keywords: ["leather", "bag", "handbag", "wallet", "luggage", "suitcase", "backpack", "umbrella"], related: [25] },
  { number: 19, kind: "goods", heading: "Non-metallic building materials", keywords: ["concrete", "stone", "brick", "tile"], related: [37] },
  { number: 20, kind: "goods", heading: "Furniture, mirrors, picture frames", keywords: ["furniture", "chair", "table", "bed", "mirror", "frame", "sofa"], related: [21] },
  { number: 21, kind: "goods", heading: "Household utensils, glassware, brushes", keywords: ["utensil", "kitchen", "glass", "cup", "mug", "plate", "brush", "comb"], related: [11, 8] },
  { number: 22, kind: "goods", heading: "Ropes, nets, awnings, raw textile fibres", keywords: ["rope", "net", "awning", "tent"], related: [23, 24] },
  { number: 23, kind: "goods", heading: "Yarns and threads for textile use", keywords: ["yarn", "thread"], related: [22, 24] },
  { number: 24, kind: "goods", heading: "Textiles, bed and table covers", keywords: ["textile", "fabric", "bedsheet", "towel", "blanket", "curtain"], related: [25] },
  { number: 25, kind: "goods", heading: "Clothing, footwear, headwear", keywords: ["clothing", "apparel", "shirt", "tshirt", "t-shirt", "pant", "dress", "shoe", "footwear", "hat", "cap", "jacket", "sock"], related: [14, 18, 24] },
  { number: 26, kind: "goods", heading: "Lace, ribbons, buttons, artificial flowers", keywords: ["lace", "ribbon", "button", "zip"], related: [25] },
  { number: 27, kind: "goods", heading: "Carpets, rugs, wall coverings", keywords: ["carpet", "rug", "wallpaper"], related: [24] },
  { number: 28, kind: "goods", heading: "Games, toys, sporting goods, Christmas decorations", keywords: ["toy", "game", "puzzle", "doll", "ball", "sporting", "skateboard", "surfboard"], related: [41] },
  { number: 29, kind: "goods", heading: "Meat, fish, poultry, dairy, oils for food", keywords: ["meat", "fish", "poultry", "dairy", "milk", "cheese", "yoghurt", "yogurt", "butter", "egg", "jam", "preserve", "fruit oil"], related: [30, 31] },
  { number: 30, kind: "goods", heading: "Coffee, tea, bakery, sauces, condiments, ice", keywords: ["coffee", "tea", "bread", "bakery", "biscuit", "cake", "cookie", "chocolate", "sauce", "condiment", "honey", "cereal", "rice", "pasta", "pizza"], related: [29, 32] },
  { number: 31, kind: "goods", heading: "Raw agricultural products, live animals, fresh produce", keywords: ["fresh fruit", "fresh vegetable", "produce", "seed", "plant", "flower", "live animal", "pet food"], related: [29] },
  { number: 32, kind: "goods", heading: "Beers, non-alcoholic beverages, mineral waters, fruit juices", keywords: ["beer", "lemonade", "soda", "softdrink", "soft drink", "cola", "juice", "smoothie", "water", "mineral water", "sparkling water", "kombucha", "energy drink", "sports drink", "cordial"], related: [33, 30] },
  { number: 33, kind: "goods", heading: "Alcoholic beverages (except beers)", keywords: ["wine", "spirit", "whisky", "whiskey", "vodka", "gin", "rum", "tequila", "cocktail", "liqueur", "champagne", "cider"], related: [32] },
  { number: 34, kind: "goods", heading: "Tobacco, smokers' articles, matches", keywords: ["tobacco", "cigar", "cigarette", "vape", "e-cigarette"], related: [] },
  { number: 35, kind: "services", heading: "Advertising, business management, retail services", keywords: ["advertising", "marketing", "retail", "ecommerce", "e-commerce", "shop", "store", "wholesale", "business management", "consulting", "agency"], related: [36, 41] },
  { number: 36, kind: "services", heading: "Insurance, finance, real estate, banking", keywords: ["insurance", "finance", "banking", "real estate", "mortgage", "investment", "crypto"], related: [35] },
  { number: 37, kind: "services", heading: "Construction, repair, installation", keywords: ["construction", "repair", "installation", "plumbing", "electrical", "building"], related: [19, 40] },
  { number: 38, kind: "services", heading: "Telecommunications", keywords: ["telecom", "broadcasting", "streaming", "messaging"], related: [9, 41] },
  { number: 39, kind: "services", heading: "Transport, packaging, storage, travel arrangement", keywords: ["transport", "delivery", "shipping", "logistics", "travel", "tour", "warehouse"], related: [35] },
  { number: 40, kind: "services", heading: "Treatment of materials, manufacturing for others", keywords: ["manufacturing", "printing", "tailoring", "recycling"], related: [37] },
  { number: 41, kind: "services", heading: "Education, entertainment, sporting and cultural activities", keywords: ["education", "training", "school", "course", "tutoring", "publishing", "entertainment", "music", "film", "gaming", "podcast", "event", "sport"], related: [9, 28] },
  { number: 42, kind: "services", heading: "Scientific and technological research, software design", keywords: ["software development", "saas", "research", "engineering", "design", "hosting", "web design", "data", "ai service"], related: [9, 45] },
  { number: 43, kind: "services", heading: "Food and drink services, accommodation", keywords: ["restaurant", "cafe", "café", "bar", "pub", "hotel", "accommodation", "catering", "takeaway", "food truck"], related: [29, 30, 32] },
  { number: 44, kind: "services", heading: "Medical, veterinary, beauty and agricultural services", keywords: ["clinic", "medical service", "veterinary", "vet", "salon", "spa", "beauty", "gardening", "agriculture"], related: [5, 3] },
  { number: 45, kind: "services", heading: "Legal, security, personal and social services", keywords: ["legal", "law", "lawyer", "attorney", "security", "funeral", "dating"], related: [36] },
];

export function getNiceClass(n: number | string): NiceClass | undefined {
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  return NICE_CLASSES.find((c) => c.number === num);
}

export function relatedClasses(n: number | string): number[] {
  return getNiceClass(n)?.related ?? [];
}

// Heuristic: given a product description or candidate name, guess the
// most likely Nice classes. Returns ordered list (most likely first).
export function detectClasses(text: string): number[] {
  const lower = text.toLowerCase();
  const scores = new Map<number, number>();
  for (const c of NICE_CLASSES) {
    let score = 0;
    for (const kw of c.keywords) {
      // Whole-word-ish match: word boundary on either side.
      const re = new RegExp(`(^|[^a-z0-9])${kw.replace(/[-/]/g, "[-/ ]?")}([^a-z0-9]|$)`, "i");
      if (re.test(lower)) score++;
    }
    if (score > 0) scores.set(c.number, score);
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => n);
}

// Format helper for UI: "Class 32 — Beers, non-alcoholic beverages…"
export function formatClass(n: number | string): string {
  const c = getNiceClass(n);
  if (!c) return `Class ${n}`;
  return `Class ${c.number} — ${c.heading}`;
}
