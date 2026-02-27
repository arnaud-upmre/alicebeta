(function () {
  function texteOuVide(valeur) {
    return String(valeur || "").trim();
  }

  function valeurOuIndisponible(valeur) {
    const texte = texteOuVide(valeur);
    return texte || "Non renseigné";
  }

  function construireResumeFiche(contexte) {
    const nom = valeurOuIndisponible(contexte?.nom);
    const type = valeurOuIndisponible(contexte?.typeObjet);
    const sat = valeurOuIndisponible(contexte?.sat);
    const acces = valeurOuIndisponible(contexte?.acces);
    return `${nom} / ${type} / ${sat} : ${acces}`;
  }

  function construireSujetSignalement(contexte) {
    return `ALICE - Modification fiche - ${construireResumeFiche(contexte)}`;
  }

  function construireCorpsSignalement(contexte, commentaire) {
    const resume = construireResumeFiche(contexte);
    const latitude = Number(contexte?.latitude);
    const longitude = Number(contexte?.longitude);
    const coordonnees =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
        : "Non renseignées";
    const lien = texteOuVide(contexte?.lienFiche);
    const texteCommentaire = texteOuVide(commentaire);

    return [
      "Bonjour,",
      "",
      `je propose une modification/ajout sur la fiche '${resume}'.`,
      "",
      "Informations de la fiche :",
      `- Nom : ${valeurOuIndisponible(contexte?.nom)}`,
      `- Type : ${valeurOuIndisponible(contexte?.typeObjet)}`,
      `- SAT : ${valeurOuIndisponible(contexte?.sat)}`,
      `- Acces : ${valeurOuIndisponible(contexte?.acces)}`,
      `- Coordonnees : ${coordonnees}`,
      `- Lien : ${lien || "Non renseigné"}`,
      "",
      "Commentaire :",
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
