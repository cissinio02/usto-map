// ========== VARIABLES GLOBALES ==========
let map, allLocations = [], markerLayer, routingControl;
let suggestionMode = false;
let currentTarget = null;
let selectedCoords = null;
let tempSelectionMarker = null;
let watchId = null;
let userMarker = null;
let isNavigating = false;
let lastKnownPosition = null;
let distanceCheckInterval = null;
let currentMapStyle = 'street';
let filteredCategory = 'all';

// Configuration
const ARRIVAL_THRESHOLD = 25; // mètres pour considérer "arrivé"
const UPDATE_INTERVAL = 2000; // ms entre calculs de distance
const USE_CAMPUS_MODE = true; // MODE CAMPUS : lignes droites au lieu de routes

// Styles de carte disponibles
const mapStyles = {
    street: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap'
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '© Esri'
    },
    topo: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '© OpenTopoMap'
    }
};

let currentTileLayer;
let campusRouteLine = null; // Pour la ligne directe campus

// ========== INITIALISATION DE LA CARTE ==========
function initMap() {
    map = L.map('map', { 
        zoomControl: false,
        attributionControl: false 
    }).setView([35.708026, -0.578963], 17);
    
    // Couche de tuiles initiale
    currentTileLayer = L.tileLayer(mapStyles.street.url, {
        attribution: mapStyles.street.attribution,
        maxZoom: 19
    }).addTo(map);
    
    // Contrôles de zoom
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    // Couche pour les marqueurs
    markerLayer = L.layerGroup().addTo(map);

    // Charger les données
    loadLocations();

    // Gestion des clics sur la carte
    map.on('click', handleMapClick);
    
    // Désactiver le menu contextuel (clic droit)
    map.on('contextmenu', function(e) {
        L.DomEvent.preventDefault(e);
    });

    // Obtenir la position initiale
    getCurrentLocation();
    
    // Vérifier la connexion
    updateConnectionStatus();
}

// ========== CHARGEMENT DES LIEUX ==========
function loadLocations() {
    fetch('data.json')
        .then(res => {
            if (!res.ok) throw new Error('Erreur chargement données');
            return res.json();
        })
        .then(data => {
            allLocations = data.locations;
            renderMarkers(allLocations);
            updateLocationCount(allLocations.length);
            showToast("📍 " + allLocations.length + " lieux chargés");
        })
        .catch(err => {
            console.error(err);
            showToast("⚠️ Erreur: Impossible de charger les lieux");
            updateConnectionStatus(false);
        });
}

// ========== GESTION DES CLICS ==========
function handleMapClick(e) {
    // Créer ou déplacer le marqueur temporaire
    if (tempSelectionMarker) {
        tempSelectionMarker.setLatLng(e.latlng);
    } else {
        tempSelectionMarker = L.marker(e.latlng, {
            icon: L.divIcon({
                className: 'temp-marker',
                html: '<div style="background: #ef4444; width: 22px; height: 22px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 10px rgba(239, 68, 68, 0.5); animation: pulse 1.5s infinite;"></div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            })
        }).addTo(map);
    }

    if (suggestionMode) {
        selectedCoords = e.latlng;
        document.getElementById('suggCoordsDisplay').innerHTML = 
            `✅ Sélectionné: ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    } else {
        currentTarget = { 
            lat: e.latlng.lat, 
            lng: e.latlng.lng, 
            name: "Point personnalisé" 
        };
        showToast("🎯 Destination définie!");
        if (navigator.vibrate) navigator.vibrate(50);
    }
}

// ========== RENDU DES MARQUEURS ==========
function renderMarkers(locations) {
    markerLayer.clearLayers();
    
    locations.forEach(loc => {
        const customIcon = L.divIcon({
            className: 'custom-pin',
            html: `<div style="background-color: ${loc.markerColor};" class="pin-circle">
                    <i class="fa fa-${loc.icon || 'map-marker-alt'}" style="color: white;"></i>
                   </div>
                   <div style="border-top-color: ${loc.markerColor};" class="pin-arrow"></div>`,
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        });

        const marker = L.marker(loc.coords, { icon: customIcon });
        
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            selectLocation(loc);
        });
        
        const popupContent = createPopupContent(loc);
        marker.bindPopup(popupContent, {
            maxWidth: 250,
            className: 'custom-popup'
        });
        
        markerLayer.addLayer(marker);
    });
}

// ========== CRÉATION DU CONTENU POPUP ==========
function createPopupContent(loc) {
    return `
        <div style="text-align: center; min-width: 150px;">
            <div style="background: ${loc.markerColor}; color: white; padding: 8px; border-radius: 8px 8px 0 0; margin: -10px -10px 10px -10px;">
                <strong style="font-size: 15px;">${loc.name}</strong>
            </div>
            ${loc.desc ? `<p style="margin: 10px 0; font-size: 12px; color: #64748b; line-height: 1.4;">${loc.desc}</p>` : ''}
            <button onclick="getDirectionsTo(${loc.coords[0]}, ${loc.coords[1]}, '${loc.name.replace(/'/g, "\\'")}')" 
                    class="primary-btn" 
                    style="padding: 10px 18px; margin-top: 8px; width: 100%; font-size: 13px;">
                <i class="fa fa-route"></i> Y aller
            </button>
        </div>
    `;
}

// ========== SÉLECTION D'UN LIEU ==========
function selectLocation(loc) {
    currentTarget = { 
        lat: loc.coords[0], 
        lng: loc.coords[1], 
        name: loc.name 
    };
    
    if (tempSelectionMarker) {
        map.removeLayer(tempSelectionMarker);
        tempSelectionMarker = null;
    }
    
    showToast("✅ Sélectionné: " + loc.name);
    if (navigator.vibrate) navigator.vibrate(50);
}

// ========== NAVIGATION VERS UN LIEU ==========
function getDirectionsTo(lat, lng, name = "Destination") {
    if (!navigator.geolocation) {
        showToast("❌ GPS non disponible sur cet appareil");
        return;
    }
    
    showToast("📍 Localisation GPS en cours...");
    
    navigator.geolocation.getCurrentPosition(pos => {
        currentTarget = { lat: lat, lng: lng, name: name };
        
        if (USE_CAMPUS_MODE) {
            // Mode Campus : ligne droite
            drawCampusRoute(
                L.latLng(pos.coords.latitude, pos.coords.longitude), 
                L.latLng(lat, lng)
            );
        } else {
            // Mode classique : routes OSRM
            drawRoute(
                L.latLng(pos.coords.latitude, pos.coords.longitude), 
                L.latLng(lat, lng)
            );
        }
    }, (error) => {
        console.error("GPS Error:", error);
        showToast("❌ Erreur GPS. Vérifie que la localisation est activée.");
    }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
    });
}

// ========== OBTENIR POSITION ACTUELLE ==========
function getCurrentLocation() {
    if (!navigator.geolocation) return;
    
    navigator.geolocation.getCurrentPosition(pos => {
        lastKnownPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        };
        updateUserLocationOnMap(pos.coords.latitude, pos.coords.longitude);
        map.setView([pos.coords.latitude, pos.coords.longitude], 17);
    }, err => {
        console.log("Position initiale non disponible:", err);
    }, {
        enableHighAccuracy: true,
        timeout: 5000
    });
}

// ========== MISE À JOUR POSITION UTILISATEUR ==========
function updateUserLocationOnMap(lat, lng) {
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        const userIcon = L.divIcon({
            className: 'user-location-marker',
            html: `<div style="
                background: #3b82f6;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 0 0 2px #3b82f6, 0 2px 8px rgba(59, 130, 246, 0.4);
                animation: pulse 2s infinite;
            "></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
        
        userMarker = L.marker([lat, lng], { 
            icon: userIcon,
            zIndexOffset: 1000 
        }).addTo(map);
    }
    
    lastKnownPosition = { lat, lng };
}

// ========== NAVIGATION EN TEMPS RÉEL ==========
function startPathFromCurrentLocation() {
    if (!currentTarget) {
        showToast("👉 Sélectionne d'abord une destination!");
        return;
    }
    
    if (!navigator.geolocation) {
        showToast("📍 GPS non supporté par ton appareil");
        return;
    }

    // Arrêter toute navigation en cours
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }
    
    if (distanceCheckInterval) {
        clearInterval(distanceCheckInterval);
    }

    isNavigating = true;
    showToast("🚀 Navigation active vers " + currentTarget.name);
    
    // Afficher le panneau d'infos
    showNavigationPanel();

    // Tracking GPS en temps réel
    watchId = navigator.geolocation.watchPosition(position => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        updateUserLocationOnMap(userLat, userLng);

        if (currentTarget) {
            updateLiveRoute(userLat, userLng, currentTarget.lat, currentTarget.lng);
            checkArrival(userLat, userLng, currentTarget.lat, currentTarget.lng);
        }
    }, error => {
        console.error("GPS Error:", error);
        showToast("⚠️ Signal GPS faible");
    }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
    });

    // Vérification de distance périodique
    distanceCheckInterval = setInterval(() => {
        if (lastKnownPosition && currentTarget) {
            updateDistanceDisplay(
                lastKnownPosition.lat, 
                lastKnownPosition.lng, 
                currentTarget.lat, 
                currentTarget.lng
            );
        }
    }, UPDATE_INTERVAL);
}

// ========== MISE À JOUR ROUTE EN DIRECT ==========
function updateLiveRoute(startLat, startLng, endLat, endLng) {
    if (USE_CAMPUS_MODE) {
        // Mode Campus : mise à jour de la ligne droite
        if (campusRouteLine) {
            campusRouteLine.setLatLngs([
                L.latLng(startLat, startLng),
                L.latLng(endLat, endLng)
            ]);
        } else {
            drawCampusRoute(
                L.latLng(startLat, startLng),
                L.latLng(endLat, endLng)
            );
        }
        
        // Calculer et afficher distance + direction
        const distance = calculateDistance(startLat, startLng, endLat, endLng);
        const direction = getCardinalDirection(startLat, startLng, endLat, endLng);
        
        updateRouteInfo(distance, distance / 1.4); // Temps estimé
        updateDirectionIndicator(direction);
        
    } else {
        // Mode classique OSRM
        if (routingControl) {
            map.removeControl(routingControl);
        }

        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(startLat, startLng),
                L.latLng(endLat, endLng)
            ],
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: 'foot'
            }),
            lineOptions: {
                styles: [{ 
                    color: '#2563eb', 
                    weight: 6, 
                    opacity: 0.7,
                    dashArray: '10, 5'
                }],
                addWaypoints: false
            },
            createMarker: function() { return null; },
            addWaypoints: false,
            routeWhileDragging: false,
            show: false,
            fitSelectedRoutes: false
        }).on('routesfound', function(e) {
            const routes = e.routes;
            const summary = routes[0].summary;
            updateRouteInfo(summary.totalDistance, summary.totalTime);
        }).addTo(map);
    }

    // Centrer sur l'utilisateur avec animation
    map.panTo([startLat, startLng], { 
        animate: true, 
        duration: 0.5 
    });
}

// ========== MISE À JOUR INDICATEUR DE DIRECTION ==========
function updateDirectionIndicator(direction) {
    let indicator = document.getElementById('direction-indicator');
    
    if (!indicator) {
        const panel = document.getElementById('nav-panel');
        if (panel) {
            // Créer l'indicateur s'il n'existe pas
            const directionDiv = document.createElement('div');
            directionDiv.id = 'direction-indicator';
            directionDiv.style.cssText = `
                text-align: center;
                padding: 8px;
                background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
                border-radius: 12px;
                margin-top: 10px;
                font-size: 13px;
                font-weight: 600;
                color: #2563eb;
            `;
            panel.appendChild(directionDiv);
            indicator = directionDiv;
        }
    }
    
    if (indicator) {
        indicator.innerHTML = `🧭 Direction: ${direction}`;
    }
}

// ========== TRACER UN ITINÉRAIRE (MODE CAMPUS) ==========
function drawCampusRoute(start, end) {
    // Supprimer l'ancienne ligne
    if (campusRouteLine) {
        map.removeLayer(campusRouteLine);
    }
    
    // Tracer une ligne droite
    campusRouteLine = L.polyline([start, end], {
        color: '#2563eb',
        weight: 5,
        opacity: 0.8,
        dashArray: '10, 10',
        lineCap: 'round'
    }).addTo(map);
    
    // Ajouter des flèches directionnelles
    const decorator = L.polylineDecorator(campusRouteLine, {
        patterns: [
            {
                offset: '10%',
                repeat: 100,
                symbol: L.Symbol.arrowHead({
                    pixelSize: 12,
                    polygon: false,
                    pathOptions: { 
                        stroke: true,
                        color: '#2563eb',
                        weight: 3,
                        opacity: 0.8
                    }
                })
            }
        ]
    }).addTo(map);
    
    // Calculer distance et direction
    const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    const direction = getCardinalDirection(start.lat, start.lng, end.lat, end.lng);
    
    // Afficher les infos
    const distanceKm = (distance / 1000).toFixed(2);
    const distanceM = Math.round(distance);
    const timeEstimate = Math.round(distance / 1.4); // ~1.4 m/s vitesse de marche
    
    showToast(`📏 ${distanceM < 1000 ? distanceM + ' m' : distanceKm + ' km'} · 🧭 ${direction} · ⏱️ ${Math.ceil(timeEstimate / 60)} min`);
    
    // Zoomer pour voir le trajet complet
    map.fitBounds(campusRouteLine.getBounds(), { padding: [50, 50] });
    
    document.getElementById('clearBtn').style.display = 'block';
}

// ========== CALCULER LA DIRECTION CARDINALE ==========
function getCardinalDirection(lat1, lng1, lat2, lng2) {
    const dLng = lng2 - lng1;
    const dLat = lat2 - lat1;
    
    const angle = Math.atan2(dLng, dLat) * 180 / Math.PI;
    const normalized = (angle + 360) % 360;
    
    if (normalized >= 337.5 || normalized < 22.5) return "Nord ⬆️";
    if (normalized >= 22.5 && normalized < 67.5) return "Nord-Est ↗️";
    if (normalized >= 67.5 && normalized < 112.5) return "Est ➡️";
    if (normalized >= 112.5 && normalized < 157.5) return "Sud-Est ↘️";
    if (normalized >= 157.5 && normalized < 202.5) return "Sud ⬇️";
    if (normalized >= 202.5 && normalized < 247.5) return "Sud-Ouest ↙️";
    if (normalized >= 247.5 && normalized < 292.5) return "Ouest ⬅️";
    if (normalized >= 292.5 && normalized < 337.5) return "Nord-Ouest ↖️";
    
    return "Direction inconnue";
}

// ========== TRACER UN ITINÉRAIRE (MODE ROUTE CLASSIQUE) ==========
function drawRoute(start, end) {
    if (routingControl) map.removeControl(routingControl);
    
    routingControl = L.Routing.control({
        waypoints: [start, end],
        router: L.Routing.osrmv1({ 
            serviceUrl: 'https://router.project-osrm.org/route/v1', 
            profile: 'foot' 
        }),
        addWaypoints: false,
        show: false,
        lineOptions: { 
            styles: [{ 
                color: '#2563eb', 
                weight: 6,
                opacity: 0.7 
            }] 
        }
    }).on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        const distance = (summary.totalDistance / 1000).toFixed(2);
        const time = Math.round(summary.totalTime / 60);
        showToast(`📏 ${distance} km · ⏱️ ${time} min`);
    }).addTo(map);
    
    document.getElementById('clearBtn').style.display = 'block';
}

// ========== CALCUL DE DISTANCE ==========
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance en mètres
}

// ========== VÉRIFICATION D'ARRIVÉE ==========
function checkArrival(userLat, userLng, targetLat, targetLng) {
    const distance = calculateDistance(userLat, userLng, targetLat, targetLng);
    
    if (distance < ARRIVAL_THRESHOLD) {
        stopNavigation();
        showToast("🎉 Arrivé à destination!");
        
        // Vibration longue pour arrivée
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
        }
        
        // Animation de célébration
        celebrateArrival();
    }
}

// ========== MISE À JOUR AFFICHAGE DISTANCE ==========
function updateDistanceDisplay(userLat, userLng, targetLat, targetLng) {
    const distance = calculateDistance(userLat, userLng, targetLat, targetLng);
    const distanceEl = document.getElementById('distance-info');
    
    if (distanceEl) {
        if (distance < 1000) {
            distanceEl.textContent = `${Math.round(distance)} m`;
        } else {
            distanceEl.textContent = `${(distance / 1000).toFixed(2)} km`;
        }
    }
}

// ========== MISE À JOUR INFOS ROUTE ==========
function updateRouteInfo(distance, time) {
    const distanceEl = document.getElementById('distance-info');
    const timeEl = document.getElementById('time-info');
    
    if (distanceEl) {
        if (distance < 1000) {
            distanceEl.textContent = `${Math.round(distance)} m`;
        } else {
            distanceEl.textContent = `${(distance / 1000).toFixed(2)} km`;
        }
    }
    
    if (timeEl) {
        const minutes = Math.round(time / 60);
        timeEl.textContent = `${minutes} min`;
    }
}

// ========== PANNEAU DE NAVIGATION ==========
function showNavigationPanel() {
    let panel = document.getElementById('nav-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'nav-panel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 15px 25px;
            border-radius: 25px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.25);
            z-index: 1000;
            display: flex;
            gap: 20px;
            align-items: center;
            font-family: 'Segoe UI', sans-serif;
            animation: slideDown 0.4s ease;
        `;
        
        panel.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Distance</div>
                <div id="distance-info" style="font-size: 22px; font-weight: 700; color: #2563eb;">-- m</div>
            </div>
            <div style="width: 1px; height: 40px; background: linear-gradient(to bottom, transparent, #e2e8f0, transparent);"></div>
            <div style="text-align: center;">
                <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Temps</div>
                <div id="time-info" style="font-size: 22px; font-weight: 700; color: #10b981;">-- min</div>
            </div>
            <div style="width: 1px; height: 40px; background: linear-gradient(to bottom, transparent, #e2e8f0, transparent);"></div>
            <button onclick="stopNavigation()" style="
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 20px;
                font-weight: 700;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                ✕ Arrêter
            </button>
        `;
        
        document.body.appendChild(panel);
    }
    panel.style.display = 'flex';
}

function hideNavigationPanel() {
    const panel = document.getElementById('nav-panel');
    if (panel) {
        panel.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => panel.style.display = 'none', 300);
    }
}

// ========== CÉLÉBRATION ARRIVÉE ==========
function celebrateArrival() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    
    for (let i = 0; i < 30; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.style.cssText = `
                position: fixed;
                top: 10%;
                left: ${Math.random() * 100}%;
                width: ${8 + Math.random() * 8}px;
                height: ${8 + Math.random() * 8}px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                z-index: 10000;
                border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
                animation: fall ${2 + Math.random()}s linear;
            `;
            document.body.appendChild(confetti);
            setTimeout(() => confetti.remove(), 3000);
        }, i * 80);
    }
}

// ========== ARRÊT DE LA NAVIGATION ==========
function stopNavigation() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    if (distanceCheckInterval) {
        clearInterval(distanceCheckInterval);
        distanceCheckInterval = null;
    }
    
    isNavigating = false;
    hideNavigationPanel();
    
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    
    showToast("🛑 Navigation arrêtée");
}

// ========== MODAL SUGGESTION ==========
function openModal() {
    const modal = document.getElementById('suggestion-modal');
    modal.style.display = 'flex';
    suggestionMode = true;
    selectedCoords = null;
    document.getElementById('suggCoordsDisplay').innerHTML = "👆 Clique sur la carte pour choisir l'emplacement";
    
    // Reset des champs
    document.getElementById('suggName').value = "";
    document.getElementById('suggCat').selectedIndex = 0;
    if (document.getElementById('suggDesc')) {
        document.getElementById('suggDesc').value = "";
    }
}

function closeModal() {
    const modal = document.getElementById('suggestion-modal');
    modal.style.display = 'none';
    suggestionMode = false;
    
    if (tempSelectionMarker) {
        map.removeLayer(tempSelectionMarker);
        tempSelectionMarker = null;
    }
}

function sendSuggestion() {
    const name = document.getElementById('suggName').value.trim();
    const category = document.getElementById('suggCat').value;
    const description = document.getElementById('suggDesc')?.value.trim() || '';
    
    if (!name) {
        showToast("⚠️ Entre un nom pour le lieu!");
        return;
    }
    
    if (!category) {
        showToast("⚠️ Choisis une catégorie!");
        return;
    }
    
    if (!selectedCoords) {
        showToast("⚠️ Clique sur la carte pour choisir l'emplacement!");
        return;
    }
    
    const payload = {
        name: name,
        category: category,
        description: description,
        latitude: selectedCoords.lat,
        longitude: selectedCoords.lng,
        timestamp: new Date().toISOString(),
        suggestedBy: 'USTO Map User'
    };

    showToast("📤 Envoi en cours...");
    
    fetch("https://formspree.io/f/mdaanqev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) throw new Error('Erreur serveur');
        showToast("✅ Suggestion envoyée! Merci pour ta contribution 🎉");
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        closeModal();
    })
    .catch(err => {
        console.error(err);
        showToast("❌ Erreur d'envoi. Vérifie ta connexion et réessaye.");
    });
}

// ========== CENTRER SUR L'UTILISATEUR ==========
function centerOnUser() {
    if (lastKnownPosition) {
        map.setView([lastKnownPosition.lat, lastKnownPosition.lng], 18, {
            animate: true,
            duration: 1
        });
        showToast("📍 Centré sur ta position");
    } else {
        showToast("📍 Localisation en cours...");
        getCurrentLocation();
    }
}

// ========== TOGGLE PANNEAU ==========
function togglePanel() {
    const panel = document.getElementById('ui-layer');
    const btn = document.getElementById('toggle-panel-btn');
    
    panel.classList.toggle('collapsed');
    
    if (panel.classList.contains('collapsed')) {
        btn.innerHTML = '<i class="fa fa-chevron-down"></i>';
        showToast("📦 Panneau réduit");
    } else {
        btn.innerHTML = '<i class="fa fa-chevron-up"></i>';
        showToast("📋 Panneau étendu");
    }
}

// ========== RECHERCHE ==========
function searchMap() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    
    if (!searchTerm) {
        renderMarkers(allLocations);
        return;
    }
    
    const results = allLocations.filter(loc => 
        loc.name.toLowerCase().includes(searchTerm) ||
        (loc.category && loc.category.toLowerCase().includes(searchTerm)) ||
        (loc.desc && loc.desc.toLowerCase().includes(searchTerm))
    );
    
    if (results.length === 0) {
        showToast("❌ Aucun résultat pour '" + searchTerm + "'");
        return;
    }
    
    renderMarkers(results);
    
    if (results.length === 1) {
        const loc = results[0];
        map.setView(loc.coords, 18);
        showToast("✅ Trouvé: " + loc.name);
    } else {
        showToast(`📍 ${results.length} résultats trouvés`);
        const bounds = L.latLngBounds(results.map(r => r.coords));
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// ========== FILTRES PAR CATÉGORIE ==========
function filterMap(category) {
    filteredCategory = category;
    
    // Réinitialiser la recherche
    document.getElementById('searchInput').value = '';
    
    if (category === 'all') {
        renderMarkers(allLocations);
        showToast("📍 Tous les lieux affichés");
        return;
    }
    
    const filtered = allLocations.filter(loc => loc.category === category);
    
    if (filtered.length === 0) {
        showToast("❌ Aucun lieu dans cette catégorie");
        return;
    }
    
    renderMarkers(filtered);
    showToast(`📍 ${filtered.length} ${category} affiché(s)`);
    
    // Zoom sur les résultats
    if (filtered.length > 0) {
        const bounds = L.latLngBounds(filtered.map(r => r.coords));
        map.fitBounds(bounds, { padding: [100, 100] });
    }
}

// ========== CHANGEMENT DE STYLE DE CARTE ==========
function changeMapStyle(style) {
    if (mapStyles[style]) {
        currentMapStyle = style;
        
        // Retirer l'ancienne couche
        if (currentTileLayer) {
            map.removeLayer(currentTileLayer);
        }
        
        // Ajouter la nouvelle couche
        currentTileLayer = L.tileLayer(mapStyles[style].url, {
            attribution: mapStyles[style].attribution,
            maxZoom: 19
        }).addTo(map);
        
        showToast(`🗺️ Style changé: ${style}`);
        toggleLayersMenu(); // Fermer le menu
    }
}

// ========== MENU DES COUCHES ==========
function toggleLayersMenu() {
    const menu = document.getElementById('layers-menu');
    if (menu.style.display === 'none' || !menu.style.display) {
        menu.style.display = 'block';
        menu.style.animation = 'slideUp 0.3s ease';
    } else {
        menu.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => menu.style.display = 'none', 300);
    }
}

// ========== TOAST NOTIFICATION ==========
function showToast(msg, duration = 3000) {
    const t = document.createElement("div");
    t.className = "toast-message show";
    t.innerHTML = msg;
    
    document.body.appendChild(t);
    
    setTimeout(() => {
        t.style.animation = 'slideDown 0.3s ease-in';
        setTimeout(() => t.remove(), 300);
    }, duration);
}

// ========== EFFACER LA CARTE ==========
function clearMap() {
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    
    if (campusRouteLine) {
        map.removeLayer(campusRouteLine);
        campusRouteLine = null;
    }
    
    if (tempSelectionMarker) {
        map.removeLayer(tempSelectionMarker);
        tempSelectionMarker = null;
    }
    
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    if (distanceCheckInterval) {
        clearInterval(distanceCheckInterval);
        distanceCheckInterval = null;
    }
    
    hideNavigationPanel();
    
    document.getElementById('clearBtn').style.display = 'none';
    currentTarget = null;
    isNavigating = false;
    
    showToast("🧹 Carte réinitialisée");
}

// ========== MISE À JOUR DU COMPTEUR ==========
function updateLocationCount(count) {
    const el = document.getElementById('location-count');
    if (el) {
        el.textContent = `${count} lieu${count > 1 ? 'x' : ''}`;
    }
}

// ========== STATUT DE CONNEXION ==========
function updateConnectionStatus(isOnline = true) {
    const el = document.getElementById('connection-status');
    if (el) {
        if (isOnline) {
            el.innerHTML = '🟢 En ligne';
            el.style.color = '#10b981';
        } else {
            el.innerHTML = '🔴 Hors ligne';
            el.style.color = '#ef4444';
        }
    }
}

// Surveiller la connexion
window.addEventListener('online', () => {
    updateConnectionStatus(true);
    showToast("✅ Connexion rétablie");
});

window.addEventListener('offline', () => {
    updateConnectionStatus(false);
    showToast("⚠️ Connexion perdue");
});

// ========== ANIMATIONS CSS ==========
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { transform: translate(-50%, 20px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes slideDown {
        from { transform: translate(-50%, 0); opacity: 1; }
        to { transform: translate(-50%, 20px); opacity: 0; }
    }
    @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.7; }
    }
    @keyframes fall {
        to { transform: translateY(100vh) rotate(360deg); opacity: 0; }
    }
    
    .custom-popup .leaflet-popup-content-wrapper {
        border-radius: 12px;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 8px 25px rgba(0,0,0,0.2);
    }
    
    .custom-popup .leaflet-popup-content {
        margin: 10px;
    }
    
    .custom-popup .leaflet-popup-tip {
        display: none;
    }
`;
document.head.appendChild(style);

// ========== GESTION DU CLAVIER ==========
document.addEventListener('keydown', (e) => {
    // Echap pour fermer modal
    if (e.key === 'Escape') {
        if (suggestionMode) {
            closeModal();
        }
    }
    
    // Entrée dans la recherche
    if (e.key === 'Enter' && document.activeElement === document.getElementById('searchInput')) {
        searchMap();
    }
});

// ========== INITIALISATION ==========
initMap();

console.log('%c🗺️ USTO-MB Map v2.0', 'font-size: 20px; font-weight: bold; color: #2563eb;');
console.log('%cBy Students, For Students 🎓', 'font-size: 14px; color: #10b981;');