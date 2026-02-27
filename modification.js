(function () {
  function texteOuVide(valeur) {
    return String(valeur || "").trim();
  }

  function estValeurVideOuIndisponible(valeur) {
    const texte = texteOuVide(valeur);
    if (!texte) {
      return true;
    }
    const normalise = texte.toLowerCase();
    return normalise === "non renseigné" || normalise === "non renseigne" || normalise === "a completer";
  }

  function valeurSiDisponible(valeur) {
    if (estValeurVideOuIndisponible(valeur)) {
      return "";
    }
    return texteOuVide(valeur);
  }

  function libelleTypeFiche(contexte) {
    const type = texteOuVide(contexte?.type).toLowerCase();
    if (type === "postes" || type === "poste") {
      return "poste";
    }
    if (type === "acces" || type === "accès") {
      return "acces";
    }
    if (type === "appareils" || type === "appareil") {
      return "appareil";
    }
    return "fiche";
  }

  function construireResumeFiche(contexte) {
    const typeFiche = libelleTypeFiche(contexte);
    const designationObjet = valeurSiDisponible(contexte?.designationObjet);
    const morceaux = [
      typeFiche === "appareil" ? designationObjet : "",
      valeurSiDisponible(contexte?.nom),
      valeurSiDisponible(contexte?.typeObjet),
      valeurSiDisponible(contexte?.sat)
    ].filter(Boolean);
    const blocPrincipal = morceaux.join(" / ");
    const acces = valeurSiDisponible(contexte?.acces);
    if (blocPrincipal && acces) {
      return `${blocPrincipal} : ${acces}`;
    }
    if (blocPrincipal) {
      return blocPrincipal;
    }
    if (acces) {
      return acces;
    }
    return "Fiche sans informations";
  }

  function construireSujetSignalement(contexte) {
    return `ALICE - Modification fiche - ${construireResumeFiche(contexte)} (${libelleTypeFiche(contexte)})`;
  }

  function construireCorpsSignalement(contexte, commentaire) {
    const resume = construireResumeFiche(contexte);
    const texteCommentaire = texteOuVide(commentaire);
    const typeFiche = libelleTypeFiche(contexte);

    return [
      "Bonjour,",
      "",
      `je propose une modification/ajout sur la fiche '${resume}' (${typeFiche}).`,
      "",
      texteCommentaire || "(A compléter)",
      "",
      "Merci."
    ].join("\n");
  }

  function construireLienMailto(destinataire, contexte, commentaire) {
    const mail = texteOuVide(destinataire);
    if (!mail) {
      return "";
    }
    const sujet = construireSujetSignalement(contexte);
    const corps = construireCorpsSignalement(contexte, commentaire);
    return `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  }

  window.moduleModificationAlice = {
    construireLienMailto,
    construireCorpsSignalement
  };
})();
