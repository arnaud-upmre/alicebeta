"use strict";

(function initialiserModuleFiltresAlice() {
  function bindFiltreAsynchrone(options) {
    const {
      input,
      onBeforeEnable,
      onEnable,
      onDisable,
      onAfterChange,
      onError
    } = options || {};

    if (!input) {
      return;
    }

    input.addEventListener("change", async () => {
      const active = input.checked;

      if (!active) {
        if (typeof onDisable === "function") {
          onDisable();
        }
        if (typeof onAfterChange === "function") {
          onAfterChange();
        }
        return;
      }

      if (typeof onBeforeEnable === "function") {
        onBeforeEnable();
      }

      input.disabled = true;
      try {
        if (typeof onEnable === "function") {
          await onEnable();
        }
      } catch (error) {
        input.checked = false;
        if (typeof onError === "function") {
          onError(error);
        } else {
          throw error;
        }
      } finally {
        input.disabled = false;
        if (typeof onAfterChange === "function") {
          onAfterChange();
        }
      }
    });
  }

  function bindFiltreSynchrone(options) {
    const {
      input,
      onChange
    } = options || {};

    if (!input || typeof onChange !== "function") {
      return;
    }

    input.addEventListener("change", () => {
      onChange(input.checked);
    });
  }

  function creerGestionnaireFiltresAlice(deps) {
    const {
      caseAppareils,
      caseAcces,
      casePostes,
      casePk,
      casePn,
      caseLignes,
      caseVitesseLigne,
      getTemporisationInfoVitesse,
      clearTemporisationInfoVitesse,
      afficherMessageInfoVitesseLigne,
      masquerMessageInfoVitesseLigne,
      chargerDonneesAppareils,
      chargerDonneesAcces,
      chargerDonneesPostes,
      chargerDonneesPk,
      chargerDonneesPn,
      appliquerCouchesDonnees,
      remonterCouchesDonnees,
      planifierMiseAJourPk,
      setAfficherAppareils,
      setAfficherAcces,
      setAfficherPostes,
      setAfficherPk,
      setAfficherPn,
      setAfficherLignes,
      setAfficherVitesseLigne
    } = deps || {};

    function rafraichirCarte() {
      appliquerCouchesDonnees();
      remonterCouchesDonnees();
    }

    bindFiltreAsynchrone({
      input: caseAppareils,
      onBeforeEnable: () => setAfficherAppareils(true),
      onEnable: () => chargerDonneesAppareils(),
      onDisable: () => setAfficherAppareils(false),
      onAfterChange: rafraichirCarte,
      onError: (error) => {
        setAfficherAppareils(false);
        console.error("Impossible de charger appareils.geojson", error);
        alert(
          "Chargement des appareils impossible. Ouvre la carte via un serveur local (http://localhost...) ou verifie appareils.geojson."
        );
      }
    });

    bindFiltreAsynchrone({
      input: caseAcces,
      onBeforeEnable: () => setAfficherAcces(true),
      onEnable: () => chargerDonneesAcces(),
      onDisable: () => setAfficherAcces(false),
      onAfterChange: rafraichirCarte,
      onError: (error) => {
        setAfficherAcces(false);
        console.error("Impossible de charger acces.geojson", error);
        alert(
          "Chargement des acces impossible. Ouvre la carte via un serveur local (http://localhost...) ou verifie acces.geojson."
        );
      }
    });

    bindFiltreAsynchrone({
      input: casePostes,
      onBeforeEnable: () => setAfficherPostes(true),
      onEnable: () => chargerDonneesPostes(),
      onDisable: () => setAfficherPostes(false),
      onAfterChange: rafraichirCarte,
      onError: (error) => {
        setAfficherPostes(false);
        console.error("Impossible de charger postes.geojson", error);
        alert(
          "Chargement des postes impossible. Ouvre la carte via un serveur local (http://localhost...) ou verifie postes.geojson."
        );
      }
    });

    bindFiltreAsynchrone({
      input: casePk,
      onBeforeEnable: () => setAfficherPk(true),
      onEnable: () => chargerDonneesPk(),
      onDisable: () => setAfficherPk(false),
      onAfterChange: () => {
        rafraichirCarte();
        planifierMiseAJourPk();
      },
      onError: (error) => {
        setAfficherPk(false);
        console.error("Impossible de charger pk.geojson", error);
        alert("Chargement des PK impossible. Verifie la presence de pk.geojson.");
      }
    });

    bindFiltreAsynchrone({
      input: casePn,
      onBeforeEnable: () => setAfficherPn(true),
      onEnable: () => chargerDonneesPn(),
      onDisable: () => setAfficherPn(false),
      onAfterChange: () => {
        rafraichirCarte();
        planifierMiseAJourPk();
      },
      onError: (error) => {
        setAfficherPn(false);
        console.error("Impossible de charger les passages a niveau via l'API SNCF", error);
        alert("Chargement des passages a niveau impossible depuis l'API SNCF.");
      }
    });

    bindFiltreSynchrone({
      input: caseLignes,
      onChange: (active) => {
        setAfficherLignes(active);
        if (active) {
          setAfficherVitesseLigne(false);
          if (caseVitesseLigne) {
            caseVitesseLigne.checked = false;
          }
          masquerMessageInfoVitesseLigne();
          if (getTemporisationInfoVitesse()) {
            clearTemporisationInfoVitesse();
          }
        }
        rafraichirCarte();
      }
    });

    bindFiltreSynchrone({
      input: caseVitesseLigne,
      onChange: (active) => {
        setAfficherVitesseLigne(active);
        if (active) {
          setAfficherLignes(false);
          if (caseLignes) {
            caseLignes.checked = false;
          }
          afficherMessageInfoVitesseLigne();
        } else {
          masquerMessageInfoVitesseLigne();
          if (getTemporisationInfoVitesse()) {
            clearTemporisationInfoVitesse();
          }
        }
        rafraichirCarte();
      }
    });
  }

  window.creerGestionnaireFiltresAlice = creerGestionnaireFiltresAlice;
})();
