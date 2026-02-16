// Centre initial de la carte (France metropolitaine).
const CENTRE_INITIAL = [2.35, 48.85];
const ZOOM_INITIAL = 6;
const ZOOM_MAX = 19;
const SOURCE_APPAREILS = "appareils-source";
const COUCHE_APPAREILS = "appareils-points";
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
      paint: {
        "circle-radius": 5,
        "circle-color": "#db2f2f",
        "circle-opacity": 0.86,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.1
      }
    });
  }

  carte.setLayoutProperty(
    COUCHE_APPAREILS,
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
        donneesAppareils = geojson;
        return geojson;
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
    if (!carte.getLayer(COUCHE_APPAREILS)) {
      return;
    }

    const objets = carte.queryRenderedFeatures(event.point, { layers: [COUCHE_APPAREILS] });
    if (!objets.length) {
      return;
    }

    const objet = objets[0];
    const propr = objet.properties || {};
    const nomPoste = propr.nom || "";
    const typePoste = propr.type || "";
    const satPoste = propr.SAT || "";
    const codeAppareil = propr.appareil || "Appareil inconnu";
    const titre = [nomPoste, typePoste, satPoste].filter(Boolean).join(" | ");
    const contenu = `<div class="popup-appareils"><strong>${echapperHtml(titre || "Poste inconnu")}</strong><br/>Appareil: ${echapperHtml(codeAppareil)}</div>`;

    if (popupAppareils) {
      popupAppareils.remove();
    }

    popupAppareils = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(objet.geometry.coordinates)
      .setHTML(contenu)
      .addTo(carte);
  });

  carte.on("mousemove", (event) => {
    if (!carte.getLayer(COUCHE_APPAREILS)) {
      carte.getCanvas().style.cursor = "";
      return;
    }

    const objets = carte.queryRenderedFeatures(event.point, { layers: [COUCHE_APPAREILS] });
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
