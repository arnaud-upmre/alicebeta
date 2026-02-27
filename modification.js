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
    const morceauxBase = [
      valeurSiDisponible(contexte?.nom),
      valeurSiDisponible(contexte?.typeObjet),
      valeurSiDisponible(contexte?.sat),
      valeurSiDisponible(contexte?.acces)
    ].filter(Boolean);
    const blocPrincipal = morceauxBase.join(" / ");
    if (typeFiche === "appareil") {
      const nomsAppareils = Array.isArray(contexte?.listeNomsAppareils) ? contexte.listeNomsAppareils : [];
      const blocAppareils = nomsAppareils.filter(Boolean).join(", ");
      if (blocAppareils && blocPrincipal) {
        return `${blocAppareils} / ${blocPrincipal}`;
      }
      if (blocAppareils) {
        return blocAppareils;
      }
    }
    if (blocPrincipal) {
      return blocPrincipal;
    }
    return "Fiche sans informations";
  }

  function construireSujetSignalement(contexte) {
    return `ALICE - Modification fiche - ${construireResumeFiche(contexte)} (${libelleTypeFiche(contexte)})`;
  }

  function construireCorpsSignalement(contexte, commentaire) {
    const texteCommentaire = texteOuVide(commentaire);
    const resume = construireResumeFiche(contexte);

    return [
      `Bonjour : Modification ou Ajout sur la fiche : ${resume}`,
      "",
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
