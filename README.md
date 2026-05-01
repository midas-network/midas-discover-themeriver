# midas-river

<img width="1617" alt="Screenshot 2023-05-01 at 9 54 02 PM" src="https://user-images.githubusercontent.com/11561825/235562996-11526ba3-a7e5-4267-b654-ef7223c83358.png">

MIDAS River is a static browser-based visualization for exploring ThemeRiver data.

## Running locally

This project does not require a build step, but it should be served through a local HTTP server because the frontend loads CSV and JSON files from the `data/` directory at runtime.

### Option 1: Python

From the project root, run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Option 2: VS Code Live Server

If you use the Live Server extension in VS Code, open `index.html` with Live Server from the project root.

## Project structure

- `index.html` contains the app shell and UI layout.
- `js/main.js` renders the visualization and loads data files.
- `data/` contains the CSV and JSON files used by the visualization.
- `css/` contains the app styles.
