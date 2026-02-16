// Centre initial de la carte (France metropolitaine).
const CENTRE_INITIAL = [2.35, 48.85];
const ZOOM_INITIAL = 6;
const ZOOM_MAX = 19;
const VERSION_APP = "V1.2.4";
const SOURCE_APPAREILS = "appareils-source";
const COUCHE_APPAREILS = "appareils-points";
const COUCHE_APPAREILS_GROUPES = "appareils-groupes";
const SOURCE_ACCES = "acces-source";
const COUCHE_ACCES = "acces-points";
const COUCHE_ACCES_GROUPES = "acces-groupes";
const APPAREILS_VIDE = { type: "FeatureCollection", features: [] };
const ACCES_VIDE = { type: "FeatureCollection", features: [] };

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
let afficherAcces = true;
let donneesAppareils = null;
let donneesAcces = null;
let promesseChargementAppareils = null;
let promesseChargementAcces = null;
let popupCarte = null;
let initialisationEffectuee = false;
let totalAppareilsBrut = 0;

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

function estHorsPatrimoine(valeur) {
  if (valeur === true) {
    return true;
  }
  const texte = String(valeur || "")
    .trim()
    .toLowerCase();
  return texte === "true" || texte === "1" || texte === "oui";
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
      couleur_appareil: determinerCouleurAppareil(propr.appareil),
      hors_patrimoine: estHorsPatrimoine(propr.hors_patrimoine)
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
          hors_patrimoine_count: unique.hors_patrimoine ? 1 : 0,
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
        hors_patrimoine_count: groupe.appareils.filter((a) => a.hors_patrimoine).length,
        hors_patrimoine: groupe.appareils.some((a) => a.hors_patrimoine),
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

function regrouperAccesParCoordonnees(geojson) {
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
    const acces = {
      nom: propr.nom || "",
      type: propr.type || "",
      SAT: propr.SAT || "",
      acces: propr.acces || "",
      portail: propr.portail || "",
      hors_patrimoine: estHorsPatrimoine(propr.hors_patrimoine),
      latitude,
      longitude
    };

    if (!groupes.has(cle)) {
      groupes.set(cle, {
        longitude,
        latitude,
        acces: []
      });
    }

    groupes.get(cle).acces.push(acces);
  }

  const features = [];
  for (const groupe of groupes.values()) {
    const total = groupe.acces.length;

    if (total === 1) {
      const unique = groupe.acces[0];
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [groupe.longitude, groupe.latitude]
        },
        properties: {
          ...unique,
          acces_count: 1,
          hors_patrimoine_count: unique.hors_patrimoine ? 1 : 0,
          est_groupe: false,
          acces_liste_json: JSON.stringify([unique])
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
        acces_count: total,
        hors_patrimoine_count: groupe.acces.filter((a) => a.hors_patrimoine).length,
        hors_patrimoine: groupe.acces.some((a) => a.hors_patrimoine),
        est_groupe: true,
        acces_liste_json: JSON.stringify(groupe.acces)
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
const caseAcces = document.querySelector('input[name="filtre-acces"]');
const compteurAppareils = document.getElementById("compteur-appareils");
const compteurAcces = document.getElementById("compteur-acces");
const badgeVersion = document.getElementById("version-app");

if (badgeVersion) {
  badgeVersion.textContent = VERSION_APP;
  badgeVersion.setAttribute("role", "link");
  badgeVersion.setAttribute("tabindex", "0");
  badgeVersion.setAttribute("title", "Ouvrir les mises a jour");
  badgeVersion.addEventListener("click", () => {
    window.location.href = "./mises-a-jour.html";
  });
  badgeVersion.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.location.href = "./mises-a-jour.html";
    }
  });
}

function calculerTotalEntrees(donnees, cleCount) {
  if (!donnees?.features) {
    return 0;
  }

  return donnees.features.reduce((total, feature) => {
    const valeur = Number(feature?.properties?.[cleCount]);
    return total + (Number.isFinite(valeur) ? valeur : 0);
  }, 0);
}

function mettreAJourCompteursFiltres() {
  if (compteurAppareils) {
    const totalAppareils = totalAppareilsBrut || calculerTotalEntrees(donneesAppareils, "appareils_count");
    compteurAppareils.textContent = `(${totalAppareils})`;
  }
  if (compteurAcces) {
    compteurAcces.textContent = `(${calculerTotalEntrees(donneesAcces, "acces_count")})`;
  }
}

function appliquerCouchesDonnees() {
  if (!carte.isStyleLoaded()) {
    return;
  }

  if (!carte.getSource(SOURCE_APPAREILS)) {
    carte.addSource(SOURCE_APPAREILS, {
      type: "geojson",
      data: donneesAppareils || APPAREILS_VIDE
    });
  } else {
    carte.getSource(SOURCE_APPAREILS).setData(donneesAppareils || APPAREILS_VIDE);
  }

  if (!carte.getLayer(COUCHE_APPAREILS)) {
    carte.addLayer({
      id: COUCHE_APPAREILS,
      type: "circle",
      source: SOURCE_APPAREILS,
      filter: ["==", ["get", "appareils_count"], 1],
      paint: {
        "circle-radius": 5,
        "circle-color": [
          "case",
          ["==", ["get", "hors_patrimoine"], true],
          "#ef4444",
          ["coalesce", ["get", "couleur_appareil"], "#111111"]
        ],
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
        "circle-color": ["case", [">", ["get", "hors_patrimoine_count"], 0], "#f87171", "#2563eb"],
        "circle-opacity": ["case", [">", ["get", "hors_patrimoine_count"], 0], 0.38, 0.32],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.8
      }
    });
  }

  if (!carte.getSource(SOURCE_ACCES)) {
    carte.addSource(SOURCE_ACCES, {
      type: "geojson",
      data: donneesAcces || ACCES_VIDE
    });
  } else {
    carte.getSource(SOURCE_ACCES).setData(donneesAcces || ACCES_VIDE);
  }

  if (!carte.getLayer(COUCHE_ACCES)) {
    carte.addLayer({
      id: COUCHE_ACCES,
      type: "circle",
      source: SOURCE_ACCES,
      filter: ["==", ["get", "acces_count"], 1],
      paint: {
        "circle-radius": 5,
        "circle-color": ["case", ["==", ["get", "hors_patrimoine"], true], "#ef4444", "#7c3aed"],
        "circle-opacity": ["case", ["==", ["get", "hors_patrimoine"], true], 0.82, 0.9],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.1
      }
    });
  }

  if (!carte.getLayer(COUCHE_ACCES_GROUPES)) {
    carte.addLayer({
      id: COUCHE_ACCES_GROUPES,
      type: "circle",
      source: SOURCE_ACCES,
      filter: [">", ["get", "acces_count"], 1],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "acces_count"], 2, 13, 5, 17, 10, 22],
        "circle-color": ["case", [">", ["get", "hors_patrimoine_count"], 0], "#f87171", "#8b5cf6"],
        "circle-opacity": ["case", [">", ["get", "hors_patrimoine_count"], 0], 0.38, 0.34],
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
  carte.setLayoutProperty(COUCHE_ACCES, "visibility", afficherAcces && donneesAcces ? "visible" : "none");
  carte.setLayoutProperty(
    COUCHE_ACCES_GROUPES,
    "visibility",
    afficherAcces && donneesAcces ? "visible" : "none"
  );
}

function restaurerEtatFiltres() {
  if (caseAppareils) {
    caseAppareils.checked = afficherAppareils;
  }
  if (caseAcces) {
    caseAcces.checked = afficherAcces;
  }

  mettreAJourCompteursFiltres();
  appliquerCouchesDonnees();
}

function remonterCouchesDonnees() {
  if (carte.getLayer(COUCHE_ACCES_GROUPES)) {
    carte.moveLayer(COUCHE_ACCES_GROUPES);
  }

  if (carte.getLayer(COUCHE_ACCES)) {
    carte.moveLayer(COUCHE_ACCES);
  }

  if (carte.getLayer(COUCHE_APPAREILS_GROUPES)) {
    carte.moveLayer(COUCHE_APPAREILS_GROUPES);
  }

  if (carte.getLayer(COUCHE_APPAREILS)) {
    carte.moveLayer(COUCHE_APPAREILS);
  }
}

function restaurerAffichageDonnees() {
  if (!carte.isStyleLoaded()) {
    return;
  }

  appliquerCouchesDonnees();
  remonterCouchesDonnees();
}

function planifierRestaurationFiltres() {
  const tentativeMax = 40;
  let tentatives = 0;

  const essayer = () => {
    tentatives += 1;

    if (carte.isStyleLoaded()) {
      restaurerEtatFiltres();
      restaurerAffichageDonnees();
      return;
    }

    if (tentatives < tentativeMax) {
      setTimeout(essayer, 60);
    }
  };

  essayer();
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
        totalAppareilsBrut = Array.isArray(geojson?.features) ? geojson.features.length : 0;
        donneesAppareils = regrouperAppareilsParCoordonnees(geojson);
        mettreAJourCompteursFiltres();
        return donneesAppareils;
      })
      .finally(() => {
        promesseChargementAppareils = null;
      });
  }

  return promesseChargementAppareils;
}

async function chargerCompteurAppareils() {
  if (donneesAppareils) {
    mettreAJourCompteursFiltres();
    return;
  }

  try {
    await chargerDonneesAppareils();
  } catch (erreur) {
    console.error("Impossible de precharger appareils.geojson pour le compteur", erreur);
  } finally {
    mettreAJourCompteursFiltres();
  }
}

async function chargerDonneesAcces() {
  if (donneesAcces) {
    return donneesAcces;
  }

  if (!promesseChargementAcces) {
    promesseChargementAcces = fetch("./acces.geojson", { cache: "no-store" })
      .then((reponse) => {
        if (!reponse.ok) {
          throw new Error(`HTTP ${reponse.status}`);
        }

        return reponse.json();
      })
      .then((geojson) => {
        donneesAcces = regrouperAccesParCoordonnees(geojson);
        mettreAJourCompteursFiltres();
        return donneesAcces;
      })
      .finally(() => {
        promesseChargementAcces = null;
      });
  }

  return promesseChargementAcces;
}

function echapperHtml(valeur) {
  return String(valeur)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function construireLiensItineraires(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return "";
  }

  const destination = `${latitude},${longitude}`;
  const googleMaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  const applePlans = `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
  const waze = `https://waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes`;

  return `<div class="popup-itineraires"><a class="popup-bouton-itineraire" href="${echapperHtml(googleMaps)}" target="_blank" rel="noopener noreferrer">Google Maps</a><a class="popup-bouton-itineraire" href="${echapperHtml(applePlans)}" target="_blank" rel="noopener noreferrer">Apple Plans</a><a class="popup-bouton-itineraire" href="${echapperHtml(waze)}" target="_blank" rel="noopener noreferrer">Waze</a></div>`;
}

function construireSectionAppareils(feature) {
  const propr = feature.properties || {};
  let appareilsListe = [];
  try {
    appareilsListe = JSON.parse(propr.appareils_liste_json || "[]");
  } catch {
    appareilsListe = [];
  }

  if (!appareilsListe.length) {
    return "";
  }

  if (Number(propr.appareils_count) > 1) {
    const titresUniques = [
      ...new Set(
        appareilsListe
          .map((a) => [a.nom || "", a.type || "", a.SAT || ""].filter(Boolean).join(" | "))
          .filter(Boolean)
      )
    ];
    const titreLieu =
      titresUniques.length === 1 ? titresUniques[0] : `${String(titresUniques.length)} lieux`;

    const lignes = appareilsListe
      .map((a) => {
        const couleur = a.couleur_appareil || "#111111";
        const classeHors = a.hors_patrimoine ? " popup-item-hors" : "";
        const tagHors = a.hors_patrimoine
          ? '<span class="popup-tag-hors">Hors patrimoine</span>'
          : "";
        return `<li class="${classeHors.trim()}"><span class="popup-point-couleur" style="background:${echapperHtml(couleur)}"></span>${echapperHtml(a.appareil || "Appareil inconnu")}${tagHors ? `<br/>${tagHors}` : ""}</li>`;
      })
      .join("");

    return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-appareils">${echapperHtml(String(propr.appareils_count))} appareils</span></div><div class="popup-sous-titre-centre">sur le meme support</div><p class="popup-lieu-unique"><strong>${echapperHtml(titreLieu || "Poste inconnu")}</strong></p><ul>${lignes}</ul></section>`;
  }

  const appareil = appareilsListe[0] || {};
  const titre = [appareil.nom || "", appareil.type || "", appareil.SAT || ""].filter(Boolean).join(" | ");
  const couleur = appareil.couleur_appareil || "#111111";
  const classeHors = appareil.hors_patrimoine ? " class=\"popup-item-hors\"" : "";
  const tagHors = appareil.hors_patrimoine ? '<span class="popup-tag-hors">Hors patrimoine</span>' : "";
  return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-appareils">1 appareil</span></div><p${classeHors}><strong>${echapperHtml(titre || "Poste inconnu")}</strong>${tagHors ? `<br/>${tagHors}` : ""}<br/><span class="popup-point-couleur" style="background:${echapperHtml(couleur)}"></span>${echapperHtml(appareil.appareil || "Appareil inconnu")}</p></section>`;
}

function construireSectionAcces(feature) {
  const propr = feature.properties || {};
  let accesListe = [];
  try {
    accesListe = JSON.parse(propr.acces_liste_json || "[]");
  } catch {
    accesListe = [];
  }

  if (!accesListe.length) {
    return "";
  }

  if (Number(propr.acces_count) > 1) {
    const lignes = accesListe
      .map((a) => {
        const titre = [a.nom || "", a.type || "", a.SAT || ""].filter(Boolean).join(" | ");
        const classeHors = a.hors_patrimoine ? "popup-item-hors" : "";
        const tagHors = a.hors_patrimoine
          ? '<span class="popup-tag-hors">Hors patrimoine</span>'
          : "";
        return `<li class="${classeHors}"><span class="popup-acces-ligne">${echapperHtml(titre || "Acces inconnu")}</span>${tagHors ? `<br/>${tagHors}` : ""}</li>`;
      })
      .join("");
    return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-acces">${echapperHtml(String(propr.acces_count))} acces voiture</span></div><ul>${lignes}</ul></section>`;
  }

  const acces = accesListe[0] || {};
  const titre = [acces.nom || "", acces.type || "", acces.SAT || ""].filter(Boolean).join(" | ");
  const classeHors = acces.hors_patrimoine ? " popup-item-hors" : "";
  const tagHors = acces.hors_patrimoine ? '<span class="popup-tag-hors">Hors patrimoine</span>' : "";
  return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-acces">1 acces voiture</span></div><p class="popup-acces-ligne${classeHors}">${echapperHtml(titre || "Acces inconnu")}</p>${tagHors}</section>`;
}

function activerInteractionsCarte() {
  const couchesInteractives = [
    COUCHE_ACCES_GROUPES,
    COUCHE_ACCES,
    COUCHE_APPAREILS_GROUPES,
    COUCHE_APPAREILS
  ];

  carte.on("click", (event) => {
    const couchesDisponibles = couchesInteractives.filter((id) => Boolean(carte.getLayer(id)));
    if (!couchesDisponibles.length) {
      return;
    }

    const objets = carte.queryRenderedFeatures(event.point, {
      layers: couchesDisponibles
    });
    if (!objets.length) {
      return;
    }

    const objet = objets[0];
    const [longitude, latitude] = objet.geometry.coordinates || [];
    const cle = `${longitude}|${latitude}`;
    const uniquesParCouche = new Map();

    for (const feature of objets) {
      const coord = feature.geometry?.coordinates || [];
      if (`${coord[0]}|${coord[1]}` !== cle) {
        continue;
      }
      const idCouche = feature.layer?.id;
      if (idCouche && !uniquesParCouche.has(idCouche)) {
        uniquesParCouche.set(idCouche, feature);
      }
    }

    const sections = [];
    let contientAcces = false;
    const ordreCouches = [COUCHE_ACCES_GROUPES, COUCHE_ACCES, COUCHE_APPAREILS_GROUPES, COUCHE_APPAREILS];
    for (const couche of ordreCouches) {
      const feature = uniquesParCouche.get(couche);
      if (!feature) {
        continue;
      }
      if (couche === COUCHE_ACCES_GROUPES || couche === COUCHE_ACCES) {
        const sectionAcces = construireSectionAcces(feature);
        if (sectionAcces) {
          contientAcces = true;
          sections.push(sectionAcces);
        }
      } else {
        const sectionAppareils = construireSectionAppareils(feature);
        if (sectionAppareils) {
          sections.push(sectionAppareils);
        }
      }
    }

    if (!sections.length) {
      return;
    }

    const sectionItineraire = contientAcces
      ? `<section class="popup-section popup-section-itineraires"><div class="popup-section-titre"><span class="popup-badge popup-badge-itineraire">Itineraire</span><strong>Navigation</strong></div>${construireLiensItineraires(longitude, latitude)}</section>`
      : "";
    const contenu = `<div class="popup-carte">${sections.join("")}${sectionItineraire}</div>`;

    if (popupCarte) {
      popupCarte.remove();
    }

    popupCarte = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(objet.geometry.coordinates)
      .setHTML(contenu)
      .addTo(carte);
  });

  carte.on("mousemove", (event) => {
    const couchesDisponibles = couchesInteractives.filter((id) => Boolean(carte.getLayer(id)));
    if (!couchesDisponibles.length) {
      carte.getCanvas().style.cursor = "";
      return;
    }

    const objets = carte.queryRenderedFeatures(event.point, {
      layers: couchesDisponibles
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
  planifierRestaurationFiltres();

  // Certains styles vectoriels se finalisent en plusieurs etapes.
  setTimeout(restaurerAffichageDonnees, 120);
  setTimeout(restaurerAffichageDonnees, 420);
  setTimeout(restaurerAffichageDonnees, 900);
}

carte.on("style.load", () => {
  restaurerEtatFiltres();
  restaurerAffichageDonnees();

  if (!initialisationEffectuee) {
    initialisationEffectuee = true;
    initialiserDonneesParDefaut();
  }
});

carte.on("styledata", () => {
  if ((afficherAppareils || afficherAcces) && carte.isStyleLoaded()) {
    restaurerEtatFiltres();
    restaurerAffichageDonnees();
  }
});

activerInteractionsCarte();

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

if (caseAppareils) {
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

    appliquerCouchesDonnees();
    remonterCouchesDonnees();
  });
}

if (caseAcces) {
  caseAcces.addEventListener("change", async () => {
    afficherAcces = caseAcces.checked;
    if (afficherAcces) {
      caseAcces.disabled = true;
      try {
        await chargerDonneesAcces();
      } catch (erreur) {
        afficherAcces = false;
        caseAcces.checked = false;
        console.error("Impossible de charger acces.geojson", erreur);
        alert(
          "Chargement des acces impossible. Ouvre la carte via un serveur local (http://localhost...) ou vérifie acces.geojson."
        );
      } finally {
        caseAcces.disabled = false;
      }
    }

    appliquerCouchesDonnees();
    remonterCouchesDonnees();
  });
}

async function initialiserDonneesParDefaut() {
  await chargerCompteurAppareils();

  if (!afficherAcces) {
    appliquerCouchesDonnees();
    remonterCouchesDonnees();
    return;
  }

  if (caseAcces) {
    caseAcces.disabled = true;
  }
  try {
    await chargerDonneesAcces();
  } catch (erreur) {
    afficherAcces = false;
    if (caseAcces) {
      caseAcces.checked = false;
    }
    console.error("Impossible de charger acces.geojson", erreur);
  } finally {
    if (caseAcces) {
      caseAcces.disabled = false;
    }
  }

  appliquerCouchesDonnees();
  remonterCouchesDonnees();
}

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
