// Centre initial de la carte (France metropolitaine).
const CENTRE_INITIAL = [2.35, 48.85];
const ZOOM_INITIAL = 6;
const ZOOM_MAX = 19;
const VERSION_APP = "V1.2.8";
const SOURCE_APPAREILS = "appareils-source";
const COUCHE_APPAREILS = "appareils-points";
const COUCHE_APPAREILS_GROUPES = "appareils-groupes";
const SOURCE_ACCES = "acces-source";
const COUCHE_ACCES = "acces-points";
const COUCHE_ACCES_GROUPES = "acces-groupes";
const SOURCE_POSTES = "postes-source";
const COUCHE_POSTES = "postes-points";
const COUCHE_POSTES_GROUPES = "postes-groupes";
const APPAREILS_VIDE = { type: "FeatureCollection", features: [] };
const ACCES_VIDE = { type: "FeatureCollection", features: [] };
const POSTES_VIDE = { type: "FeatureCollection", features: [] };

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

let fondActif = "satelliteIgn";
let afficherAppareils = false;
let afficherAcces = true;
let afficherPostes = false;
let donneesAppareils = null;
let donneesAcces = null;
let donneesPostes = null;
let promesseChargementAppareils = null;
let promesseChargementAcces = null;
let promesseChargementPostes = null;
let popupCarte = null;
let initialisationEffectuee = false;
let totalAppareilsBrut = 0;
let totalPostesBrut = 0;
let indexRecherche = [];
let promesseChargementRecherche = null;
const DIAMETRE_ICONE_GROUPE_APPAREILS = 84;

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

function normaliserCouleurHex(couleur) {
  const valeur = String(couleur || "")
    .trim()
    .toLowerCase();
  if (!valeur) {
    return "#111111";
  }
  const hex = valeur.startsWith("#") ? valeur.slice(1) : valeur;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex
      .split("")
      .map((c) => c + c)
      .join("")}`;
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return `#${hex}`;
  }
  return "#111111";
}

function convertirHexEnRgba(couleurHex, alpha) {
  const hex = normaliserCouleurHex(couleurHex).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function construireIdIconeGroupeAppareils(couleurs, horsPatrimoine) {
  const palette = (couleurs || [])
    .map((couleur) => normaliserCouleurHex(couleur).slice(1))
    .join("-");
  const suffixeHp = horsPatrimoine ? "-hp" : "";
  return `appareils-groupe-${palette || "111111"}${suffixeHp}`;
}

function creerImageIconeGroupeAppareils(couleurs, horsPatrimoine) {
  const canvas = document.createElement("canvas");
  canvas.width = DIAMETRE_ICONE_GROUPE_APPAREILS;
  canvas.height = DIAMETRE_ICONE_GROUPE_APPAREILS;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const teintes = Array.isArray(couleurs) && couleurs.length ? couleurs : ["#2563eb"];
  const taille = teintes.length;
  const centre = DIAMETRE_ICONE_GROUPE_APPAREILS / 2;
  const rayon = centre - 3;
  const depart = -Math.PI / 2;

  for (let i = 0; i < taille; i += 1) {
    const angleStart = depart + (i / taille) * Math.PI * 2;
    const angleEnd = depart + ((i + 1) / taille) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centre, centre);
    ctx.arc(centre, centre, rayon, angleStart, angleEnd);
    ctx.closePath();
    ctx.fillStyle = convertirHexEnRgba(teintes[i], 0.52);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(centre, centre, rayon, 0, Math.PI * 2);
  ctx.strokeStyle = horsPatrimoine ? "#f87171" : "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, DIAMETRE_ICONE_GROUPE_APPAREILS, DIAMETRE_ICONE_GROUPE_APPAREILS);
  return {
    width: DIAMETRE_ICONE_GROUPE_APPAREILS,
    height: DIAMETRE_ICONE_GROUPE_APPAREILS,
    data: imageData.data
  };
}

function enregistrerIconesGroupesAppareils() {
  if (!carte.hasImage("appareils-groupe-111111")) {
    const fallback = creerImageIconeGroupeAppareils(["#111111"], false);
    if (fallback) {
      carte.addImage("appareils-groupe-111111", fallback, { pixelRatio: 2 });
    }
  }

  if (!donneesAppareils?.features?.length) {
    return;
  }

  for (const feature of donneesAppareils.features) {
    const propr = feature?.properties || {};
    if (Number(propr.appareils_count) <= 1) {
      continue;
    }

    const idIcone = String(propr.icone_groupe_appareils || "").trim();
    if (!idIcone || carte.hasImage(idIcone)) {
      continue;
    }

    let couleurs = [];
    try {
      couleurs = JSON.parse(propr.appareils_couleurs_json || "[]");
    } catch {
      couleurs = [];
    }
    const image = creerImageIconeGroupeAppareils(couleurs, Number(propr.hors_patrimoine_count) > 0);
    if (image) {
      carte.addImage(idIcone, image, { pixelRatio: 2 });
    }
  }
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
      acces: propr.acces || "",
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
        icone_groupe_appareils: construireIdIconeGroupeAppareils(
          groupe.appareils.map((a) => a.couleur_appareil || "#111111"),
          groupe.appareils.some((a) => a.hors_patrimoine)
        ),
        appareils_couleurs_json: JSON.stringify(
          groupe.appareils.map((a) => normaliserCouleurHex(a.couleur_appareil || "#111111"))
        ),
        appareils_count: total,
        hors_patrimoine_count: groupe.appareils.filter((a) => a.hors_patrimoine).length,
        hors_patrimoine: groupe.appareils.some((a) => a.hors_patrimoine),
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
    const horsPatrimoine = estHorsPatrimoine(propr.hors_patrimoine);
    const champAcces = String(propr.acces || "").trim();
    const acces = {
      nom: propr.nom || "",
      type: propr.type || "",
      SAT: propr.SAT || "",
      acces: champAcces,
      hors_patrimoine: horsPatrimoine
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
        acces_liste_json: JSON.stringify(groupe.acces)
      }
    });
  }

  return {
    type: "FeatureCollection",
    features
  };
}

function regrouperPostesParCoordonnees(geojson) {
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
    const nomNormalise = String(propr.nom || "")
      .trim()
      .toLowerCase();

    if (!groupes.has(cle)) {
      groupes.set(cle, {
        longitude,
        latitude,
        postes: [],
        nomsVus: new Set()
      });
    }

    const groupe = groupes.get(cle);
    if (nomNormalise && groupe.nomsVus.has(nomNormalise)) {
      continue;
    }

    const poste = {
      nom: propr.nom || "",
      type: propr.type || "",
      SAT: propr.SAT || "",
      acces: propr.acces || "",
      description: propr.description || "",
      description_telecommande: propr.description_telecommande || "",
      rss: propr.rss || "",
      contact: propr.contact || "",
      lignes: propr.lignes || "",
      numero_ligne: propr.numero_ligne ?? "",
      pk: propr.pk || "",
      hors_patrimoine: estHorsPatrimoine(propr.hors_patrimoine)
    };

    if (nomNormalise) {
      groupe.nomsVus.add(nomNormalise);
    }

    groupe.postes.push(poste);
  }

  const features = [];
  for (const groupe of groupes.values()) {
    const total = groupe.postes.length;

    if (total === 1) {
      const unique = groupe.postes[0];
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [groupe.longitude, groupe.latitude]
        },
        properties: {
          ...unique,
          postes_count: 1,
          hors_patrimoine_count: unique.hors_patrimoine ? 1 : 0,
          postes_liste_json: JSON.stringify([unique])
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
        postes_count: total,
        hors_patrimoine_count: groupe.postes.filter((p) => p.hors_patrimoine).length,
        hors_patrimoine: groupe.postes.some((p) => p.hors_patrimoine),
        postes_liste_json: JSON.stringify(groupe.postes)
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
const casePostes = document.querySelector('input[name="filtre-postes"]');
const compteurAppareils = document.getElementById("compteur-appareils");
const compteurAcces = document.getElementById("compteur-acces");
const compteurPostes = document.getElementById("compteur-postes");
const badgeVersion = document.getElementById("version-app");
const controleRecherche = document.getElementById("controle-recherche");
const champRecherche = document.getElementById("champ-recherche");
const listeResultatsRecherche = document.getElementById("recherche-resultats");

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
  if (compteurPostes) {
    const totalPostes = totalPostesBrut || calculerTotalEntrees(donneesPostes, "postes_count");
    compteurPostes.textContent = `(${totalPostes})`;
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

  enregistrerIconesGroupesAppareils();

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
      type: "symbol",
      source: SOURCE_APPAREILS,
      filter: [">", ["get", "appareils_count"], 1],
      layout: {
        "icon-image": ["coalesce", ["get", "icone_groupe_appareils"], "appareils-groupe-111111"],
        "icon-size": ["interpolate", ["linear"], ["get", "appareils_count"], 2, 0.42, 5, 0.55, 10, 0.72],
        "icon-allow-overlap": true
      },
      paint: {
        "icon-opacity": 0.92
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

  if (!carte.getSource(SOURCE_POSTES)) {
    carte.addSource(SOURCE_POSTES, {
      type: "geojson",
      data: donneesPostes || POSTES_VIDE
    });
  } else {
    carte.getSource(SOURCE_POSTES).setData(donneesPostes || POSTES_VIDE);
  }

  if (!carte.getLayer(COUCHE_POSTES)) {
    carte.addLayer({
      id: COUCHE_POSTES,
      type: "circle",
      source: SOURCE_POSTES,
      filter: ["==", ["get", "postes_count"], 1],
      paint: {
        "circle-radius": 5,
        "circle-color": ["case", ["==", ["get", "hors_patrimoine"], true], "#ef4444", "#2563eb"],
        "circle-opacity": ["case", ["==", ["get", "hors_patrimoine"], true], 0.82, 0.92],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.1
      }
    });
  }

  if (!carte.getLayer(COUCHE_POSTES_GROUPES)) {
    carte.addLayer({
      id: COUCHE_POSTES_GROUPES,
      type: "circle",
      source: SOURCE_POSTES,
      filter: [">", ["get", "postes_count"], 1],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "postes_count"], 2, 13, 5, 17, 10, 22],
        "circle-color": ["case", [">", ["get", "hors_patrimoine_count"], 0], "#f87171", "#3b82f6"],
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
  carte.setLayoutProperty(COUCHE_POSTES, "visibility", afficherPostes && donneesPostes ? "visible" : "none");
  carte.setLayoutProperty(
    COUCHE_POSTES_GROUPES,
    "visibility",
    afficherPostes && donneesPostes ? "visible" : "none"
  );
}

function restaurerEtatFiltres() {
  if (caseAppareils) {
    caseAppareils.checked = afficherAppareils;
  }
  if (caseAcces) {
    caseAcces.checked = afficherAcces;
  }
  if (casePostes) {
    casePostes.checked = afficherPostes;
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

  if (carte.getLayer(COUCHE_POSTES_GROUPES)) {
    carte.moveLayer(COUCHE_POSTES_GROUPES);
  }

  if (carte.getLayer(COUCHE_POSTES)) {
    carte.moveLayer(COUCHE_POSTES);
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

async function chargerDonneesPostes() {
  if (donneesPostes) {
    return donneesPostes;
  }

  if (!promesseChargementPostes) {
    promesseChargementPostes = fetch("./postes.geojson", { cache: "no-store" })
      .then((reponse) => {
        if (!reponse.ok) {
          throw new Error(`HTTP ${reponse.status}`);
        }

        return reponse.json();
      })
      .then((geojson) => {
        donneesPostes = regrouperPostesParCoordonnees(geojson);
        totalPostesBrut = calculerTotalEntrees(donneesPostes, "postes_count");
        mettreAJourCompteursFiltres();
        return donneesPostes;
      })
      .finally(() => {
        promesseChargementPostes = null;
      });
  }

  return promesseChargementPostes;
}

async function chargerCompteurPostes() {
  if (donneesPostes) {
    mettreAJourCompteursFiltres();
    return;
  }

  try {
    await chargerDonneesPostes();
  } catch (erreur) {
    console.error("Impossible de precharger postes.geojson pour le compteur", erreur);
  } finally {
    mettreAJourCompteursFiltres();
  }
}

function echapperHtml(valeur) {
  return String(valeur)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normaliserChampTexte(valeur) {
  return String(valeur || "").trim();
}

function champEstACompleter(valeur) {
  const texte = normaliserChampTexte(valeur).toUpperCase();
  return texte === "A COMPLETER" || texte === "A COMPLÉTER" || texte === "COMPLETER" || texte === "COMPLÉTER";
}

function champCompletOuVide(valeur) {
  const texte = normaliserChampTexte(valeur);
  if (!texte || champEstACompleter(texte)) {
    return "";
  }
  return texte;
}

function construireTitreNomTypeSat(entree, options = {}) {
  const nomBase = normaliserChampTexte(entree?.nom);
  const nom = entree?.hors_patrimoine && options.nomVilleDe && nomBase ? `${nomBase} (Ville De)` : nomBase;
  const type = normaliserChampTexte(entree?.type);
  const sat = champCompletOuVide(entree?.SAT);
  return [nom, type, sat].filter(Boolean).join(" | ");
}

function construireTitreNomTypeSatAcces(entree, options = {}) {
  const nomTypeSat = construireTitreNomTypeSat(entree, options);
  const acces = champCompletOuVide(entree?.acces);
  return [nomTypeSat, acces].filter(Boolean).join(" | ");
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

function construireSectionAppareils(feature, options = {}) {
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
    const lignes = appareilsListe
      .map((a) => {
        const couleur = a.couleur_appareil || "#111111";
        const tagHp = a.hors_patrimoine ? '<span class="popup-tag-hp">HP</span>' : "";
        const libelleAppareil = champCompletOuVide(a.appareil) || "Appareil inconnu";
        const titrePoste = construireTitreNomTypeSat(a);
        return `<li><span class="popup-point-couleur" style="background:${echapperHtml(couleur)}"></span>${echapperHtml(libelleAppareil)}${tagHp}${titrePoste ? `<br/><span class="popup-poste-details">${echapperHtml(titrePoste)}</span>` : ""}</li>`;
      })
      .join("");

    return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-appareils">${echapperHtml(String(propr.appareils_count))} appareils</span></div><div class="popup-sous-titre-centre">sur le meme support</div><ul>${lignes}</ul></section>`;
  }

  const appareil = appareilsListe[0] || {};
  const titre = construireTitreNomTypeSatAcces(appareil);
  const couleur = appareil.couleur_appareil || "#111111";
  const tagHp = appareil.hors_patrimoine ? '<span class="popup-tag-hp">HP</span>' : "";
  const libelleAppareil = champCompletOuVide(appareil.appareil) || "Appareil inconnu";
  const ligneTitre = options.masquerTitreLieu ? "" : `<strong>${echapperHtml(titre || "Poste inconnu")}</strong><br/>`;
  return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-appareils">1 appareil</span></div><p>${ligneTitre}<span class="popup-point-couleur" style="background:${echapperHtml(couleur)}"></span>${echapperHtml(libelleAppareil)}${tagHp}</p></section>`;
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

  const construireTitreAcces = (acces) => construireTitreNomTypeSatAcces(acces, { nomVilleDe: true });

  if (Number(propr.acces_count) > 1) {
    const lignes = accesListe
      .map((a) => {
        const titre = construireTitreAcces(a);
        const classeHors = a.hors_patrimoine ? "popup-item-hors" : "";
        return `<li class="${classeHors}"><span class="popup-acces-ligne">${echapperHtml(titre || "Acces inconnu")}</span></li>`;
      })
      .join("");
    return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-acces">${echapperHtml(String(propr.acces_count))} acces voiture</span></div><ul>${lignes}</ul></section>`;
  }

  const acces = accesListe[0] || {};
  const titre = construireTitreAcces(acces);
  const classeHors = acces.hors_patrimoine ? " popup-item-hors" : "";
  return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-acces">1 acces voiture</span></div><p class="popup-acces-ligne${classeHors}">${echapperHtml(titre || "Acces inconnu")}</p></section>`;
}

function construireTitrePoste(poste) {
  return construireTitreNomTypeSatAcces(poste);
}

function extraireCodesTelecommande(valeur) {
  const brut = champCompletOuVide(valeur);
  if (!brut) {
    return [];
  }

  const segments = brut
    .split(/[|,;()]+/)
    .flatMap((partie) => String(partie).split(/\s+/))
    .map((element) => String(element || "").trim())
    .filter(Boolean);

  const codes = [];
  const dejaVu = new Set();
  for (const segment of segments) {
    const token = segment.replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
    if (!token) {
      continue;
    }

    const estCodeCourt = /^[A-Z]{2,5}$/.test(token);
    const estCodeAvecChiffres = /^[A-Z0-9-]{2,12}$/.test(token) && /\d/.test(token);
    if (!estCodeCourt && !estCodeAvecChiffres) {
      continue;
    }

    if (dejaVu.has(token)) {
      continue;
    }
    dejaVu.add(token);
    codes.push(token);
  }

  return codes;
}

function construireCleCorrespondance(entree) {
  return [
    normaliserTexteRecherche(champCompletOuVide(entree?.nom)),
    normaliserTexteRecherche(champCompletOuVide(entree?.type)),
    normaliserTexteRecherche(champCompletOuVide(entree?.SAT)),
    normaliserTexteRecherche(champCompletOuVide(entree?.acces))
  ].join("|");
}

function extraireListeDepuisFeature(feature, cleJson) {
  try {
    return JSON.parse(feature?.properties?.[cleJson] || "[]");
  } catch {
    return [];
  }
}

function trouverCoordonneesAccesDepuisPostes(featurePostes) {
  if (!featurePostes || !donneesAcces?.features?.length) {
    return null;
  }

  const postesListe = extraireListeDepuisFeature(featurePostes, "postes_liste_json");
  if (!postesListe.length) {
    return null;
  }

  const clesPostes = new Set(postesListe.map((poste) => construireCleCorrespondance(poste)).filter(Boolean));
  if (!clesPostes.size) {
    return null;
  }

  for (const featureAcces of donneesAcces.features) {
    const accesListe = extraireListeDepuisFeature(featureAcces, "acces_liste_json");
    const correspond = accesListe.some((acces) => clesPostes.has(construireCleCorrespondance(acces)));
    if (!correspond) {
      continue;
    }

    const [longitude, latitude] = featureAcces.geometry?.coordinates || [];
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      return [longitude, latitude];
    }
  }

  return null;
}

function construireLignePkEtLigne(poste) {
  const pk = champCompletOuVide(poste.pk);
  const numeroLigne = poste.numero_ligne !== "" && poste.numero_ligne !== null && poste.numero_ligne !== undefined
    ? String(poste.numero_ligne).trim()
    : "";
  const lignes = champCompletOuVide(poste.lignes);

  const elements = [];
  if (pk) {
    elements.push(`PK ${pk}`);
  }
  if (numeroLigne || lignes) {
    const partieLigne = [
      numeroLigne ? `sur la ligne n°${numeroLigne}` : "",
      lignes || ""
    ]
      .filter(Boolean)
      .join(" – ");
    elements.push(partieLigne);
  }

  return elements.join(" ");
}

function construireDetailsPoste(poste) {
  const details = [];
  const lignePk = construireLignePkEtLigne(poste);
  const rss = champCompletOuVide(poste.rss);
  if (lignePk) {
    details.push(lignePk);
  }
  if (rss) {
    details.push(`RSS: ${rss}`);
  }
  const codes = extraireCodesTelecommande(poste.description_telecommande);
  if (codes.length) {
    details.push(codes.join(" "));
  }
  return details.join(" | ");
}

function construireSectionPostes(feature) {
  const propr = feature.properties || {};
  let postesListe = [];
  try {
    postesListe = JSON.parse(propr.postes_liste_json || "[]");
  } catch {
    postesListe = [];
  }

  if (!postesListe.length) {
    return "";
  }

  if (Number(propr.postes_count) > 1) {
    const lignes = postesListe
      .map((p) => {
        const titre = construireTitrePoste(p) || "Poste inconnu";
        const infoLigne = construireLignePkEtLigne(p);
        const rss = champCompletOuVide(p.rss);
        const codesTelecommande = extraireCodesTelecommande(p.description_telecommande);
        const pillsTelecommande = codesTelecommande.length
          ? `<div class="popup-poste-pills">${codesTelecommande
              .map((code) => `<span class="popup-poste-pill">${echapperHtml(code)}</span>`)
              .join("")}</div>`
          : "";
        const classeHors = p.hors_patrimoine ? "popup-item-hors" : "";
        return `<li class="${classeHors}"><span class="popup-acces-ligne">${echapperHtml(titre)}</span>${pillsTelecommande}${infoLigne ? `<br/><span class="popup-poste-details">${echapperHtml(infoLigne)}</span>` : ""}${rss ? `<br/><span class="popup-poste-details">RSS: ${echapperHtml(rss)}</span>` : ""}</li>`;
      })
      .join("");
    return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-postes">${echapperHtml(String(propr.postes_count))} postes</span></div><ul>${lignes}</ul></section>`;
  }

  const poste = postesListe[0] || {};
  const titre = construireTitrePoste(poste) || "Poste inconnu";
  const infoLigne = construireLignePkEtLigne(poste);
  const rss = champCompletOuVide(poste.rss);
  const codesTelecommande = extraireCodesTelecommande(poste.description_telecommande);
  const pillsTelecommande = codesTelecommande.length
    ? `<div class="popup-poste-pills">${codesTelecommande
        .map((code) => `<span class="popup-poste-pill">${echapperHtml(code)}</span>`)
        .join("")}</div>`
    : "";
  const classeHors = poste.hors_patrimoine ? " popup-item-hors" : "";
  return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-postes popup-badge-poste-nom">${echapperHtml(titre)}</span></div>${pillsTelecommande}<p class="popup-acces-ligne${classeHors}">${infoLigne ? echapperHtml(infoLigne) : ""}${rss ? `<br/><span class="popup-poste-details">RSS: ${echapperHtml(rss)}</span>` : ""}</p></section>`;
}

function normaliserTexteRecherche(valeur) {
  return String(valeur || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fermerResultatsRecherche() {
  if (!controleRecherche) {
    return;
  }
  controleRecherche.classList.remove("est-ouvert");
}

function ouvrirResultatsRecherche() {
  if (!controleRecherche) {
    return;
  }
  controleRecherche.classList.add("est-ouvert");
}

function viderResultatsRecherche() {
  if (!listeResultatsRecherche) {
    return;
  }
  listeResultatsRecherche.innerHTML = "";
}

function construireResumeRecherche(entree) {
  if (entree.type === "postes") {
    return "Poste";
  }
  if (entree.type === "appareils") {
    return "Appareil";
  }
  return "Acces";
}

function reconstruireIndexRecherche() {
  const index = [];

  for (const feature of donneesPostes?.features || []) {
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    let postesListe = [];
    try {
      postesListe = JSON.parse(feature.properties?.postes_liste_json || "[]");
    } catch {
      postesListe = [];
    }

    for (const poste of postesListe) {
      const titre = construireTitrePoste(poste) || "Poste";
      const details = construireDetailsPoste(poste);
      const motsCles = [titre, details, poste.nom, poste.type, poste.SAT, poste.acces, poste.rss, poste.pk, poste.contact]
        .filter(Boolean)
        .join(" ");

      index.push({
        type: "postes",
        titre,
        sousTitre: details,
        longitude,
        latitude,
        scoreBase: 3,
        texteRecherche: normaliserTexteRecherche(motsCles)
      });
    }
  }

  for (const feature of donneesAppareils?.features || []) {
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    let appareilsListe = [];
    try {
      appareilsListe = JSON.parse(feature.properties?.appareils_liste_json || "[]");
    } catch {
      appareilsListe = [];
    }

    for (const appareil of appareilsListe) {
      const titre = construireTitreNomTypeSatAcces(appareil) || "Appareil";
      const appareilNom = champCompletOuVide(appareil.appareil) || "";
      const motsCles = [titre, appareilNom, appareil.nom, appareil.type, appareil.SAT, appareil.acces]
        .filter(Boolean)
        .join(" ");

      index.push({
        type: "appareils",
        titre,
        sousTitre: appareilNom,
        longitude,
        latitude,
        scoreBase: 2,
        texteRecherche: normaliserTexteRecherche(motsCles)
      });
    }
  }

  for (const feature of donneesAcces?.features || []) {
    const [longitude, latitude] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    let accesListe = [];
    try {
      accesListe = JSON.parse(feature.properties?.acces_liste_json || "[]");
    } catch {
      accesListe = [];
    }

    for (const acces of accesListe) {
      const titre = construireTitreNomTypeSatAcces(acces, { nomVilleDe: true }) || "Acces";
      const motsCles = [titre, acces.nom, acces.type, acces.SAT, acces.acces]
        .filter(Boolean)
        .join(" ");

      index.push({
        type: "acces",
        titre,
        sousTitre: "",
        longitude,
        latitude,
        scoreBase: 1,
        texteRecherche: normaliserTexteRecherche(motsCles)
      });
    }
  }

  indexRecherche = index;
}

async function chargerDonneesRecherche() {
  if (indexRecherche.length) {
    return;
  }

  if (!promesseChargementRecherche) {
    promesseChargementRecherche = Promise.all([
      chargerDonneesPostes(),
      chargerDonneesAppareils(),
      chargerDonneesAcces()
    ])
      .then(() => {
        reconstruireIndexRecherche();
      })
      .finally(() => {
        promesseChargementRecherche = null;
      });
  }

  await promesseChargementRecherche;
}

function obtenirFeatureALaCoordonnee(collection, longitude, latitude) {
  return (collection?.features || []).find((feature) => {
    const [lng, lat] = feature.geometry?.coordinates || [];
    return lng === longitude && lat === latitude;
  });
}

function construirePopupDepuisFeatures(longitude, latitude, featurePostes, featureAcces, featureAppareils) {
  const sections = [];
  let coordonneesNavigation = null;

  if (featurePostes) {
    const sectionPostes = construireSectionPostes(featurePostes);
    if (sectionPostes) {
      sections.push(sectionPostes);
    }
  }

  if (featureAcces) {
    const sectionAcces = construireSectionAcces(featureAcces);
    if (sectionAcces) {
      sections.push(sectionAcces);
      const [lngAcces, latAcces] = featureAcces.geometry?.coordinates || [];
      if (Number.isFinite(lngAcces) && Number.isFinite(latAcces)) {
        coordonneesNavigation = [lngAcces, latAcces];
      }
    }
  }

  if (featureAppareils) {
    const sectionAppareils = construireSectionAppareils(featureAppareils, {
      masquerTitreLieu: Boolean(featurePostes)
    });
    if (sectionAppareils) {
      sections.push(sectionAppareils);
    }
  }

  if (!sections.length) {
    return false;
  }

  if (!coordonneesNavigation && featurePostes) {
    coordonneesNavigation = trouverCoordonneesAccesDepuisPostes(featurePostes);
  }

  const sectionItineraire = coordonneesNavigation
    ? `<section class="popup-section popup-section-itineraires"><div class="popup-section-titre"><span class="popup-badge popup-badge-itineraire">Itineraire</span><strong>Navigation</strong></div>${construireLiensItineraires(coordonneesNavigation[0], coordonneesNavigation[1])}</section>`
    : "";
  const contenu = `<div class="popup-carte">${sections.join("")}${sectionItineraire}</div>`;

  if (popupCarte) {
    popupCarte.remove();
  }

  popupCarte = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
    .setLngLat([longitude, latitude])
    .setHTML(contenu)
    .addTo(carte);

  return true;
}

function ouvrirPopupDepuisCoordonnees(longitude, latitude) {
  const featurePostes = afficherPostes ? obtenirFeatureALaCoordonnee(donneesPostes, longitude, latitude) : null;
  const featureAcces = afficherAcces ? obtenirFeatureALaCoordonnee(donneesAcces, longitude, latitude) : null;
  const featureAppareils = afficherAppareils ? obtenirFeatureALaCoordonnee(donneesAppareils, longitude, latitude) : null;
  return construirePopupDepuisFeatures(longitude, latitude, featurePostes, featureAcces, featureAppareils);
}

function ouvrirPopupDepuisObjetsCarte(objets) {
  if (!Array.isArray(objets) || !objets.length) {
    return false;
  }

  const objet = objets[0];
  const [longitude, latitude] = objet.geometry?.coordinates || [];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return false;
  }

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

  const featurePostes = uniquesParCouche.get(COUCHE_POSTES_GROUPES) || uniquesParCouche.get(COUCHE_POSTES) || null;
  const featureAcces = uniquesParCouche.get(COUCHE_ACCES_GROUPES) || uniquesParCouche.get(COUCHE_ACCES) || null;
  const featureAppareils =
    uniquesParCouche.get(COUCHE_APPAREILS_GROUPES) || uniquesParCouche.get(COUCHE_APPAREILS) || null;

  return construirePopupDepuisFeatures(longitude, latitude, featurePostes, featureAcces, featureAppareils);
}

async function activerFiltrePourType(type) {
  if (type === "postes") {
    afficherPostes = true;
    if (casePostes) {
      casePostes.checked = true;
    }
    await chargerDonneesPostes();
    return;
  }

  if (type === "appareils") {
    afficherAppareils = true;
    if (caseAppareils) {
      caseAppareils.checked = true;
    }
    await chargerDonneesAppareils();
    return;
  }

  afficherAcces = true;
  if (caseAcces) {
    caseAcces.checked = true;
  }
  await chargerDonneesAcces();
}

function rechercherEntrees(terme) {
  const termeNormalise = normaliserTexteRecherche(terme);
  if (!termeNormalise || termeNormalise.length < 2) {
    return [];
  }

  const resultats = [];
  for (const entree of indexRecherche) {
    if (!entree.texteRecherche.includes(termeNormalise)) {
      continue;
    }
    const matchDebut = entree.texteRecherche.startsWith(termeNormalise) ? 1 : 0;
    resultats.push({
      ...entree,
      score: entree.scoreBase + matchDebut
    });
  }

  resultats.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" });
  });

  return resultats.slice(0, 24);
}

function afficherResultatsRecherche(resultats) {
  if (!listeResultatsRecherche) {
    return;
  }

  if (!resultats.length) {
    listeResultatsRecherche.innerHTML = '<li class="recherche-resultat-vide">Aucun resultat</li>';
    ouvrirResultatsRecherche();
    return;
  }

  listeResultatsRecherche.innerHTML = resultats
    .map((resultat, index) => {
      const titre = echapperHtml(resultat.titre || "Element");
      const sousTitre = echapperHtml(resultat.sousTitre || "");
      const meta = construireResumeRecherche(resultat);
      return `<li><button class="recherche-resultat" type="button" data-index="${index}" data-type="${echapperHtml(resultat.type)}" data-lng="${resultat.longitude}" data-lat="${resultat.latitude}"><span class="recherche-resultat-titre">${titre}</span><span class="recherche-resultat-meta">${echapperHtml(meta)}${sousTitre ? ` | ${sousTitre}` : ""}</span></button></li>`;
    })
    .join("");

  ouvrirResultatsRecherche();
}

async function executerRecherche(texte) {
  await chargerDonneesRecherche();
  const resultats = rechercherEntrees(texte);
  afficherResultatsRecherche(resultats);
  return resultats;
}

function activerInteractionsCarte() {
  const couchesInteractives = [
    COUCHE_POSTES_GROUPES,
    COUCHE_POSTES,
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

    ouvrirPopupDepuisObjetsCarte(objets);
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
  if ((afficherAppareils || afficherAcces || afficherPostes) && carte.isStyleLoaded()) {
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

if (casePostes) {
  casePostes.addEventListener("change", async () => {
    afficherPostes = casePostes.checked;
    if (afficherPostes) {
      casePostes.disabled = true;
      try {
        await chargerDonneesPostes();
      } catch (erreur) {
        afficherPostes = false;
        casePostes.checked = false;
        console.error("Impossible de charger postes.geojson", erreur);
        alert(
          "Chargement des postes impossible. Ouvre la carte via un serveur local (http://localhost...) ou vérifie postes.geojson."
        );
      } finally {
        casePostes.disabled = false;
      }
    }

    appliquerCouchesDonnees();
    remonterCouchesDonnees();
  });
}

async function initialiserDonneesParDefaut() {
  await chargerCompteurAppareils();
  await chargerCompteurPostes();

  if (!afficherAcces && !afficherPostes) {
    appliquerCouchesDonnees();
    remonterCouchesDonnees();
    return;
  }

  if (afficherAcces) {
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
  }

  if (afficherPostes) {
    if (casePostes) {
      casePostes.disabled = true;
    }
    try {
      await chargerDonneesPostes();
    } catch (erreur) {
      afficherPostes = false;
      if (casePostes) {
        casePostes.checked = false;
      }
      console.error("Impossible de charger postes.geojson", erreur);
    } finally {
      if (casePostes) {
        casePostes.disabled = false;
      }
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

if (champRecherche && listeResultatsRecherche) {
  let temporisationRecherche = null;

  champRecherche.addEventListener("input", () => {
    const texte = champRecherche.value.trim();
    if (temporisationRecherche) {
      clearTimeout(temporisationRecherche);
    }

    if (!texte || texte.length < 2) {
      viderResultatsRecherche();
      fermerResultatsRecherche();
      return;
    }

    temporisationRecherche = setTimeout(async () => {
      try {
        await executerRecherche(texte);
      } catch (erreur) {
        console.error("Impossible d'executer la recherche", erreur);
      }
    }, 220);
  });

  champRecherche.addEventListener("focus", async () => {
    const texte = champRecherche.value.trim();
    if (texte.length < 2) {
      return;
    }
    try {
      await executerRecherche(texte);
    } catch (erreur) {
      console.error("Impossible d'executer la recherche", erreur);
    }
  });

  champRecherche.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }
    const premierResultat = listeResultatsRecherche.querySelector(".recherche-resultat");
    if (!premierResultat) {
      return;
    }

    event.preventDefault();
    premierResultat.click();
  });

  listeResultatsRecherche.addEventListener("click", async (event) => {
    const boutonResultat = event.target.closest(".recherche-resultat");
    if (!boutonResultat) {
      return;
    }

    const type = boutonResultat.dataset.type || "acces";
    const longitude = Number(boutonResultat.dataset.lng);
    const latitude = Number(boutonResultat.dataset.lat);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return;
    }

    try {
      await activerFiltrePourType(type);
      appliquerCouchesDonnees();
      remonterCouchesDonnees();

      fermerResultatsRecherche();
      champRecherche.blur();
      fermerMenuFiltres();
      fermerMenuFonds();

      let popupOuverte = false;
      const ouvrirPopup = () => {
        if (popupOuverte) {
          return;
        }
        popupOuverte = true;
        ouvrirPopupDepuisCoordonnees(longitude, latitude);
      };

      carte.once("moveend", ouvrirPopup);
      carte.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(carte.getZoom(), 14),
        speed: 1.15,
        curve: 1.2,
        essential: true
      });

      setTimeout(ouvrirPopup, 700);
    } catch (erreur) {
      console.error("Impossible d'ouvrir le resultat de recherche", erreur);
    }
  });
}

document.addEventListener("click", (event) => {
  if (!controleFonds.contains(event.target)) {
    fermerMenuFonds();
  }

  if (!controleFiltres.contains(event.target)) {
    fermerMenuFiltres();
  }

  if (controleRecherche && !controleRecherche.contains(event.target)) {
    fermerResultatsRecherche();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    fermerMenuFonds();
    fermerMenuFiltres();
    fermerResultatsRecherche();
  }
});
