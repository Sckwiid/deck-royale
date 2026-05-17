import type { CardInfo, DeckCardData } from "@/types";

export const cardCatalog: CardInfo[] = [
  {
    key: "knight",
    nameFr: "Chevalier",
    nameEn: "Knight",
    icon: "https://api-assets.clashroyale.com/cards/300/knight.png"
  },
  {
    key: "archers",
    nameFr: "Archers",
    nameEn: "Archers",
    icon: "https://api-assets.clashroyale.com/cards/300/archers.png"
  },
  {
    key: "fireball",
    nameFr: "Boule de feu",
    nameEn: "Fireball",
    icon: "https://api-assets.clashroyale.com/cards/300/fireball.png"
  },
  {
    key: "tesla",
    nameFr: "Tesla",
    nameEn: "Tesla",
    icon: "https://api-assets.clashroyale.com/cards/300/tesla.png"
  },
  {
    key: "hog-rider",
    nameFr: "Cochon",
    nameEn: "Hog Rider",
    icon: "https://api-assets.clashroyale.com/cards/300/hog-rider.png"
  },
  {
    key: "the-log",
    nameFr: "La Bûche",
    nameEn: "The Log",
    icon: "https://api-assets.clashroyale.com/cards/300/the-log.png"
  },
  {
    key: "ice-spirit",
    nameFr: "Esprit de glace",
    nameEn: "Ice Spirit",
    icon: "https://api-assets.clashroyale.com/cards/300/ice-spirit.png"
  },
  {
    key: "skeletons",
    nameFr: "Squelettes",
    nameEn: "Skeletons",
    icon: "https://api-assets.clashroyale.com/cards/300/skeletons.png"
  }
];

export const mockDecks: DeckCardData[] = [
  {
    id: "hog-cycle-core",
    name: "Hog Cycle Core",
    winRate: 56.8,
    useRate: 14.2,
    trophies: [5000, 7000],
    cards: [
      "hog-rider",
      "knight",
      "archers",
      "tesla",
      "fireball",
      "the-log",
      "ice-spirit",
      "skeletons"
    ],
    avgElixir: 2.9,
    archetype: "Cycle"
  },
  {
    id: "control-bait",
    name: "Control Bait",
    winRate: 54.9,
    useRate: 11.1,
    trophies: [4500, 6500],
    cards: [
      "knight",
      "archers",
      "tesla",
      "fireball",
      "the-log",
      "ice-spirit",
      "skeletons",
      "hog-rider"
    ],
    avgElixir: 3.1,
    archetype: "Control"
  }
];

export const mockStats = {
  playersTracked: "128k",
  decksIndexed: "2.1k",
  refresh: "15 min"
};
