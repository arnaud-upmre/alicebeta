// Centre initial de la carte (France metropolitaine).
const CENTRE_INITIAL = [2.35, 48.85];
const ZOOM_INITIAL = 6;
const ZOOM_MAX = 19;
const VERSION_APP = "V1.1.1";
const SOURCE_APPAREILS = "appareils-source";
const COUCHE_APPAREILS = "appareils-points";
const COUCHE_APPAREILS_GROUPES = "appareils-groupes";
const APPAREILS_VIDE = { type: "FeatureCollection", features: [] };

// Style raster OSM (plan open).
const stylePlanOsm = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm"
    }
  ]
};

// Style raster des orthophotos IGN (satellite).
const styleSatelliteIgn = {
  version: 8,
  sources: {
    satelliteIgn: {
      type: "raster",
      tiles: [
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
      ],
      tileSize: 256,
      attribution: "© IGN"
    }
  },
  layers: [
    {
      id: "satelliteIgn",
      type: "raster",
      source: "satelliteIgn"
    }
  ]
};

// Style vectoriel officiel du Plan IGN (plus fluide pour le fond plan).
const URL_STYLE_PLAN_IGN =
  "https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json";

const fondsCartographiques = {
  planIgn: URL_STYLE_PLAN_IGN,
  osm: stylePlanOsm,
  satelliteIgn: styleSatelliteIgn
};

let fondActif = "planIgn";
let afficherAppareils = false;
let donneesAppareils = null;
let promesseChargementAppareils = null;
let popupAppareils = null;

function determinerCouleurAppareil(codeAppareil) {
  const code = String(codeAppareil || "").trim().toUpperCase();

  if (!code) {
    return "#111111";
  }

  if (code.startsWith("DU")) {
    return "#d90429"; // Rouge
  }

  if (code.startsWith("SI") || code.startsWith("I") || code.startsWith("D")) {
    return "#f77f00"; // Orange
  }

  if (
    code.startsWith("TT") ||
    code.startsWith("TSA") ||
    code.startsWith("TC") ||
    code.startsWith("TRA") ||
    /^GT\d+$/.test(code) ||
    /^AT\d+$/.test(code)
  ) {
    return "#ffd60a"; // Jaune
  }

  if (
    /^T\d+(?:\/\d+)?$/.test(code) ||
    code.startsWith("T/") ||
    /^\d/.test(code) ||
    code.startsWith("ST") ||
    code.startsWith("S") ||
    code.startsWith("FB") ||
    code.startsWith("F") ||
    code.startsWith("P") ||
    code.startsWith("B")
  ) {
    return "#2a9d8f"; // Vert
  }

  if (code.startsWith("ALIM")) {
    return "#8d99ae"; // Gris
  }

  return "#111111"; // Noir
}

function regrouperAppareilsParCoordonnees(geojson) {
  const groupes = new Map();

  for (const feature of geojson.features || []) {
    if (!feature?.geometry || feature.geometry.type !== "Point") {
      continue;
    }

    const [longitude, latitude] = feature.geometry.coordinates || [];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    const propr = feature.properties || {};
    const cle = `${longitude}|${latitude}`;
    const appareil = {
      nom: propr.nom || "",
      type: propr.type || "",
      SAT: propr.SAT || "",
      appareil: propr.appareil || "",
      couleur_appareil: determinerCouleurAppareil(propr.appareil)
    };

    if (!groupes.has(cle)) {
      groupes.set(cle, {
        longitude,
        latitude,
        appareils: []
      });
    }

    groupes.get(cle).appareils.push(appareil);
  }

  const features = [];
  for (const groupe of groupes.values()) {
    const total = groupe.appareils.length;

    if (total === 1) {
      const unique = groupe.appareils[0];
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [groupe.longitude, groupe.latitude]
        },
        properties: {
          ...unique,
          appareils_count: 1,
          est_groupe: false,
          appareils_liste_json: JSON.stringify([unique])
        }
      });
      continue;
    }

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [groupe.longitude, groupe.latitude]
      },
      properties: {
        appareils_count: total,
        est_groupe: true,
        couleur_appareil: "#1f2937",
        appareils_liste_json: JSON.stringify(groupe.appareils)
      }
    });
  }

  return {
    type: "FeatureCollection",
    features
  };
}

const carte = new maplibregl.Map({
  container: "map",
  center: CENTRE_INITIAL,
  zoom: ZOOM_INITIAL,
  maxZoom: ZOOM_MAX,
  style: fondsCartographiques[fondActif]
});

carte.addControl(new maplibregl.NavigationControl(), "top-right");
carte.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

const controleFonds = document.getElementById("controle-fonds");
const boutonFonds = document.getElementById("bouton-fonds");
const optionsFond = Array.from(document.querySelectorAll('input[name="fond"]'));
const controleFiltres = document.getElementById("controle-filtres");
const boutonFiltres = document.getElementById("bouton-filtres");
const caseAppareils = document.querySelector('input[name="filtre-appareils"]');
const badgeVersion = document.getElementById("version-app");

if (badgeVersion) {
  badgeVersion.textContent = VERSION_APP;
}

function appliquerCoucheAppareils() {
  if (!carte.getSource(SOURCE_APPAREILS)) {
    carte.addSource(SOURCE_APPAREILS, {
      type: "geojson",
      data: donneesAppareils || APPAREILS_VIDE
    });
  } else if (donneesAppareils) {
    carte.getSource(SOURCE_APPAREILS).setData(donneesAppareils);
  }

  if (!carte.getLayer(COUCHE_APPAREILS)) {
    carte.addLayer({
      id: COUCHE_APPAREILS,
      type: "circle",
      source: SOURCE_APPAREILS,
      filter: ["==", ["get", "appareils_count"], 1],
      paint: {
        "circle-radius": 5,
        "circle-color": ["coalesce", ["get", "couleur_appareil"], "#111111"],
        "circle-opacity": 0.86,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.1
      }
    });
  }

  if (!carte.getLayer(COUCHE_APPAREILS_GROUPES)) {
    carte.addLayer({
      id: COUCHE_APPAREILS_GROUPES,
      type: "circle",
      source: SOURCE_APPAREILS,
      filter: [">", ["get", "appareils_count"], 1],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "appareils_count"], 2, 13, 5, 17, 10, 22],
        "circle-color": "#2563eb",
        "circle-opacity": 0.32,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.8
      }
    });
  }

  carte.setLayoutProperty(
    COUCHE_APPAREILS,
    "visibility",
    afficherAppareils && donneesAppareils ? "visible" : "none"
  );
  carte.setLayoutProperty(
    COUCHE_APPAREILS_GROUPES,
    "visibility",
    afficherAppareils && donneesAppareils ? "visible" : "none"
  );
}

async function chargerDonneesAppareils() {
  if (donneesAppareils) {
    return donneesAppareils;
  }

  if (!promesseChargementAppareils) {
    promesseChargementAppareils = fetch("./appareils.geojson", { cache: "no-store" })
      .then((reponse) => {
        if (!reponse.ok) {
          throw new Error(`HTTP ${reponse.status}`);
        }

        return reponse.json();
      })
      .then((geojson) => {
        donneesAppareils = regrouperAppareilsParCoordonnees(geojson);
        return donneesAppareils;
      })
      .finally(() => {
        promesseChargementAppareils = null;
      });
  }

  return promesseChargementAppareils;
}

function activerInteractionsAppareils() {
  const echapperHtml = (valeur) =>
    String(valeur)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  carte.on("click", (event) => {
    if (!carte.getLayer(COUCHE_APPAREILS) || !carte.getLayer(COUCHE_APPAREILS_GROUPES)) {
      return;
    }

    const objets = carte.queryRenderedFeatures(event.point, {
      layers: [COUCHE_APPAREILS_GROUPES, COUCHE_APPAREILS]
    });
    if (!objets.length) {
      return;
    }

    const objet = objets[0];
    const propr = objet.properties || {};
    let appareilsListe = [];
    try {
      appareilsListe = JSON.parse(propr.appareils_liste_json || "[]");
    } catch {
      appareilsListe = [];
    }

    let contenu = "";
    if (Number(propr.appareils_count) > 1) {
      const lignes = appareilsListe
        .map((a) => {
          const titre = [a.nom || "", a.type || "", a.SAT || ""].filter(Boolean).join(" | ");
          return `<li><strong>${echapperHtml(titre || "Poste inconnu")}</strong><br/>Appareil: ${echapperHtml(a.appareil || "Appareil inconnu")}</li>`;
        })
        .join("");

      contenu = `<div class="popup-appareils"><strong>${echapperHtml(String(propr.appareils_count))} appareils au meme point</strong><ul style="margin:8px 0 0 16px;padding:0;max-height:180px;overflow:auto">${lignes}</ul></div>`;
    } else {
      const appareil = appareilsListe[0] || {};
      const titre = [appareil.nom || "", appareil.type || "", appareil.SAT || ""].filter(Boolean).join(" | ");
      contenu = `<div class="popup-appareils"><strong>${echapperHtml(titre || "Poste inconnu")}</strong><br/>Appareil: ${echapperHtml(appareil.appareil || "Appareil inconnu")}</div>`;
    }

    if (popupAppareils) {
      popupAppareils.remove();
    }

    popupAppareils = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(objet.geometry.coordinates)
      .setHTML(contenu)
      .addTo(carte);
  });

  carte.on("mousemove", (event) => {
    if (!carte.getLayer(COUCHE_APPAREILS) || !carte.getLayer(COUCHE_APPAREILS_GROUPES)) {
      carte.getCanvas().style.cursor = "";
      return;
    }

    const objets = carte.queryRenderedFeatures(event.point, {
      layers: [COUCHE_APPAREILS_GROUPES, COUCHE_APPAREILS]
    });
    carte.getCanvas().style.cursor = objets.length ? "pointer" : "";
  });
}

function mettreAJourSelection(nomFond) {
  for (const option of optionsFond) {
    option.checked = option.value === nomFond;
  }
}

function fermerMenuFonds() {
  controleFonds.classList.remove("est-ouvert");
  boutonFonds.setAttribute("aria-expanded", "false");
}

function ouvrirMenuFonds() {
  controleFonds.classList.add("est-ouvert");
  boutonFonds.setAttribute("aria-expanded", "true");
}

function basculerMenuFonds() {
  if (controleFonds.classList.contains("est-ouvert")) {
    fermerMenuFonds();
    return;
  }

  ouvrirMenuFonds();
}

function fermerMenuFiltres() {
  controleFiltres.classList.remove("est-ouvert");
  boutonFiltres.setAttribute("aria-expanded", "false");
}

function ouvrirMenuFiltres() {
  controleFiltres.classList.add("est-ouvert");
  boutonFiltres.setAttribute("aria-expanded", "true");
}

function basculerMenuFiltres() {
  if (controleFiltres.classList.contains("est-ouvert")) {
    fermerMenuFiltres();
    return;
  }

  ouvrirMenuFiltres();
}

function changerFondCarte(nomFond) {
  if (!fondsCartographiques[nomFond] || nomFond === fondActif) {
    return;
  }

  // Changement de style complet pour basculer proprement entre raster et vectoriel.
  carte.setStyle(fondsCartographiques[nomFond]);
  fondActif = nomFond;
  mettreAJourSelection(nomFond);
}

carte.on("style.load", () => {
  appliquerCoucheAppareils();
});

activerInteractionsAppareils();

for (const option of optionsFond) {
  option.addEventListener("change", () => {
    if (!option.checked) {
      return;
    }

    changerFondCarte(option.value);
    fermerMenuFonds();
  });
}

boutonFonds.addEventListener("click", (event) => {
  event.stopPropagation();
  fermerMenuFiltres();
  basculerMenuFonds();
});

caseAppareils.addEventListener("change", async () => {
  afficherAppareils = caseAppareils.checked;
  if (afficherAppareils) {
    caseAppareils.disabled = true;
    try {
      await chargerDonneesAppareils();
    } catch (erreur) {
      afficherAppareils = false;
      caseAppareils.checked = false;
      console.error("Impossible de charger appareils.geojson", erreur);
      alert(
        "Chargement des appareils impossible. Ouvre la carte via un serveur local (http://localhost...) ou vérifie appareils.geojson."
      );
    } finally {
      caseAppareils.disabled = false;
    }
  }

  appliquerCoucheAppareils();
});

boutonFiltres.addEventListener("click", (event) => {
  event.stopPropagation();
  fermerMenuFonds();
  basculerMenuFiltres();
});

document.addEventListener("click", (event) => {
  if (!controleFonds.contains(event.target)) {
    fermerMenuFonds();
  }

  if (!controleFiltres.contains(event.target)) {
    fermerMenuFiltres();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    fermerMenuFonds();
    fermerMenuFiltres();
  }
});
