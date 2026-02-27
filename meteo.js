(function () {
  const URL_VIGILANCE = "https://vigilance.meteofrance.fr/data/NXFR34_LFPW_.json";
  const URLS_VIGILANCE_FALLBACK = [
    URL_VIGILANCE,
    `https://corsproxy.io/?${encodeURIComponent(URL_VIGILANCE)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(URL_VIGILANCE)}`
  ];
  const DEPARTEMENTS_HDF = [
    { code: "02", nom: "Aisne" },
    { code: "59", nom: "Nord" },
    { code: "60", nom: "Oise" },
    { code: "62", nom: "Pas-de-Calais" },
    { code: "80", nom: "Somme" }
  ];
  const COULEURS_NIVEAU = Object.freeze({
    1: { nom: "Vert", hex: "#22c55e" },
    2: { nom: "Jaune", hex: "#facc15" },
    3: { nom: "Orange", hex: "#f97316" },
    4: { nom: "Rouge", hex: "#dc2626" }
  });
  const LIBELLES_PHENOMENES = Object.freeze({
    1: "Vent violent",
    2: "Pluie-inondation",
    3: "Orages",
    4: "Crues",
    5: "Neige-verglas",
    6: "Canicule",
    7: "Grand froid",
    8: "Avalanches",
    9: "Vagues-submersion"
  });
  const INTERVALLE_ACTUALISATION_MS = 15 * 60 * 1000;

  const etat = {
    ouvert: false,
    timer: null
  };

  function getElements() {
    return {
      bouton: document.getElementById("bouton-meteo-hdf"),
      panneau: document.getElementById("panneau-meteo-hdf"),
      indicateur: document.getElementById("meteo-hdf-indicator"),
      boutonFermer: document.getElementById("bouton-fermer-meteo-hdf"),
      boutonRefresh: document.getElementById("meteo-hdf-refresh"),
      statut: document.getElementById("meteo-hdf-statut"),
      liste: document.getElementById("meteo-hdf-liste")
    };
  }

  function appliquerCouleurIndicateur(niveau) {
    const { indicateur } = getElements();
    if (!indicateur) {
      return;
    }
    indicateur.classList.remove("vert", "jaune", "orange", "rouge", "inconnu");
    if (niveau === 1) {
      indicateur.classList.add("vert");
      return;
    }
    if (niveau === 2) {
      indicateur.classList.add("jaune");
      return;
    }
    if (niveau === 3) {
      indicateur.classList.add("orange");
      return;
    }
    if (niveau === 4) {
      indicateur.classList.add("rouge");
      return;
    }
    indicateur.classList.add("inconnu");
  }

  function normaliserCode(code) {
    const brut = String(code || "").trim().toUpperCase();
    if (/^\d$/.test(brut)) {
      return `0${brut}`;
    }
    if (/^\d{2,3}$/.test(brut) || /^2[AB]$/.test(brut)) {
      return brut;
    }
    return null;
  }

  function versNiveau(valeur) {
    const niveau = Number(valeur);
    if (!Number.isFinite(niveau)) {
      return null;
    }
    if (niveau < 1 || niveau > 4) {
      return null;
    }
    return Math.round(niveau);
  }

  function extraireNiveaux(donnees) {
    const niveaux = new Map();
    const pile = [donnees];

    while (pile.length) {
      const courant = pile.pop();
      if (!courant) {
        continue;
      }
      if (Array.isArray(courant)) {
        for (const item of courant) {
          pile.push(item);
        }
        continue;
      }
      if (typeof courant !== "object") {
        continue;
      }

      const code = normaliserCode(
        courant.domain_id || courant.department_code || courant.departement || courant.dep || courant.code
      );
      const niveau = versNiveau(
        courant.color_id
        ?? courant.colour_id
        ?? courant.max_color_id
        ?? courant.vigilance_level
        ?? courant.level
      );

      if (code && niveau != null) {
        const precedent = niveaux.get(code);
        niveaux.set(code, {
          niveau: precedent ? Math.max(precedent.niveau, niveau) : niveau,
          phenomenes: precedent?.phenomenes || []
        });
      }

      for (const valeur of Object.values(courant)) {
        pile.push(valeur);
      }
    }

    const pilePhenomenes = [donnees];
    while (pilePhenomenes.length) {
      const courant = pilePhenomenes.pop();
      if (!courant) {
        continue;
      }
      if (Array.isArray(courant)) {
        for (const item of courant) {
          pilePhenomenes.push(item);
        }
        continue;
      }
      if (typeof courant !== "object") {
        continue;
      }

      const code = normaliserCode(
        courant.domain_id || courant.department_code || courant.departement || courant.dep || courant.code
      );
      const listePhenomenes = Array.isArray(courant.phenomenons)
        ? courant.phenomenons
        : Array.isArray(courant.phenomena)
          ? courant.phenomena
          : [];

      if (code && niveaux.has(code) && listePhenomenes.length) {
        const details = [];
        for (const phenomene of listePhenomenes) {
          const codePhenomene = Number(phenomene?.phenomenon_id ?? phenomene?.id ?? phenomene?.code);
          const niveauPhenomene = versNiveau(
            phenomene?.phenomenon_max_color_id
            ?? phenomene?.color_id
            ?? phenomene?.couleur_id
          );
          if (!Number.isFinite(codePhenomene) || niveauPhenomene == null || niveauPhenomene < 2) {
            continue;
          }
          const nom = LIBELLES_PHENOMENES[codePhenomene] || `Phénomène ${codePhenomene}`;
          const libelleNiveau = COULEURS_NIVEAU[niveauPhenomene]?.nom || `Niveau ${niveauPhenomene}`;
          details.push(`${nom} (${libelleNiveau})`);
        }
        if (details.length) {
          const courantNiveau = niveaux.get(code);
          niveaux.set(code, {
            ...courantNiveau,
            phenomenes: details
          });
        }
      }

      for (const valeur of Object.values(courant)) {
        pilePhenomenes.push(valeur);
      }
    }

    return {
      niveaux,
      dateMaj:
        donnees?.product?.issue_time
        || donnees?.product?.update_time
        || donnees?.update_time
        || null
    };
  }

  function formatDate(dateIso) {
    if (!dateIso) {
      return "Mise à jour inconnue";
    }
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) {
      return `Mise à jour: ${dateIso}`;
    }
    return `Mise à jour: ${date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }

  function setStatut(message) {
    const { statut } = getElements();
    if (statut) {
      statut.textContent = message;
    }
  }

  function niveauPourCode(niveaux, code) {
    const resultat = niveaux.get(code);
    if (resultat && resultat.niveau != null) {
      return resultat;
    }
    return { niveau: 1, phenomenes: [] };
  }

  function renderListe(niveaux) {
    const { liste } = getElements();
    if (!liste) {
      return;
    }
    const fragment = document.createDocumentFragment();
    let niveauMaxHdf = 1;

    for (const dept of DEPARTEMENTS_HDF) {
      const data = niveauPourCode(niveaux, dept.code);
      niveauMaxHdf = Math.max(niveauMaxHdf, data.niveau || 1);
      const infoCouleur = COULEURS_NIVEAU[data.niveau] || COULEURS_NIVEAU[1];

      const item = document.createElement("li");
      item.className = "meteo-hdf-item";

      const top = document.createElement("div");
      top.className = "meteo-hdf-item-top";

      const dot = document.createElement("span");
      dot.className = "meteo-hdf-item-niveau";
      dot.style.background = infoCouleur.hex;

      const titre = document.createElement("p");
      titre.className = "meteo-hdf-item-dept";
      titre.textContent = `${dept.nom} (${dept.code}) - ${infoCouleur.nom}`;

      const texte = document.createElement("p");
      texte.className = "meteo-hdf-item-texte";
      texte.textContent = data.phenomenes.length
        ? data.phenomenes.join(" | ")
        : "Pas d'alerte particulière signalée.";

      top.appendChild(dot);
      top.appendChild(titre);
      item.appendChild(top);
      item.appendChild(texte);
      fragment.appendChild(item);
    }

    liste.innerHTML = "";
    liste.appendChild(fragment);
    appliquerCouleurIndicateur(niveauMaxHdf);
  }

  async function chargerAlertes() {
    setStatut("Chargement des alertes météo…");
    try {
      let donnees = null;
      let derniereErreur = null;

      for (const url of URLS_VIGILANCE_FALLBACK) {
        try {
          const reponse = await fetch(url, { cache: "no-store" });
          if (!reponse.ok) {
            throw new Error(`HTTP ${reponse.status}`);
          }
          donnees = await reponse.json();
          break;
        } catch (erreurUrl) {
          derniereErreur = erreurUrl;
        }
      }

      if (!donnees) {
        throw derniereErreur || new Error("Vigilance Météo-France indisponible");
      }

      const resultat = extraireNiveaux(donnees);
      renderListe(resultat.niveaux);
      setStatut(formatDate(resultat.dateMaj));
    } catch (erreur) {
      appliquerCouleurIndicateur(null);
      const estModeFichier = window.location.protocol === "file:";
      const message = erreur instanceof Error ? erreur.message : "Erreur météo";
      if (estModeFichier) {
        setStatut("Mode local bloqué (CORS). Lance un serveur local: python3 -m http.server 8080");
        return;
      }
      setStatut(message || "Erreur météo");
    }
  }

  function positionnerPanneau() {
    const { bouton, panneau } = getElements();
    if (!bouton || !panneau || !etat.ouvert) {
      return;
    }
    const rectBouton = bouton.getBoundingClientRect();
    const largeurPanneau = Math.min(window.innerWidth * 0.9, 340);
    const marge = 6;
    let left = rectBouton.left - largeurPanneau - marge;
    if (left < 8) {
      left = Math.max(8, rectBouton.right + marge);
      if (left + largeurPanneau > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - largeurPanneau - 8);
      }
    }
    let top = rectBouton.top - 2;
    const maxTop = window.innerHeight - 140;
    top = Math.max(8, Math.min(top, maxTop));
    panneau.style.left = `${Math.round(left)}px`;
    panneau.style.top = `${Math.round(top)}px`;
  }

  function ouvrirPanneau() {
    const { bouton, panneau } = getElements();
    if (!bouton || !panneau) {
      return;
    }
    etat.ouvert = true;
    panneau.classList.add("is-open");
    panneau.setAttribute("aria-hidden", "false");
    bouton.setAttribute("aria-expanded", "true");
    positionnerPanneau();
  }

  function fermerPanneau() {
    const { bouton, panneau } = getElements();
    if (!bouton || !panneau) {
      return;
    }
    etat.ouvert = false;
    panneau.classList.remove("is-open");
    panneau.setAttribute("aria-hidden", "true");
    bouton.setAttribute("aria-expanded", "false");
  }

  function togglePanneau() {
    if (etat.ouvert) {
      fermerPanneau();
      return;
    }
    ouvrirPanneau();
  }

  function initialiser() {
    const { bouton, panneau, boutonFermer, boutonRefresh } = getElements();
    if (!bouton || !panneau || !boutonFermer || !boutonRefresh) {
      return;
    }

    bouton.addEventListener("click", () => {
      togglePanneau();
      if (etat.ouvert) {
        chargerAlertes();
      }
    });
    boutonFermer.addEventListener("click", fermerPanneau);
    boutonRefresh.addEventListener("click", chargerAlertes);

    window.addEventListener("resize", positionnerPanneau);
    window.addEventListener("scroll", positionnerPanneau, { passive: true });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && etat.ouvert) {
        fermerPanneau();
      }
    });

    document.addEventListener("click", (event) => {
      if (!etat.ouvert) {
        return;
      }
      const cible = event.target;
      if (!(cible instanceof Node)) {
        return;
      }
      if (panneau.contains(cible) || bouton.contains(cible)) {
        return;
      }
      fermerPanneau();
    });

    chargerAlertes();
    etat.timer = window.setInterval(chargerAlertes, INTERVALLE_ACTUALISATION_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiser, { once: true });
  } else {
    initialiser();
  }
})();
