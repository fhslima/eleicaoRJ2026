const numberFormat = new Intl.NumberFormat("pt-BR");
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
const votesByName = new Map(window.voteRows.map(([name, eduardo, douglas, garotinho]) => [normalize(name), { name, eduardo, douglas, garotinho }]));
const totals = window.voteRows.reduce((sum, [, eduardo, douglas, garotinho]) => ({ eduardo: sum.eduardo + eduardo, douglas: sum.douglas + douglas, garotinho: sum.garotinho + garotinho }), { eduardo: 0, douglas: 0, garotinho: 0 });
const map = L.map("map", { zoomControl: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, dragging: true, tap: true, zoomSnap: 0.25, zoomDelta: 0.25 }).setView([-22.35, -42.65], 7);
L.control.zoom({ position: "bottomright" }).addTo(map);
const geojsonUrl = "https://servicodados.ibge.gov.br/api/v3/malhas/estados/33?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio";
const namesUrl = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/33/municipios";
const nameByCode = new Map();
const featureByName = new Map();
const detailPanel = document.querySelector("#detail-panel");
let selectedLayer = null;
let allLayers = [];

function fillTotals() {
  document.querySelector("#total-eduardo").textContent = numberFormat.format(totals.eduardo);
  document.querySelector("#total-douglas").textContent = numberFormat.format(totals.douglas);
  document.querySelector("#total-garotinho").textContent = numberFormat.format(totals.garotinho);
}

function winnerFor(votes) {
  const winner = votes.eduardo > votes.douglas ? "eduardo" : "douglas";
  const share = votes[winner] / (votes.eduardo + votes.douglas + votes.garotinho);
  return { winner, share };
}

function fillDetail(votes) {
  const { winner, share } = winnerFor(votes);
  detailPanel.querySelector(".detail-default").hidden = true;
  detailPanel.querySelector(".detail-content").hidden = false;
  document.querySelector("#detail-name").textContent = votes.name;
  document.querySelector("#winner-mark").className = `winner-mark ${winner}`;
  document.querySelector("#winner-name").textContent = winner === "eduardo" ? "Eduardo Paes" : "Douglas Ruas";
  document.querySelector("#winner-share").textContent = `${(share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  document.querySelector("#detail-eduardo").textContent = numberFormat.format(votes.eduardo);
  document.querySelector("#detail-douglas").textContent = numberFormat.format(votes.douglas);
  document.querySelector("#detail-garotinho").textContent = numberFormat.format(votes.garotinho);
}

function blend(hex, amount) {
  const base = ["#e2aa16", "#1767ad"].map(color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)));
  const target = base[amount.winner === "eduardo" ? 0 : 1];
  const strength = 0.28 + ((amount.share - 0.5) / 0.5) * 0.72;
  const paper = [246, 244, 237];
  return `rgb(${target.map((channel, index) => Math.round(paper[index] + (channel - paper[index]) * strength)).join(",")})`;
}

function featureStyle(votes, feature) {
  if (!votes) return { color: "#aab3ad", weight: 1, fillColor: "#e8e6df", fillOpacity: 0.9 };
  const result = winnerFor(votes);
  return {
    color: selectedLayer?.feature === feature ? "#142b36" : "#fffdf8",
    weight: selectedLayer?.feature === feature ? 2.2 : 1.15,
    fillColor: blend(null, result),
    fillOpacity: 1
  };
}

function selectLayer(layer, votes) {
  if (selectedLayer && selectedLayer !== layer) selectedLayer.setStyle(featureStyle(selectedLayer.votes, selectedLayer.feature));
  selectedLayer = layer;
  selectedLayer.votes = votes;
  layer.setStyle({ ...featureStyle(votes, layer.feature), color: "#142b36", weight: 2.2 });
  layer.bringToFront();
  fillDetail(votes);
}

function municipalityName(feature) {
  return nameByCode.get(String(feature.properties.codarea)) || feature.properties.name || "";
}

function onEachFeature(feature, layer) {
  const name = municipalityName(feature);
  const votes = votesByName.get(normalize(name));
  layer.featureName = name;
  layer.votes = votes;
  if (votes) featureByName.set(normalize(name), layer);
  layer.bindTooltip(name || "Município sem correspondência", { sticky: true, direction: "top", className: "map-tooltip" });
  layer.on({
    mouseover: () => { if (votes) selectLayer(layer, votes); },
    click: () => { if (votes) selectLayer(layer, votes); },
    focus: () => { if (votes) selectLayer(layer, votes); }
  });
}

function applySearch() {
  const query = normalize(document.querySelector("#municipality-search").value.trim());
  allLayers.forEach(layer => {
    const visible = !query || normalize(layer.featureName).includes(query);
    layer.setStyle({ opacity: visible ? 1 : 0.12, fillOpacity: visible ? 1 : 0.12 });
  });
  const firstMatch = allLayers.find(layer => query && normalize(layer.featureName).startsWith(query));
  if (firstMatch) {
    const bounds = firstMatch.getBounds();
    map.fitBounds(bounds, { maxZoom: 10, padding: [30, 30] });
    if (firstMatch.votes) selectLayer(firstMatch, firstMatch.votes);
  }
}

document.querySelector("#municipality-search").addEventListener("input", applySearch);
document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.querySelector("#municipality-search").focus();
  }
  if (event.key === "Escape") {
    document.querySelector("#municipality-search").value = "";
    applySearch();
  }
});
fillTotals();

Promise.all([fetch(geojsonUrl).then(response => { if (!response.ok) throw new Error("Não foi possível obter os limites do IBGE."); return response.json(); }), fetch(namesUrl).then(response => { if (!response.ok) throw new Error("Não foi possível obter os nomes dos municípios."); return response.json(); })])
  .then(([geometry, municipalities]) => {
    municipalities.forEach(municipality => nameByCode.set(String(municipality.id), municipality.nome));
    const geoLayer = L.geoJSON(geometry, { style: feature => featureStyle(votesByName.get(normalize(municipalityName(feature))), feature), onEachFeature }).addTo(map);
    allLayers = [];
    geoLayer.eachLayer(layer => allLayers.push(layer));
    map.fitBounds(geoLayer.getBounds(), { padding: [24, 24] });
    const matched = featureByName.size;
    document.querySelector("#map-count").textContent = `${matched} de ${window.voteRows.length} municípios`;
    const message = document.querySelector("#map-message");
    if (matched !== window.voteRows.length) message.textContent = `Mapa carregado; ${matched} de ${window.voteRows.length} municípios foram associados aos dados.`;
    else message.remove();
  })
  .catch(error => {
    const message = document.querySelector("#map-message");
    message.textContent = `${error.message} Verifique sua conexão e recarregue a página.`;
    message.classList.add("is-error");
  });
