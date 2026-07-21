(function initMidasTheme(global) {
    "use strict";

    const STORAGE_KEY = "midas-theme-preference";
    const PREFERENCES = new Set(["system", "light", "dark"]);
    const root = document.documentElement;
    const colorSchemeQuery = global.matchMedia("(prefers-color-scheme: dark)");

    function readPreference() {
        try {
            const stored = global.localStorage.getItem(STORAGE_KEY);
            return PREFERENCES.has(stored) ? stored : "system";
        } catch (error) {
            return "system";
        }
    }

    function resolveTheme(preference) {
        if (preference === "light" || preference === "dark") return preference;
        return colorSchemeQuery.matches ? "dark" : "light";
    }

    function updateThemeColor() {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;

        const headerColor = global.getComputedStyle(root)
            .getPropertyValue("--color-header-bg")
            .trim();
        if (headerColor) meta.setAttribute("content", headerColor);
    }

    function syncControls(preference) {
        document.querySelectorAll("[data-theme-selector]").forEach((control) => {
            control.value = preference;
        });
    }

    function applyTheme(preference, persist) {
        const safePreference = PREFERENCES.has(preference) ? preference : "system";
        const resolvedTheme = resolveTheme(safePreference);

        if (safePreference === "system") {
            root.removeAttribute("data-theme");
        } else {
            root.setAttribute("data-theme", safePreference);
        }
        root.setAttribute("data-bs-theme", resolvedTheme);
        root.setAttribute("data-theme-preference", safePreference);
        root.style.colorScheme = resolvedTheme;

        if (persist) {
            try {
                global.localStorage.setItem(STORAGE_KEY, safePreference);
            } catch (error) {
                // The selected theme still applies when storage is unavailable.
            }
        }

        syncControls(safePreference);
        global.requestAnimationFrame(updateThemeColor);
        return resolvedTheme;
    }

    function bindControls() {
        document.querySelectorAll("[data-theme-selector]").forEach((control) => {
            control.addEventListener("change", (event) => {
                applyTheme(event.currentTarget.value, true);
            });
        });
        syncControls(readPreference());
        updateThemeColor();
    }

    colorSchemeQuery.addEventListener("change", () => {
        if (readPreference() === "system") applyTheme("system", false);
    });

    global.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) applyTheme(readPreference(), false);
    });

    global.MidasTheme = {
        apply: (preference) => applyTheme(preference, true),
        getPreference: readPreference,
        getResolvedTheme: () => resolveTheme(readPreference()),
        storageKey: STORAGE_KEY
    };

    applyTheme(readPreference(), false);
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindControls, {once: true});
    } else {
        bindControls();
    }
})(window);
