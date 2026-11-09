// Keep route metadata independent of UI imports so route registration does not
// eagerly load the candidate interface before the client bootstrap is ready.
export function candidateHead(title: string, description: string) {
  return { meta: [{ title: `${title} | Orvane Recrutement` }, { name: "description", content: description }, { property: "og:title", content: `${title} | Orvane Recrutement` }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] };
}