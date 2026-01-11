let map, allLocations = [], markerLayer, routingControl, userMarker;
let selectedCoords = null;
let suggestionMode = false;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([35.708026, -0.578963], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);

    fetch('data.json')
        .then(res => res.json())
        .then(data => {
            allLocations = data.locations;
            renderMarkers(allLocations);
        });

    map.on('click', function(e) {
        if (suggestionMode) {
            selectedCoords = e.latlng;
            document.getElementById('suggCoordsDisplay').innerHTML = 
                `<i class="fa fa-check-circle"></i> Spot Selected: ${selectedCoords.lat.toFixed(6)}, ${selectedCoords.lng.toFixed(6)}`;
            L.marker(e.latlng).addTo(map).bindPopup("Suggested Spot").openPopup();
        }
    });
}

function renderMarkers(locations) {
    markerLayer.clearLayers();
    locations.forEach(loc => {
        const customIcon = L.divIcon({
            className: 'custom-pin',
            html: `<div style="background-color: ${loc.markerColor};" class="pin-circle"><i class="fa fa-${loc.icon || 'map-marker-alt'}" style="color: white;"></i></div><div style="border-top-color: ${loc.markerColor};" class="pin-arrow"></div>`,
            iconSize: [30, 42], iconAnchor: [15, 42]
        });

        const marker = L.marker(loc.coords, { icon: customIcon });
        const popupContent = `
            <div style="text-align: center;">
                <strong style="font-size: 14px;">${loc.name}</strong>
                <p style="font-size: 12px; color: #666;">${loc.desc || ''}</p>
                <button onclick="getDirectionsTo(${loc.coords[0]}, ${loc.coords[1]})" class="primary-btn" style="padding: 5px; font-size: 12px;">Go Here</button>
            </div>`;
        marker.bindPopup(popupContent);
        markerLayer.addLayer(marker);
    });
}

function getDirectionsTo(lat, lng) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            drawRoute(L.latLng(pos.coords.latitude, pos.coords.longitude), L.latLng(lat, lng));
        }, () => showToast("GPS error. Check permissions."));
    }
}

function drawRoute(start, end) {
    if (routingControl) map.removeControl(routingControl);
    routingControl = L.Routing.control({
        waypoints: [start, end],
        router: L.Routing.osrmv1({ 
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'foot' // TRÈS IMPORTANT: Walking logic
        }),
        addWaypoints: false, show: false,
        lineOptions: { styles: [{ color: '#2563eb', weight: 6 }] }
    }).addTo(map);
    document.getElementById('clearBtn').style.display = 'block';
}

function sendSuggestion() {
    const name = document.getElementById('suggName').value;
    const cat = document.getElementById('suggCat').value;
    if (!name || !selectedCoords) { showToast("Click the map and enter a name!"); return; }

    const data = {
        name: name, category: cat,
        coords: [selectedCoords.lat, selectedCoords.lng]
    };

    // Replaces the visible email with a private form submission
    fetch("https://formspree.io/f/mdaanqev", { // Change YOUR_ID_HERE to your Formspree ID
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).then(res => {
        if(res.ok) { showToast("✅ Sent to admin!"); closeModal(); }
    });
}

function showToast(msg) {
    const t = document.createElement("div"); t.className = "toast-message show";
    t.innerHTML = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

function openModal() { document.getElementById('suggestion-modal').style.display = 'flex'; suggestionMode = true; }
function closeModal() { document.getElementById('suggestion-modal').style.display = 'none'; suggestionMode = false; }
function clearMap() { if (routingControl) map.removeControl(routingControl); document.getElementById('clearBtn').style.display = 'none'; }
function searchMap() { const q = document.getElementById('searchInput').value.toLowerCase(); renderMarkers(allLocations.filter(l => l.name.toLowerCase().includes(q))); }
function filterMap(cat) { renderMarkers(cat === 'all' ? allLocations : allLocations.filter(l => l.category === cat)); }

initMap();