(function () {
  window.creerModuleLocalisationAlice = function creerModuleLocalisationAlice(config) {
    const {
      carte,
      chargerDonneesAcces,
      chargerDonneesPostes,
      chargerDonneesAppareils,
      getDonneesAcces,
      getDonneesPostes,
      getDonneesAppareils,
      construireTitreNomTypeSat,
      construireTitreNomTypeSatAcces,
      construireContexteNomTypeSat,
      estHorsPatrimoine,
      echapperHtml,
      formaterDistanceMetres,
      obtenirDistanceMetres,
      demarrerClignotementLocalisation,
      activerFiltrePourType,
      appliquerCouchesDonnees,
      remonterCouchesDonnees,
      ouvrirPopupDepuisCoordonneesPourType,
      naviguerVersCoordonneesPuisOuvrirPopup,
      fermerMenusGlobalement
    } = config;

    const modal = document.getElementById("modal-localisation");
    const zoneEtat = document.getElementById("localisation-etat");
    const listeResultats = document.getElementById("localisation-resultats");
    const boutonFermer = document.getElementById("modal-localisation-fermer");

    function estOuverte() {
      return Boolean(modal?.classList.contains("est-visible"));
    }

    function ouvrir() {
      if (!modal) {
        return;
      }
      modal.classList.add("est-visible");
      modal.setAttribute("aria-hidden", "false");
      fermerMenusGlobalement?.();
    }

    function fermer() {
      if (!modal) {
        return;
      }
      modal.classList.remove("est-visible");
      modal.setAttribute("aria-hidden", "true");
    }

    function definirEtat(message, estErreur) {
      if (!zoneEtat) {
        return;
      }
      zoneEtat.textContent = message;
      zoneEtat.classList.toggle("est-erreur", Boolean(estErreur));
    }

    function viderResultats() {
      if (!listeResultats) {
        return;
      }
      listeResultats.innerHTML = "";
    }

    function obtenirPositionUtilisateur() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("La geolocalisation n'est pas disponible sur cet appareil."));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const longitude = Number(coords?.longitude);
            const latitude = Number(coords?.latitude);
            if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
              reject(new Error("Position GPS invalide."));
              return;
            }
            resolve({ longitude, latitude });
          },
          () => {
            reject(new Error("Impossible de recuperer votre position."));
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 120000
          }
        );
      });
    }

    function formaterTypeResultat(type) {
      if (type === "postes") {
        return "Poste";
      }
      if (type === "acces") {
        return "Acces";
      }
      return "Appareil";
    }

    function construireTitreResultat(type, feature) {
      const proprietes = feature?.properties || {};
      if (type === "postes") {
        return (
          construireTitreNomTypeSat(proprietes, {
            nomVilleDe: estHorsPatrimoine(proprietes?.hors_patrimoine)
          }) || "Poste"
        );
      }
      if (type === "acces") {
        return (
          construireTitreNomTypeSatAcces(proprietes, {
            nomVilleDe: estHorsPatrimoine(proprietes?.hors_patrimoine)
          }) || "Acces"
        );
      }

      const titre = construireContexteNomTypeSat(proprietes);
      const nombre = Number(proprietes?.appareils_count);
      if (titre) {
        return titre;
      }
      if (Number.isFinite(nombre) && nombre > 1) {
        return `${nombre} appareils`;
      }
      return "Appareil";
    }

    function construireResultatsProximite(longitude, latitude, limite) {
      const pointUtilisateur = [longitude, latitude];
      const ensembles = [
        { type: "postes", donnees: getDonneesPostes?.() },
        { type: "acces", donnees: getDonneesAcces?.() },
        { type: "appareils", donnees: getDonneesAppareils?.() }
      ];
      const resultats = [];

      for (const { type, donnees } of ensembles) {
        for (const feature of donnees?.features || []) {
          const [lng, lat] = feature?.geometry?.coordinates || [];
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            continue;
          }
          const distanceMetres = obtenirDistanceMetres(pointUtilisateur, [lng, lat]);
          resultats.push({
            type,
            longitude: lng,
            latitude: lat,
            distanceMetres,
            titre: construireTitreResultat(type, feature),
            typeLibelle: formaterTypeResultat(type)
          });
        }
      }

      return resultats
        .sort((a, b) => a.distanceMetres - b.distanceMetres)
        .slice(0, Math.max(1, Number(limite) || 8));
    }

    function afficherResultats(resultats) {
      if (!listeResultats) {
        return;
      }
      if (!Array.isArray(resultats) || !resultats.length) {
        listeResultats.innerHTML = "";
        return;
      }

      listeResultats.innerHTML = resultats
        .map((resultat) => {
          return `<li class="modal-localisation-resultat-item"><div class="modal-localisation-resultat-entete"><strong>${echapperHtml(
            resultat.titre
          )}</strong><span>${echapperHtml(resultat.typeLibelle)}</span></div><div class="modal-localisation-resultat-pied"><span class="modal-localisation-resultat-distance">${echapperHtml(
            formaterDistanceMetres(resultat.distanceMetres)
          )}</span><button class="popup-bouton-itineraire modal-localisation-resultat-action" type="button" data-type="${echapperHtml(
            resultat.type
          )}" data-lng="${resultat.longitude}" data-lat="${resultat.latitude}">Voir la fiche</button></div></li>`;
        })
        .join("");
    }

    async function ouvrirResultat(type, longitude, latitude) {
      if (!type || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }

      try {
        await activerFiltrePourType(type);
        appliquerCouchesDonnees();
        remonterCouchesDonnees();
      } catch (erreur) {
        console.error(`Impossible d'activer la couche ${type}`, erreur);
      }

      fermer();

      let popupOuverte = false;
      const ouvrirPopup = () => {
        if (popupOuverte) {
          return;
        }
        popupOuverte = true;
        ouvrirPopupDepuisCoordonneesPourType(type, longitude, latitude, { fallbackGenerique: false });
      };
      naviguerVersCoordonneesPuisOuvrirPopup(longitude, latitude, ouvrirPopup, {
        zoomMin: 14.8,
        durationDouxMs: 420
      });
    }

    async function localiser(options) {
      const avecPanneau = Boolean(options?.avecPanneau);

      if (avecPanneau) {
        ouvrir();
        definirEtat("Localisation en cours...");
        viderResultats();
      }

      try {
        const [position] = await Promise.all([
          obtenirPositionUtilisateur(),
          Promise.allSettled([chargerDonneesAcces(), chargerDonneesPostes(), chargerDonneesAppareils()])
        ]);

        const longitude = Number(position?.longitude);
        const latitude = Number(position?.latitude);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
          throw new Error("Position GPS invalide.");
        }

        carte.flyTo({
          center: [longitude, latitude],
          zoom: Math.max(carte.getZoom(), 15.5),
          essential: true
        });
        demarrerClignotementLocalisation(longitude, latitude);

        if (!avecPanneau) {
          return;
        }

        const resultats = construireResultatsProximite(longitude, latitude, 8);
        if (!resultats.length) {
          definirEtat("Aucun resultat proche trouve.", true);
          return;
        }

        definirEtat(`${resultats.length} resultats proches trouves.`);
        afficherResultats(resultats);
      } catch (erreur) {
        const message = String(erreur?.message || "Impossible de recuperer votre position.");
        if (avecPanneau) {
          definirEtat(message, true);
          return;
        }
        alert(message);
      }
    }

    boutonFermer?.addEventListener("click", fermer);

    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        fermer();
      }
    });

    listeResultats?.addEventListener("click", (event) => {
      const bouton = event.target instanceof Element ? event.target.closest(".modal-localisation-resultat-action") : null;
      if (!bouton) {
        return;
      }

      const type = String(bouton.getAttribute("data-type") || "").trim();
      const longitude = Number(bouton.getAttribute("data-lng"));
      const latitude = Number(bouton.getAttribute("data-lat"));
      ouvrirResultat(type, longitude, latitude);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && estOuverte()) {
        fermer();
      }
    });

    return {
      localiserSimple() {
        localiser({ avecPanneau: false });
      },
      localiserEtAfficher() {
        localiser({ avecPanneau: true });
      },
      fermer
    };
  };
})();
