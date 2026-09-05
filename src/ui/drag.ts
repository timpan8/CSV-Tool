/**
 * Det webbläsarens dra-och-släpp behöver för att över huvud taget börja.
 *
 * Verktyget bär sitt dragtillstånd i komponenten och läser aldrig
 * `dataTransfer` — men Firefox startar ingen dragsession alls om `dragstart`
 * inte lagt något i den. Chromium bryr sig inte, och det är därför felet
 * aldrig syntes: e2e-sviten kör bara Chromium. Ett tomt textvärde räcker, och
 * `effectAllowed` gör att markören visar en flytt i stället för en kopia.
 */
export function startaDrag(e: DragEvent): void {
  if (!e.dataTransfer) return
  e.dataTransfer.setData('text/plain', '')
  e.dataTransfer.effectAllowed = 'move'
}

/**
 * Sant när det som dras är en fil från skrivbordet, inte ett av verktygets
 * egna handtag. Fildragen tar appens fönsterlyssnare hand om, och en släppzon
 * som svalde dem hade tyst kastat bort filen.
 */
export function arFildrag(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}
