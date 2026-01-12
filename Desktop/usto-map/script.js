let map, allLocations = [], markerLayer, routingControl;
let suggestionMode = false;
let currentTarget = null; // For Navigation
let selectedCoords = null; // Specifically for the Form/Add Place
let tempSelectionMarker = null; 

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
        // Create or move the visual marker where user clicks
        if (tempSelectionMarker) {
            tempSelectionMarker.setLatLng(e.latlng);
        } else {
            tempSelectionMarker = L.marker(e.latlng).addTo(map);
        }

        if (suggestionMode) {
            // Update the form-specific coordinates
            selectedCoords = e.latlng;
            document.getElementById('suggCoordsDisplay').innerHTML = 
                `📍 Selected: ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
        } else {
            // Update the navigation-specific coordinates
            currentTarget = { lat: e.latlng.lat, lng: e.latlng.lng, name: "Custom Spot" };
            showToast("Destination set!");
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
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e); 
            currentTarget = { lat: loc.coords[0], lng: loc.coords[1], name: loc.name };
            if(tempSelectionMarker) map.removeLayer(tempSelectionMarker);
            showToast("Selected: " + loc.name);
        });
        marker.bindPopup(`<strong>${loc.name}</strong><br><button onclick="getDirectionsTo(${loc.coords[0]}, ${loc.coords[1]})" class="primary-btn" style="padding:5px;">Go</button>`);
        markerLayer.addLayer(marker);
    });
}

function getDirectionsTo(lat, lng) {
    if (navigator.geolocation) {
        showToast("📍 Accessing GPS...");
        navigator.geolocation.getCurrentPosition(pos => {
            drawRoute(L.latLng(pos.coords.latitude, pos.coords.longitude), L.latLng(lat, lng));
        }, () => showToast("❌ GPS Error. Enable location."));
    }
}

function startPathFromCurrentLocation() {
    if (currentTarget) getDirectionsTo(currentTarget.lat, currentTarget.lng);
    else showToast("👉 Click anywhere on the map first!");
}

function drawRoute(start, end) {
    if (routingControl) map.removeControl(routingControl);
    routingControl = L.Routing.control({
        waypoints: [start, end],
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'foot' }),
        addWaypoints: false, show: false,
        lineOptions: { styles: [{ color: '#2563eb', weight: 6 }] }
    }).addTo(map);
    document.getElementById('clearBtn').style.display = 'block';
}

function openModal() { 
    document.getElementById('suggestion-modal').style.display = 'flex'; 
    suggestionMode = true; 
    selectedCoords = null; // Reset when opening
    document.getElementById('suggCoordsDisplay').innerHTML = "Click on map to pick location";
}

function closeModal() { 
    document.getElementById('suggestion-modal').style.display = 'none'; 
    suggestionMode = false; 
    if(tempSelectionMarker) map.removeLayer(tempSelectionMarker);
    tempSelectionMarker = null;
}

function sendSuggestion() {
    const name = document.getElementById('suggName').value;
    // CRITICAL FIX: Checking selectedCoords specifically
    if (!name || !selectedCoords) { 
        showToast("⚠️ Enter name AND click map!"); 
        return; 
    }
    
    const payload = { 
        name: name, 
        latitude: selectedCoords.lat, 
        longitude: selectedCoords.lng 
    };

    fetch("https://formspree.io/f/mdaanqev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(() => { 
        showToast("✅ Suggestion sent to admin!"); 
        document.getElementById('suggName').value = ""; // Clear input
        closeModal(); 
    }).catch(() => showToast("❌ Error sending."));
}

function showToast(msg) {
    const t = document.createElement("div"); t.className = "toast-message show";
    t.innerHTML = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function clearMap() { 
    if (routingControl) map.removeControl(routingControl); 
    if (tempSelectionMarker) map.removeLayer(tempSelectionMarker);
    document.getElementById('clearBtn').style.display = 'none'; 
    currentTarget = null;
    tempSelectionMarker = null;
}

initMap();