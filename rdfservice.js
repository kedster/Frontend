/**
 * @file Manages D3.js graph and chart visualization.
 * Removed Sankey logic and added multiple chart types.
 */

// Define GraphTypes and NodeTypes locally for this example.
// In a real application, these would be imported from '../lib/Constants.js'.
const GraphTypes = {
    FORCE_DIRECTED: 'forceDirected',
    BAR_CHART: 'barChart',
    PIE_CHART: 'pieChart',
    TIME_SERIES: 'timeSeriesChart',
    HISTOGRAM: 'histogram',
    LINK_TYPE_BREAKDOWN: 'linkTypeBreakdown',
    GROUP_SIZE: 'groupSizeChart',
    // SANKEY type has been removed
};
function getNodeTypes(subject, object) {
    return {
        SUBJECT: subject,
        OBJECT: object,
        LITERAL: 'literal',
    };
}
// Ensure d3 is available globally from CDN
const d3 = window.d3;

// Mock DomUtils to run the example. In a real project, this would be imported.
const DomUtils = {
    getById: (id) => {
        // Create a dummy SVG for 'rdf-graph' and a dummy div for messages.
        // In a live environment, these would be existing DOM elements.
        let element = document.getElementById(id);
        if (element) return element; // Return existing element if it's there.

        if (id === 'rdf-graph') {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = id;
            document.body.appendChild(svg); // Append for visibility in example
            return svg;
        } else {
            const div = document.createElement('div');
            div.id = id;
            div.style.display = 'none';
            div.style.position = 'absolute';
            div.style.top = '10px';
            div.style.left = '10px';
            div.style.backgroundColor = 'lightyellow';
            div.style.padding = '5px';
            div.style.border = '1px solid orange';
            document.body.appendChild(div);
            return div;
        }
    }
};


export class GraphService {
    /** @private @type {HTMLElement} */
    _containerElement;
    /** @private @type {d3.Selection<SVGSVGElement, unknown, HTMLElement, any>} */
    _d3Svg = null;
    /** @private @type {d3.Selection<SVGGElement, unknown, HTMLElement, any>} */
    _d3G = null; // Main group for chart/graph elements, often used for translations/zooms
    /** @private @type {d3.Simulation<d3.SimulationNodeDatum, d3.SimulationLinkDatum>} */
    _d3Simulation = null; // Only for force-directed graphs
    /** @private @type {string} */
    _currentChartType = null; // Stores the type of the last rendered chart
    /** @private @type {object} // Equivalent to import('../models/GraphData.js').GraphData */
    _currentGraphData = { nodes: [], links: [] }; // Stores the graph data that was last passed to renderChart
    /** @private @type {string} */
    _currentPredicateFilter = ''; // Stores the last applied predicate filter

    /**
     * @param {HTMLElement} containerElement - The DOM element to render graphs/charts into.
     */
    constructor(containerElement) {
        this._containerElement = containerElement;
        this._initializeSvg();
    }

    /**
     * Initializes the SVG element for D3 rendering.
     * @private
     */
    _initializeSvg() {
        const svgElement = DomUtils.getById('rdf-graph');
        if (!svgElement) {
            console.error('SVG element #rdf-graph not found.');
            return;
        }
        this._d3Svg = d3.select(svgElement);
        this._d3Svg.attr("width", "100%").attr("height", "100%");
        // Ensure initial sizing is set if container is not set
        this._d3Svg.style("min-width", "500px").style("min-height", "400px");
    }

    /**
     * Clears the current SVG content and stops any active simulations.
     */
    clearGraph() {
        if (this._d3Simulation) {
            this._d3Simulation.stop();
            this._d3Simulation = null;
        }
        if (this._d3Svg) {
            this._d3Svg.selectAll("*").remove(); // Remove all child elements (chart/graph)
            this._d3G = null; // Reset the main group
        }
        // Hide any general messages that might have been displayed separately
        DomUtils.getById('graph-message').style.display = 'none';
        // Remove any tooltips that might be lingering
        d3.select("body").selectAll(".d3-tooltip").remove();
    }

    /**
     * Helper to display a fallback message directly in the SVG area.
     * @private
     * @param {string} message - The message to display.
     */
    _displayFallbackMessage(message) {
        this.clearGraph(); // Clear any previous chart / error message
        const width = this._containerElement.clientWidth || 500; // Fallback width
        const height = this._containerElement.clientHeight || 400; // Fallback height

        // Ensure SVG dimensions are set
        if (!this._d3Svg) {
            this._initializeSvg();
        }
        this._d3Svg.attr("viewBox", [0, 0, width, height]);

        this._d3Svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("font-size", "1.2em")
            .attr("fill", "#666")
            .text(message);
    }

    /**
     * Renders the specified type of chart. This is the new primary render method.
     * It accepts the same input structure as the original `renderGraph` and renders
     * to the same SVG container.
     * @param {object} graphData - The data to visualize ({ nodes: [], links: [] }).
     * @param {string} chartType - The type of chart to render (e.g., 'barChart', 'pieChart').
     * @param {string} [predicateFilter=''] - Optional predicate label to filter links by (primarily for force-directed).
     */
    renderChart(graphData, chartType, predicateFilter = '') {
        console.log(`Rendering chart: ${chartType}`);
        console.log('Data:', graphData);
        
        // Validate data
        if (!graphData || !graphData.nodes || !graphData.links) {
            console.error('Invalid graph data structure:', graphData);
            this._displayFallbackMessage('Invalid data structure for visualization');
            return;
        }

        if (graphData.nodes.length === 0 && graphData.links.length === 0) {
            console.warn('Empty graph data');
            this._displayFallbackMessage('No data available for visualization');
            return;
        }

        // Clear existing visualization
        const svg = d3.select('#rdf-graph');
        svg.selectAll('*').remove();
        
        // Store current state
        this._currentGraphData = graphData;
        this._currentChartType = chartType;
        this._currentPredicateFilter = predicateFilter;
        
        // Get container dimensions
        const width = this._containerElement.clientWidth || 500;
        const height = this._containerElement.clientHeight || 400;
        
        try {
            switch (chartType) {
                case GraphTypes.FORCE_DIRECTED:
                    this._renderForceDirectedGraph(graphData, width, height); // Added underscore
                    break;
                case GraphTypes.BAR_CHART:
                    this._renderBarChart(graphData, width, height); // Added underscore
                    break;
                case GraphTypes.PIE_CHART:
                    this._renderPieChart(graphData, width, height); // Added underscore
                    break;
                case GraphTypes.TIME_SERIES:
                    this._renderTimeSeriesChart(graphData, width, height); // Added underscore
                    break;
                case GraphTypes.HISTOGRAM:
                    this._renderHistogram(graphData, width, height); // Added underscore
                    break;
                case GraphTypes.LINK_TYPE_BREAKDOWN:
                    this._renderLinkTypeBreakdown(graphData, width, height); // Added underscore
                    break;
                case GraphTypes.GROUP_SIZE:
                    this._renderGroupSizeChart(graphData, width, height); // Added underscore
                    break;
                default:
                    console.warn(`Unknown chart type: ${chartType}`);
            }
        } catch (error) {
            console.error('Error rendering chart:', error);
            this._displayFallbackMessage(`Error rendering ${chartType}: ${error.message}`);
        }
    }

    /**
     * Renders a force-directed graph. This method is largely unchanged.
     * @private
     * @param {object} data - The graph data {nodes, links}.
     * @param {number} width - SVG width.
     * @param {number} height - SVG height.
     */
    _renderForceDirectedGraph(data, width, height) {
        if (!data || data.nodes.length === 0) {
            this._displayFallbackMessage("No nodes to display in force-directed graph.");
            return;
        }

        // Create a group for graph elements that will be transformed by zoom/pan
        this._d3G = this._d3Svg.append("g");

        // Initialize simulation. Ensure data.links are objects if using d3.forceLink
        // The prompt's input shows source/target as strings, so d3.forceLink handles resolution.
        this._d3Simulation = d3.forceSimulation(data.nodes)
            .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX(width / 2))
            .force("y", d3.forceY(height / 2));

        const link = this._d3G.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(data.links)
            .join("line")
            .attr("stroke-width", d => Math.sqrt(d.value || 1))
            .attr("class", "link");

        const linkLabel = this._d3G.append("g")
            .attr("class", "link-labels")
            .selectAll("text")
            .data(data.links)
            .join("text")
            .attr("fill", "#222")
            .attr("class", "link-label")
            .text(d => d.label);

        const node = this._d3G.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .selectAll("g")
            .data(data.nodes)
            .join("g")
            .attr("class", d => `node ${d.type || ''}`) // Add type class for styling
            .call(d3.drag()
                .on("start", this._dragstarted.bind(this))
                .on("drag", this._dragged.bind(this))
                .on("end", this._dragended.bind(this)));

        node.append("rect")
            .attr("rx", 8)
            .attr("ry", 8)
            .attr("fill", d => {
                if (d.type === NodeTypes.SUBJECT) return '#4CAF50';
                if (d.type === NodeTypes.LITERAL) return '#FFC107';
                return '#2196F3'; // NodeTypes.OBJECT or default
            });

        node.append("text")
            .attr("fill", "#222")
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .text(d => d.label || d.id); // Fallback to ID if no label

        // Adjust rect size based on text bounding box
        node.each(function (d) {
            const textElem = d3.select(this).select("text").node();
            const bbox = textElem.getBBox();
            const paddingX = 16;
            const paddingY = 10;
            d3.select(this).select("rect")
                .attr("x", bbox.x - paddingX / 2)
                .attr("y", bbox.y - paddingY / 2)
                .attr("width", bbox.width + paddingX)
                .attr("height", bbox.height + paddingY);
        });

        this._d3Simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            linkLabel
                .attr("x", d => (d.source.x + d.target.x) / 2)
                .attr("y", d => (d.source.y + d.target.y) / 2);

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        });

        // Add zoom and pan functionality
        const zoom = d3.zoom()
            .scaleExtent([0.1, 8])
            .on("zoom", (event) => {
                this._d3G.attr("transform", event.transform);
            });
        this._d3Svg.call(zoom);

        // Click highlighting
        node.on("click", (event, d) => {
            // Clear previous highlights
            node.classed("highlighted", false);
            link.classed("highlighted", false);
            linkLabel.classed("highlighted", false);

            // Highlight clicked node
            d3.select(event.currentTarget).classed("highlighted", true);

            // Highlight connected links and nodes
            link.filter(targetLink => targetLink.source.id === d.id || targetLink.target.id === d.id)
                .classed("highlighted", true);
            linkLabel.filter(targetLink => targetLink.source.id === d.id || targetLink.target.id === d.id)
                .classed("highlighted", true);

            node.filter(targetNode => {
                return data.links.some(l =>
                    (l.source.id === d.id && l.target.id === targetNode.id) ||
                    (l.target.id === d.id && l.source.id === targetNode.id)
                );
            }).classed("highlighted", true);

            event.stopPropagation(); // Prevent SVG click from clearing
        });

        this._d3Svg.on("click", (event) => {
            // If click is on SVG itself (not a node/link), clear highlights
            if (event.target === this._d3Svg.node() || event.target === this._d3G.node()) {
                node.classed("highlighted", false);
                link.classed("highlighted", false);
                linkLabel.classed("highlighted", false);
            }
        });

        // Tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "d3-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "white")
            .style("border", "1px solid #ccc")
            .style("padding", "8px")
            .style("border-radius", "4px")
            .style("pointer-events", "none");

        node.on("mouseover", (event, d) => {
            tooltip.html(`<strong>${d.label || d.id}</strong><br>${d.uri || ''}<br>Type: ${d.type || 'N/A'}`)
                .style("visibility", "visible");
        }).on("mousemove", (event) => {
            tooltip.style("top", (event.pageY + 10) + "px")
                .style("left", (event.pageX + 10) + "px");
        }).on("mouseout", () => {
            tooltip.style("visibility", "hidden");
        });

        link.on("mouseover", (event, d) => {
            tooltip.html(`<strong>${d.label}</strong><br>${d.source.id} &rarr; ${d.target.id}<br>Value: ${d.value || 'N/A'}`)
                .style("visibility", "visible");
        }).on("mousemove", (event) => {
            tooltip.style("top", (event.pageY + 10) + "px")
                .style("left", (event.pageX + 10) + "px");
        }).on("mouseout", () => {
            tooltip.style("visibility", "hidden");
        });
    }

    /**
     * Handles drag start event for force-directed graph.
     * @private
     * @param {d3.D3DragEvent<SVGElement, d3.SimulationNodeDatum, d3.SimulationNodeDatum>} event
     * @param {d3.SimulationNodeDatum} d
     */
    _dragstarted(event, d) {
        if (!event.active) this._d3Simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    /**
     * Handles drag event for force-directed graph.
     * @private
     * @param {d3.D3DragEvent<SVGElement, d3.SimulationNodeDatum, d3.SimulationNodeDatum>} event
     * @param {d3.SimulationNodeDatum} d
     */
    _dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    /**
     * Handles drag end event for force-directed graph.
     * @private
     * @param {d3.D3DragEvent<SVGElement, d3.SimulationNodeDatum, d3.SimulationNodeDatum>} event
     * @param {d3.SimulationNodeDatum} d
     */
    _dragended(event, d) {
        if (!event.active) this._d3Simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // --- New Chart Implementations ---

    /**
     * Renders a Bar Chart comparing Node and Link Counts.
     * @private
     * @param {object} data - The graph data {nodes, links}.
     * @param {number} width - SVG width.
     * @param {number} height - SVG height.
     */
    _renderBarChart(data, width, height) {
        if (data.nodes.length === 0 && data.links.length === 0) {
            this._displayFallbackMessage("No nodes or links to display in Bar Chart.");
            return;
        }

        const margin = { top: 40, right: 20, bottom: 60, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        this._d3G = this._d3Svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const chartData = [
            { label: 'Nodes', value: data.nodes.length },
            { label: 'Links', value: data.links.length }
        ];

        const xScale = d3.scaleBand()
            .domain(chartData.map(d => d.label))
            .range([0, innerWidth])
            .padding(0.3);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(chartData, d => d.value) * 1.1]) // 10% padding
            .range([innerHeight, 0]);

        // Add X axis
        this._d3G.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale));

        // Add Y axis
        this._d3G.append("g")
            .call(d3.axisLeft(yScale));

        // Bars
        this._d3G.selectAll(".bar")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", d => xScale(d.label))
            .attr("y", d => yScale(d.value))
            .attr("width", xScale.bandwidth())
            .attr("height", d => innerHeight - yScale(d.value))
            .attr("fill", "#69b3a2");

        // Bar labels
        this._d3G.selectAll(".bar-label")
            .data(chartData)
            .enter().append("text")
            .attr("class", "bar-label")
            .attr("x", d => xScale(d.label) + xScale.bandwidth() / 2)
            .attr("y", d => yScale(d.value) - 5) // Position above the bar
            .attr("text-anchor", "middle")
            .text(d => d.value);

        // Chart Title
        this._d3Svg.append("text")
            .attr("x", width / 2)
            .attr("y", margin.top / 2)
            .attr("text-anchor", "middle")
            .attr("font-size", "1.2em")
            .attr("font-weight", "bold")
            .text("Node vs Link Count");
    }

    /**
     * Renders a Pie Chart showing Nodes vs Links count.
     * @private
     * @param {object} data - The graph data {nodes, links}.
     * @param {number} width - SVG width.
     * @param {number} height - SVG height.
     */
    _renderPieChart(data, width, height) {
        if (data.nodes.length === 0 && data.links.length === 0) {
            this._displayFallbackMessage("No nodes or links to display in Pie Chart.");
            return;
        }

        const radius = Math.min(width, height) / 2 - 40;

        this._d3G = this._d3Svg.append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        const chartData = [
            { label: 'Nodes', value: data.nodes.length, color: '#4CAF50' },
            { label: 'Links', value: data.links.length, color: '#2196F3' }
        ];

        const pie = d3.pie()
            .value(d => d.value)(chartData);

        const arc = d3.arc()
            .innerRadius(0)
            .outerRadius(radius);

        const outerArc = d3.arc()
            .innerRadius(radius * 0.9)
            .outerRadius(radius * 0.9);

        // Add slices
        this._d3G.selectAll('slices')
            .data(pie)
            .enter()
            .append('path')
            .attr('d', arc)
            .attr('fill', d => d.data.color)
            .attr("stroke", "white")
            .style("stroke-width", "2px")
            .style("opacity", 0.7);

        // Add Polyline
        this._d3G.selectAll('polylines')
            .data(pie)
            .enter()
            .append('polyline')
            .attr("stroke", "black")
            .style("fill", "none")
            .attr("stroke-width", 1)
            .attr('points', d => {
                const posA = arc.centroid(d); // centroid of arc
                const posB = outerArc.centroid(d); // centroid of outer arc
                const posC = outerArc.centroid(d); // for text
                const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                posC[0] = radius * 0.95 * (midangle < Math.PI ? 1 : -1); // x position
                return [posA, posB, posC];
            });

        // Add Slice Labels
        this._d3G.selectAll('labels')
            .data(pie)
            .enter()
            .append('text')
            .text(d => `${d.data.label} (${d.data.value})`)
            .attr('transform', d => {
                const pos = outerArc.centroid(d);
                const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                pos[0] = radius * 0.99 * (midangle < Math.PI ? 1 : -1);
                return `translate(${pos})`;
            })
            .style('text-anchor', d => {
                const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                return (midangle < Math.PI ? 'start' : 'end');
            });

        // Chart Title
        this._d3Svg.append("text")
            .attr("x", width / 2)
            .attr("y", 30)
            .attr("text-anchor", "middle")
            .attr("font-size", "1.2em")
            .attr("font-weight", "bold")
            .text("Nodes vs Links Distribution");
    }

    /**
     * Renders a Time Series Chart (if timestamps exist).
     * @private
     * @param {object} data - The graph data {nodes, links}.
     * @param {number} width - SVG width.
     * @param {number} height - SVG height.
     */
    _renderTimeSeriesChart(data, width, height) {
        let timestamps = [];

        data.nodes.forEach(node => {
            if (node.createdAt) {
                const date = new Date(node.createdAt);
                if (!isNaN(date.getTime())) {
                    timestamps.push(date);
                }
            }
        });

        data.links.forEach(link => {
            if (link.createdAt) {
                const date = new Date(link.createdAt);
                if (!isNaN(date.getTime())) {
                    timestamps.push(date);
                }
            }
        });

        if (timestamps.length === 0) {
            this._displayFallbackMessage("No timestamps (e.g., 'createdAt' field) found in nodes or links for Time Series Chart.");
            return;
        }

        // Group by day
        const dailyCounts = {};
        timestamps.forEach(date => {
            const day = d3.timeDay(date); // Aligns to the start of the day
            dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        });

        const chartData = Object.keys(dailyCounts).map(dateStr => ({
            date: new Date(dateStr),
            count: dailyCounts[dateStr]
        })).sort((a, b) => a.date - b.date);

        if (chartData.length < 2) {
            this._displayFallbackMessage("Not enough data points (at least 2 days) to create a meaningful Time Series Chart.");
            return;
        }

        const margin = { top: 40, right: 30, bottom: 80, left: 60 }; // Increased bottom for rotated labels
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        this._d3G = this._d3Svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const xScale = d3.scaleTime()
            .domain(d3.extent(chartData, d => d.date))
            .range([0, innerWidth]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(chartData, d => d.count) * 1.1])
            .range([innerHeight, 0]);

        // Add X axis
        this._d3G.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale)
                .ticks(d3.timeDay.every(Math.ceil(chartData.length / 7))) // Adjust tick frequency
                .tickFormat(d3.timeFormat("%Y-%m-%d")))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");

        // Add Y axis
        this._d3G.append("g")
            .call(d3.axisLeft(yScale));

        // Add Y axis label
        this._d3G.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left + 15)
            .attr("x", 0 - (innerHeight / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text("Count");

        // Add the line
        this._d3G.append("path")
            .datum(chartData)
            .attr("fill", "none")
            .attr("stroke", "#3366cc")
            .attr("stroke-width", 2)
            .attr("d", d3.line()
                .x(d => xScale(d.date))
                .y(d => yScale(d.count))
            );

        // Add circles for data points
        this._d3G.selectAll(".dot")
            .data(chartData)
            .enter().append("circle")
            .attr("class", "dot")
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yScale(d.count))
            .attr("r", 4)
            .attr("fill", "#3366cc");

        // Chart Title
        this._d3Svg.append("text")
            .attr("x", width / 2)
            .attr("y", margin.top / 2)
            .attr("text-anchor", "middle")
            .attr("font-size", "1.2em")
            .attr("font-weight", "bold")
            .text("Activity Over Time (Daily Count)");
    }

    /**
     * Renders a Histogram of Node Degree.
     * @private
     * @param {object} data - The graph data {nodes, links}.
     * @param {number} width - SVG width.
     * @param {number} height - SVG height.
     */
    _renderHistogram(data, width, height) {
        if (data.nodes.length === 0 || data.links.length === 0) {
            this._displayFallbackMessage("No nodes or links to calculate node degrees for Histogram.");
            return;
        }

        const nodeDegrees = new Map(); // Map<nodeId, degree>

        // Initialize all nodes with degree 0
        data.nodes.forEach(node => {
            nodeDegrees.set(node.id, 0);
        });

        // Calculate degrees (in-degree + out-degree)
        data.links.forEach(link => {
            // Ensure source and target are resolved IDs, not objects (as d3-force resolves them)
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            if (nodeDegrees.has(sourceId) && nodeDegrees.has(targetId)) {
                nodeDegrees.set(sourceId, nodeDegrees.get(sourceId) + 1);
                // Only count unique connections for target if not same as source or if not a self-loop handled elsewhere
                nodeDegrees.set(targetId, nodeDegrees.get(targetId) + 1);
            } else {
                console.warn(`Link ${sourceId} -> ${targetId} involves non-existent node(s). Skipping for degree calculation.`);
            }
        });

        const degrees = Array.from(nodeDegrees.values());
        if (degrees.length === 0 || d3.max(degrees) === 0) {
            this._displayFallbackMessage("Could not calculate meaningful node degrees for Histogram (all nodes have 0 degree or no valid links).");
            return;
        }

        // Group degrees by value to count frequency
        const degreeFrequency = new Map(); // Map<degreeValue, count>
        degrees.forEach(degree => {
            degreeFrequency.set(degree, (degreeFrequency.get(degree) || 0) + 1);
        });

        const chartData = Array.from(degreeFrequency.entries())
            .map(([degree, frequency]) => ({ degree, frequency }))
            .sort((a, b) => a.degree - b.degree); // Sort by degree for clear x-axis

        const margin = { top: 40, right: 20, bottom: 60, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        this._d3G = this._d3Svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const xScale = d3.scaleBand()
             .domain(chartData.map(d => d.degree)) // Use all unique degree values
            .range([0, innerWidth])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(chartData, d => d.frequency) * 1.1])
            .range([innerHeight, 0]);

        // Add X axis
        this._d3G.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale));

        // Add Y axis
        this._d3G.append("g")
            .call(d3.axisLeft(yScale));

        // Bars
        this._d3G.selectAll(".bar")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", d => xScale(d.degree))
            .attr("y", d => yScale(d.frequency))
            .attr("width", xScale.bandwidth())
            .attr("height", d => innerHeight - yScale(d.frequency))
            .attr("fill", "#6699ff");

        // Chart Title
        this._d3Svg.append("text")
            .attr("x", width / 2)
            .attr("y", margin.top / 2)
            .attr("text-anchor", "middle")
            .attr("font-size", "1.2em")
            .attr("font-weight", "bold")
            .text("Node Degree Frequency Histogram");

        // Axis labels
        this._d3G.append("text")
            .attr("transform", `translate(${innerWidth / 2}, ${innerHeight + margin.bottom / 2 + 10})`)
            .style("text-anchor", "middle")
            .text("Node Degree");

        this._d3G.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left + 15)
            .attr("x", 0 - (innerHeight / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text("Number of Nodes");
    }

    /**
     * Renders a Pie Chart for Link Type Breakdown.
     * @private
     * @param {object} data - The graph data {nodes, links}.
     * @param {number} width - SVG width.
     * @param {number} height - SVG height.
     */
    _renderLinkTypeBreakdown(data, width, height) {
        if (data.links.length === 0) {
            this._displayFallbackMessage("No links to breakdown by type.");
            return;
        }

        const linkTypeCounts = new Map();
        data.links.forEach(link => {
            const type = link.label || 'unknown'; // Using link.label as the 'type'
            linkTypeCounts.set(type, (linkTypeCounts.get(type) || 0) + 1);
        });

        const chartData = Array.from(linkTypeCounts.entries())
            .map(([type, count]) => ({ label: type, value: count }));

        if (chartData.length === 0) {
            this._displayFallbackMessage("No meaningful link types found for breakdown.");
            return;
        }

        // Render as Pie Chart (similar to _renderPieChart, but with dynamic colors)
        const radius = Math.min(width, height) / 2 - 40;

        this._d3G = this._d3Svg.append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        const colorScale = d3.scaleOrdinal(d3.schemeCategory10); // Use a color scheme for varied types

        const pie = d3.pie()
            .value(d => d.value)(chartData);

        const arc = d3.arc()
            .innerRadius(0)
            .outerRadius(radius);

        const outerArc = d3.arc()
            .innerRadius(radius * 0.9)
            .outerRadius(radius * 0.9);

        // Add slices
        this._d3G.selectAll('slices')
            .data(pie)
            .enter()
            .append('path')
            .attr('d', arc)
            .attr('fill', d => colorScale(d.data.label))
            .attr("stroke", "white")
            .style("stroke-width", "2px")
            .style("opacity", 0.7);

        // Add labels
        this._d3G.selectAll('labels')
            .data(pie)
            .enter()
            .append('text')
            .text(d => `${d.data.label} (${d.data.value})`)
            .attr('transform', d => {
                const pos = outerArc.centroid(d);
                const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                pos[0] = radius * 0.99 * (midangle < Math.PI ? 1 : -1);
                return `translate(${pos})`;
            })
            .style('text-anchor', d => {
                const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                return (midangle < Math.PI ? 'start' : 'end');
            });

        // Add polylines
        this._d3G.selectAll('polylines')
            .data(pie)
            .enter()
            .append('polyline')
            .attr("stroke", "black")
            .style("fill", "none")
            .attr("stroke-width", 1)
            .attr('points', d => {
                const posA = arc.centroid(d);
                const posB = outerArc.centroid(d);
                const posC = outerArc.centroid(d);
                const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                posC[0] = radius * 0.95 * (midangle < Math.PI ? 1 : -1);
                return [posA, posB, posC];
            });


        // Chart Title
        this._d3Svg.append("text")
            .attr("x", width / 2)
            .attr("y", 30) // Adjusted slightly for visibility
            .attr("text-anchor", "middle")
            .attr("font-size", "1.2em")
            .attr("font-weight", "bold")
            .text("Link Type Breakdown");
    }

    /**
     * Renders a Bar Chart for Node Group Sizes.
     * @private
     * @param {object} data - The graph data {nodes, links}.
     * @param {number} width - SVG width.
     * @param {number} height - SVG height.
     */
    _renderGroupSizeChart(data, width, height) {
        if (data.nodes.length === 0) {
            this._displayFallbackMessage("No nodes to breakdown by group size.");
            return;
        }

        const groupCounts = new Map();
        let hasGroupOrTypeField = false;
        data.nodes.forEach(node => {
            if (node.group !== undefined || node.type !== undefined) { // Check for existence of group or type
                hasGroupOrTypeField = true;
                const group = node.group || node.type || 'unknown'; // default to 'unknown' if neither exists
                groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
            }
        });

        if (!hasGroupOrTypeField) {
            this._displayFallbackMessage("No 'group' or 'type' property found in nodes for Group Size Chart.");
            return;
        }

        const chartData = Array.from(groupCounts.entries())
            .map(([group, count]) => ({ group, count }))
            .sort((a, b) => b.count - a.count); // Sort by count descending

        const margin = { top: 40, right: 20, bottom: 80, left: 60 }; // Increased bottom for labels
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        this._d3G = this._d3Svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const xScale = d3.scaleBand()
            .domain(chartData.map(d => d.group))
            .range([0, innerWidth])
            .padding(0.2);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(chartData, d => d.count) * 1.1])
            .range([innerHeight, 0]);

        // Add X axis
        this._d3G.append("g")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .attr("transform", "rotate(-45)") // Rotate labels if they overlap
            .style("text-anchor", "end");

        // Add Y axis
        this._d3G.append("g")
            .call(d3.axisLeft(yScale));

        // Add Y axis label
        this._d3G.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left + 15)
            .attr("x", 0 - (innerHeight / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text("Number of Nodes");

        // Bars
        this._d3G.selectAll(".bar")
            .data(chartData)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", d => xScale(d.group))
            .attr("y", d => yScale(d.count))
            .attr("width", xScale.bandwidth())
            .attr("height", d => innerHeight - yScale(d.count))
            .attr("fill", "#88ccaa");

        // Bar labels (values on top of bars)
        this._d3G.selectAll(".bar-label")
            .data(chartData)
            .enter().append("text")
            .attr("class", "bar-label")
            .attr("x", d => xScale(d.group) + xScale.bandwidth() / 2)
            .attr("y", d => yScale(d.count) - 5)
            .attr("text-anchor", "middle")
            .text(d => d.count);

        // Chart Title
        this._d3Svg.append("text")
            .attr("x", width / 2)
            .attr("y", margin.top / 2)
            .attr("text-anchor", "middle")
            .attr("font-size", "1.2em")
            .attr("font-weight", "bold")
            .text("Node Group Size Breakdown");
    }

    /**
     * Exports the current graph SVG to a file.
     * @returns {void}
     */
    exportGraphAsSvg() {
        if (!this._d3Svg) {
            alert('No graph to export.');
            return;
        }
        const svgString = new XMLSerializer().serializeToString(this._d3Svg.node());
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        // Ensure FileSaver is available globally from CDN for saveAs.
        // Provide a fallback for browsers that don't support it directly or without FileSaver.js.
        if (window.saveAs) {
            window.saveAs(blob, 'rdf_graph.svg');
        } else {
            console.warn("FileSaver.js (saveAs function) is not available. Attempting direct download.");
            const downloadLink = document.createElement('a');
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = 'rdf_graph.svg';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(downloadLink.href); // Clean up the object URL
        }
    }

    /**
     * Gets unique predicate labels from the current graph data.
     * This is still relevant for force-directed graph filtering.
     * @returns {string[]}
     */
    getUniquePredicateLabels() {
        if (!this._currentGraphData || !this._currentGraphData.links) {
            return [];
        }
        return Array.from(new Set(this._currentGraphData.links.map(l => l.label).filter(Boolean))); // Filter out undefined/null labels
    }

    /**
     * Re-renders the current chart with an updated predicate filter.
     * This primarily affects the force-directed graph. Other charts generally
     * operate on overall graph statistics, not filtered subgraphs.
     * @param {string} predicateFilter - The predicate label to filter by.
     */
    updatePredicateFilter(predicateFilter) {
        // Re-render the currently active chart type using the stored data and the new filter.
        // The filter will only apply to Force Directed Graph as implemented in renderChart logic.
        this.renderChart(this._currentGraphData, this._currentChartType, predicateFilter);
    }

    /**
     * Returns a mapping of chart names to functions that trigger rendering.
     * These functions will use the graph data *currently stored* in the service
     * (i.e., the data from the last call to `renderChart`).
     * This assumes `renderChart` has been called at least once with valid data.
     * @returns {object.<string, Function>} A map where keys are chart names and values are functions.
     */
    getChartRenderers() {
        // Provide functions that, when called, trigger a render of the currently loaded data
        // for the specified chart type. The predicate filter is only relevant for force-directed.
        return {
            forceDirected: () => this.renderChart(this._currentGraphData, GraphTypes.FORCE_DIRECTED, this._currentPredicateFilter),
            barChart: () => this.renderChart(this._currentGraphData, GraphTypes.BAR_CHART),
            pieChart: () => this.renderChart(this._currentGraphData, GraphTypes.PIE_CHART),
            timeSeriesChart: () => this.renderChart(this._currentGraphData, GraphTypes.TIME_SERIES),
            histogram: () => this.renderChart(this._currentGraphData, GraphTypes.HISTOGRAM),
            linkTypeBreakdown: () => this.renderChart(this._currentGraphData, GraphTypes.LINK_TYPE_BREAKDOWN),
            groupSizeChart: () => this.renderChart(this._currentGraphData, GraphTypes.GROUP_SIZE),
        };
    }
}