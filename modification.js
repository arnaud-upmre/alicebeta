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

  function construireResumeFiche(contexte, options = {}) {
    const typeFiche = libelleTypeFiche(contexte);
    const inclureDesignation = options.inclureDesignation !== false;
    const designationObjet = valeurSiDisponible(contexte?.designationObjet);
    const morceaux = [
      typeFiche === "appareil" && inclureDesignation ? designationObjet : "",
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
    const texteCommentaire = texteOuVide(commentaire);
    const typeFiche = libelleTypeFiche(contexte);
    const listeAppareils = Array.isArray(contexte?.listeElementsAppareils) ? contexte.listeElementsAppareils : [];
    const listeAcces = Array.isArray(contexte?.listeElementsAcces) ? contexte.listeElementsAcces : [];
    const resume = construireResumeFiche(contexte, {
      inclureDesignation: !(typeFiche === "appareil" && listeAppareils.length > 1)
    });
    const lignesMultiples = [];
    if (listeAppareils.length > 1) {
      lignesMultiples.push(`Appareils concernés : ${listeAppareils.join(", ")}`);
    }
    if (listeAcces.length > 1) {
      lignesMultiples.push(`Accès concernés : ${listeAcces.join(", ")}`);
    }

    return [
      "Bonjour,",
      "",
      `je propose une modification/ajout sur la fiche '${resume}' (${typeFiche}).`,
      ...(lignesMultiples.length ? ["", ...lignesMultiples] : []),
      "",
      texteCommentaire || "(A compléter)"
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
