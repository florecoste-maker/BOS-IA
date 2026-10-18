/** Identité Jamaliance — BOS-IA est l'assistant / cockpit de l'agence. */

export const brand = {
  agency: "Jamaliance",
  product: "BOS-IA",
  tagline: "Des agents IA qui travaillent pour votre entreprise, simplement.",
  email: "contact@jamaliance.com",
  siteUrl: "https://jamaliance.com",
  description:
    "Assistant opérationnel Jamaliance : rendez-vous, agents IA et pilotage métier — vous gardez le contrôle.",
} as const;

export const jamalianceServices = [
  {
    id: "site",
    title: "Création de site Web",
    text: "Un site clair, rapide et à votre image, conçu pour représenter votre entreprise et convertir vos visiteurs.",
  },
  {
    id: "phone",
    title: "Réponse téléphonique",
    text: "Un agent IA répond à vos appels, qualifie les demandes et transmet les informations utiles à votre équipe.",
  },
  {
    id: "rdv",
    title: "Prise de rendez-vous",
    text: "Les demandes de créneaux restent en attente de confirmation : vous validez chaque rendez-vous manuellement.",
  },
  {
    id: "email",
    title: "Lecture et réponse aux e-mails",
    text: "Un agent lit, trie et prépare vos réponses afin que vous gardiez le contrôle sans être submergé.",
  },
] as const;
