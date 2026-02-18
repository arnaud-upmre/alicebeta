// Centre initial de la carte (France metropolitaine).
const CENTRE_INITIAL = [2.35, 48.85];
const ZOOM_INITIAL = 6;
const ZOOM_MAX = 19;
const SOURCE_APPAREILS = "appareils-source";
const COUCHE_APPAREILS = "appareils-points";
const COUCHE_APPAREILS_GROUPES = "appareils-groupes";
const SOURCE_ACCES = "acces-source";
const COUCHE_ACCES = "acces-points";
const COUCHE_ACCES_GROUPES = "acces-groupes";
const SOURCE_POSTES = "postes-source";
const COUCHE_POSTES = "postes-points";
const COUCHE_POSTES_GROUPES = "postes-groupes";
const SOURCE_LIGNES = "openrailwaymap-source";
const COUCHE_LIGNES = "openrailwaymap-lignes";
const SOURCE_VITESSE_LIGNE = "openrailwaymap-maxspeed-source";
const COUCHE_VITESSE_LIGNE = "openrailwaymap-maxspeed";
const SOURCE_MESURE = "mesure-source";
const COUCHE_MESURE_LIGNES = "mesure-lignes";
const COUCHE_MESURE_POINTS = "mesure-points";
const COUCHE_MESURE_LABELS = "mesure-labels";
const TABLES_RSS = window.RSS_TABLE_NUMBERS || {};
const DUREE_APPUI_LONG_MENU_CONTEXTUEL_MS = 1000;
const DELAI_DEMARRAGE_DONNEES_MS = 220;
const PLACEHOLDER_RECHERCHE_DESKTOP = "Rechercher un poste, appareil, acces...";
const PLACEHOLDER_RECHERCHE_MOBILE = "Rechercher...";
const SEPARATEUR_LIBELLE = " ";
const DEBUG_RECHERCHE_FICHE = true;
const DEBUG_BUILD_ID = "debug-fiche-2026-02-18-22h15";
const APPAREILS_VIDE = { type: "FeatureCollection", features: [] };
const ACCES_VIDE = { type: "FeatureCollection", features: [] };
const POSTES_VIDE = { type: "FeatureCollection", features: [] };

if (DEBUG_RECHERCHE_FICHE) {
  console.warn(`[ALICE DEBUG] build=${DEBUG_BUILD_ID}`);
}

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
      maxzoom: 18,
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
let afficherPostes = true;
let afficherLignes = false;
let afficherVitesseLigne = false;
let donneesAppareils = null;
let donneesAcces = null;
let donneesPostes = null;
let promesseChargementAppareils = null;
let promesseChargementAcces = null;
let promesseChargementPostes = null;
let popupCarte = null;
let initialisationDonneesLancee = false;
let totalAppareilsBrut = 0;
let totalPostesBrut = 0;
let indexRecherche = [];
let promesseChargementRecherche = null;
let menuContextuelOuvert = false;
let mesureActive = false;
let mesurePoints = [];
let navigationInternePopup = null;
let minuterieClignotementLocalisation = null;
let minuterieArretLocalisation = null;
let coordonneesDerniereFiche = null;
let marqueurLocalisation = null;
let recadragePopupMobileEnCours = false;
let navigationPopupProgrammatiqueEnCours = false;
let conserverFichePendantNavigation = false;
let restaurationStylePlanifiee = false;
let contexteMenuPosition = {
  longitude: null,
  latitude: null
};
let contexteMenuFeature = null;
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

function determinerCouleurCarteAppareil(appareil) {
  if (appareil?.hors_patrimoine) {
    return "#ef4444";
  }
  return normaliserCouleurHex(appareil?.couleur_appareil || "#111111");
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
    ctx.fillStyle = convertirHexEnRgba(teintes[i], 1);
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
      couleurs = JSON.parse(propr.appareils_couleurs_carte_json || propr.appareils_couleurs_json || "[]");
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
      description: propr.description || "",
      imajnet: propr.imajnet || "",
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
          groupe.appareils.map((a) => determinerCouleurCarteAppareil(a)),
          groupe.appareils.some((a) => a.hors_patrimoine)
        ),
        appareils_couleurs_carte_json: JSON.stringify(
          groupe.appareils.map((a) => determinerCouleurCarteAppareil(a))
        ),
        appareils_couleurs_json: JSON.stringify(
          groupe.appareils.map((a) => normaliserCouleurHex(a.couleur_appareil || "#111111"))
        ),
        appareils_count: total,
        hors_patrimoine_count: groupe.appareils.filter((a) => a.hors_patrimoine).length,
        hors_patrimoine: groupe.appareils.some((a) => a.hors_patrimoine),
        imajnet:
          groupe.appareils.find((a) => String(a.imajnet || "").trim())?.imajnet || "",
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
    const champPortail = String(propr.portail || "").trim();
    const acces = {
      nom: propr.nom || "",
      type: propr.type || "",
      SAT: propr.SAT || "",
      acces: champAcces,
      portail: champPortail,
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
      hors_patrimoine: estHorsPatrimoine(propr.hors_patrimoine),
      special: estHorsPatrimoine(propr.special)
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

let conteneurControleActionsCarte = null;
let boutonLocaliserCarte = null;
let boutonInfoCarte = null;
let menuLegendeOuvert = false;

const carte = new maplibregl.Map({
  container: "map",
  center: CENTRE_INITIAL,
  zoom: ZOOM_INITIAL,
  maxZoom: ZOOM_MAX,
  attributionControl: false,
  prefetchZoomDelta: 0,
  fadeDuration: 0,
  refreshExpiredTiles: false,
  style: fondsCartographiques[fondActif]
});

carte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
carte.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
carte.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

const controleFonds = document.getElementById("controle-fonds");
const boutonFonds = document.getElementById("bouton-fonds");
const optionsFond = Array.from(document.querySelectorAll('input[name="fond"]'));
const controleFiltres = document.getElementById("controle-filtres");
const boutonFiltres = document.getElementById("bouton-filtres");
const boutonItineraire = document.getElementById("bouton-itineraire");
const caseAppareils = document.querySelector('input[name="filtre-appareils"]');
const caseAcces = document.querySelector('input[name="filtre-acces"]');
const casePostes = document.querySelector('input[name="filtre-postes"]');
const caseLignes = document.querySelector('input[name="filtre-lignes"]');
const caseVitesseLigne = document.querySelector('input[name="filtre-vitesse-ligne"]');
const compteurAppareils = document.getElementById("compteur-appareils");
const compteurAcces = document.getElementById("compteur-acces");
const compteurPostes = document.getElementById("compteur-postes");
const controleRecherche = document.getElementById("controle-recherche");
const champRecherche = document.getElementById("champ-recherche");
const listeResultatsRecherche = document.getElementById("recherche-resultats");
const infoVitesseLigne = document.getElementById("info-vitesse-ligne");
const fenetreAccueil = document.getElementById("fenetre-accueil");
const boutonFermerFenetreAccueil = document.getElementById("fenetre-accueil-fermer");
const menuContextuelCarte = document.getElementById("menu-contextuel-carte");
const boutonCtxCoord = document.getElementById("ctx-coord");
const boutonCtxShare = document.getElementById("ctx-share");
const boutonCtxItin = document.getElementById("ctx-itin");
const sousMenuItin = document.getElementById("ctx-submenu-itin");
const boutonCtxGoogleItin = document.getElementById("ctx-gmaps");
const boutonCtxWaze = document.getElementById("ctx-waze");
const boutonCtxApple = document.getElementById("ctx-apple");
const boutonCtxRegle = document.getElementById("ctx-regle");
const boutonCtxGoogleMarker = document.getElementById("ctx-gmaps-marker");
const boutonCtxStreet = document.getElementById("ctx-street");
const boutonCtxImajnet = document.getElementById("ctx-imajnet");
const boutonCtxAjoutAppareil = document.getElementById("ctx-add-appareil");
const panneauMesure = document.getElementById("panneau-mesure");
const textePanneauMesure = document.getElementById("panneau-mesure-texte");
const boutonSortieMesure = document.getElementById("bouton-sortie-mesure");
const menuLegendeCarte = document.getElementById("menu-legende-carte");
const boutonFermerLegende = document.getElementById("bouton-fermer-legende");
let modalFiche = document.getElementById("modal-fiche");
let modalFicheContenu = document.getElementById("modal-fiche-contenu");
let boutonFermerModalFiche = document.getElementById("modal-fiche-fermer");
const CLE_STOCKAGE_FENETRE_ACCUEIL = "alice.fenetre-accueil.derniere-date";
let temporisationInfoVitesse = null;
let moduleItineraire = null;
let promesseChargementModuleItineraire = null;

class ControleActionsCarte {
  onAdd() {
    const conteneur = document.createElement("div");
    conteneur.className = "maplibregl-ctrl maplibregl-ctrl-group controle-actions-carte";

    const boutonLocaliser = document.createElement("button");
    boutonLocaliser.type = "button";
    boutonLocaliser.className = "bouton-carte-action";
    boutonLocaliser.setAttribute("aria-label", "Me localiser");
    boutonLocaliser.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.8A3.2 3.2 0 1 0 12 15.2 3.2 3.2 0 1 0 12 8.8z"/>
        <path d="M20.5 11h-1.64a6.94 6.94 0 0 0-5.86-5.86V3.5a1 1 0 1 0-2 0v1.64A6.94 6.94 0 0 0 5.14 11H3.5a1 1 0 1 0 0 2h1.64a6.94 6.94 0 0 0 5.86 5.86v1.64a1 1 0 1 0 2 0v-1.64A6.94 6.94 0 0 0 18.86 13h1.64a1 1 0 1 0 0-2zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
      </svg>
    `;

    const boutonInfo = document.createElement("button");
    boutonInfo.type = "button";
    boutonInfo.className = "bouton-carte-action";
    boutonInfo.setAttribute("aria-label", "Afficher la légende");
    boutonInfo.setAttribute("aria-expanded", "false");
    boutonInfo.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 10h2v7h-2zM11 7h2v2h-2z"/>
        <path d="M12 2.5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 12 2.5zm0 17a7.5 7.5 0 1 1 7.5-7.5 7.51 7.51 0 0 1-7.5 7.5z"/>
      </svg>
    `;

    conteneur.append(boutonLocaliser, boutonInfo);
    conteneurControleActionsCarte = conteneur;
    boutonLocaliserCarte = boutonLocaliser;
    boutonInfoCarte = boutonInfo;
    return conteneur;
  }

  onRemove() {
    if (conteneurControleActionsCarte?.parentNode) {
      conteneurControleActionsCarte.parentNode.removeChild(conteneurControleActionsCarte);
    }
    conteneurControleActionsCarte = null;
    boutonLocaliserCarte = null;
    boutonInfoCarte = null;
  }
}

carte.addControl(new ControleActionsCarte(), "top-right");

function actualiserPlaceholderRecherche() {
  if (!champRecherche) {
    return;
  }
  const estMobile = window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
  champRecherche.placeholder = estMobile ? PLACEHOLDER_RECHERCHE_MOBILE : PLACEHOLDER_RECHERCHE_DESKTOP;
}

function planifierResizeCarte() {
  window.requestAnimationFrame(() => {
    carte.resize();
  });
}

function obtenirDateLocaleDuJour() {
  const maintenant = new Date();
  const annee = maintenant.getFullYear();
  const mois = String(maintenant.getMonth() + 1).padStart(2, "0");
  const jour = String(maintenant.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

function doitAfficherFenetreAccueilAujourdhui() {
  try {
    const dateEnregistree = localStorage.getItem(CLE_STOCKAGE_FENETRE_ACCUEIL);
    return dateEnregistree !== obtenirDateLocaleDuJour();
  } catch {
    return true;
  }
}

function fermerFenetreAccueil() {
  if (!fenetreAccueil) {
    return;
  }
  fenetreAccueil.classList.remove("est-visible");
  fenetreAccueil.setAttribute("aria-hidden", "true");
  try {
    localStorage.setItem(CLE_STOCKAGE_FENETRE_ACCUEIL, obtenirDateLocaleDuJour());
  } catch {
    // Ignore les erreurs de stockage (mode prive, quota, etc.).
  }
}

function masquerMessageInfoVitesseLigne() {
  if (!infoVitesseLigne) {
    return;
  }
  infoVitesseLigne.classList.remove("est-visible");
  infoVitesseLigne.setAttribute("aria-hidden", "true");
}

function afficherMessageInfoVitesseLigne() {
  if (!infoVitesseLigne) {
    return;
  }
  infoVitesseLigne.classList.add("est-visible");
  infoVitesseLigne.setAttribute("aria-hidden", "false");

  if (temporisationInfoVitesse) {
    clearTimeout(temporisationInfoVitesse);
  }
  temporisationInfoVitesse = setTimeout(() => {
    masquerMessageInfoVitesseLigne();
    temporisationInfoVitesse = null;
  }, 5200);
}

function fermerPopupCarte(options = {}) {
  const { localiserPoint = false } = options;
  const coordonnees = Array.isArray(coordonneesDerniereFiche) ? [...coordonneesDerniereFiche] : null;
  const preserveNavigationLock = Boolean(options.preserveNavigationLock);
  if (!preserveNavigationLock) {
    conserverFichePendantNavigation = false;
  }
  if (!popupCarte) {
    if (localiserPoint && coordonnees) {
      demarrerClignotementLocalisation(coordonnees[0], coordonnees[1]);
    }
    return;
  }
  popupCarte.remove();
  popupCarte = null;
  navigationInternePopup = null;
  if (localiserPoint && coordonnees) {
    demarrerClignotementLocalisation(coordonnees[0], coordonnees[1]);
  }
}

function assurerElementsModalFiche() {
  if (modalFiche && modalFicheContenu && boutonFermerModalFiche) {
    return true;
  }

  const existante = document.getElementById("modal-fiche");
  if (existante) {
    modalFiche = existante;
    modalFicheContenu = document.getElementById("modal-fiche-contenu");
    boutonFermerModalFiche = document.getElementById("modal-fiche-fermer");
    return Boolean(modalFicheContenu && boutonFermerModalFiche);
  }

  const racine = document.createElement("div");
  racine.className = "modal-fiche";
  racine.id = "modal-fiche";
  racine.setAttribute("role", "dialog");
  racine.setAttribute("aria-modal", "true");
  racine.setAttribute("aria-label", "Fiche");
  racine.setAttribute("aria-hidden", "true");
  racine.innerHTML = `
    <div class="modal-fiche-carte">
      <button class="modal-fiche-fermer" id="modal-fiche-fermer" type="button" aria-label="Fermer la fiche">×</button>
      <div class="modal-fiche-contenu maplibregl-popup-content" id="modal-fiche-contenu"></div>
    </div>
  `;
  document.body.appendChild(racine);

  modalFiche = racine;
  modalFicheContenu = document.getElementById("modal-fiche-contenu");
  boutonFermerModalFiche = document.getElementById("modal-fiche-fermer");
  return Boolean(modalFicheContenu && boutonFermerModalFiche);
}

function creerPopupFicheModale() {
  assurerElementsModalFiche();
  const callbacksFermeture = [];
  let estFermee = false;

  const instance = {
    setLngLat() {
      return instance;
    },
    setHTML(html) {
      if (modalFicheContenu) {
        modalFicheContenu.innerHTML = html;
      }
      return instance;
    },
    addTo() {
      if (modalFiche) {
        modalFiche.classList.add("est-visible");
        modalFiche.setAttribute("aria-hidden", "false");
        debugRechercheFiche("Modal fiche addTo", {
          phase: "addTo",
          raison: "class est-visible appliquée"
        });
      } else {
        debugRechercheFiche("Modal fiche absente dans le DOM", {
          phase: "addTo",
          raison: "element #modal-fiche introuvable",
          alerteMobile: true
        });
      }
      return instance;
    },
    getElement() {
      return modalFicheContenu;
    },
    on(event, callback) {
      if (event === "close" && typeof callback === "function") {
        callbacksFermeture.push(callback);
      }
      return instance;
    },
    remove() {
      if (estFermee) {
        return;
      }
      estFermee = true;
      if (modalFiche) {
        modalFiche.classList.remove("est-visible");
        modalFiche.setAttribute("aria-hidden", "true");
      }
      if (modalFicheContenu) {
        modalFicheContenu.innerHTML = "";
      }
      for (const callback of callbacksFermeture) {
        try {
          callback();
        } catch {
          // Ignore un callback de fermeture en erreur.
        }
      }
    }
  };

  return instance;
}

function estContexteMobile() {
  return window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
}

function recadrerCartePourPopupMobile(longitude, latitude) {
  if (!estContexteMobile() || !Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return;
  }

  const decalageVertical = Math.min(200, Math.round(window.innerHeight * 0.22));
  recadragePopupMobileEnCours = true;
  carte.once("moveend", () => {
    recadragePopupMobileEnCours = false;
  });
  setTimeout(() => {
    recadragePopupMobileEnCours = false;
  }, 700);
  carte.easeTo({
    center: [longitude, latitude],
    offset: [0, decalageVertical],
    duration: 280,
    essential: true
  });
}

function demarrerNavigationPopupProgrammatique() {
  navigationPopupProgrammatiqueEnCours = true;
}

function terminerNavigationPopupProgrammatique() {
  navigationPopupProgrammatiqueEnCours = false;
}

function bloquerZoomTactileHorsCarte() {
  const estDansCanvasCarte = (cible) => {
    return cible instanceof Node && carte.getCanvas().contains(cible);
  };

  const bloquerSiHorsCarte = (event) => {
    if (!estDansCanvasCarte(event.target)) {
      event.preventDefault();
    }
  };

  document.addEventListener("gesturestart", bloquerSiHorsCarte, { passive: false });
  document.addEventListener("gesturechange", bloquerSiHorsCarte, { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.touches?.length > 1 && !estDansCanvasCarte(event.target)) {
      event.preventDefault();
    }
  }, { passive: false });
}

function formaterCoordonneeMenu(valeur) {
  return Number(valeur).toFixed(5);
}

function construireUrlPartagePosition(latitude, longitude) {
  return `${location.origin}${location.pathname}?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&z=18&marker=true`;
}

function obtenirLienImajnetDepuisContexte() {
  const valeurFeature = String(contexteMenuFeature?.properties?.imajnet || "").trim();
  if (valeurFeature) {
    return valeurFeature;
  }

  const valeurListe = (contexteMenuFeature?.properties?.appareils_liste_json || "").trim();
  if (valeurListe) {
    try {
      const liste = JSON.parse(valeurListe);
      const trouve = Array.isArray(liste) ? liste.find((item) => String(item?.imajnet || "").trim()) : null;
      const valeur = String(trouve?.imajnet || "").trim();
      if (valeur) {
        return valeur;
      }
    } catch {
      // Ignore les JSON invalides.
    }
  }

  const { latitude, longitude } = contexteMenuPosition;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "https://gecko.imajnet.net/";
  }
  return `https://gecko.imajnet.net/#map=OSM;zoom=18;loc=${latitude},${longitude};`;
}

function obtenirDistanceMetres(pointA, pointB) {
  return new maplibregl.LngLat(pointA[0], pointA[1]).distanceTo(new maplibregl.LngLat(pointB[0], pointB[1]));
}

function formaterDistanceMetres(distanceMetres) {
  if (distanceMetres < 1000) {
    return `${distanceMetres.toFixed(1)} m`;
  }
  return `${(distanceMetres / 1000).toFixed(2)} km`;
}

function supprimerPointLocalisation() {
  if (marqueurLocalisation) {
    marqueurLocalisation.remove();
    marqueurLocalisation = null;
  }
}

function arreterClignotementLocalisation() {
  if (minuterieClignotementLocalisation) {
    clearInterval(minuterieClignotementLocalisation);
    minuterieClignotementLocalisation = null;
  }
  if (minuterieArretLocalisation) {
    clearTimeout(minuterieArretLocalisation);
    minuterieArretLocalisation = null;
  }
  supprimerPointLocalisation();
}

function demarrerClignotementLocalisation(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return;
  }

  arreterClignotementLocalisation();
  const element = document.createElement("div");
  element.className = "point-localisation-clignotant";
  marqueurLocalisation = new maplibregl.Marker({ element, anchor: "center" }).setLngLat([longitude, latitude]).addTo(carte);

  let visible = true;
  minuterieClignotementLocalisation = setInterval(() => {
    visible = !visible;
    if (!element) {
      return;
    }
    element.style.opacity = visible ? "1" : "0.15";
  }, 390);
  minuterieArretLocalisation = setTimeout(() => {
    arreterClignotementLocalisation();
  }, 5000);
}

function chargerScriptItineraire() {
  if (window.creerModuleItineraireAlice) {
    return Promise.resolve(window.creerModuleItineraireAlice);
  }
  if (promesseChargementModuleItineraire) {
    return promesseChargementModuleItineraire;
  }

  promesseChargementModuleItineraire = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./itineraire.js";
    script.async = true;
    script.onload = () => {
      if (typeof window.creerModuleItineraireAlice === "function") {
        resolve(window.creerModuleItineraireAlice);
      } else {
        reject(new Error("Module itinéraire introuvable après chargement."));
      }
    };
    script.onerror = () => {
      reject(new Error("Impossible de charger itineraire.js"));
    };
    document.head.appendChild(script);
  }).finally(() => {
    promesseChargementModuleItineraire = null;
  });

  return promesseChargementModuleItineraire;
}

async function obtenirModuleItineraire() {
  if (moduleItineraire) {
    return moduleItineraire;
  }

  const creerModule = await chargerScriptItineraire();
  moduleItineraire = creerModule({
    maplibre: maplibregl,
    centreInitial: CENTRE_INITIAL,
    chargerDonneesAcces,
    getDonneesAcces: () => donneesAcces,
    normaliserTexteRecherche,
    champCompletOuVide,
    extraireListeDepuisFeature,
    echapperHtml,
    obtenirDistanceMetres,
    fermerMenusGlobalement: () => {
      fermerMenuFonds();
      fermerMenuFiltres();
      fermerResultatsRecherche();
      fermerMenuContextuel();
      fermerMenuLegende();
    }
  });
  return moduleItineraire;
}

function construireDonneesSourceMesure() {
  const featuresPoints = mesurePoints.map((coordonnees, index) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: coordonnees
    },
    properties: {
      lettre: String.fromCharCode(65 + index)
    }
  }));

  const features = [...featuresPoints];
  if (mesurePoints.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: mesurePoints
      },
      properties: {}
    });
  }

  return {
    type: "FeatureCollection",
    features
  };
}

function assurerSourceEtCouchesMesure() {
  if (!carte.isStyleLoaded()) {
    return;
  }

  if (!carte.getSource(SOURCE_MESURE)) {
    carte.addSource(SOURCE_MESURE, {
      type: "geojson",
      data: construireDonneesSourceMesure()
    });
  }

  if (!carte.getLayer(COUCHE_MESURE_LIGNES)) {
    carte.addLayer({
      id: COUCHE_MESURE_LIGNES,
      type: "line",
      source: SOURCE_MESURE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#ef4444",
        "line-width": 3.2
      }
    });
  }

  if (!carte.getLayer(COUCHE_MESURE_POINTS)) {
    carte.addLayer({
      id: COUCHE_MESURE_POINTS,
      type: "circle",
      source: SOURCE_MESURE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#111111"
      }
    });
  }

  if (!carte.getLayer(COUCHE_MESURE_LABELS)) {
    carte.addLayer({
      id: COUCHE_MESURE_LABELS,
      type: "symbol",
      source: SOURCE_MESURE,
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "lettre"],
        "text-size": 12,
        "text-offset": [0, -1.1],
        "text-font": ["Open Sans Bold"]
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(15, 23, 42, 0.88)",
        "text-halo-width": 1.5
      }
    });
  }
}

function rafraichirAffichageMesure() {
  assurerSourceEtCouchesMesure();
  const source = carte.getSource(SOURCE_MESURE);
  if (source) {
    source.setData(construireDonneesSourceMesure());
  }
}

function masquerPanneauMesure() {
  if (!panneauMesure) {
    return;
  }
  panneauMesure.classList.remove("est-visible");
}

function mettreAJourPanneauMesure() {
  if (!textePanneauMesure) {
    return;
  }

  if (mesurePoints.length < 2) {
    textePanneauMesure.textContent = "";
    masquerPanneauMesure();
    return;
  }

  let total = 0;
  const lignes = [];

  for (let i = 1; i < mesurePoints.length; i += 1) {
    const pointA = mesurePoints[i - 1];
    const pointB = mesurePoints[i];
    const distance = obtenirDistanceMetres(pointA, pointB);
    total += distance;

    const lettreA = String.fromCharCode(64 + i);
    const lettreB = String.fromCharCode(65 + i);
    lignes.push(`${lettreA} -> ${lettreB} : ${formaterDistanceMetres(distance)}`);
  }

  lignes.push("---------------------");
  lignes.push(`Total : ${formaterDistanceMetres(total)}`);
  textePanneauMesure.textContent = lignes.join("\n");

  if (panneauMesure) {
    panneauMesure.classList.add("est-visible");
  }
}

function reinitialiserMesure() {
  mesurePoints = [];
  rafraichirAffichageMesure();
  mettreAJourPanneauMesure();
}

function mettreAJourEtatMesureUI() {
  if (boutonSortieMesure) {
    boutonSortieMesure.classList.toggle("est-visible", mesureActive);
  }

  if (boutonCtxRegle) {
    boutonCtxRegle.textContent = mesureActive ? "❌ Quitter le traçage" : "📏 Règle / Traçage";
  }
}

function quitterModeMesure() {
  reinitialiserMesure();
  mesureActive = false;
  mettreAJourEtatMesureUI();
}

function activerModeMesure() {
  reinitialiserMesure();
  mesureActive = true;
  mettreAJourEtatMesureUI();
}

function ajouterPointMesure(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return;
  }

  mesurePoints.push([longitude, latitude]);
  rafraichirAffichageMesure();
  mettreAJourPanneauMesure();
}

function ouvrirMenuContextuel(event, feature) {
  if (!menuContextuelCarte) {
    return;
  }

  if (sousMenuItin) {
    sousMenuItin.classList.remove("est-visible");
    sousMenuItin.setAttribute("aria-hidden", "true");
  }

  const { lng, lat } = event.lngLat || {};
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return;
  }

  contexteMenuPosition = { longitude: lng, latitude: lat };
  contexteMenuFeature = feature || null;

  if (boutonCtxCoord) {
    boutonCtxCoord.textContent = `📍 ${formaterCoordonneeMenu(lat)}, ${formaterCoordonneeMenu(lng)}`;
  }

  const eventDom = event.originalEvent;
  const marge = 10;
  const clientX = Number(eventDom?.clientX);
  const clientY = Number(eventDom?.clientY);

  menuContextuelCarte.classList.add("est-visible");
  menuContextuelCarte.setAttribute("aria-hidden", "false");

  const largeur = menuContextuelCarte.offsetWidth;
  const hauteur = menuContextuelCarte.offsetHeight;

  let gauche = Number.isFinite(clientX) ? clientX + 12 : 28;
  let haut = Number.isFinite(clientY) ? clientY + 12 : 28;

  if (gauche + largeur > window.innerWidth - marge) {
    gauche = window.innerWidth - largeur - marge;
  }
  if (haut + hauteur > window.innerHeight - marge) {
    haut = window.innerHeight - hauteur - marge;
  }
  if (gauche < marge) {
    gauche = marge;
  }
  if (haut < marge) {
    haut = marge;
  }

  menuContextuelCarte.style.left = `${Math.round(gauche)}px`;
  menuContextuelCarte.style.top = `${Math.round(haut)}px`;
  menuContextuelOuvert = true;
}

function fermerMenuContextuel() {
  if (!menuContextuelCarte || !menuContextuelOuvert) {
    return;
  }
  menuContextuelCarte.classList.remove("est-visible");
  menuContextuelCarte.setAttribute("aria-hidden", "true");
  if (sousMenuItin) {
    sousMenuItin.classList.remove("est-visible");
    sousMenuItin.setAttribute("aria-hidden", "true");
  }
  menuContextuelOuvert = false;
}

function basculerSousMenuItineraire() {
  if (!sousMenuItin) {
    return;
  }
  const ouvert = sousMenuItin.classList.contains("est-visible");
  if (ouvert) {
    sousMenuItin.classList.remove("est-visible");
    sousMenuItin.setAttribute("aria-hidden", "true");
    return;
  }
  sousMenuItin.classList.add("est-visible");
  sousMenuItin.setAttribute("aria-hidden", "false");
}

function fermerMenuLegende() {
  if (!menuLegendeCarte || !menuLegendeOuvert) {
    return;
  }
  menuLegendeCarte.classList.remove("est-visible");
  menuLegendeCarte.setAttribute("aria-hidden", "true");
  if (boutonInfoCarte) {
    boutonInfoCarte.setAttribute("aria-expanded", "false");
  }
  menuLegendeOuvert = false;
}

function ouvrirMenuLegende() {
  if (!menuLegendeCarte) {
    return;
  }
  menuLegendeCarte.classList.add("est-visible");
  menuLegendeCarte.setAttribute("aria-hidden", "false");
  if (boutonInfoCarte) {
    boutonInfoCarte.setAttribute("aria-expanded", "true");
  }
  menuLegendeOuvert = true;
}

function basculerMenuLegende() {
  if (menuLegendeOuvert) {
    fermerMenuLegende();
    return;
  }
  ouvrirMenuLegende();
}

function localiserUtilisateurCarte() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas disponible sur cet appareil.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const longitude = Number(coords?.longitude);
      const latitude = Number(coords?.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }
      carte.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(carte.getZoom(), 15.5),
        essential: true
      });
    },
    () => {
      alert("Impossible de récupérer votre position.");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 120000
    }
  );
}

async function partagerPositionContextuelle() {
  const { latitude, longitude } = contexteMenuPosition;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return;
  }

  const lien = construireUrlPartagePosition(latitude, longitude);

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Position carte",
        text: `Position: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        url: lien
      });
      return;
    } catch {
      // Annulation utilisateur ou API indisponible: fallback copie.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(lien);
      return;
    } catch {
      // Fallback ultime plus bas.
    }
  }

  window.prompt("Copiez ce lien :", lien);
}

if (fenetreAccueil && doitAfficherFenetreAccueilAujourdhui()) {
  fenetreAccueil.classList.add("est-visible");
  fenetreAccueil.setAttribute("aria-hidden", "false");
}

if (boutonFermerFenetreAccueil) {
  boutonFermerFenetreAccueil.addEventListener("click", () => {
    fermerFenetreAccueil();
  });
}

actualiserPlaceholderRecherche();
window.addEventListener("resize", () => {
  actualiserPlaceholderRecherche();
  planifierResizeCarte();
}, { passive: true });
window.addEventListener("orientationchange", planifierResizeCarte, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", planifierResizeCarte, { passive: true });
  window.visualViewport.addEventListener("scroll", planifierResizeCarte, { passive: true });
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

function calculerTotalPostesPourCompteur(donnees) {
  if (!donnees?.features) {
    return 0;
  }

  const hpKeys = new Set();
  const postesUniques = new Set();

  for (const feature of donnees.features) {
    const propr = feature?.properties || {};
    const nom = String(propr.nom || "").trim();
    const type = String(propr.type || "").trim();
    const cle = `${nom.toLowerCase()}__${type.toLowerCase()}`;

    if (estHorsPatrimoine(propr.hors_patrimoine)) {
      hpKeys.add(cle);
    }

    if (estHorsPatrimoine(propr.special)) {
      continue;
    }

    postesUniques.add(cle);
  }

  let total = 0;
  for (const cle of postesUniques) {
    if (hpKeys.has(cle)) {
      continue;
    }
    total += 1;
  }

  return total;
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
    const totalPostes = donneesPostes ? totalPostesBrut : calculerTotalEntrees(donneesPostes, "postes_count");
    compteurPostes.textContent = `(${totalPostes})`;
  }
}

function appliquerCouchesDonnees() {
  if (!carte.isStyleLoaded()) {
    return;
  }

  if (!carte.getSource(SOURCE_LIGNES)) {
    carte.addSource(SOURCE_LIGNES, {
      type: "raster",
      tiles: [
        "https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
        "https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
        "https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "© OpenRailwayMap, © OpenStreetMap contributors",
      maxzoom: 19
    });
  }

  if (!carte.getLayer(COUCHE_LIGNES)) {
    carte.addLayer({
      id: COUCHE_LIGNES,
      type: "raster",
      source: SOURCE_LIGNES,
      paint: {
        "raster-opacity": 0.92
      }
    });
  }

  if (!carte.getSource(SOURCE_VITESSE_LIGNE)) {
    carte.addSource(SOURCE_VITESSE_LIGNE, {
      type: "raster",
      tiles: [
        "https://a.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png",
        "https://b.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png",
        "https://c.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "© OpenRailwayMap, © OpenStreetMap contributors",
      maxzoom: 19
    });
  }

  if (!carte.getLayer(COUCHE_VITESSE_LIGNE)) {
    carte.addLayer({
      id: COUCHE_VITESSE_LIGNE,
      type: "raster",
      source: SOURCE_VITESSE_LIGNE,
      paint: {
        "raster-opacity": 0.95
      }
    });
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 4.5, 12, 5.2, 18, 5.9],
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
        "icon-size": ["interpolate", ["linear"], ["get", "appareils_count"], 2, 0.43, 5, 0.56, 10, 0.72],
        "icon-allow-overlap": true
      },
      paint: {
        "icon-opacity": 1
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 12, 5.8, 18, 6.8],
        "circle-color": "#7c3aed",
        "circle-opacity": 0.9,
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
        "circle-color": "#8b5cf6",
        "circle-opacity": 0.34,
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 12, 5.8, 18, 6.8],
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
  carte.setLayoutProperty(COUCHE_LIGNES, "visibility", afficherLignes ? "visible" : "none");
  carte.setLayoutProperty(COUCHE_VITESSE_LIGNE, "visibility", afficherVitesseLigne ? "visible" : "none");
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
  if (caseLignes) {
    caseLignes.checked = afficherLignes;
  }
  if (caseVitesseLigne) {
    caseVitesseLigne.checked = afficherVitesseLigne;
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
    promesseChargementAppareils = fetch("./appareils.geojson", { cache: "default" })
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
    promesseChargementAcces = fetch("./acces.geojson", { cache: "default" })
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
    promesseChargementPostes = fetch("./postes.geojson", { cache: "default" })
      .then((reponse) => {
        if (!reponse.ok) {
          throw new Error(`HTTP ${reponse.status}`);
        }

        return reponse.json();
      })
      .then((geojson) => {
        totalPostesBrut = calculerTotalPostesPourCompteur(geojson);
        donneesPostes = regrouperPostesParCoordonnees(geojson);
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
  return [nom, type, sat].filter(Boolean).join(SEPARATEUR_LIBELLE);
}

function construireFragmentsTitreAcces(entree, options = {}) {
  const nomTypeSat = construireTitreNomTypeSat(entree, options);
  const acces = champCompletOuVide(entree?.acces);
  return { nomTypeSat, acces };
}

function construireTitreNomTypeSatAcces(entree, options = {}) {
  const { nomTypeSat, acces } = construireFragmentsTitreAcces(entree, options);
  const accesLibelle = acces ? `(Accès : ${acces})` : "";
  return [nomTypeSat, accesLibelle].filter(Boolean).join(SEPARATEUR_LIBELLE);
}

function construireTitreNomTypeSatAccesHtml(entree, options = {}) {
  const { nomTypeSat, acces } = construireFragmentsTitreAcces(entree, options);
  const base = echapperHtml(nomTypeSat || "Acces inconnu");
  if (!acces) {
    return base;
  }
  return `${base} <span class="popup-acces-suffixe">(Accès : ${echapperHtml(acces)})</span>`;
}

function construireLiensItineraires(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return "";
  }

  const destination = `${latitude},${longitude}`;
  const googleMaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  const applePlans = `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
  const waze = `https://waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes`;

  return `<div class="popup-itineraires"><a class="popup-bouton-itineraire" href="${echapperHtml(googleMaps)}" target="_blank" rel="noopener noreferrer">🗺️ Maps</a><a class="popup-bouton-itineraire" href="${echapperHtml(applePlans)}" target="_blank" rel="noopener noreferrer">🍎 Plans</a><a class="popup-bouton-itineraire" href="${echapperHtml(waze)}" target="_blank" rel="noopener noreferrer">🚗 Waze</a></div>`;
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
    const titresPostes = appareilsListe.map((a) => construireTitreNomTypeSatAcces(a)).filter(Boolean);
    const titresUniques = [...new Set(titresPostes)];
    const titrePosteCommun = titresUniques.length === 1 ? titresUniques[0] : "";

    const lignes = appareilsListe
      .map((a) => {
        const couleur = a.couleur_appareil || "#111111";
        const tagHp = a.hors_patrimoine ? '<span class="popup-tag-hp">HP</span>' : "";
        const libelleAppareil = champCompletOuVide(a.appareil) || "Appareil inconnu";
        const descriptionAppareil = champCompletOuVide(a.description);
        const titrePosteHtml = construireTitreNomTypeSatAccesHtml(a);
        const detailsPoste = !titrePosteCommun && titrePosteHtml
          ? `<br/><span class="popup-poste-details">${titrePosteHtml}</span>`
          : "";
        const detailsDescription = descriptionAppareil
          ? `<br/><span class="popup-poste-details">${echapperHtml(descriptionAppareil)}</span>`
          : "";
        return `<li><span class="popup-point-couleur" style="background:${echapperHtml(couleur)}"></span>${echapperHtml(libelleAppareil)}${tagHp}${detailsPoste}${detailsDescription}</li>`;
      })
      .join("");

    const lignePosteCommune = titrePosteCommun
      ? `<p class="popup-acces-titre popup-poste-details-centre">${construireTitreNomTypeSatAccesHtml(appareilsListe[0] || {})}</p>`
      : "";

    return `<section class="popup-section">${lignePosteCommune}<div class="popup-pill-ligne"><span class="popup-badge popup-badge-appareils">${echapperHtml(String(propr.appareils_count))} appareils</span></div><div class="popup-sous-titre-centre">sur le meme support</div><ul>${lignes}</ul></section>`;
  }

  const appareil = appareilsListe[0] || {};
  const titreHtml = construireTitreNomTypeSatAccesHtml(appareil);
  const couleur = appareil.couleur_appareil || "#111111";
  const tagHp = appareil.hors_patrimoine ? '<span class="popup-tag-hp">HP</span>' : "";
  const libelleAppareil = champCompletOuVide(appareil.appareil) || "Appareil inconnu";
  const descriptionAppareil = champCompletOuVide(appareil.description);
  const ligneTitre = options.masquerTitreLieu ? "" : `<p class="popup-acces-titre">${titreHtml}</p>`;
  const ligneDescription = descriptionAppareil
    ? `<p class="popup-poste-details">${echapperHtml(descriptionAppareil)}</p>`
    : "";
  return `<section class="popup-section">${ligneTitre}<p><span class="popup-point-couleur" style="background:${echapperHtml(couleur)}"></span>${echapperHtml(libelleAppareil)}${tagHp}</p>${ligneDescription}</section>`;
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

  const construireTitreAccesHtml = (acces) => construireTitreNomTypeSatAccesHtml(acces, { nomVilleDe: true });
  const clesAccesUniques = new Set(
    accesListe
      .map((a) => normaliserTexteRecherche(champCompletOuVide(a?.acces)))
      .filter(Boolean)
  );
  // Fallback: si "acces" est vide, on deduit une cle route via nom/type/sat.
  if (!clesAccesUniques.size) {
    for (const acces of accesListe) {
      const cleFallback = construireCleNomTypeSat(acces);
      if (cleFallback) {
        clesAccesUniques.add(cleFallback);
      }
    }
  }
  const clesAffichageLignes = new Set(
    accesListe
      .map((a) => normaliserTexteRecherche(champCompletOuVide(a?.acces)))
      .filter(Boolean)
  );
  const clesPostesUniques = new Set(
    accesListe
      .map((a) => construireCleNomTypeSat(a))
      .filter(Boolean)
  );

  if (Number(propr.acces_count) > 1) {
    const lignes = accesListe
      .map((a) => {
        const titreHtml = construireTitreAccesHtml(a);
        const classeHp = a.hors_patrimoine ? " popup-acces-ligne-hp" : "";
        return `<li><span class="popup-acces-ligne${classeHp}">${titreHtml}</span></li>`;
      })
      .join("");
    const totalAccesUniques = Math.max(1, clesAccesUniques.size || Number(propr.acces_count) || 1);
    const totalPostesUniques = clesPostesUniques.size;
    const totalLignesUniques = Math.max(1, clesAffichageLignes.size || accesListe.length);
    const libelleBadge =
      totalAccesUniques === 1 && totalPostesUniques > 1
        ? `${totalPostesUniques} postes`
        : `${totalLignesUniques} accès voiture`;
    return `<section class="popup-section"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-acces">${echapperHtml(libelleBadge)}</span></div><ul>${lignes}</ul></section>`;
  }

  const acces = accesListe[0] || {};
  const titreHtml = construireTitreAccesHtml(acces);
  const classeHors = acces.hors_patrimoine ? " popup-item-hors" : "";
  return `<section class="popup-section"><p class="popup-acces-titre${classeHors}">🚗 ${titreHtml}</p></section>`;
}

function construireSectionPortail(featureAcces, options = {}) {
  const afficherVide = Boolean(options.afficherVide);
  const accesListe = extraireListeDepuisFeature(featureAcces, "acces_liste_json");
  const portails = [];
  const dejaVu = new Set();

  for (const acces of accesListe) {
    const portail = champCompletOuVide(acces?.portail);
    if (!portail) {
      continue;
    }
    const cle = portail.toLowerCase();
    if (dejaVu.has(cle)) {
      continue;
    }
    dejaVu.add(cle);
    portails.push(portail);
  }

  if (!portails.length && !afficherVide) {
    return "";
  }

  const contenu = portails.length
    ? portails.map((texte) => echapperHtml(texte)).join(" • ")
    : '<span class="popup-portail-vide">(non renseigné)</span>';
  return `<section class="popup-section popup-section-portail"><p class="popup-portail-ligne">🔐 Portail : <span class="popup-portail-valeur">${contenu}</span></p></section>`;
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

function construireCleNomType(entree) {
  return [
    normaliserTexteRecherche(champCompletOuVide(entree?.nom)),
    normaliserTexteRecherche(champCompletOuVide(entree?.type))
  ].join("|");
}

function construireCleNomTypeSat(entree) {
  return [
    normaliserTexteRecherche(champCompletOuVide(entree?.nom)),
    normaliserTexteRecherche(champCompletOuVide(entree?.type)),
    normaliserTexteRecherche(champCompletOuVide(entree?.SAT))
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

function trouverPosteAssocieDepuisAcces(featureAcces) {
  if (!featureAcces || !donneesPostes?.features?.length) {
    return null;
  }

  const accesListe = extraireListeDepuisFeature(featureAcces, "acces_liste_json");
  if (!accesListe.length) {
    return null;
  }

  const clesCorrespondance = new Set(accesListe.map((acces) => construireCleCorrespondance(acces)).filter(Boolean));
  const clesNomType = new Set(accesListe.map((acces) => construireCleNomType(acces)).filter(Boolean));
  if (!clesCorrespondance.size && !clesNomType.size) {
    return null;
  }

  let fallbackNomType = null;
  for (const featurePostes of donneesPostes.features) {
    const postesListe = extraireListeDepuisFeature(featurePostes, "postes_liste_json");
    if (!postesListe.length) {
      continue;
    }

    const matchesCorrespondance = postesListe.filter((poste) => clesCorrespondance.has(construireCleCorrespondance(poste)));
    if (matchesCorrespondance.length) {
      const posteAvecRss = matchesCorrespondance.find((poste) => Boolean(champCompletOuVide(poste?.rss)));
      return posteAvecRss || matchesCorrespondance[0];
    }

    if (!fallbackNomType) {
      const matchesNomType = postesListe.filter((poste) => clesNomType.has(construireCleNomType(poste)));
      if (matchesNomType.length) {
        const posteAvecRss = matchesNomType.find((poste) => Boolean(champCompletOuVide(poste?.rss)));
        fallbackNomType = posteAvecRss || matchesNomType[0];
      }
    }
  }

  return fallbackNomType;
}

function construireSectionRssAssocieDepuisAcces(featureAcces) {
  const posteAssocie = trouverPosteAssocieDepuisAcces(featureAcces);
  if (!posteAssocie) {
    return "";
  }
  return construireSectionRssPoste(posteAssocie);
}

function trouverCoordonneesAccesDepuisAppareils(featureAppareils) {
  if (!featureAppareils || !donneesAcces?.features?.length) {
    return null;
  }

  const appareilsListe = extraireListeDepuisFeature(featureAppareils, "appareils_liste_json");
  if (!appareilsListe.length) {
    return null;
  }

  const clesAppareils = new Set(appareilsListe.map((appareil) => construireCleCorrespondance(appareil)).filter(Boolean));
  if (!clesAppareils.size) {
    return null;
  }

  for (const featureAcces of donneesAcces.features) {
    const accesListe = extraireListeDepuisFeature(featureAcces, "acces_liste_json");
    const correspond = accesListe.some((acces) => clesAppareils.has(construireCleCorrespondance(acces)));
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

function trouverCoordonneesPosteDepuisAppareils(featureAppareils) {
  if (!featureAppareils || !donneesPostes?.features?.length) {
    return null;
  }

  const appareilsListe = extraireListeDepuisFeature(featureAppareils, "appareils_liste_json");
  if (!appareilsListe.length) {
    return null;
  }

  const clesNomTypeSat = new Set(appareilsListe.map((a) => construireCleNomTypeSat(a)).filter(Boolean));
  const clesNomType = new Set(appareilsListe.map((a) => construireCleNomType(a)).filter(Boolean));
  if (!clesNomType.size) {
    return null;
  }

  let fallbackNomType = null;

  for (const featurePostes of donneesPostes.features) {
    const postesListe = extraireListeDepuisFeature(featurePostes, "postes_liste_json");
    if (!postesListe.length) {
      continue;
    }

    const matchSat = postesListe.some((poste) => clesNomTypeSat.has(construireCleNomTypeSat(poste)));
    const matchNomType = postesListe.some((poste) => clesNomType.has(construireCleNomType(poste)));
    if (!matchSat && !matchNomType) {
      continue;
    }

    const [longitude, latitude] = featurePostes.geometry?.coordinates || [];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    if (matchSat) {
      return [longitude, latitude];
    }

    if (!fallbackNomType) {
      fallbackNomType = [longitude, latitude];
    }
  }

  return fallbackNomType;
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
  return details.join(SEPARATEUR_LIBELLE);
}

function normaliserCleRss(valeur) {
  return String(valeur || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace("TABLE", "")
    .trim();
}

function normaliserNumeroTelephone(numero) {
  const chiffres = String(numero || "").replace(/\D/g, "");
  if (chiffres.length === 10 && chiffres.startsWith("0")) {
    return chiffres.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  if (chiffres.length === 11 && chiffres.startsWith("33")) {
    return `+33 ${chiffres.slice(2).replace(/(\d{2})(?=\d)/g, "$1 ").trim()}`;
  }
  return String(numero || "").trim();
}

function construireHrefTelephone(numero) {
  const chiffres = String(numero || "").replace(/\D/g, "");
  if (!chiffres) {
    return "";
  }
  if (chiffres.length === 11 && chiffres.startsWith("33")) {
    return `+${chiffres}`;
  }
  return chiffres;
}

function extraireNumerosTelephone(texte) {
  const source = String(texte || "").replace(/\u00a0/g, " ");
  const motif = /(?:\+33\s?[1-9](?:[\s.-]?\d{2}){4}|0[1-9](?:[\s.-]?\d{2}){4})/g;
  const correspondances = source.match(motif) || [];
  const resultat = [];
  const dejaVu = new Set();

  for (const entree of correspondances) {
    const normalise = normaliserNumeroTelephone(entree);
    const cle = normalise.replace(/\D/g, "");
    if (!cle || dejaVu.has(cle)) {
      continue;
    }
    dejaVu.add(cle);
    resultat.push(normalise);
  }
  return resultat;
}

function obtenirNumerosRssDepuisCode(codeRss) {
  const cle = normaliserCleRss(codeRss);
  const tableau = TABLES_RSS?.[cle];
  if (!Array.isArray(tableau) || !tableau.length) {
    return [];
  }
  return tableau.map((numero) => normaliserNumeroTelephone(numero)).filter(Boolean);
}

function construireLibelleTableRss(codeRss) {
  const cle = normaliserCleRss(codeRss);
  if (cle === "A") {
    return "Table 1";
  }
  if (cle === "B") {
    return "Table 2";
  }
  if (cle === "C") {
    return "Table 3";
  }
  return `Table ${cle || "?"}`;
}

function construireSectionRssPoste(poste) {
  const rss = champCompletOuVide(poste?.rss);
  if (!rss) {
    return "";
  }

  const cle = normaliserCleRss(rss);
  const numeros = obtenirNumerosRssDepuisCode(cle);
  const libelleTable = construireLibelleTableRss(cle);
  if (!numeros.length) {
    return `<section class="popup-section"><p class="popup-poste-ligne">📞 RSS ${echapperHtml(libelleTable)}</p></section>`;
  }

  const boutons = numeros
    .map((numero) => {
      const href = construireHrefTelephone(numero);
      return `<a class="popup-bouton-itineraire" href="tel:${echapperHtml(href)}">${echapperHtml(numero)}</a>`;
    })
    .join("");

  return `<section class="popup-section"><p class="popup-poste-rss-titre">📞 RSS ${echapperHtml(libelleTable)}</p><div class="popup-itineraires popup-itineraires-rss">${boutons}</div></section>`;
}

function construireSectionPkPoste(poste) {
  const lignePk = construireLignePkEtLigne(poste);
  if (!lignePk) {
    return "";
  }
  return `<section class="popup-section"><p class="popup-poste-ligne">🚆 ${echapperHtml(lignePk)}</p></section>`;
}

function construireSectionInformationsPoste(poste) {
  const informations = champCompletOuVide(poste?.description);
  if (!informations) {
    return "";
  }
  return `<section class="popup-section"><p class="popup-poste-ligne">ℹ️ <strong>Informations :</strong> ${echapperHtml(informations)}</p></section>`;
}

function construireSectionContactPoste(poste) {
  const contact = champCompletOuVide(poste?.contact);
  if (!contact) {
    return "";
  }

  const numeros = extraireNumerosTelephone(contact);
  if (!numeros.length) {
    return `<section class="popup-section"><p class="popup-poste-ligne">👤 <strong>Contact :</strong> ${echapperHtml(contact)}</p></section>`;
  }

  const source = String(contact).replace(/\u00a0/g, " ");
  const premierNumero = source.search(/(?:\+33\s?[1-9](?:[\s.-]?\d{2}){4}|0[1-9](?:[\s.-]?\d{2}){4})/);
  const etiquette = premierNumero > 0 ? source.slice(0, premierNumero).replace(/[:\s]+$/g, "") : "Contact";

  const liensNumeros = numeros
    .map((numero) => {
      const href = construireHrefTelephone(numero);
      return `<a class="popup-poste-contact-numero" href="tel:${echapperHtml(href)}">${echapperHtml(numero)}</a>`;
    })
    .join(" · ");

  return `<section class="popup-section"><p class="popup-poste-ligne">👤 <strong>Contact :</strong> ${echapperHtml(etiquette)}${etiquette ? " : " : " "}${liensNumeros}</p></section>`;
}

function comparerLibellesSat(a, b) {
  const normaliser = (valeur) => String(valeur || "").trim().toUpperCase();
  const A = normaliser(a);
  const B = normaliser(b);

  if (A === B) {
    return 0;
  }
  if (A === "POSTE") {
    return -1;
  }
  if (B === "POSTE") {
    return 1;
  }

  const matchA = A.match(/^SAT(\d+)$/);
  const matchB = B.match(/^SAT(\d+)$/);
  if (matchA && matchB) {
    return Number(matchA[1]) - Number(matchB[1]);
  }
  if (matchA) {
    return -1;
  }
  if (matchB) {
    return 1;
  }
  return A.localeCompare(B, "fr", { sensitivity: "base", numeric: true });
}

function construireSectionAppareilsAssociesDepuisPostes(postesListe) {
  if (!Array.isArray(postesListe) || !postesListe.length || !donneesAppareils?.features?.length) {
    return "";
  }

  const clesPostesNomType = new Set(postesListe.map((poste) => construireCleNomType(poste)).filter(Boolean));
  if (!clesPostesNomType.size) {
    return "";
  }

  const groupes = new Map();
  for (const feature of donneesAppareils.features) {
    const [longitudeFeature, latitudeFeature] = feature.geometry?.coordinates || [];
    if (!Number.isFinite(longitudeFeature) || !Number.isFinite(latitudeFeature)) {
      continue;
    }
    const appareilsListe = extraireListeDepuisFeature(feature, "appareils_liste_json");
    for (const appareil of appareilsListe) {
      if (!clesPostesNomType.has(construireCleNomType(appareil))) {
        continue;
      }

      const code = champCompletOuVide(appareil?.appareil);
      if (!code) {
        continue;
      }

      const sat = champCompletOuVide(appareil?.SAT) || "Poste";
      const cleSat = sat.toUpperCase();
      if (!groupes.has(cleSat)) {
        groupes.set(cleSat, {
          label: sat,
          codes: new Map()
        });
      }
      const groupe = groupes.get(cleSat);
      if (!groupe.codes.has(code)) {
        groupe.codes.set(code, {
          code,
          longitude: longitudeFeature,
          latitude: latitudeFeature
        });
      }
    }
  }

  if (!groupes.size) {
    return "";
  }

  const lignes = Array.from(groupes.values())
    .sort((a, b) => comparerLibellesSat(a.label, b.label))
    .map((groupe) => {
      const codes = Array.from(groupe.codes.values()).sort((a, b) =>
        String(a.code).localeCompare(String(b.code), "fr", { numeric: true })
      );
      const codesHtml = codes
        .map(
          (entree) =>
            `<button class="popup-poste-appareil-lien" type="button" data-lng="${entree.longitude}" data-lat="${entree.latitude}">${echapperHtml(entree.code)}</button>`
        )
        .join(", ");
      return `<p class="popup-poste-appareils-ligne"><strong>${echapperHtml(groupe.label)} :</strong> ${codesHtml}</p>`;
    })
    .join("");

  return `<section class="popup-section"><p class="popup-poste-appareils-titre">💡 Appareils au poste</p>${lignes}</section>`;
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
  const classeHors = poste.hors_patrimoine ? " popup-item-hors" : "";
  const sectionRss = construireSectionRssPoste(poste);
  const sectionPk = construireSectionPkPoste(poste);
  const sectionInformations = construireSectionInformationsPoste(poste);
  const sectionContact = construireSectionContactPoste(poste);

  return `<section class="popup-section${classeHors}"><div class="popup-pill-ligne"><span class="popup-badge popup-badge-postes popup-badge-poste-nom">${echapperHtml(titre)}</span></div></section>${sectionRss}${sectionPk}${sectionInformations}${sectionContact}`;
}

function attacherActionsPopupInterne() {
  if (!popupCarte) {
    return;
  }

  const racinePopup = popupCarte.getElement();
  if (!racinePopup) {
    return;
  }

  if (navigationInternePopup) {
    const boutonVoirAppareils = racinePopup.querySelector("#popup-voir-appareils-associes");
    if (boutonVoirAppareils) {
      boutonVoirAppareils.addEventListener("click", () => {
        if (!popupCarte || !navigationInternePopup?.vueAppareils) {
          return;
        }
        popupCarte.setHTML(navigationInternePopup.vueAppareils);
        attacherActionsPopupInterne();
      });
    }

    const boutonRetourFiche = racinePopup.querySelector("#popup-retour-fiche-poste");
    if (boutonRetourFiche) {
      boutonRetourFiche.addEventListener("click", () => {
        if (!popupCarte || !navigationInternePopup?.vueFiche) {
          return;
        }
        popupCarte.setHTML(navigationInternePopup.vueFiche);
        attacherActionsPopupInterne();
      });
    }
  }

  const boutonRetourPosteDepuisAppareil = racinePopup.querySelector("#popup-retour-poste-appareil");
  if (boutonRetourPosteDepuisAppareil) {
    boutonRetourPosteDepuisAppareil.addEventListener("click", async () => {
      const longitude = Number(boutonRetourPosteDepuisAppareil.getAttribute("data-lng"));
      const latitude = Number(boutonRetourPosteDepuisAppareil.getAttribute("data-lat"));
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }

      try {
        await activerFiltrePourType("postes");
        appliquerCouchesDonnees();
        remonterCouchesDonnees();
      } catch (erreur) {
        console.error("Impossible d'activer la couche postes", erreur);
      }

      let popupOuverte = false;
      const ouvrirPopup = () => {
        if (popupOuverte) {
          return;
        }
        popupOuverte = true;
        ouvrirPopupDepuisCoordonnees(longitude, latitude);
      };
      naviguerVersCoordonneesPuisOuvrirPopup(longitude, latitude, ouvrirPopup, {
        zoomMin: 14.8,
        durationDouxMs: 420
      });
    });
  }

  const boutonsAppareilsAssocies = racinePopup.querySelectorAll(".popup-poste-appareil-lien[data-lng][data-lat]");
  for (const bouton of boutonsAppareilsAssocies) {
    bouton.addEventListener("click", async () => {
      const longitude = Number(bouton.getAttribute("data-lng"));
      const latitude = Number(bouton.getAttribute("data-lat"));
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }

      try {
        await activerFiltrePourType("appareils");
        appliquerCouchesDonnees();
        remonterCouchesDonnees();
      } catch (erreur) {
        console.error("Impossible d'activer la couche appareils", erreur);
      }

      fermerMenuContextuel();
      fermerResultatsRecherche();

      let popupOuverte = false;
      const ouvrirPopup = () => {
        if (popupOuverte) {
          return;
        }
        popupOuverte = true;
        ouvrirPopupDepuisCoordonnees(longitude, latitude);
      };
      naviguerVersCoordonneesPuisOuvrirPopup(longitude, latitude, ouvrirPopup, {
        zoomMin: 14.8,
        durationDouxMs: 420
      });
    });
  }

  const boutonLocaliserCarte = racinePopup.querySelector("#popup-localiser-carte");
  if (boutonLocaliserCarte) {
    boutonLocaliserCarte.addEventListener("click", () => {
      const longitude = Number(boutonLocaliserCarte.getAttribute("data-lng"));
      const latitude = Number(boutonLocaliserCarte.getAttribute("data-lat"));
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return;
      }
      fermerPopupCarte();
      demarrerClignotementLocalisation(longitude, latitude);
    });
  }
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
    if (Number(entree.appareilsCount) > 1) {
      return `${entree.appareilsCount} appareils`;
    }
    return "Appareil";
  }
  return "Acces voiture";
}

function obtenirPrioriteTypeRecherche(type) {
  if (type === "acces") {
    return 0;
  }
  if (type === "postes") {
    return 1;
  }
  if (type === "appareils") {
    return 2;
  }
  return 3;
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
      const motsCles = [titre, details, poste.nom, poste.SAT, poste.acces, poste.rss, poste.pk, poste.contact]
        .filter(Boolean)
        .join(" ");

      index.push({
        type: "postes",
        titre,
        sousTitre: "",
        longitude,
        latitude,
        couleurPastille: "#2563eb",
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

    const groupesParTitre = new Map();
    for (const appareil of appareilsListe) {
      const titre = construireTitreNomTypeSatAcces(appareil) || "Appareil";
      const appareilNom = champCompletOuVide(appareil.appareil) || "";
      const motsCles = [titre, appareilNom, appareil.nom, appareil.SAT, appareil.acces]
        .filter(Boolean)
        .join(" ");
      const cle = `${titre}|${longitude}|${latitude}`;

      if (!groupesParTitre.has(cle)) {
        groupesParTitre.set(cle, {
          type: "appareils",
          titre,
          sousTitre: "",
          longitude,
          latitude,
          couleurPastille: normaliserCouleurHex(
            appareil.couleur_appareil || determinerCouleurAppareil(appareilNom)
          ),
          appareilsCount: 0,
          appareilsLignes: [],
          texteMotsCles: []
        });
      }

      const groupe = groupesParTitre.get(cle);
      groupe.appareilsCount += 1;
      const contexteAppareil = [appareil.nom, appareil.type, appareil.SAT]
        .map((v) => champCompletOuVide(v))
        .filter(Boolean)
        .join(SEPARATEUR_LIBELLE);
      groupe.appareilsLignes.push({
        code: appareilNom || "Appareil",
        contexte: contexteAppareil,
        horsPatrimoine: Boolean(appareil.hors_patrimoine),
        couleur: normaliserCouleurHex(appareil.couleur_appareil || determinerCouleurAppareil(appareilNom))
      });
      groupe.texteMotsCles.push(motsCles);
      if (!groupe.sousTitre && appareilNom) {
        groupe.sousTitre = appareilNom;
      }
    }

    for (const groupe of groupesParTitre.values()) {
      const lignesUniques = Array.from(
        new Map(
          groupe.appareilsLignes.map((ligne) => [`${ligne.code}|${ligne.contexte}`, ligne])
        ).values()
      );
      index.push({
        ...groupe,
        sousTitre: groupe.appareilsCount > 1 ? "" : groupe.sousTitre,
        appareilsLignesUniques: lignesUniques,
        texteRecherche: normaliserTexteRecherche(groupe.texteMotsCles.join(" "))
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
      const motsCles = [titre, acces.nom, acces.SAT, acces.acces]
        .filter(Boolean)
        .join(" ");

      index.push({
        type: "acces",
        titre,
        sousTitre: "",
        longitude,
        latitude,
        couleurPastille: "#8b5cf6",
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

function obtenirFeatureProche(collection, longitude, latitude, seuilDegres = 0.00045) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  let meilleur = null;
  let meilleureDistance = Infinity;
  for (const feature of collection?.features || []) {
    const [lng, lat] = feature?.geometry?.coordinates || [];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }
    const distance = Math.hypot(lng - longitude, lat - latitude);
    if (distance < meilleureDistance) {
      meilleureDistance = distance;
      meilleur = feature;
    }
  }

  if (meilleureDistance <= seuilDegres) {
    return meilleur;
  }
  return null;
}

function debugRechercheFiche(message, details = {}) {
  if (!DEBUG_RECHERCHE_FICHE) {
    return;
  }
  const texte = `[DEBUG fiche recherche] ${message}`;
  console.warn(texte, details);
  if (window.matchMedia("(max-width: 820px), (pointer: coarse)").matches) {
    const resume = [
      texte,
      details?.type ? `type=${details.type}` : "",
      Number.isFinite(details?.longitude) ? `lng=${details.longitude}` : "",
      Number.isFinite(details?.latitude) ? `lat=${details.latitude}` : "",
      details?.phase ? `phase=${details.phase}` : "",
      details?.raison ? `raison=${details.raison}` : "",
      `exact={postes:${Boolean(details.exactPostes)},acces:${Boolean(details.exactAcces)},app:${Boolean(details.exactAppareils)}}`,
      `proche={postes:${Boolean(details.prochePostes)},acces:${Boolean(details.procheAcces)},app:${Boolean(details.procheAppareils)}}`
    ]
      .filter(Boolean)
      .join("\n");
    if (details?.alerteMobile) {
      window.alert(resume);
    }
  }
}

function collecterEtatDebugOuverturePopup(longitude, latitude) {
  const exactPostes = afficherPostes ? obtenirFeatureALaCoordonnee(donneesPostes, longitude, latitude) : null;
  const exactAcces = afficherAcces ? obtenirFeatureALaCoordonnee(donneesAcces, longitude, latitude) : null;
  const exactAppareils = afficherAppareils ? obtenirFeatureALaCoordonnee(donneesAppareils, longitude, latitude) : null;
  const prochePostes = !exactPostes && afficherPostes ? obtenirFeatureProche(donneesPostes, longitude, latitude) : null;
  const procheAcces = !exactAcces && afficherAcces ? obtenirFeatureProche(donneesAcces, longitude, latitude) : null;
  const procheAppareils =
    !exactAppareils && afficherAppareils ? obtenirFeatureProche(donneesAppareils, longitude, latitude) : null;

  return {
    exactPostes,
    exactAcces,
    exactAppareils,
    prochePostes,
    procheAcces,
    procheAppareils
  };
}

function construirePopupDepuisFeatures(longitude, latitude, featurePostes, featureAcces, featureAppareils) {
  const sections = [];
  let coordonneesNavigation = null;
  let sectionAppareilsAssociesPoste = "";
  let coordonneesRetourPosteDepuisAppareil = null;
  let sectionRssAssocieDepuisAcces = "";

  if (featurePostes) {
    const sectionPostes = construireSectionPostes(featurePostes);
    if (sectionPostes) {
      sections.push(sectionPostes);
    }

    const postesListe = extraireListeDepuisFeature(featurePostes, "postes_liste_json");
    sectionAppareilsAssociesPoste = construireSectionAppareilsAssociesDepuisPostes(postesListe);
    if (sectionAppareilsAssociesPoste) {
      sections.push(
        '<section class="popup-section"><button class="popup-action-lien" id="popup-voir-appareils-associes" type="button">🧩 Voir les appareils associés</button></section>'
      );
    }
  }

  if (featureAcces) {
    const sectionAcces = construireSectionAcces(featureAcces);
    if (sectionAcces) {
      sections.push(sectionAcces);
      sectionRssAssocieDepuisAcces = construireSectionRssAssocieDepuisAcces(featureAcces);
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

  if (!coordonneesNavigation && featureAppareils) {
    coordonneesNavigation = trouverCoordonneesAccesDepuisAppareils(featureAppareils);
  }

  if (featureAppareils && !featurePostes) {
    coordonneesRetourPosteDepuisAppareil = trouverCoordonneesPosteDepuisAppareils(featureAppareils);
  }

  const sectionPortail = featureAcces
    ? construireSectionPortail(featureAcces, {
        afficherVide: true
      })
    : "";
  const sectionItineraire = coordonneesNavigation
    ? `<section class="popup-section popup-section-itineraires"><div class="popup-section-titre"><span class="popup-badge popup-badge-itineraire">Itineraire</span></div>${construireLiensItineraires(coordonneesNavigation[0], coordonneesNavigation[1])}</section>`
    : "";
  const sectionRetourPoste = coordonneesRetourPosteDepuisAppareil
    ? `<section class="popup-section popup-section-itineraires"><div class="popup-section-titre"><span class="popup-badge popup-badge-itineraire">Poste</span></div><div class="popup-itineraires"><button class="popup-bouton-itineraire" id="popup-retour-poste-appareil" type="button" data-lng="${coordonneesRetourPosteDepuisAppareil[0]}" data-lat="${coordonneesRetourPosteDepuisAppareil[1]}">↩ Retour poste</button></div></section>`
    : "";
  const sectionLocaliser = `<section class="popup-section popup-section-localiser"><div class="popup-itineraires popup-itineraires-localiser"><button class="popup-bouton-itineraire popup-bouton-localiser" id="popup-localiser-carte" type="button" data-lng="${longitude}" data-lat="${latitude}">📍 Localiser sur la carte</button></div></section>`;
  const contenuFiche = `<div class="popup-carte">${sections.join("")}${sectionPortail}${sectionRssAssocieDepuisAcces}${sectionItineraire}${sectionRetourPoste}${sectionLocaliser}</div>`;

  let contenuVueAppareils = "";
  if (sectionAppareilsAssociesPoste) {
    contenuVueAppareils = `<div class="popup-carte">${sectionAppareilsAssociesPoste}<section class="popup-section popup-section-itineraires"><div class="popup-section-titre"><span class="popup-badge popup-badge-itineraire">Fiche</span></div><div class="popup-itineraires"><button class="popup-bouton-itineraire" id="popup-retour-fiche-poste" type="button">↩ Retour à la fiche</button></div></section></div>`;
  }

  fermerPopupCarte({ preserveNavigationLock: conserverFichePendantNavigation });
  coordonneesDerniereFiche = [longitude, latitude];
  navigationInternePopup = sectionAppareilsAssociesPoste
    ? {
        vueFiche: contenuFiche,
        vueAppareils: contenuVueAppareils
      }
    : null;

  popupCarte = creerPopupFicheModale()
    .setLngLat([longitude, latitude])
    .setHTML(contenuFiche)
    .addTo(carte);
  attacherActionsPopupInterne();
  setTimeout(() => {
    recadrerCartePourPopupMobile(longitude, latitude);
  }, 30);
  popupCarte.on("close", () => {
    popupCarte = null;
    navigationInternePopup = null;
    coordonneesDerniereFiche = null;
  });

  return true;
}

function ouvrirPopupDepuisCoordonnees(longitude, latitude) {
  let featurePostes = afficherPostes ? obtenirFeatureALaCoordonnee(donneesPostes, longitude, latitude) : null;
  let featureAcces = afficherAcces ? obtenirFeatureALaCoordonnee(donneesAcces, longitude, latitude) : null;
  let featureAppareils = afficherAppareils ? obtenirFeatureALaCoordonnee(donneesAppareils, longitude, latitude) : null;

  if (!featurePostes && afficherPostes) {
    featurePostes = obtenirFeatureProche(donneesPostes, longitude, latitude);
  }
  if (!featureAcces && afficherAcces) {
    featureAcces = obtenirFeatureProche(donneesAcces, longitude, latitude);
  }
  if (!featureAppareils && afficherAppareils) {
    featureAppareils = obtenirFeatureProche(donneesAppareils, longitude, latitude);
  }

  return construirePopupDepuisFeatures(longitude, latitude, featurePostes, featureAcces, featureAppareils);
}

function calculerContexteDeplacement(longitude, latitude) {
  const canvas = carte.getCanvas();
  const largeur = canvas?.clientWidth || window.innerWidth;
  const hauteur = canvas?.clientHeight || window.innerHeight;
  const pointCible = carte.project([longitude, latitude]);
  const pointCentre = carte.project(carte.getCenter());
  const distancePixels = Math.hypot(pointCible.x - pointCentre.x, pointCible.y - pointCentre.y);

  const margeHorizontale = Math.min(160, Math.max(90, largeur * 0.18));
  const margeHaut = Math.min(190, Math.max(92, hauteur * 0.2));
  const margeBas = Math.min(115, Math.max(62, hauteur * 0.13));
  const cibleDansZoneConfort =
    pointCible.x > margeHorizontale &&
    pointCible.x < largeur - margeHorizontale &&
    pointCible.y > margeHaut &&
    pointCible.y < hauteur - margeBas;

  return { distancePixels, cibleDansZoneConfort };
}

function naviguerVersCoordonneesPuisOuvrirPopup(longitude, latitude, ouvrirPopup, options = {}) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || typeof ouvrirPopup !== "function") {
    return false;
  }

  const conserverPopupOuvert = Boolean(options.conserverPopupOuvert);
  const { distancePixels, cibleDansZoneConfort } = calculerContexteDeplacement(longitude, latitude);
  const forcerZoom = Boolean(options.forceZoom);
  if (!forcerZoom && cibleDansZoneConfort && distancePixels < 210) {
    ouvrirPopup();
    return true;
  }

  let temporisationFallbackPopup = null;
  if (conserverPopupOuvert) {
    conserverFichePendantNavigation = true;
  }
  demarrerNavigationPopupProgrammatique();
  carte.once("moveend", () => {
    terminerNavigationPopupProgrammatique();
    if (conserverPopupOuvert) {
      conserverFichePendantNavigation = false;
    }
    if (temporisationFallbackPopup) {
      clearTimeout(temporisationFallbackPopup);
      temporisationFallbackPopup = null;
    }
    ouvrirPopup();
  });

  if (distancePixels < 520) {
    carte.easeTo({
      center: [longitude, latitude],
      zoom: forcerZoom ? Math.max(carte.getZoom(), Number(options.zoomMin) || 14.2) : carte.getZoom(),
      duration: Number(options.durationDouxMs) || 460,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      essential: true
    });
  } else {
    carte.flyTo({
      center: [longitude, latitude],
      zoom: Math.max(carte.getZoom(), Number(options.zoomMin) || 14.2),
      speed: Number(options.speed) || 1.05,
      curve: Number(options.curve) || 1.15,
      essential: true
    });
  }

  temporisationFallbackPopup = setTimeout(() => {
    if (carte.isMoving()) {
      return;
    }
    terminerNavigationPopupProgrammatique();
    if (conserverPopupOuvert) {
      conserverFichePendantNavigation = false;
    }
    ouvrirPopup();
  }, Number(options.fallbackMs) || (distancePixels < 520 ? 980 : 1500));

  return true;
}

function naviguerVersCoordonneesArrierePlan(longitude, latitude, options = {}) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return false;
  }

  const { distancePixels, cibleDansZoneConfort } = calculerContexteDeplacement(longitude, latitude);
  const forcerZoom = Boolean(options.forceZoom);
  if (!forcerZoom && cibleDansZoneConfort && distancePixels < 210) {
    return true;
  }

  const conserverPopupOuvert = Boolean(options.conserverPopupOuvert);
  if (conserverPopupOuvert) {
    conserverFichePendantNavigation = true;
  }
  demarrerNavigationPopupProgrammatique();

  let fallback = null;
  const terminer = () => {
    terminerNavigationPopupProgrammatique();
    if (conserverPopupOuvert) {
      conserverFichePendantNavigation = false;
    }
    if (fallback) {
      clearTimeout(fallback);
      fallback = null;
    }
  };

  carte.once("moveend", terminer);

  if (distancePixels < 520) {
    carte.easeTo({
      center: [longitude, latitude],
      zoom: forcerZoom ? Math.max(carte.getZoom(), Number(options.zoomMin) || 14.2) : carte.getZoom(),
      duration: Number(options.durationDouxMs) || 460,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      essential: true
    });
  } else {
    carte.flyTo({
      center: [longitude, latitude],
      zoom: Math.max(carte.getZoom(), Number(options.zoomMin) || 14.2),
      speed: Number(options.speed) || 1.05,
      curve: Number(options.curve) || 1.15,
      essential: true
    });
  }

  fallback = setTimeout(() => {
    if (carte.isMoving()) {
      return;
    }
    terminer();
  }, Number(options.fallbackMs) || (distancePixels < 520 ? 980 : 1500));

  return true;
}

function ouvrirPopupAvecAnimationDepuisObjets(objets, options = {}) {
  if (!Array.isArray(objets) || !objets.length) {
    return false;
  }

  const [longitude, latitude] = objets[0]?.geometry?.coordinates || [];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return false;
  }

  let popupOuverte = false;
  const ouvrirPopup = () => {
    if (popupOuverte) {
      return;
    }
    popupOuverte = true;
    if (!ouvrirPopupDepuisObjetsCarte(objets)) {
      ouvrirPopupDepuisCoordonnees(longitude, latitude);
    }
  };

  return naviguerVersCoordonneesPuisOuvrirPopup(longitude, latitude, ouvrirPopup, options);
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
    const titreNormalise = normaliserTexteRecherche(entree.titre);
    const matchDebut = entree.texteRecherche.startsWith(termeNormalise) || titreNormalise.startsWith(termeNormalise) ? 1 : 0;
    resultats.push({
      ...entree,
      matchDebut
    });
  }

  resultats.sort((a, b) => {
    if (b.matchDebut !== a.matchDebut) {
      return b.matchDebut - a.matchDebut;
    }
    const prioriteA = obtenirPrioriteTypeRecherche(a.type);
    const prioriteB = obtenirPrioriteTypeRecherche(b.type);
    if (prioriteA !== prioriteB) {
      return prioriteA - prioriteB;
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
      const meta = construireResumeRecherche(resultat);
      const classePastille = `recherche-resultat-pastille-${echapperHtml(resultat.type || "acces")}`;
      const couleurPastille = echapperHtml(
        normaliserCouleurHex(
          resultat.couleurPastille || (resultat.type === "postes" ? "#2563eb" : resultat.type === "appareils" ? "#111111" : "#8b5cf6")
        )
      );
      if (resultat.type === "appareils") {
        const appareilsLignes =
          Array.isArray(resultat.appareilsLignesUniques) && resultat.appareilsLignesUniques.length
            ? resultat.appareilsLignesUniques
            : [{ code: resultat.sousTitre || "Appareil", contexte: "" }];
        const classeGroupe = appareilsLignes.length > 1 ? " recherche-appareil-groupe" : "";
        const lignesAppareils = appareilsLignes
          .map((ligne) => {
            const code = echapperHtml(ligne?.code || "Appareil");
            const contexte = echapperHtml(ligne?.contexte || "");
            const blocContexte = contexte ? `<span class="recherche-appareil-contexte">(${contexte})</span>` : "";
            const couleurLigne = echapperHtml(normaliserCouleurHex(ligne?.couleur || "#111111"));
            const blocHorsPatrimoine = ligne?.horsPatrimoine
              ? '<span class="recherche-appareil-hors-patrimoine">Hors patrimoine</span>'
              : "";
            return `<span class="recherche-appareil-ligne"><span class="recherche-appareil-ligne-principale"><span class="recherche-resultat-pastille recherche-resultat-pastille-ligne-appareil" style="background-color:${couleurLigne};"></span><span class="recherche-appareil-code">${code}</span>${blocContexte}</span>${blocHorsPatrimoine}</span>`;
          })
          .join("");
        return `<li><button class="recherche-resultat" type="button" data-index="${index}" data-type="${echapperHtml(resultat.type)}" data-lng="${resultat.longitude}" data-lat="${resultat.latitude}"><span class="recherche-resultat-titre"><span class="recherche-appareil-liste${classeGroupe}">${lignesAppareils}</span></span></button></li>`;
      }

      return `<li><button class="recherche-resultat" type="button" data-index="${index}" data-type="${echapperHtml(resultat.type)}" data-lng="${resultat.longitude}" data-lat="${resultat.latitude}"><span class="recherche-resultat-titre"><span class="recherche-resultat-pastille ${classePastille}" style="background-color:${couleurPastille};"></span>${titre}<span class="recherche-resultat-type-inline">${echapperHtml(meta)}</span></span></button></li>`;
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
  let temporisationAppuiLong = null;
  let survolCurseurPlanifie = false;
  let dernierPointCurseur = null;

  const recupererFeatureContexte = (point) => {
    if (!point) {
      return null;
    }
    const couchesDisponibles = couchesInteractives.filter((id) => Boolean(carte.getLayer(id)));
    if (!couchesDisponibles.length) {
      return null;
    }
    const objets = carte.queryRenderedFeatures(point, { layers: couchesDisponibles });
    return objets[0] || null;
  };

  carte.on("click", (event) => {
    fermerMenuContextuel();

    if (mesureActive) {
      ajouterPointMesure(event.lngLat.lng, event.lngLat.lat);
      return;
    }

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

    if (!ouvrirPopupAvecAnimationDepuisObjets(objets)) {
      ouvrirPopupDepuisObjetsCarte(objets);
    }
  });

  carte.on("contextmenu", (event) => {
    event.originalEvent?.preventDefault?.();
    fermerPopupCarte();
    const featureContexte = recupererFeatureContexte(event.point);
    ouvrirMenuContextuel(event, featureContexte);
  });

  carte.on("touchstart", (event) => {
    if (!event.lngLat) {
      return;
    }
    const touches = event.originalEvent?.touches;
    if (touches && touches.length > 1) {
      return;
    }
    temporisationAppuiLong = setTimeout(() => {
      const featureContexte = recupererFeatureContexte(event.point);
      ouvrirMenuContextuel(event, featureContexte);
    }, DUREE_APPUI_LONG_MENU_CONTEXTUEL_MS);
  });

  carte.on("touchend", () => {
    if (temporisationAppuiLong) {
      clearTimeout(temporisationAppuiLong);
      temporisationAppuiLong = null;
    }
  });

  carte.on("touchcancel", () => {
    if (temporisationAppuiLong) {
      clearTimeout(temporisationAppuiLong);
      temporisationAppuiLong = null;
    }
  });

  carte.on("touchmove", () => {
    if (temporisationAppuiLong) {
      clearTimeout(temporisationAppuiLong);
      temporisationAppuiLong = null;
    }
  });

  carte.on("mousemove", (event) => {
    dernierPointCurseur = event.point;
    if (survolCurseurPlanifie) {
      return;
    }
    survolCurseurPlanifie = true;
    window.requestAnimationFrame(() => {
      survolCurseurPlanifie = false;
      const couchesDisponibles = couchesInteractives.filter((id) => Boolean(carte.getLayer(id)));
      if (!couchesDisponibles.length || !dernierPointCurseur) {
        carte.getCanvas().style.cursor = "";
        return;
      }
      const objets = carte.queryRenderedFeatures(dernierPointCurseur, {
        layers: couchesDisponibles
      });
      carte.getCanvas().style.cursor = objets.length ? "pointer" : "";
    });
  });

  carte.on("movestart", () => {
    fermerMenuContextuel();
    if (!recadragePopupMobileEnCours && !navigationPopupProgrammatiqueEnCours && !conserverFichePendantNavigation) {
      if (popupCarte) {
        debugRechercheFiche("Fermeture fiche sur movestart", {
          phase: "movestart",
          raison: "fermeture automatique activée",
          alerteMobile: true
        });
      }
      fermerPopupCarte();
    }
  });

  carte.on("zoomstart", () => {
    fermerMenuContextuel();
  });

  carte.on("dragstart", () => {
    fermerMenuContextuel();
  });

  carte.on("rotatestart", () => {
    fermerMenuContextuel();
  });

  carte.on("pitchstart", () => {
    fermerMenuContextuel();
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

function extraireCoordonneesDepuisCollection(collection) {
  const coordonnees = [];
  for (const feature of collection?.features || []) {
    const [longitude, latitude] = feature?.geometry?.coordinates || [];
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }
    coordonnees.push([longitude, latitude]);
  }
  return coordonnees;
}

function obtenirCoordonneesCadrageInitial() {
  const coordonnees = [];

  if (afficherAcces) {
    coordonnees.push(...extraireCoordonneesDepuisCollection(donneesAcces));
  }
  if (afficherPostes) {
    coordonnees.push(...extraireCoordonneesDepuisCollection(donneesPostes));
  }
  if (afficherAppareils) {
    coordonnees.push(...extraireCoordonneesDepuisCollection(donneesAppareils));
  }

  return coordonnees;
}

function cadrerCarteSurDonneesInitiales() {
  const coordonnees = obtenirCoordonneesCadrageInitial();
  if (!coordonnees.length) {
    return;
  }

  if (coordonnees.length === 1) {
    carte.flyTo({
      center: coordonnees[0],
      zoom: Math.max(carte.getZoom(), 12),
      speed: 1.1,
      curve: 1.2,
      essential: true
    });
    return;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [longitude, latitude] of coordonnees) {
    if (longitude < minLng) {
      minLng = longitude;
    }
    if (latitude < minLat) {
      minLat = latitude;
    }
    if (longitude > maxLng) {
      maxLng = longitude;
    }
    if (latitude > maxLat) {
      maxLat = latitude;
    }
  }

  carte.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat]
    ],
    {
      padding: {
        top: 86,
        right: 64,
        bottom: 78,
        left: 64
      },
      maxZoom: 10.8,
      duration: 850,
      essential: true
    }
  );
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

function gererStyleCharge() {
  restaurerEtatFiltres();
  restaurerAffichageDonnees();
  rafraichirAffichageMesure();
}

carte.on("style.load", gererStyleCharge);
carte.once("load", lancerInitialisationDonneesSiNecessaire);

if (carte.isStyleLoaded()) {
  gererStyleCharge();
}
if (carte.loaded()) {
  lancerInitialisationDonneesSiNecessaire();
}
bloquerZoomTactileHorsCarte();

carte.on("styledata", () => {
  if (!(afficherAppareils || afficherAcces || afficherPostes || afficherLignes || afficherVitesseLigne)) {
    return;
  }
  if (!carte.isStyleLoaded()) {
    return;
  }
  if (restaurationStylePlanifiee) {
    return;
  }
  restaurationStylePlanifiee = true;
  window.requestAnimationFrame(() => {
    restaurationStylePlanifiee = false;
    if (!carte.isStyleLoaded()) {
      return;
    }
    restaurerEtatFiltres();
    restaurerAffichageDonnees();
  });
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

if (caseLignes) {
  caseLignes.addEventListener("change", () => {
    afficherLignes = caseLignes.checked;
    if (afficherLignes) {
      afficherVitesseLigne = false;
      if (caseVitesseLigne) {
        caseVitesseLigne.checked = false;
      }
      masquerMessageInfoVitesseLigne();
      if (temporisationInfoVitesse) {
        clearTimeout(temporisationInfoVitesse);
        temporisationInfoVitesse = null;
      }
    }
    appliquerCouchesDonnees();
    remonterCouchesDonnees();
  });
}

if (caseVitesseLigne) {
  caseVitesseLigne.addEventListener("change", () => {
    afficherVitesseLigne = caseVitesseLigne.checked;
    if (afficherVitesseLigne) {
      afficherLignes = false;
      if (caseLignes) {
        caseLignes.checked = false;
      }
      afficherMessageInfoVitesseLigne();
    } else {
      masquerMessageInfoVitesseLigne();
      if (temporisationInfoVitesse) {
        clearTimeout(temporisationInfoVitesse);
        temporisationInfoVitesse = null;
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
  cadrerCarteSurDonneesInitiales();
}

function lancerInitialisationDonneesSiNecessaire() {
  if (initialisationDonneesLancee) {
    return;
  }
  initialisationDonneesLancee = true;
  const demarrer = () => {
    initialiserDonneesParDefaut().catch((erreur) => {
      console.error("Impossible d'initialiser les donnees au demarrage", erreur);
    });
  };

  // Laisse le fond de carte prioritaire au premier affichage.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(demarrer, { timeout: 1200 });
    return;
  }

  window.setTimeout(demarrer, DELAI_DEMARRAGE_DONNEES_MS);
}

boutonFiltres.addEventListener("click", (event) => {
  event.stopPropagation();
  fermerMenuFonds();
  basculerMenuFiltres();
});

if (boutonItineraire) {
  boutonItineraire.addEventListener("click", async (event) => {
    event.stopPropagation();
    try {
      const module = await obtenirModuleItineraire();
      module?.ouvrir?.();
    } catch (erreur) {
      console.error("Impossible d'ouvrir le module itinéraire", erreur);
      alert("Impossible d'ouvrir le calcul d'itinéraire.");
    }
  });
}

if (boutonLocaliserCarte) {
  boutonLocaliserCarte.addEventListener("click", (event) => {
    event.stopPropagation();
    localiserUtilisateurCarte();
  });
}

if (boutonInfoCarte) {
  boutonInfoCarte.addEventListener("click", (event) => {
    event.stopPropagation();
    fermerMenuFonds();
    fermerMenuFiltres();
    fermerResultatsRecherche();
    fermerMenuContextuel();
    basculerMenuLegende();
  });
}

if (boutonFermerLegende) {
  boutonFermerLegende.addEventListener("click", () => {
    fermerMenuLegende();
  });
}

document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("#modal-fiche-fermer")) {
    fermerPopupCarte({ localiserPoint: true });
    return;
  }
  if (modalFiche && event.target === modalFiche) {
    fermerPopupCarte();
  }
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

      // Sur mobile, le blur du champ peut déclencher un petit mouvement de viewport:
      // on garde la fiche ouverte pendant toute la séquence "ouvrir puis zoom".
      conserverFichePendantNavigation = true;
      fermerResultatsRecherche();
      champRecherche.blur();
      fermerMenuFiltres();
      fermerMenuFonds();

      const ouvertureOk = ouvrirPopupDepuisCoordonnees(longitude, latitude);
      if (!ouvertureOk) {
        const etat = collecterEtatDebugOuverturePopup(longitude, latitude);
        debugRechercheFiche("Echec ouverture fiche depuis recherche", {
          type,
          longitude,
          latitude,
          ...etat,
          alerteMobile: true
        });
        return;
      }
      debugRechercheFiche("Ouverture fiche OK depuis recherche", {
        phase: "search-click",
        type,
        longitude,
        latitude,
        raison: modalFiche?.classList.contains("est-visible") ? "modal visible" : "modal non visible"
      });
      setTimeout(() => {
        naviguerVersCoordonneesArrierePlan(longitude, latitude, {
          forceZoom: true,
          conserverPopupOuvert: true,
          zoomMin: 14.1,
          durationDouxMs: 430
        });
        debugRechercheFiche("Zoom arrière-plan lancé", {
          phase: "search-click",
          type,
          longitude,
          latitude
        });
      }, 40);
    } catch (erreur) {
      conserverFichePendantNavigation = false;
      console.error("Impossible d'ouvrir le resultat de recherche", erreur);
    }
  });
}

if (boutonCtxCoord) {
  boutonCtxCoord.addEventListener("click", async () => {
    const { latitude, longitude } = contexteMenuPosition;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    const texteCoordonnees = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(texteCoordonnees);
    } catch {
      window.prompt("Coordonnées :", texteCoordonnees);
    }
    fermerMenuContextuel();
  });
}

if (boutonCtxShare) {
  boutonCtxShare.addEventListener("click", async () => {
    await partagerPositionContextuelle();
    fermerMenuContextuel();
  });
}

if (boutonCtxItin) {
  boutonCtxItin.addEventListener("click", () => {
    basculerSousMenuItineraire();
  });
}

if (boutonCtxGoogleItin) {
  boutonCtxGoogleItin.addEventListener("click", () => {
    const { latitude, longitude } = contexteMenuPosition;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, "_blank", "noopener");
    fermerMenuContextuel();
  });
}

if (boutonCtxWaze) {
  boutonCtxWaze.addEventListener("click", () => {
    const { latitude, longitude } = contexteMenuPosition;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    window.open(`https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`, "_blank", "noopener");
    fermerMenuContextuel();
  });
}

if (boutonCtxApple) {
  if (!/iPhone|iPad|Macintosh/i.test(navigator.userAgent)) {
    boutonCtxApple.style.display = "none";
  }

  boutonCtxApple.addEventListener("click", () => {
    const { latitude, longitude } = contexteMenuPosition;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    window.open(`http://maps.apple.com/?daddr=${latitude},${longitude}`, "_blank", "noopener");
    fermerMenuContextuel();
  });
}

if (boutonCtxRegle) {
  boutonCtxRegle.addEventListener("click", () => {
    if (mesureActive) {
      quitterModeMesure();
      fermerMenuContextuel();
      return;
    }
    activerModeMesure();
    fermerPopupCarte();
    fermerMenuContextuel();
  });
}

if (boutonSortieMesure) {
  boutonSortieMesure.addEventListener("click", () => {
    quitterModeMesure();
  });
}

if (boutonCtxGoogleMarker) {
  boutonCtxGoogleMarker.addEventListener("click", () => {
    const { latitude, longitude } = contexteMenuPosition;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, "_blank", "noopener");
    fermerMenuContextuel();
  });
}

if (boutonCtxStreet) {
  boutonCtxStreet.addEventListener("click", () => {
    const { latitude, longitude } = contexteMenuPosition;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    window.open(
      `https://www.google.com/maps?q=&layer=c&cbll=${latitude},${longitude}`,
      "_blank",
      "noopener"
    );
    fermerMenuContextuel();
  });
}

if (boutonCtxImajnet) {
  boutonCtxImajnet.addEventListener("click", () => {
    window.open(obtenirLienImajnetDepuisContexte(), "_blank", "noopener");
    fermerMenuContextuel();
  });
}

if (boutonCtxAjoutAppareil) {
  boutonCtxAjoutAppareil.addEventListener("click", () => {
    const { latitude, longitude } = contexteMenuPosition;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    const sujet = encodeURIComponent("➕ Ajout d'un appareil");
    const corps = encodeURIComponent(
      `Bonjour Arnaud,\n\nMerci d'ajouter l'appareil : (à préciser)\nau poste de (à préciser, si poste, sat) :\n\nExiste-t-il d’autres appareils sur le même support ? (si oui, précisez)\n\nCoordonnées GPS :\nLatitude : ${latitude}\nLongitude : ${longitude}\n\n📍 Lien Google Maps :\nhttps://www.google.com/maps?q=${latitude},${longitude}\n\nBonne journée,`
    );
    window.location.href = `mailto:arnaud.debaecker@sncf.fr?subject=${sujet}&body=${corps}`;
    fermerMenuContextuel();
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

  if (menuContextuelCarte && !menuContextuelCarte.contains(event.target)) {
    fermerMenuContextuel();
  }

  const clicDansLegende = menuLegendeCarte?.contains(event.target);
  const clicDansControleActions = conteneurControleActionsCarte?.contains(event.target);
  if (!clicDansLegende && !clicDansControleActions) {
    fermerMenuLegende();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    fermerPopupCarte();
    fermerFenetreAccueil();
    fermerMenuFonds();
    fermerMenuFiltres();
    fermerResultatsRecherche();
    fermerMenuContextuel();
    fermerMenuLegende();
    if (mesureActive || mesurePoints.length) {
      quitterModeMesure();
    }
  }
});
