const bar_colors = new Object()

const next_bar_color =  (d,i) => {
        colors = [
            "#FF007F",
            "#FFBF00",
            "#08E8DE",
            "#66FF00",
            "#FF9966",
            "#00FFFF",
            "#7366BD",
            "#FF7F50",
            "#DE3163",
            "#9ACEEB",
            "#FFBCD9",
            "#FF1493",
            "#00BFFF",
            "#7CB9E8",
            "#FBCEB1",
            "#ACE5EE",
            "#A2A2D0",
            "#6699CC",
            "#00BFBF",
            "#DE5D83",
            "#CB4154",
            "#964B00",
            "#CC5500",
            "#E97451",
            "#A9B2C3",
            "#C19A6B",
            "#FFA6C9",
            "#DE3163",
            "#007BA7",
            "#CD5C5C",
            "#D2691E",
            "#0047AB",
            "#DA8A67",
            "#FF7F50",
            "#9ACEEB",
            "#FFBCD9",
            "#DC143C",
            "#00FFFF",
            "#FDB813",
            "#00008B",
            "#008B8B",
            "#B8860B",
            "#A9A9A9",
            "#006400",
            "#BDB76B",
            "#8B008B",
            "#556B2F",
            "#FF8C00",
            "#9932CC",
            "#8B0000",
            "#E9967A",
            "#8FBC8F",
            "#483D8B",
            "#2F4F4F",
            "#00CED1",
            "#9400D3",
            "#FF1493"
        ]
        if (currentColor > 55) {
            currentColor = 0;
        }

        if (bar_colors[d.key] == undefined) {
           bar_colors[d.key] = colors[currentColor++]
        }
        return bar_colors[d.key];
    }