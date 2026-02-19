(function (global) {
  const DEFAULT_POWERAPPS_CODES_URL =
    "https://apps.powerapps.com/play/e/91a9a793-eabc-4be4-b4f4-d19d551f0072/a/a11716b8-c506-4cd0-b3fe-e473f5cac6df?tenantId=4a7c8238-5799-4b16-9fc6-9ad8fce5a7d9";

  function fallbackChampCompletOuVide(valeur) {
    return String(valeur || "").trim();
  }

  function fallbackEchapperHtml(valeur) {
    return String(valeur || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function estCodeDisponible(valeur) {
    if (valeur === true) {
      return true;
    }
    const texte = String(valeur || "")
      .trim()
      .toLowerCase();
    return texte === "true" || texte === "1" || texte === "oui" || texte === "yes";
  }

  function construireLienCodesAcces(acces) {
    const champCompletOuVide = global.champCompletOuVide || fallbackChampCompletOuVide;
    const baseUrl = global.URL_POWERAPPS_CODES || DEFAULT_POWERAPPS_CODES_URL;
    const url = new URL(baseUrl);
    const poste = champCompletOuVide(acces?.nom);
    const type = champCompletOuVide(acces?.type);
    const sat = champCompletOuVide(acces?.SAT);
    const accesAppareil = champCompletOuVide(acces?.acces);

    if (poste) {
      url.searchParams.set("poste", poste);
    } else {
      url.searchParams.delete("poste");
    }
    if (type) {
      url.searchParams.set("type", type);
    } else {
      url.searchParams.delete("type");
    }
    url.searchParams.set("sat", sat || "");
    url.searchParams.set("acces", accesAppareil || "");

    return url.toString();
  }

  function construireSectionBoutonCodes(featureAcces) {
    const extraireListeDepuisFeature = global.extraireListeDepuisFeature;
    if (typeof extraireListeDepuisFeature !== "function") {
      return "";
    }

    const echapperHtml = global.echapperHtml || fallbackEchapperHtml;
    const accesListe = extraireListeDepuisFeature(featureAcces, "acces_liste_json");
    const accesAvecCode = accesListe.find((acces) => estCodeDisponible(acces?.code));
    if (!accesAvecCode) {
      return "";
    }
    const urlCodes = construireLienCodesAcces(accesAvecCode);
    return `<section class="popup-section popup-section-codes"><button class="popup-action-lien" id="popup-afficher-codes-acces" type="button" data-url="${echapperHtml(urlCodes)}">🔐 Afficher les codes d’accès</button></section>`;
  }

  global.URL_POWERAPPS_CODES = global.URL_POWERAPPS_CODES || DEFAULT_POWERAPPS_CODES_URL;
  global.estCodeDisponible = estCodeDisponible;
  global.construireLienCodesAcces = construireLienCodesAcces;
  global.construireSectionBoutonCodes = construireSectionBoutonCodes;
})(window);
