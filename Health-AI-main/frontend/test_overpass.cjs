const fetch = require('node-fetch');

async function test() {
  const lat = 22.723;
  const lng = 88.483;
  const radiusM = 15000;
  const query = `
    [out:json][timeout:30];
    (
      node["amenity"~"^(hospital|clinic|doctors|health_post|pharmacy)$"](around:${radiusM},${lat},${lng});
      way["amenity"~"^(hospital|clinic|doctors|health_post)$"](around:${radiusM},${lat},${lng});
    );
    out center;
  `;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query.trim())}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('STATUS:', res.status);
  console.log('TOTAL ELEMENTS:', data.elements.length);
  const elements = data.elements || [];
  const doctors = elements
    .map((el, idx) => {
      const elLat = el.lat ?? el.center?.lat ?? lat;
      const elLng = el.lon ?? el.center?.lon ?? lng;
      const tags = el.tags || {};
      const amenity = tags.amenity || 'hospital';
      
      const displayName =
        tags['name:en'] || tags.name || tags['name:hi'] || `Health ${amenity.charAt(0).toUpperCase() + amenity.slice(1)} ${idx + 1}`;
      return {
        id: String(el.id),
        name: displayName,
        amenity,
        lat: elLat,
        lng: elLng
      };
    })
    .filter(d => d.amenity !== 'pharmacy');
    
  console.log('HOSPITALS:', doctors.slice(0, 5));
}
test();
