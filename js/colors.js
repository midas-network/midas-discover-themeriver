const bar_colors = Object.create(null);
const other_bar_color = "#687386";
const colors = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#17becf",
    "#bcbd22",
    "#e377c2",
    "#4c78a8",
    "#f58518",
    "#54a24b",
    "#b279a2",
    "#e45756",
    "#72b7b2",
    "#b68f00",
    "#6b4c9a",
    "#00876c",
    "#c43a31",
    "#3a86ff"
];

const reset_bar_colors = () => {
    Object.keys(bar_colors).forEach(key => delete bar_colors[key]);
};

const next_bar_color = (d, i) => {
    const topic = d.key;
    if (topic === "Other") return other_bar_color;

    if (bar_colors[topic] === undefined) {
        const colorIndex = Number.isFinite(i) ? i : Object.keys(bar_colors).length;
        bar_colors[topic] = colors[colorIndex % colors.length];
    }

    return bar_colors[topic];
};
