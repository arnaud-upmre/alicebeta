(function () {
  function creerMoteurRecherchePrincipal(config) {
    const normaliserTexteRecherche = config?.normaliserTexteRecherche;
    const obtenirPrioriteTypeRecherche = config?.obtenirPrioriteTypeRecherche;

    if (typeof normaliserTexteRecherche !== "function") {
      throw new Error("normaliserTexteRecherche est requis pour creerMoteurRecherchePrincipal.");
    }

    const prioriteParDefaut = (type) => {
      if (type === "acces") return 0;
      if (type === "postes") return 1;
      if (type === "appareils") return 2;
      return 3;
    };

    return {
      rechercher(indexRecherche, terme, options = {}) {
        const minLength = Number.isFinite(options.minLength) ? options.minLength : 2;
        const limit = Number.isFinite(options.limit) ? options.limit : 24;
        const termeNormalise = normaliserTexteRecherche(terme);

        if (!termeNormalise || termeNormalise.length < minLength) {
          return [];
        }

        const resultats = [];
        for (const entree of indexRecherche || []) {
          if (!entree?.texteRecherche || !entree.texteRecherche.includes(termeNormalise)) {
            continue;
          }
          const titreNormalise = normaliserTexteRecherche(entree.titre);
          const matchDebut = entree.texteRecherche.startsWith(termeNormalise) || titreNormalise.startsWith(termeNormalise) ? 1 : 0;
          resultats.push({
            ...entree,
            matchDebut
          });
        }

        const prioriteFn = typeof obtenirPrioriteTypeRecherche === "function" ? obtenirPrioriteTypeRecherche : prioriteParDefaut;
        resultats.sort((a, b) => {
          if (b.matchDebut !== a.matchDebut) {
            return b.matchDebut - a.matchDebut;
          }
          const prioriteA = prioriteFn(a.type);
          const prioriteB = prioriteFn(b.type);
          if (prioriteA !== prioriteB) {
            return prioriteA - prioriteB;
          }
          return String(a.titre || "").localeCompare(String(b.titre || ""), "fr", { sensitivity: "base" });
        });

        return resultats.slice(0, Math.max(0, limit));
      }
    };
  }

  window.creerMoteurRecherchePrincipal = creerMoteurRecherchePrincipal;
})();
