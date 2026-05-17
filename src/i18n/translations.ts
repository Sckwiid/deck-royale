import type { Locale } from "@/types";

export interface Dictionary {
  localeLabel: string;
  nav: {
    home: string;
    analyze: string;
    meta: string;
    proTracking: string;
  };
  seo: {
    homeTitle: string;
    homeDescription: string;
    analyzeTitle: string;
    metaTitle: string;
    proTitle: string;
    playerTitle: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    placeholder: string;
    button: string;
  };
  home: {
    trophyPreviewTitle: string;
    trophyPreviewSubtitle: string;
    advantages: Array<{ title: string; description: string }>;
    seoHeading: string;
    seoParagraphs: string[];
  };
  proTrackingPage: {
    title: string;
    subtitle: string;
    features: string[];
    formTitle: string;
    noPayment: string;
    noAutoEnable: string;
    fields: {
      playerTag: string;
      email: string;
      discord: string;
      message: string;
      language: string;
      consent: string;
    };
    placeholders: {
      playerTag: string;
      email: string;
      discord: string;
      message: string;
    };
    submit: string;
    submitting: string;
    successTitle: string;
    successText: string;
    errorTitle: string;
    validation: {
      tagRequired: string;
      contactRequired: string;
      emailInvalid: string;
      consentRequired: string;
    };
  };
  dashboard: {
    loading: string;
    profileHeader: string;
    lastScan: string;
    nextScan: string;
    bestDeckNow: string;
    bestDeckNowNote: string;
    currentRange: string;
    yourDecksVsAverage: string;
    yourDecksVsAverageSubtitle: string;
    trophyMap: string;
    directOpponents: string;
    directOpponentsLocked: string;
    directOpponentsLockedText: string;
    unlockTracking: string;
    deckChangeHistory: string;
    emptyDeckHistory: string;
    basedOnGames: string;
    statsUpdatedAt: string;
    recommendedDeck: string;
    noRecommendedDeck: string;
    tabs: {
      decks: string;
      opponents: string;
      changes: string;
    };
  };
  common: {
    trophies: string;
    bestTrophies: string;
    arena: string;
    trophyRange: string;
    range250: string;
    winrate: string;
    useRate: string;
    games: string;
    avgElixir: string;
    legal: string;
    noData: string;
    retry: string;
  };
  blocks: {
    topDecks: string;
    liveMeta: string;
    quickStats: string;
    proTracking: string;
    comingSoon: string;
  };
}

export const translations: Record<Locale, Dictionary> = {
  fr: {
    localeLabel: "FR",
    nav: {
      home: "Accueil",
      analyze: "Analyser",
      meta: "Meta",
      proTracking: "Pro Tracking"
    },
    seo: {
      homeTitle: "DeckRadar | Decks Clash Royale par Trophées",
      homeDescription:
        "DeckRadar analyse les winrates réels par range de 250 trophées pour recommander les meilleurs decks Clash Royale selon votre profil.",
      analyzeTitle: "DeckRadar | Analyse de Profil",
      metaTitle: "DeckRadar | Meta Clash Royale",
      proTitle: "Tracking avancé Clash Royale | DeckRadar",
      playerTitle: "DeckRadar | Dashboard Joueur"
    },
    hero: {
      badge: "DeckRadar Tactical Intel",
      title: "Trouve le meilleur deck pour ton niveau de trophées",
      subtitle:
        "Analyse les winrates réels par range de 250 trophées, compare tes decks aux autres joueurs et découvre quand changer de deck.",
      placeholder: "Ex: #2PP, #L8Q9R2",
      button: "Analyser mon profil"
    },
    home: {
      trophyPreviewTitle: "Aperçu Trophy Map",
      trophyPreviewSubtitle: "Projection des ranges 250 trophées avec decks dominants.",
      advantages: [
        {
          title: "Decks par trophées",
          description:
            "Chaque recommandation est alignée sur une plage de trophées précise pour éviter les decks hors contexte."
        },
        {
          title: "Comparaison avec ton profil",
          description:
            "Compare tes decks récents à la moyenne observée dans ta range et identifie rapidement les écarts."
        },
        {
          title: "Tracking automatique",
          description:
            "DeckRadar met à jour les statistiques régulièrement pour suivre les changements méta sans action manuelle."
        }
      ],
      seoHeading: "Analyse Clash Royale orientée performance réelle",
      seoParagraphs: [
        "DeckRadar centralise les performances de decks observées en jeu réel pour produire des recommandations contextualisées selon votre niveau de trophées. L'objectif n'est pas de proposer des listes génériques, mais de montrer ce qui gagne effectivement dans votre tranche actuelle.",
        "En combinant suivi de profil, comparaison de vos decks et lecture des ranges de 250 trophées, DeckRadar aide à décider quand conserver un deck, quand l'ajuster, et quand basculer vers une option plus rentable pour progresser sur le ladder."
      ]
    },
    proTrackingPage: {
      title: "Tracking avancé pour joueurs compétitifs",
      subtitle:
        "Suivez vos decks, vos changements de stratégie et vos adversaires directs avec une analyse plus fréquente.",
      features: [
        "Scan prioritaire toutes les 30 à 60 minutes",
        "Suivi de tes decks par range de trophées",
        "Comparaison avec les joueurs de ton niveau",
        "Suivi des adversaires directs uniquement",
        "Détection des changements de deck",
        "Historique de progression"
      ],
      formTitle: "Demander l'activation Pro Tracking",
      noPayment: "Aucun paiement pour l'instant. Cette demande est un simple contact.",
      noAutoEnable:
        "Aucun tracking pro n'est activé automatiquement sans validation admin.",
      fields: {
        playerTag: "Tag joueur",
        email: "Email",
        discord: "Discord",
        message: "Message",
        language: "Langue",
        consent: "Je consens à être contacté à propos de ma demande Pro Tracking."
      },
      placeholders: {
        playerTag: "Ex: #2PP",
        email: "vous@email.com",
        discord: "PseudoDiscord#1234",
        message: "Expliquez votre objectif ou votre contexte compétitif."
      },
      submit: "Envoyer ma demande",
      submitting: "Envoi en cours...",
      successTitle: "Demande envoyée",
      successText:
        "Votre demande Pro Tracking a bien été enregistrée. Notre équipe reviendra vers vous si votre profil est retenu.",
      errorTitle: "Impossible d'envoyer la demande",
      validation: {
        tagRequired: "Le tag joueur est requis.",
        contactRequired: "Ajoutez un email ou un Discord pour être recontacté.",
        emailInvalid: "Le format de l'email est invalide.",
        consentRequired: "Le consentement contact est requis."
      }
    },
    dashboard: {
      loading: "Analyse en cours de votre profil et de vos combats...",
      profileHeader: "Profil joueur",
      lastScan: "Dernier scan",
      nextScan: "Prochain scan",
      bestDeckNow: "Meilleur deck maintenant",
      bestDeckNowNote: "Stats mises à jour automatiquement chaque jour",
      currentRange: "Range actuelle (250)",
      yourDecksVsAverage: "Tes decks vs la moyenne",
      yourDecksVsAverageSubtitle:
        "Lecture rapide de tes résultats récents face à la performance moyenne de ta range.",
      trophyMap: "Trophy Map verticale",
      directOpponents: "Adversaires directs",
      directOpponentsLocked: "Disponible avec Pro Tracking",
      directOpponentsLockedText:
        "Débloquez le suivi prioritaire, les patterns de match-up et les tendances de decks adverses.",
      unlockTracking: "Activer le tracking avancé",
      deckChangeHistory: "Historique de changements de deck",
      emptyDeckHistory: "Aucun changement de deck détecté pour le moment.",
      basedOnGames: "Basé sur {count} games",
      statsUpdatedAt: "Stats mises à jour le",
      recommendedDeck: "Deck recommandé",
      noRecommendedDeck: "Aucune recommandation disponible sur cette range pour le moment.",
      tabs: {
        decks: "Decks",
        opponents: "Adversaires",
        changes: "Historique"
      }
    },
    common: {
      trophies: "Trophées",
      bestTrophies: "Record",
      arena: "Arène",
      trophyRange: "Range trophées",
      range250: "Range 250",
      winrate: "Winrate",
      useRate: "Taux d'usage",
      games: "Games",
      avgElixir: "Elixir moyen",
      legal:
        "DeckRadar is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Clash Royale and Supercell are trademarks of Supercell Oy.",
      noData: "Aucune donnée disponible.",
      retry: "Réessayer"
    },
    blocks: {
      topDecks: "Decks recommandés",
      liveMeta: "Meta en direct",
      quickStats: "Stats rapides",
      proTracking: "Pro Tracking",
      comingSoon: "Bientôt disponible"
    }
  },
  en: {
    localeLabel: "EN",
    nav: {
      home: "Home",
      analyze: "Analyze",
      meta: "Meta",
      proTracking: "Pro Tracking"
    },
    seo: {
      homeTitle: "DeckRadar | Clash Royale Decks by Trophy Range",
      homeDescription:
        "DeckRadar analyzes real win rates by 250-trophy ranges and recommends the best Clash Royale decks for your current profile.",
      analyzeTitle: "DeckRadar | Profile Analysis",
      metaTitle: "DeckRadar | Clash Royale Meta",
      proTitle: "Advanced Clash Royale Tracking | DeckRadar",
      playerTitle: "DeckRadar | Player Dashboard"
    },
    hero: {
      badge: "DeckRadar Tactical Intel",
      title: "Find the best deck for your trophy range",
      subtitle:
        "Analyze real win rates by 250-trophy range, compare your decks against other players, and discover when to switch decks.",
      placeholder: "Ex: #2PP, #L8Q9R2",
      button: "Analyze my profile"
    },
    home: {
      trophyPreviewTitle: "Trophy Map Preview",
      trophyPreviewSubtitle: "250-trophy lane projection with dominant decks.",
      advantages: [
        {
          title: "Decks by trophy range",
          description:
            "Each recommendation is aligned with a specific trophy bracket so you avoid out-of-context deck choices."
        },
        {
          title: "Comparison with your profile",
          description:
            "Compare your recent decks with observed range averages and spot performance gaps quickly."
        },
        {
          title: "Automatic tracking",
          description:
            "DeckRadar refreshes performance stats regularly so you can follow meta shifts without manual work."
        }
      ],
      seoHeading: "Clash Royale analytics focused on real ladder performance",
      seoParagraphs: [
        "DeckRadar aggregates in-match deck performance to produce recommendations tied to your exact trophy bracket. Instead of generic tier lists, you get what is actually winning where you currently play.",
        "By combining profile scans, deck comparison, and 250-trophy lane analysis, DeckRadar helps you decide when to keep your deck, when to tweak it, and when to switch for stronger progression."
      ]
    },
    proTrackingPage: {
      title: "Advanced Tracking for Competitive Players",
      subtitle:
        "Track your decks, your strategy shifts, and your direct opponents with higher-frequency analysis.",
      features: [
        "Priority scans every 30 to 60 minutes",
        "Deck tracking by trophy range",
        "Comparison with players at your level",
        "Direct opponents tracking only",
        "Deck change detection",
        "Progression history"
      ],
      formTitle: "Request Pro Tracking activation",
      noPayment: "No payment for now. This is a contact request only.",
      noAutoEnable: "No pro tracking is enabled automatically without admin validation.",
      fields: {
        playerTag: "Player tag",
        email: "Email",
        discord: "Discord",
        message: "Message",
        language: "Language",
        consent: "I agree to be contacted about my Pro Tracking request."
      },
      placeholders: {
        playerTag: "Ex: #2PP",
        email: "you@email.com",
        discord: "DiscordHandle#1234",
        message: "Describe your objective or competitive context."
      },
      submit: "Send my request",
      submitting: "Submitting...",
      successTitle: "Request sent",
      successText:
        "Your Pro Tracking request was recorded successfully. Our team will contact you if your profile is selected.",
      errorTitle: "Could not send your request",
      validation: {
        tagRequired: "Player tag is required.",
        contactRequired: "Add an email or Discord so we can contact you.",
        emailInvalid: "Email format is invalid.",
        consentRequired: "Contact consent is required."
      }
    },
    dashboard: {
      loading: "Analyzing your profile and battle history...",
      profileHeader: "Player profile",
      lastScan: "Last scan",
      nextScan: "Next scan",
      bestDeckNow: "Best deck right now",
      bestDeckNowNote: "Stats updated automatically every day",
      currentRange: "Current range (250)",
      yourDecksVsAverage: "Your decks vs average",
      yourDecksVsAverageSubtitle:
        "Quick read of your recent deck results against the average performance in your bracket.",
      trophyMap: "Vertical Trophy Map",
      directOpponents: "Direct opponents",
      directOpponentsLocked: "Available with Pro Tracking",
      directOpponentsLockedText:
        "Unlock priority tracking, matchup patterns, and opponent deck trend signals.",
      unlockTracking: "Enable advanced tracking",
      deckChangeHistory: "Deck change history",
      emptyDeckHistory: "No deck changes detected yet.",
      basedOnGames: "Based on {count} games",
      statsUpdatedAt: "Stats updated at",
      recommendedDeck: "Recommended deck",
      noRecommendedDeck: "No recommendation available for this range yet.",
      tabs: {
        decks: "Decks",
        opponents: "Opponents",
        changes: "History"
      }
    },
    common: {
      trophies: "Trophies",
      bestTrophies: "Best trophies",
      arena: "Arena",
      trophyRange: "Trophy range",
      range250: "250 range",
      winrate: "Winrate",
      useRate: "Use rate",
      games: "Games",
      avgElixir: "Average elixir",
      legal:
        "DeckRadar is not affiliated with, endorsed, sponsored, or specifically approved by Supercell. Clash Royale and Supercell are trademarks of Supercell Oy.",
      noData: "No data available.",
      retry: "Retry"
    },
    blocks: {
      topDecks: "Recommended decks",
      liveMeta: "Live meta",
      quickStats: "Quick stats",
      proTracking: "Pro Tracking",
      comingSoon: "Coming soon"
    }
  }
};
