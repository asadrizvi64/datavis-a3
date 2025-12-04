window.onload = () => {
  // Set the width and height of the SVG container
  const width = 1000;
  const height = 700;
  let map = null; // Store map reference for cleanup
  let currentLayout = "force";

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

    // Calculate node values (total flight volume)
    nodes.forEach(n => n.value = links.reduce(
      (a, l) => l.source === n.id || l.target === n.id ? a + l.value : a, 0)
    );

    // Sort nodes by value to identify major airports
    const sortedNodes = [...nodes].sort((a, b) => b.value - a.value);
    const majorAirports = new Set(sortedNodes.slice(0, 15).map(n => n.id));

    // Create statistics
    const totalFlights = links.reduce((sum, l) => sum + l.value, 0);
    const avgFlights = totalFlights / links.length;
    const maxRoute = links.reduce((max, l) => l.value > max.value ? l : max, links[0]);

    // Create container
    const container = d3.select("#visualization-container");
    container.classed("map-layout", false); // Ensure force layout doesn't have map-layout class

    // Add info panel
    const infoPanel = container.append("div")
      .attr("id", "info-panel")
      .html(`
        <h3>Flight Network Visualization</h3>
        <div id="stats">
          <p><strong>Total Airports:</strong> ${nodes.length}</p>
          <p><strong>Total Routes:</strong> ${links.length}</p>
          <p><strong>Total Flights:</strong> ${totalFlights.toLocaleString()}</p>
          <p><strong>Busiest Route:</strong> ${maxRoute.source} → ${maxRoute.target} (${maxRoute.value.toLocaleString()} flights)</p>
        </div>
        <div id="node-info">
          <p class="hint">Hover over airports to see details<br>Click to pin/unpin<br>Drag to reposition</p>
        </div>
      `);

    // Create SVG container wrapper
    const svgContainer = container.append("div")
      .attr("id", "svg-container");

    // Create SVG
    const svg = svgContainer.append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [-width / 2, -height / 2, width, height]);

    // Add legend as overlay on top of SVG
    const legend = svgContainer.append("div")
      .attr("id", "legend")
      .html(`
        <h4>✈️ Legend</h4>
        <div class="legend-item">
          <div class="legend-circle large"></div>
          <span>Major Hub</span>
        </div>
        <div class="legend-item">
          <div class="legend-circle medium"></div>
          <span>Medium Airport</span>
        </div>
        <div class="legend-item">
          <div class="legend-circle small"></div>
          <span>Small Airport</span>
        </div>
        <div class="legend-item">
          <div class="legend-line thick"></div>
          <span>High volume</span>
        </div>
        <div class="legend-item">
          <div class="legend-line thin"></div>
          <span>Low volume</span>
        </div>
      `);

    // Add arrow marker for directed edges
    svg.append("defs").selectAll("marker")
      .data(["arrow"])
      .join("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#999")
      .attr("d", "M0,-5L10,0L0,5");

    // Create link group
    const linkGroup = svg.append("g")
      .attr("class", "links")
      .attr("stroke-linecap", "round");

    // Create node group
    const nodeGroup = svg.append("g")
      .attr("class", "nodes");

    // Create label group
    const labelGroup = svg.append("g")
      .attr("class", "labels");

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).strength(d => Math.sqrt(d.value) / 10000))
      .force("charge", d3.forceManyBody().strength(-30))
      .force("collision", d3.forceCollide().radius(d => Math.sqrt(d.value) / 200 + 5))
      .force("center", d3.forceCenter(0, 0));

    // Create links
    const link = linkGroup.selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "link")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", d => Math.max(d.value / 1000, 0.5))
      .attr("marker-end", d => d.value > 8000 ? "url(#arrow)" : null);

    // Create nodes
    const node = nodeGroup.selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("class", "node")
      .attr("r", d => Math.max(Math.sqrt(d.value) / 200, 3))
      .attr("fill", d => {
        const ratio = d.value / sortedNodes[0].value;
        if (ratio > 0.5) return "#e74c3c"; // Red for major hubs
        if (ratio > 0.2) return "#f39c12"; // Orange for medium
        return "#3498db"; // Blue for small
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .call(drag(simulation));

    // Add labels for major airports
    const label = labelGroup.selectAll("text")
      .data(nodes.filter(d => majorAirports.has(d.id)))
      .join("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("dy", d => -Math.sqrt(d.value) / 200 - 5)
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .style("fill", "#2c3e50")
      .style("pointer-events", "none")
      .style("user-select", "none")
      .text(d => d.id);

    // Interaction handlers
    let selectedNode = null;
    let isDragging = false;

    node.on("mouseover", function(event, d) {
      if (selectedNode && selectedNode !== d) return;
      if (isDragging) return;

      d3.select(this).classed("hovering", true);
      highlightConnections(d);
      updateNodeInfo(d, links);
    })
    .on("mouseout", function(event, d) {
      if (selectedNode === d) return;
      if (isDragging) return;

      d3.select(this).classed("hovering", false);
      if (!selectedNode) {
        resetHighlight();
        updateNodeInfo(null, links);
      }
    })
    .on("click", function(event, d) {
      event.stopPropagation();

      if (selectedNode === d) {
        // Unpin the node
        d.fx = null;
        d.fy = null;
        selectedNode = null;

        node.filter(n => n === d).classed("pinned", false);
        resetHighlight();
        updateNodeInfo(null, links);
      } else {
        // Unpin previous node if any
        if (selectedNode) {
          selectedNode.fx = null;
          selectedNode.fy = null;
          node.filter(n => n === selectedNode).classed("pinned", false);
        }

        // Pin the new node
        d.fx = d.x;
        d.fy = d.y;
        selectedNode = d;

        node.filter(n => n === d).classed("pinned", true);
        highlightConnections(d);
        updateNodeInfo(d, links);
      }
    });

    svg.on("click", function() {
      if (selectedNode && !isDragging) {
        selectedNode.fx = null;
        selectedNode.fy = null;
        node.filter(n => n === selectedNode).classed("pinned", false);
        selectedNode = null;
        resetHighlight();
        updateNodeInfo(null, links);
      }
    });

    function highlightConnections(d) {
      const connectedNodes = new Set();
      const connectedLinks = new Set();

      links.forEach(l => {
        if (l.source.id === d.id || l.target.id === d.id) {
          connectedLinks.add(l);
          connectedNodes.add(l.source.id);
          connectedNodes.add(l.target.id);
        }
      });

      // Use opacity and classes for stable highlighting
      node.attr("opacity", n => connectedNodes.has(n.id) ? 1 : 0.15);

      link.each(function(l) {
        const isConnected = connectedLinks.has(l);
        d3.select(this)
          .classed("highlighted", isConnected)
          .attr("stroke-opacity", isConnected ? 0.85 : 0.05)
          .attr("stroke-width", isConnected ? Math.max(l.value / 500, 3) : Math.max(l.value / 1000, 0.5));
      });

      label.each(function(n) {
        const isConnected = connectedNodes.has(n.id);
        d3.select(this)
          .classed("highlighted", isConnected)
          .attr("opacity", isConnected ? 1 : 0.15);
      });
    }

    function resetHighlight() {
      node.attr("opacity", 1);
      link.classed("highlighted", false)
        .attr("stroke-opacity", 0.3)
        .attr("stroke-width", d => Math.max(d.value / 1000, 0.5));
      label.classed("highlighted", false)
        .attr("opacity", 1);
    }

    function updateNodeInfo(d, links) {
      const nodeInfoDiv = d3.select("#node-info");
      if (!d) {
        nodeInfoDiv.html('<p class="hint">Hover over airports to see details<br>Click to pin/unpin<br>Drag to reposition</p>');
        return;
      }

      const outgoing = links.filter(l => l.source.id === d.id);
      const incoming = links.filter(l => l.target.id === d.id);
      const totalOut = outgoing.reduce((sum, l) => sum + l.value, 0);
      const totalIn = incoming.reduce((sum, l) => sum + l.value, 0);

      const topRoutes = [...outgoing, ...incoming]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      let routesHtml = '<ul class="routes-list">';
      topRoutes.forEach(route => {
        const isOutgoing = route.source.id === d.id;
        const other = isOutgoing ? route.target.id : route.source.id;
        const arrow = isOutgoing ? "→" : "←";
        routesHtml += `<li>${arrow} ${other}: ${route.value.toLocaleString()} flights</li>`;
      });
      routesHtml += '</ul>';

      nodeInfoDiv.html(`
        <h4>Airport: ${d.id}</h4>
        <p><strong>Total Traffic:</strong> ${d.value.toLocaleString()} flights</p>
        <p><strong>Outgoing:</strong> ${totalOut.toLocaleString()} | <strong>Incoming:</strong> ${totalIn.toLocaleString()}</p>
        <p><strong>Connections:</strong> ${outgoing.length + incoming.length} routes</p>
        <p><strong>Top Routes:</strong></p>
        ${routesHtml}
      `);
    }

    function drag(simulation) {
      function dragstarted(event, d) {
        isDragging = true;
        if (!event.active) simulation.alphaTarget(0.3).restart();

        d.fx = d.x;
        d.fy = d.y;

        d3.select(this).classed("dragging", true);
        highlightConnections(d);
        updateNodeInfo(d, links);
      }

      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        isDragging = false;

        d3.select(this).classed("dragging", false);

        // If this node is not the selected node, unpin it
        if (selectedNode !== d) {
          d.fx = null;
          d.fy = null;

          if (selectedNode) {
            // Keep the selected node highlighted
            highlightConnections(selectedNode);
            updateNodeInfo(selectedNode, links);
          } else {
            resetHighlight();
            updateNodeInfo(null, links);
          }
        } else {
          // Keep the pinned node highlighted
          highlightConnections(d);
        }
      }

      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    function ticked() {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

      label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    }

    simulation.on("tick", ticked);
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
        state: airport.state,
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
    container.classed("map-layout", true); // Add map-layout class

    // Add info panel for map
    const infoPanel = container.append("div")
      .attr("id", "info-panel")
      .html(`
        <h3>Geographic Flight Network</h3>
        <div id="stats">
          <p><strong>Airports:</strong> ${airportVolumes.size}</p>
          <p><strong>Routes:</strong> ${flights.length}</p>
        </div>
        <div id="node-info">
          <p class="hint">Click on airports or routes to see details</p>
        </div>
      `);

    const mapDiv = container.append("div")
      .attr("id", "map")
      .style("width", "100%")
      .style("height", "650px");

    // Add map legend overlay
    const mapLegend = container.append("div")
      .attr("id", "map-legend")
      .style("position", "absolute")
      .style("top", "20px")
      .style("right", "20px")
      .style("z-index", "1000")
      .html(`
        <h4 style="margin-top: 0; margin-bottom: 12px; color: #2c3e50; font-size: 14px; border-bottom: 2px solid #3498db; padding-bottom: 6px;">🗺️ Map Legend</h4>
        <div class="legend-item" style="margin-bottom: 10px; font-size: 12px;">
          <div class="legend-circle large"></div>
          <span>Major Hub</span>
        </div>
        <div class="legend-item" style="margin-bottom: 10px; font-size: 12px;">
          <div class="legend-circle medium"></div>
          <span>Medium</span>
        </div>
        <div class="legend-item" style="margin-bottom: 10px; font-size: 12px;">
          <div class="legend-circle small"></div>
          <span>Small</span>
        </div>
      `);

    // Initialize Leaflet map
    map = L.map('map').setView([39.8283, -98.5795], 4); // Center of USA

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Store route lines for interaction
    const routeLines = [];

    // Add flight connections as lines first (so they're under markers)
    flights.forEach(flight => {
      const origin = airportMap.get(flight.origin);
      const dest = airportMap.get(flight.destination);
      const count = +flight.count;

      if (origin && dest && origin.lat && origin.lng && dest.lat && dest.lng) {
        const opacity = Math.min(count / 15000, 0.6);
        const weight = Math.max(count / 2500, 1);

        const line = L.polyline(
          [[origin.lat, origin.lng], [dest.lat, dest.lng]],
          {
            color: '#3498db',
            weight: weight,
            opacity: opacity,
            className: 'flight-route'
          }
        );

        line.on('click', function() {
          updateMapInfo({
            type: 'route',
            from: flight.origin,
            to: flight.destination,
            fromCity: `${origin.city}, ${origin.state}`,
            toCity: `${dest.city}, ${dest.state}`,
            count: count
          });
          // Highlight this route
          routeLines.forEach(r => r.setStyle({ color: '#3498db', weight: r.options.weight }));
          this.setStyle({ color: '#e74c3c', weight: weight * 2 });
        });

        line.bindTooltip(`${flight.origin} → ${flight.destination}<br>${count.toLocaleString()} flights`);
        line.addTo(map);
        routeLines.push(line);
      }
    });

    // Add airport markers
    airports.forEach(airport => {
      const lat = +airport.latitude;
      const lng = +airport.longitude;
      const iata = airport.iata;

      if (lat && lng && airportVolumes.has(iata)) {
        const volume = airportVolumes.get(iata);
        const radius = Math.sqrt(volume) / 80;

        // Color based on volume
        let color;
        if (volume > 100000) color = "#e74c3c";
        else if (volume > 50000) color = "#f39c12";
        else color = "#3498db";

        const marker = L.circleMarker([lat, lng], {
          radius: radius,
          fillColor: color,
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.7
        });

        marker.on('click', function() {
          updateMapInfo({
            type: 'airport',
            code: iata,
            name: airport.name,
            city: airport.city,
            state: airport.state,
            volume: volume
          });
        });

        marker.bindTooltip(`<b>${airport.name}</b><br>${airport.city}, ${airport.state}<br>${iata} - ${volume.toLocaleString()} flights`);
        marker.addTo(map);
      }
    });

    function updateMapInfo(data) {
      const nodeInfoDiv = d3.select("#node-info");
      if (data.type === 'airport') {
        nodeInfoDiv.html(`
          <h4>${data.code} - ${data.name}</h4>
          <p><strong>Location:</strong> ${data.city}, ${data.state}</p>
          <p><strong>Total Traffic:</strong> ${data.volume.toLocaleString()} flights</p>
        `);
      } else if (data.type === 'route') {
        nodeInfoDiv.html(`
          <h4>Route Details</h4>
          <p><strong>From:</strong> ${data.from} (${data.fromCity})</p>
          <p><strong>To:</strong> ${data.to} (${data.toCity})</p>
          <p><strong>Flights:</strong> ${data.count.toLocaleString()}</p>
        `);
      }
    }
  }

  function draw(layoutType) {
    currentLayout = layoutType;

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
