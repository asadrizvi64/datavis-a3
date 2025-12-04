window.onload = () => {
  // Set the width and height of the SVG container
  const width = 500;
  const height = 500;
  let map = null; // Store map reference for cleanup

  async function forceLayout() {
    const nodes = [];
    const links = [];
    const nodeSet = new Set();

    const data = await d3.csv("./data/flights-airport-5000plus.csv");

    data.forEach((row) => {
      const origin = row.origin;
      const destination = row.destination;
      const count = +row.count;

      // Create links between origin and destination airports
      links.push({ source: origin, target: destination, value: count });

      // Add unique origin and destination nodes
      if (!nodeSet.has(origin)) {
        nodes.push({ id: origin, name: origin });
        nodeSet.add(origin)
      }

      if (!nodeSet.has(destination)) {
        nodes.push({ id: destination, name: destination });
        nodeSet.add(destination)
      }
    });

    nodes.forEach(n => n.value = links.reduce(
      (a, l) => l.source === n.id || l.target === n.id ? a + l.value : a, 0)
    );

    ForceGraph(
      { nodes, links },
      {
        width,
        height,
        linkStrength: d => Math.sqrt(d.data.value) / 10000,
        nodeRadius: d => d.value / 20000,
        linkStrokeWidth: d => d.value / 1000,
      });
  }

  async function mapLayout() {
    // Load both datasets
    const airports = await d3.csv("./data/airports.csv");
    const flights = await d3.csv("./data/flights-airport-5000plus.csv");

    // Create a map of airport codes to their location data
    const airportMap = new Map();
    airports.forEach(airport => {
      airportMap.set(airport.iata, {
        name: airport.name,
        city: airport.city,
        lat: +airport.latitude,
        lng: +airport.longitude
      });
    });

    // Calculate flight volumes for each airport
    const airportVolumes = new Map();
    flights.forEach(flight => {
      const origin = flight.origin;
      const dest = flight.destination;
      const count = +flight.count;

      airportVolumes.set(origin, (airportVolumes.get(origin) || 0) + count);
      airportVolumes.set(dest, (airportVolumes.get(dest) || 0) + count);
    });

    // Create map container
    const container = d3.select("#visualization-container");
    container.html(""); // Clear previous content

    const mapDiv = container.append("div")
      .attr("id", "map")
      .style("width", "100%")
      .style("height", "600px");

    // Initialize Leaflet map
    map = L.map('map').setView([39.8283, -98.5795], 4); // Center of USA

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Add airport markers
    airports.forEach(airport => {
      const lat = +airport.latitude;
      const lng = +airport.longitude;
      const iata = airport.iata;

      if (lat && lng && airportVolumes.has(iata)) {
        const volume = airportVolumes.get(iata);
        const radius = Math.sqrt(volume) / 100; // Scale radius based on volume

        L.circleMarker([lat, lng], {
          radius: radius,
          fillColor: "#ff7800",
          color: "#000",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.6
        }).bindPopup(`<b>${airport.name}</b><br>${airport.city}, ${airport.state}<br>Code: ${iata}<br>Flights: ${volume}`)
          .addTo(map);
      }
    });

    // Add flight connections as lines
    flights.forEach(flight => {
      const origin = airportMap.get(flight.origin);
      const dest = airportMap.get(flight.destination);
      const count = +flight.count;

      if (origin && dest && origin.lat && origin.lng && dest.lat && dest.lng) {
        const opacity = Math.min(count / 20000, 0.8); // Scale opacity based on flight count
        const weight = Math.max(count / 3000, 1); // Scale line weight

        L.polyline(
          [[origin.lat, origin.lng], [dest.lat, dest.lng]],
          {
            color: '#3388ff',
            weight: weight,
            opacity: opacity
          }
        ).bindPopup(`${flight.origin} → ${flight.destination}<br>Flights: ${count}`)
         .addTo(map);
      }
    });
  }

  function draw(layoutType) {
    // Remove traces of leaflet when toggling
    if (map) {
      map.remove();
      map = null;
    }

    d3.select("#visualization-container").html("");

    if (layoutType === "force") {
      forceLayout();
    } else if (layoutType === "map") {
      mapLayout();
    }
  }

  // Set up button event listeners
  document.getElementById("force-btn").addEventListener("click", () => {
    document.getElementById("force-btn").classList.add("active");
    document.getElementById("map-btn").classList.remove("active");
    draw("force");
  });

  document.getElementById("map-btn").addEventListener("click", () => {
    document.getElementById("map-btn").classList.add("active");
    document.getElementById("force-btn").classList.remove("active");
    draw("map");
  });

  draw("force"); // force by default
};
