const svg = d3.select('#main-svg');

let up_max = 5000;
let yScale;
let maxX, maxY;
let dates;
let allDates = [];
let xScale, full_dataset, limited_dataset;
let redrawThemeRiver = null;
let currentZoomTransform = d3.zoomIdentity;

const chartMargins = {
    top: 20,
    right: 50,
    bottom: 45,
    left: 50
};
const zoomScaleExtent = [1, 8];

let mouseOutTimeout;
let fadeInDuration = 750;
let papersJsonFilename2;
let selectionCueTimer, hoverTimer, popupHideTimer, resizeTimer;
let started = false;
let alreadyAnimatedResize = false;
let papersShowing = false;
let selectedTopic = null;
let selectedDateIndex = null;
let rendered_topics = new Set();
const base_opacity = 0.7;
const active_opacity = 0.96;
const inactive_opacity = 0.16;
const TOP_TOPIC_COUNT = 20;
const OTHER_TOPIC = "Other";

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getSvgBounds() {
    const rect = $("#main-svg")[0].getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height
    };
}

function clampDateIndex(index) {
    return Math.max(0, Math.min(index, dates.length - 1));
}

function getDateIndexFromTarget(target) {
    const localX = d3.mouse(target)[0];
    const unscaledX = currentZoomTransform.invertX(localX);
    return clampDateIndex(Math.round(xScale.invert(unscaledX)));
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


const xValue = (datum) => {
    return dates.indexOf(datum['date']);
};
const yValue = (datum) => {
    return datum['adjusted_percent']
};
const yRaw = (datum) => {
    return datum['count']
};
// Dataset metadata. These defaults let the app work even if the manifest fails
// to load (e.g. an older static deploy); applyManifest() overrides them from
// data/manifest.json so the controls are driven entirely by the data on disk.
let pubmedDatasourceLookup = {
    'meshTerms': 'MeSH Terms',
    'pubmedKeywords': 'PubMed Keywords',
    'paperAbstract': 'Title + Abstracts'
};
let ngramSizeLookup = {
    '1': 'Unigrams',
    '2': 'Bigrams',
    '3': 'Trigrams'
};
// id -> { label, ngrams:[…], supportsNgrams:bool, default:bool }
let SOURCE_META = {
    'meshTerms':      {label: 'MeSH Terms',        ngrams: [1],       supportsNgrams: false, default: false},
    'pubmedKeywords': {label: 'PubMed Keywords',   ngrams: [1, 2, 3], supportsNgrams: true,  default: false},
    'paperAbstract':  {label: 'Title + Abstracts', ngrams: [1, 2, 3], supportsNgrams: true,  default: true}
};

// The most recently applied manifest (for provenance / download metadata).
let MANIFEST = null;

// Fetch the build-time manifest (a static file, served by nginx in prod).
// Returns null if it is missing or malformed, in which case the defaults stand.
async function loadManifest() {
    try {
        const res = await fetch('./data/manifest.json', {cache: 'no-store'});
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    } catch (err) {
        console.warn('ThemeRiver: manifest unavailable, using built-in defaults:', err.message);
        return null;
    }
}

// Refresh lookups/metadata from a manifest, then (re)build the option controls.
function applyManifest(manifest) {
    MANIFEST = manifest;
    if (manifest && Array.isArray(manifest.datasets) && manifest.datasets.length) {
        pubmedDatasourceLookup = {};
        SOURCE_META = {};
        for (const d of manifest.datasets) {
            pubmedDatasourceLookup[d.id] = d.label;
            SOURCE_META[d.id] = {
                label: d.label,
                ngrams: (d.ngrams && d.ngrams.length) ? d.ngrams : [1],
                supportsNgrams: !!d.supportsNgrams,
                default: !!d.default
            };
        }
        if (manifest.ngramLabels) ngramSizeLookup = manifest.ngramLabels;
    }
    buildOptionControls();
    updateProvenance();
}

// Show the data build date + licensing in the data bar (FAIR provenance).
function updateProvenance() {
    const el = document.getElementById('data-provenance');
    if (!el) return;
    if (MANIFEST && MANIFEST.generatedAt) {
        const d = new Date(MANIFEST.generatedAt);
        const when = isNaN(d) ? MANIFEST.generatedAt : d.toISOString().slice(0, 10);
        const lic = MANIFEST.dataLicense || 'CC-BY-4.0';
        el.textContent = `Data generated ${when} · Licensed ${lic}`;
    } else {
        el.textContent = '';
    }
}

// Point the download links at the files behind the current selection.
function updateDownloadLinks(baseFilename) {
    const counts = document.getElementById('download-counts');
    const papers = document.getElementById('download-papers');
    if (counts) counts.href = './data/' + baseFilename + 'counts.csv';
    if (papers) papers.href = './data/' + baseFilename + 'papers.json';
}

// Non-blocking error banner over the chart (e.g. a dataset file is missing).
function showVizError(message) {
    const el = document.getElementById('viz-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
}

function hideVizError() {
    const el = document.getElementById('viz-error');
    if (el) el.hidden = true;
}

function showVizLoading() {
    const el = document.getElementById('viz-loading');
    if (el) el.hidden = false;
}

function hideVizLoading() {
    const el = document.getElementById('viz-loading');
    if (el) el.hidden = true;
}

// Generate the source + n-gram radio controls from SOURCE_META so that adding a
// dataset never requires editing this markup — it appears automatically.
function buildOptionControls() {
    const ids = Object.keys(SOURCE_META);
    if (!ids.length) return;
    const defaultId = ids.find(id => SOURCE_META[id].default) || ids[0];

    const sourceHtml = ids.map(id => {
        const checked = id === defaultId ? ' checked' : '';
        return `<label class="seg"><input type="radio" name="pubmed-source-radio" value="${id}"${checked}>` +
            `<span class="seg__label">${escapeHtml(SOURCE_META[id].label)}</span></label>`;
    }).join('');
    $('.control-group-pubmed-source').html(sourceHtml);

    // Union of n-gram sizes across all datasets, ascending.
    const ngramSet = new Set();
    ids.forEach(id => (SOURCE_META[id].ngrams || []).forEach(n => ngramSet.add(n)));
    const ngrams = [...ngramSet].sort((a, b) => a - b);
    const defaultNgrams = SOURCE_META[defaultId].ngrams;
    const defaultNgram = defaultNgrams.includes(2) ? 2 : defaultNgrams[0];

    const ngramHtml = ngrams.map(n => {
        const checked = n === defaultNgram ? ' checked' : '';
        const aria = ngramSizeLookup[n] ? ` aria-label="${escapeHtml(ngramSizeLookup[n])}"` : '';
        return `<label class="seg"><input type="radio" name="ngram-radio" value="${n}"${checked}${aria}>` +
            `<span class="seg__label">${n}</span></label>`;
    }).join('');
    $('.control-group-ngram').html(ngramHtml);
}

function setPaperAndTop20Showing(showPapers, showTerms = true) {
    let hideOnSelection, paperInstructions, paperDisplay, paperVisibility, termDisplay, termVisibility;
    let paperDisplayOpacity, termDisplayOpacity;
    const transitionDuration = prefersReducedMotion() ? '0s' : '2s';

    if (showPapers) {
        hideOnSelection = "hidden";
        paperInstructions = "none";
        paperDisplay = "block";
        paperVisibility = "visible";
        paperDisplayOpacity = 1


    } else {
        hideOnSelection = "visible";
        paperInstructions = "block";
        paperDisplay = "none";
        paperVisibility = "hidden";
        paperDisplayOpacity = 0
    }
    termDisplay = showTerms ? "block" : "none";
    termVisibility = showTerms ? "visible" : "hidden";
    termDisplayOpacity = showTerms ? 1 : 0;
    $(".hide-on-selection").css("visibility", hideOnSelection);
    $(".paper-instructions").css("display", paperInstructions);
    $(".paper-display").css({'display': paperDisplay, 'visibility': paperVisibility});
    $(".paper-display").css({'opacity': paperDisplayOpacity, 'transition': transitionDuration});
    $(".term-display").css({'display': termDisplay, 'visibility': termVisibility});
    $(".term-display").css({'opacity': termDisplayOpacity, 'transition': transitionDuration});
    papersShowing = showPapers;
}

function getThemePath(topic) {
    return $('#maingroup path').filter(function () {
        return this.dataset.topic === topic;
    }).first();
}

function isOtherTopic(topic) {
    return topic === OTHER_TOPIC;
}

function setRibbonHighlight(topic) {
    const paths = $("#maingroup path");
    if (!paths.length) return;

    const activePath = topic ? getThemePath(topic) : $();
    if (!topic || !activePath.length) {
        paths.attr("opacity", base_opacity);
        paths.removeClass("theme-ribbon-active theme-ribbon-muted");
        return;
    }

    paths.each(function () {
        const isActive = this.dataset.topic === topic;
        $(this)
            .attr("opacity", isActive ? active_opacity : inactive_opacity)
            .toggleClass("theme-ribbon-active", isActive)
            .toggleClass("theme-ribbon-muted", !isActive);
    });
}

function setTermHighlight(topic) {
    $('#term-list .term-btn').each(function () {
        $(this).toggleClass('term-btn--highlighted', !!topic && this.dataset.topic === topic);
    });
}

function restoreSelectedHighlight() {
    setRibbonHighlight(selectedTopic);
    setTermHighlight(selectedTopic);
}

function highlightTheme(topic) {
    setRibbonHighlight(topic);
    setTermHighlight(topic);
}

function resetPaths() {
    clearTimeout(selectionCueTimer)
    $("#maingroup path").attr("opacity", base_opacity);
    $("#maingroup path").css("filter", "");
    $("#maingroup path").removeClass("theme-ribbon-active theme-ribbon-muted theme-ribbon-selected-cue");
    setTermHighlight(null);
}

function cueSelectedTheme(topic) {
    clearTimeout(selectionCueTimer);
    const path = getThemePath(topic);
    if (!path.length || prefersReducedMotion()) return;

    path.addClass("theme-ribbon-selected-cue");
    selectionCueTimer = setTimeout(function () {
        path.removeClass("theme-ribbon-selected-cue");
    }, 900);
}

function getDateIndexForYear(year) {
    if (!dates || !dates.length) return -1;
    return dates.findIndex(d => d && d.startsWith(String(year)));
}

function getYearFromDate(dateString) {
    return String(dateString || '').substr(0, 4);
}

function getDatasetForYear(dataset, year) {
    const selectedYear = String(year || '');
    if (!selectedYear) return dataset || [];
    return (dataset || []).filter(d => getYearFromDate(d.date) === selectedYear);
}

function getDatasetThroughYear(dataset, year) {
    const endYear = Number(year);
    if (!Number.isFinite(endYear)) return dataset || [];
    return (dataset || []).filter(d => Number(getYearFromDate(d.date)) <= endYear);
}

function getTopicRankingDataset(dataset, year) {
    const yearlyDataset = getDatasetForYear(dataset, year).filter(d => d.count > 0);
    return yearlyDataset.length ? yearlyDataset : (dataset || []);
}

function getYearsFromDates(dateList) {
    if (!dateList || !dateList.length) return [];
    return dateList.map(getYearFromDate);
}

function getAvailableYears() {
    return getYearsFromDates(allDates.length ? allDates : dates);
}

function getDatesThroughYear(dateList, year) {
    const endYear = Number(year);
    if (!dateList || !dateList.length || !Number.isFinite(endYear)) return dateList || [];
    const filteredDates = dateList.filter(date => Number(getYearFromDate(date)) <= endYear);
    return filteredDates.length ? filteredDates : dateList;
}

function getLatestYear() {
    const years = getAvailableYears();
    if (!years.length) return '';
    return years.reduce((latest, year) => Number(year) > Number(latest) ? year : latest, years[0]);
}

function getCurrentSelectionDateIndex() {
    if (!dates || !dates.length) return -1;
    const selectedYear = $('#year-select').val() || $('#current-year2').text() || $('#current-year').text();
    const dateIndex = selectedYear ? getDateIndexForYear(selectedYear) : -1;
    return dateIndex >= 0 ? dateIndex : dates.length - 1;
}

function populateYearSelect() {
    const select = document.getElementById('year-select');
    if (!select) return '';

    const years = getAvailableYears();
    const previousYear = select.value;
    const latestYear = getLatestYear();
    const selectedYear = years.includes(previousYear) ? previousYear : latestYear;

    select.innerHTML = years.map(year => {
        const selected = year === selectedYear ? ' selected' : '';
        return `<option value="${escapeHtml(year)}"${selected}>${escapeHtml(year)}</option>`;
    }).join('');

    select.value = selectedYear;
    return selectedYear;
}

function updateTermListForYear(year, selected_topic) {
    dismissTransientPopups();
    $('#current-year2').text(year);
    fillTopics(year, selected_topic);
    $("#topic-line2, #term-list").show()
    setPaperAndTop20Showing(papersShowing, true);
}

function updateSelectionChip() {
    const chip = document.getElementById('selection-chip');
    const chipText = document.getElementById('selection-chip-text');
    if (!chip || !chipText) return;

    if (!selectedTopic || selectedDateIndex === null || selectedDateIndex < 0 || !dates[selectedDateIndex]) {
        chip.hidden = true;
        chipText.textContent = '';
        return;
    }

    chipText.textContent = `${selectedTopic} - ${getYearFromDate(dates[selectedDateIndex])}`;
    chip.hidden = false;
}

function resetPaperSelection() {
    selectedTopic = null;
    selectedDateIndex = null;
    papersShowing = false;
    $('#current-topic-count, #current-topic, #current-year').text('');
    $('#paper-list').empty();
    $("#instruction-line").show();
    resetPaths();
    updateSelectionChip();
}

function buildSortingSet(filtered_set, includeOther) {
    let odds = [],
        evens = []
    let sorting_set = [];
    for (const x of Array(filtered_set.length).keys()) {
        if (x === 0) {

        } else if (x % 2 === 1) {
            odds.push(x)
        } else {
            evens.push(x)
        }
    }

    evens.reverse().forEach((index) => {
        sorting_set.push(filtered_set[index]['key'])
    })
    if (filtered_set[0]) {
        sorting_set.push(filtered_set[0]['key'])
    }
    odds.forEach((index) => {
        sorting_set.push(filtered_set[index]['key'])
    })
    if (includeOther) {
        sorting_set.push(OTHER_TOPIC);
    }
    return sorting_set;
}

function buildChartDataset(dataset, topTopics, allDates, includeOther) {
    const topTopicSet = new Set(topTopics);
    const chartDataset = dataset
        .filter(d => topTopicSet.has(d.topic))
        .map(d => Object.assign({}, d));
    const hasOtherTopics = dataset.some(d => !topTopicSet.has(d.topic));

    if (!includeOther || !hasOtherTopics) return chartDataset;

    allDates.forEach(date => {
        const otherCount = dataset.reduce((sum, datum) => {
            return datum.date === date && !topTopicSet.has(datum.topic) ? sum + datum.count : sum;
        }, 0);
        chartDataset.push({
            date: date,
            topic: OTHER_TOPIC,
            count: otherCount
        });
    });

    return chartDataset;
}

function getChartViewLabel() {
    const datasource = $('#pubmed-datasource-in-title').text().trim();
    const ngram = $('#ngram-size-in-title').text().trim();
    return [datasource, ngram].filter(Boolean).join(' ') || 'selected dataset';
}

function getChartLayout() {
    return $('input[name="layout-radio"]:checked').val() === 'stacked' ? 'stacked' : 'stream';
}

function getTopicLimit() {
    const selectedLimit = Number($('input[name="topic-limit-radio"]:checked').val());
    return Number.isFinite(selectedLimit) && selectedLimit > 0 ? selectedLimit : TOP_TOPIC_COUNT;
}

function shouldShowOtherBand() {
    const toggle = document.getElementById('show-other-toggle');
    return toggle ? toggle.checked : false;
}

function getChartLayoutLabel() {
    return getChartLayout() === 'stacked' ? 'zero-baseline stacked area chart' : 'streamgraph';
}

function getYearRangeText() {
    if (!dates || !dates.length) return '';
    const years = getYearsFromDates(dates);
    return `${years[0]} to ${years[years.length - 1]}`;
}

function ensureSvgTitle() {
    if (!document.getElementById('main-svg-title')) {
        svg.append("title").attr("id", "main-svg-title");
    }
}

function updateChartAccessibleText(keys, hasHiddenOther, selectedYear) {
    ensureSvgTitle();

    const viewLabel = getChartViewLabel();
    const layoutLabel = getChartLayoutLabel();
    const yearRange = getYearRangeText();
    const renderedCount = keys.filter(key => !isOtherTopic(key)).length;
    const hasOther = keys.some(isOtherTopic);
    const rankedYearText = selectedYear ? ` ranked in ${selectedYear}` : "";
    const otherTitleText = hasOther ? " plus an Other band for remaining topics" : hasHiddenOther ? " with the Other band hidden" : "";
    const otherSummaryText = hasOther ? ", plus an Other band for remaining topics" : hasHiddenOther ? ", with the Other band hidden" : "";
    const title = `ThemeRiver ${layoutLabel} of the top ${renderedCount} ${viewLabel} themes${rankedYearText}${otherTitleText}, ${yearRange}`;
    const summary = `ThemeRiver ${layoutLabel} showing the top ${renderedCount} ${viewLabel} themes${rankedYearText} across ${yearRange}${otherSummaryText}. Full yearly counts for charted themes are available in the data table.`;

    $('#main-svg-title').text(title);
    $('#chart-summary').text(summary);
}

function buildChartDataTable(dataset, keys, selectedYear) {
    const container = document.getElementById('chart-data-table');
    if (!container) return;
    if (!dataset || !dataset.length || !dates || !dates.length) {
        container.innerHTML = '';
        return;
    }

    const sortedTopics = Array.isArray(keys) && keys.length ? keys : getFilteredSet(dataset).map(d => d.key);
    const countsByTopic = new Map();
    dataset.forEach(datum => {
        if (!countsByTopic.has(datum.topic)) {
            countsByTopic.set(datum.topic, new Map());
        }
        countsByTopic.get(datum.topic).set(datum.date, datum.count);
    });

    const viewLabel = getChartViewLabel();
    const yearRange = getYearRangeText();
    const rankedYearText = selectedYear ? ` ranked in ${escapeHtml(selectedYear)}` : '';
    let table = `<table><caption>Yearly paper counts for charted ${escapeHtml(viewLabel)} themes${rankedYearText}, ${escapeHtml(yearRange)}.</caption>`;
    table += '<thead><tr><th scope="col">Theme</th>';
    dates.forEach(date => {
        table += `<th scope="col">${escapeHtml(getYearFromDate(date))}</th>`;
    });
    table += '</tr></thead><tbody>';

    sortedTopics.forEach(topic => {
        table += `<tr><th scope="row">${escapeHtml(topic)}</th>`;
        dates.forEach(date => {
            const count = countsByTopic.get(topic)?.get(date) || 0;
            table += `<td>${count}</td>`;
        });
        table += '</tr>';
    });

    table += '</tbody></table>';
    container.innerHTML = table;
}

function showBootstrapTab(tabElement) {
    if (!tabElement || !window.bootstrap || !bootstrap.Tab) return;
    const tab = bootstrap.Tab.getOrCreateInstance
        ? bootstrap.Tab.getOrCreateInstance(tabElement)
        : new bootstrap.Tab(tabElement);
    tab.show();
}

function focusThemeExtractionHeading() {
    setTimeout(() => {
        const heading = document.getElementById('term-extraction-heading');
        if (!heading) return;
        heading.focus({preventScroll: true});
        heading.scrollIntoView({block: 'start'});
    }, 0);
}

function showThemeExtractionDocs() {
    const termTab = document.getElementById('doc-tab-terms');
    const termPanel = document.getElementById('term-tab-explain');
    if (!termTab || !termPanel) return;

    if (termPanel.classList.contains('active')) {
        focusThemeExtractionHeading();
        return;
    }

    termTab.addEventListener('shown.bs.tab', focusThemeExtractionHeading, {once: true});
    showBootstrapTab(termTab);
}

function showAboutData(event) {
    event.preventDefault();

    const introTab = document.getElementById('main-tab-intro');
    const introPanel = document.getElementById('home');
    if (!introTab || !introPanel) return;

    if (introPanel.classList.contains('active')) {
        showThemeExtractionDocs();
        return;
    }

    introTab.addEventListener('shown.bs.tab', showThemeExtractionDocs, {once: true});
    showBootstrapTab(introTab);
}

function positionPopup(elem, pageX, pageY) {
    const safeX = Math.min(Math.max(0, pageX), Math.max(0, window.innerWidth - 320));
    const top = window.innerHeight - pageY < 500 ? pageY - elem.outerHeight() : pageY;
    const safeTop = Math.max(0, top);
    elem.css({
        'left': safeX + 14,
        'top': safeTop,
        'width': 'calc(100vw - ' + (safeX + 32) + 'px)',
        'max-width': '560px',
        'max-height': 'calc(100vh - ' + safeTop + 'px)'
    });
}

function getFocusedPaperLink() {
    const activeElement = document.activeElement;
    return activeElement && activeElement.matches && activeElement.matches('#paper-list .paper a')
        ? activeElement
        : null;
}

function showPaperAbstract(paperItem, event, delay, source = 'hover') {
    const item = $(paperItem);
    const link = item.children("a");
    const focusedPaperLink = getFocusedPaperLink();
    if (source === 'hover' && focusedPaperLink && focusedPaperLink !== link[0]) return;

    clearTimeout(hoverTimer);
    clearTimeout(popupHideTimer);

    const elem = $('#abstract-hover');
    const offset = item.offset() || {left: 0, top: 0};
    const pageX = event && event.pageX ? event.pageX : offset.left + item.outerWidth();
    const pageY = event && event.pageY ? event.pageY : offset.top;

    $("#paper-list a[aria-describedby='abstract-hover']").removeAttr('aria-describedby');
    $("#hover-paper-title").text(link.attr('data-paper-title') || link.text())
    $("#hover-paper-abstract").text(item.children("span").text())
    link.attr('aria-describedby', 'abstract-hover');
    positionPopup(elem, pageX, pageY);

    hoverTimer = setTimeout(function () {
        elem.show()
    }, prefersReducedMotion() ? 0 : delay)
}

function scheduleHidePaperAbstract(options = {}) {
    if (options.preserveFocused && getFocusedPaperLink()) return;
    clearTimeout(hoverTimer)
    clearTimeout(popupHideTimer)
    popupHideTimer = setTimeout(function () {
        if (options.preserveFocused && getFocusedPaperLink()) return;
        $("#paper-list a[aria-describedby='abstract-hover']").removeAttr('aria-describedby');
        $("#abstract-hover").hide()
    }, prefersReducedMotion() ? 0 : 250)
}

function dismissTransientPopups() {
    clearTimeout(hoverTimer)
    clearTimeout(popupHideTimer)
    clearTimeout(mouseOutTimeout)
    $("#paper-list a[aria-describedby='abstract-hover']").removeAttr('aria-describedby');
    $("#abstract-hover").hide()
    $('#word-box').stop(true, true).fadeTo(0, 0);
    fadeInDuration = prefersReducedMotion() ? 0 : 750
}

const showPapers = (topic, dateIndex, options = {}) => {
    if (isOtherTopic(topic)) return;
    dismissTransientPopups();

    const updateInfoPanel = (year, topic, paper_list, count) => {

        const paper_elem = $('#paper-list')

        $('#current-year').text(year)
        $('#current-year2').text(year)
        $('#current-topic-count').text(count)

        $('#current-topic').text(topic)
        paper_elem[0].innerHTML = paper_list;
        paper_elem[0].scrollTop = 0;

        $("#instruction-line").hide()
        $("#topic-line,#topic-line2, #term-list").show()

        fillTopics(year, topic)
        if (options.focusTermButton) {
            document.querySelector('.term-btn[aria-current="true"]')?.focus({preventScroll: true});
        }
        $(".paper").on("mouseenter", function (event) {
            showPaperAbstract(event.currentTarget, event, 1000, 'hover')
        }).on("mouseleave", function () {
            scheduleHidePaperAbstract({preserveFocused: true});
        });
    }

    $(".hide-on-start").css("visibility", "visible")
    if (!topic || dateIndex < 0 || !dates[dateIndex]) {
        updateInfoPanel('', topic || '', '<p>No papers found for this selection.</p>', 0);
        return;
    }
    selectedTopic = topic;
    selectedDateIndex = dateIndex;
    updateSelectionChip();
    const year = dates[dateIndex].substr(0, 4)
    resetPaths()
    cueSelectedTheme(topic)
    highlightTheme(topic)
    setPaperAndTop20Showing(true)

    fetch(papersJsonFilename2)
        .then(response => {
            return response.json()
        })
        .then(papers => {
                const articles = papers[year] && papers[year][topic] ? papers[year][topic] : [];
                let paper_list = "<ul>"
                for (let article of articles) {
                    const paperTitle = escapeHtml(article['title']);
                    paper_list += "<li class='paper'><a href='" + escapeHtml(article['uri']) +
                        "' target='_blank' rel='noopener noreferrer' data-paper-title='" + paperTitle + "'>" +
                        paperTitle + "<span class='sr-only'> (opens in a new tab)</span></a>" +
                        "<span>" + escapeHtml(article['abstract']) + "</span></li>"
                }
                paper_list += "</ul>"
                updateInfoPanel(year, topic, paper_list, articles.length)
            }
        )
        .catch(() => {
            updateInfoPanel(year, topic, '<p>Failed to load papers.</p>', 0);
        })
}

function fillTopics(year, selected_topic) {
    let s_date = year + '/1/1'
    let topicDataset = full_dataset || limited_dataset || [];
    const yearTopicCounts = new Map();
    topicDataset
        .filter(d => d.date == s_date && !isOtherTopic(d.topic))
        .forEach(d => {
            yearTopicCounts.set(d.topic, d.count);
        });

    let year_topics = topicDataset.filter(d => d.date == s_date && d.count != 0)
        .filter(d => !isOtherTopic(d.topic))
        .sort((a, b) => (a.count < b.count) ? 1 : ((b.count < a.count) ? -1 : 0))
        .map(function (d) {
            return d.topic
        })
    rendered_topics.forEach(topic => {
        if (!year_topics.includes(topic)) year_topics.push(topic);
    });
    let topic_list = "<ul class='term-list-ul'>"
    year_topics.forEach((topic, i) => {
        const d = {}
        d.key = topic
        const topicCount = yearTopicCounts.get(topic) || 0;
        const topicIsRendered = rendered_topics.has(topic);
        const swatchClass = topicIsRendered ? "term-swatch" : "term-swatch term-swatch--muted";
        const swatchStyle = topicIsRendered ? " style='background:" + next_bar_color(d) + "'" : "";
        const isSelected = selected_topic == topic ? " aria-current='true'" : ""
        topic_list += "<li>"
        topic_list += "<button type='button' class='term-btn' data-topic='" + escapeHtml(topic) +
            "' data-year-count='" + topicCount + "'" + isSelected + ">"
        topic_list += "<span class='term-rank'>" + (i + 1) + ".</span>"
        topic_list += "<span class='term-name'>" + escapeHtml(topic) + "</span>"
        topic_list += "<span class='" + swatchClass + "'" + swatchStyle + " aria-hidden='true'></span>"
        topic_list += "</button>"
        topic_list += "</li>"
    })
    topic_list += "</ul>"
    $("#term-list")[0].innerHTML = topic_list
    document.querySelector('.term-btn[aria-current="true"]')?.scrollIntoView({block: "nearest", inline: "nearest"});
}

$(document).ready(async function () {

    // Build the option controls from the data manifest before wiring up the viz.
    applyManifest(await loadManifest());

    $('#data-about').off('click').on('click', showAboutData);

    $('#clear-selection').off('click').on('click', function () {
        resetPaperSelection();
        const year = $('#year-select').val() || getLatestYear();
        if (year) updateTermListForYear(year);
        document.getElementById('year-select')?.focus({preventScroll: true});
    });

    $(document).off('keydown.dismiss-popups').on('keydown.dismiss-popups', function (event) {
        if (event.key === 'Escape') {
            dismissTransientPopups();
        }
    });

    $('#abstract-hover').off('mouseenter mouseleave')
        .on('mouseenter', function () {
            clearTimeout(popupHideTimer);
        })
        .on('mouseleave', function () {
            scheduleHidePaperAbstract({preserveFocused: true});
        });

    $('#word-box').off('mouseenter mouseleave')
        .on('mouseenter', function () {
            clearTimeout(mouseOutTimeout);
        })
        .on('mouseleave', function () {
            mouseOutTimeout = setTimeout(() => {
                $('#word-box').fadeTo(prefersReducedMotion() ? 0 : 750, 0);
                fadeInDuration = prefersReducedMotion() ? 0 : 750
            }, 250);
        });

    $('#paper-list').off('focusin', '.paper a').on('focusin', '.paper a', function (event) {
        showPaperAbstract($(event.currentTarget).closest('.paper')[0], event, 0, 'focus')
    });

    $('#paper-list').off('focusout', '.paper a').on('focusout', '.paper a', scheduleHidePaperAbstract);

    $('#term-list').off('click', '.term-btn').on('click', '.term-btn', function () {
        showPapers(this.dataset.topic, getCurrentSelectionDateIndex(), {focusTermButton: true});
    });

    $('#term-list').off('mouseenter focusin', '.term-btn').on('mouseenter focusin', '.term-btn', function () {
        highlightTheme(this.dataset.topic);
    });

    $('#term-list').off('mouseleave focusout', '.term-btn').on('mouseleave focusout', '.term-btn', function () {
        restoreSelectedHighlight();
    });

    $('#year-select').off('change').on('change', function () {
        if (redrawThemeRiver) {
            redrawThemeRiver();
            return;
        }
        const dateIndex = getDateIndexForYear(this.value);
        if (dateIndex < 0) return;

        selectedDateIndex = dateIndex;
        if (selectedTopic) {
            showPapers(selectedTopic, dateIndex);
        } else {
            updateTermListForYear(this.value);
            setPaperAndTop20Showing(false, true);
        }
    });

    $('.nav-tabs a').on('shown.bs.tab', function (event) {
        var x = $(event.target).text();
        let stateObj;
        if (x == "Visualization") {
            const drawRiver = (countsCsvFilename, papersJsonFilename) => {
                papersJsonFilename2 = papersJsonFilename

                const render = function (dataset, keys) {
                    const chartLayout = getChartLayout();
                    const stackOffset = chartLayout === 'stacked' ? d3.stackOffsetNone : d3.stackOffsetWiggle;
                    let layers = d3.stack()
                        .keys(keys)
                        .offset(stackOffset)
                        .order(d3.stackOrderAscending)
                        (dataset);

                    svg.selectAll("*").remove();
                    ensureSvgTitle();
                    svg.attr('data-layout', chartLayout);
                    currentZoomTransform = d3.zoomIdentity;

                    const svgBounds = getSvgBounds();
                    const svgWidth = Math.max(1, svgBounds.width);
                    const svgHeight = Math.max(1, svgBounds.height);
                    const xMin = chartMargins.left;
                    const xMax = svgWidth - chartMargins.right;
                    const yMinPixel = chartMargins.top;
                    const yMaxPixel = svgHeight - chartMargins.bottom;

                    xScale = d3.scaleLinear()
                        .domain([0, dates.length - 1])
                        .range([xMin, xMax]);

                    const stackedMin = d3.min(layers, (layer) => d3.min(layer, (point) => point[0]));
                    const stackedMax = d3.max(layers, (layer) => d3.max(layer, (point) => point[1]));
                    const span = Math.max(1, (stackedMax - stackedMin));
                    const verticalPadding = span * 0.03;
                    const yDomain = chartLayout === 'stacked'
                        ? [0, stackedMax + verticalPadding]
                        : [stackedMin - verticalPadding, stackedMax + verticalPadding];

                    yScale = d3.scaleLinear()
                        .domain(yDomain)
                        .range([yMaxPixel, yMinPixel]);

                    maxX = xScale(d3.max(dataset, xValue));
                    maxY = yScale(d3.max(dataset, yValue));

                    const area = d3.area()
                        .curve(d3.curveMonotoneX)
                        .x(d => xScale(xValue(d.data)))
                        .y0(d => yScale(d[0]))
                        .y1(d => yScale(d[1]));

                    const defs = svg.append("defs");
                    defs.append("clipPath")
                        .attr("id", "rectClip")
                        .append("rect")
                        .attr("class", "rect-clip")
                        .attr("x", xMin)
                        .attr("y", yMinPixel)
                        .attr("width", Math.max(1, xMax - xMin))
                        .attr("height", Math.max(1, yMaxPixel - yMinPixel));

                    const gForXAxis = svg.append('g')
                        .attr('transform', `translate(0,0)`)
                        .attr('id', 'xaxisgroup');

                    const xAxis = d3.axisBottom(xScale)
                        .tickValues(d3.range(dates.length))
                        .tickFormat((d) => dates[d] ? dates[d].substring(0, 4) : '');

                    const xAxisGroup = gForXAxis.append('g')
                        .attr('id', 'xaxis')
                        .attr('transform', `translate(0, ${yMaxPixel})`)
                        .call(xAxis);

                    xAxisGroup.append('text')
                        .attr('class', 'axis-title')
                        .attr('x', (xMin + xMax) / 2)
                        .attr('y', 38)
                        .text('Year');

                    if (chartLayout === 'stacked') {
                        const yAxis = d3.axisLeft(yScale)
                            .ticks(5)
                            .tickSize(0);

                        gForXAxis.append('g')
                            .attr('id', 'yaxis')
                            .attr('transform', `translate(${xMin},0)`)
                            .call(yAxis);

                        gForXAxis.append('text')
                            .attr('class', 'axis-title y-axis-title')
                            .attr('transform', `translate(${xMin - 36}, ${(yMinPixel + yMaxPixel) / 2}) rotate(-90)`)
                            .text('Papers');
                    }

                    const gridlineGroup = gForXAxis.append('g')
                        .attr('id', 'year-gridlines')
                        .attr('aria-hidden', 'true');

                    const updateGridlines = function (scale) {
                        gridlineGroup.selectAll('line')
                            .data(d3.range(dates.length))
                            .join('line')
                            .attr('class', 'year-gridline')
                            .attr('x1', d => scale(d))
                            .attr('x2', d => scale(d))
                            .attr('y1', yMinPixel)
                            .attr('y2', yMaxPixel);
                    };

                    updateGridlines(xScale);

                    const g = svg.append('g')
                        .attr('transform', 'translate(0,0)')
                        .attr('id', 'maingroup')
                        .attr('clip-path', 'url(#rectClip)');

                    g.selectAll('path')
                        .data(layers)
                        .join('path')
                        .attr('opacity', base_opacity)
                        .attr('d', function (d) {
                            return area(d);
                        })
                        .attr('fill', function (d, i) {
                            return next_bar_color(d, i);
                        })
                        .attr('data-topic', function (d) {
                            return d['key']
                        })
                        .attr('class', function (d) {
                            return 'theme-ribbon'
                        })
                        .on("mousemove", onMouseMove)
                        .on("mouseout", onMouseOut)
                        .on("click", onMouseClick);

                    const yearGuide = svg.append('line')
                        .attr('id', 'hover-year-guide')
                        .attr('aria-hidden', 'true')
                        .attr('x1', xMin)
                        .attr('x2', xMin)
                        .attr('y1', yMinPixel)
                        .attr('y2', yMaxPixel)
                        .attr('hidden', true);

                    function updateYearGuide(dateIndex) {
                        const x = currentZoomTransform.applyX(xScale(dateIndex));
                        yearGuide
                            .attr('x1', x)
                            .attr('x2', x)
                            .attr('hidden', null);
                    }

                    function onMouseOut() {
                        const elem = $('#word-box')
                        yearGuide.attr('hidden', true);
                        restoreSelectedHighlight();
                        mouseOutTimeout = setTimeout(() => {
                            elem.fadeTo(prefersReducedMotion() ? 0 : 750, 0);
                            fadeInDuration = prefersReducedMotion() ? 0 : 750
                        }, 250);
                    }

                    function onMouseMove() {
                        clearTimeout(mouseOutTimeout)
                        const elem = $('#word-box')
                        const X = d3.event.pageX;
                        let adjustX = 0;
                        if (X < 275) {
                            adjustX = -19;
                            $("#tooltip-arrow").removeClass("left").addClass("right")
                        } else {
                            adjustX = 8;
                            $("#tooltip-arrow").removeClass("right").addClass("left")
                        }
                        elem.css('left', d3.event.pageX + adjustX + 'px');
                        elem.css('top', d3.event.pageY - (elem.height() / 2) - 10 + 'px');
                        elem.css('backgroundColor', 'transparent');
                        $('#tooltip-inner').css('border-color', d3.event.currentTarget.getAttribute('fill'));
                        $('#word-label').css('border-color', d3.event.currentTarget.getAttribute('fill'));

                        const date_index = getDateIndexFromTarget(this);
                        const topic = this.dataset.topic;
                        updateYearGuide(date_index);
                        highlightTheme(topic);
                        let topic_count = 0;
                        if (this.__data__[date_index] && this.__data__[date_index]['data']) {
                            topic_count = this.__data__[date_index]['data'][topic] || 0;
                        }
                        for (let i = 0; i < limited_dataset.length; i++) {
                            if (limited_dataset[i]['date'] === dates[date_index] && limited_dataset[i]['topic'] === topic) {
                                topic_count = limited_dataset[i]['count'];
                                break;
                            }
                        }
                        $('#river-word').text(topic);
                        if (topic_count === 0) {
                            $('#word-label').text("No papers in " + dates[date_index].substr(0, 4));
                        } else if (isOtherTopic(topic)) {
                            $('#word-label').text(topic_count + " papers outside the top " + getTopicLimit() + " in " + dates[date_index].substr(0, 4));
                        } else {
                            $('#word-label').text(topic_count + " papers in " + dates[date_index].substr(0, 4));
                        }
                        $('#word-box').fadeTo(prefersReducedMotion() ? 0 : fadeInDuration, 1);
                        fadeInDuration = 0
                    }

                    function onMouseClick() {
                        if (isOtherTopic(this.dataset.topic)) return;
                        showPapers(this.dataset.topic, getDateIndexFromTarget(this))
                    }

                    const zoomBehavior = d3.zoom()
                        .scaleExtent(zoomScaleExtent)
                        .extent([[xMin, yMinPixel], [xMax, yMaxPixel]])
                        .translateExtent([[xMin, yMinPixel], [xMax, yMaxPixel]])
                        .on("zoom", function () {
                            const transform = d3.event.transform;
                            currentZoomTransform = transform;
                            g.attr("transform", transform.toString());
                            const rescaledX = transform.rescaleX(xScale);
                            xAxisGroup.call(xAxis.scale(rescaledX));
                            updateGridlines(rescaledX);
                            yearGuide.attr('hidden', true);
                        });

                    svg.call(zoomBehavior)
                        .on("dblclick.zoom", null);
                };

                const seqgen = function (data, keys, valueAccessor) {
                    // re-arrange the data sequentially
                    let prestack = [];
                    dates.forEach(datum => {
                        const row = {'date': datum};
                        keys.forEach(key => {
                            row[key] = 0;
                        });
                        prestack.push(row);
                    });
                    data.forEach(datum => {
                        prestack[dates.indexOf(datum['date'])][datum['topic']] = valueAccessor(datum);
                    });
                    return prestack
                }

                showVizLoading();
                d3.csv(countsCsvFilename).then(function (dataset) {
                    dataset.forEach(datum => {
                        datum['count'] = +(datum['count']);
                    });

                    full_dataset = dataset;

                    // remove duplicated items
                    let datasetDates = Array.from(new Set(full_dataset.map(datum => datum['date'])));

                    // make sure dates are listed according to real time order
                    datasetDates = datasetDates.sort((a, b) => new Date(a) - new Date(b));
                    allDates = datasetDates;

                    const selectedYear = populateYearSelect();
                    dates = getDatesThroughYear(allDates, selectedYear);
                    selectedDateIndex = getDateIndexForYear(selectedYear);
                    const topicLimit = getTopicLimit();
                    let filtered_set = getFilteredSet(getTopicRankingDataset(full_dataset, selectedYear), topicLimit);
                    const topTopics = filtered_set.map(d => d.key);
                    rendered_topics = new Set(topTopics);
                    const visibleDataset = getDatasetThroughYear(full_dataset, selectedYear);
                    const hasOtherTopics = visibleDataset.some(d => !topTopics.includes(d.topic));
                    const includeOther = hasOtherTopics && shouldShowOtherBand();
                    let sorting_set = buildSortingSet(filtered_set, includeOther);

                    limited_dataset = buildChartDataset(visibleDataset, topTopics, dates, includeOther)

                    // generate sequential data
                    let sequential = [];
                    dates.forEach(() => {
                        sequential.push([])
                    });
                    // place each datum into year-specific array
                    limited_dataset.forEach(datum => {
                        const dateIndex = dates.indexOf(datum['date']);
                        if (dateIndex >= 0) sequential[dateIndex].push(datum);
                    });

                    // generate max for Y-scale
                    let up_max_index = d3.maxIndex(sequential, seq => {
                        let result = 0;
                        seq.forEach(s => {
                            result += yRaw(s)
                        })
                        // result = result + (result*.1)
                        return result;
                    });

                    up_max = 0
                    sequential[up_max_index].forEach(s => {
                        up_max += yRaw(s)
                    })
                    // up_max = up_max + (up_max*.1)


                    // put arrays in correct display order and get adjusted counts
                    sequential = rebalanceSet(sequential, sorting_set, up_max);

                    // stack data
                    const stackValue = getChartLayout() === 'stacked' ? yRaw : yValue;
                    let prestack = seqgen(limited_dataset, sorting_set, stackValue);
                    let keys = sorting_set;
                    reset_bar_colors();
                    render(prestack, keys);
                    updateChartAccessibleText(keys, hasOtherTopics && !includeOther, selectedYear);
                    buildChartDataTable(limited_dataset, keys, selectedYear);
                    if (selectedTopic && papersShowing) {
                        showPapers(selectedTopic, selectedDateIndex);
                    } else {
                        updateTermListForYear(selectedYear, selectedTopic);
                        setPaperAndTop20Showing(false, true);
                    }
                    hideVizLoading();
                }).catch(err => {
                    hideVizLoading();
                    console.error('Failed to load visualization data:', err);
                    showVizError('Could not load data for this selection. The dataset files may be missing.');
                });
            }

            function updateOptions(stateObj) {
                function getBaseFilename() {
                    //get the values of the radio buttons
                    const pubmedSourceValue = $('.control-group-pubmed-source input[type=radio]:checked').val();
                    let ngramValue = $('.control-group-ngram input[type=radio]:checked').val();

                    const meta = SOURCE_META[pubmedSourceValue];
                    const supportsNgrams = meta ? meta.supportsNgrams : true;

                    // Datasets with a single n-gram size always use their only size.
                    if (meta && !supportsNgrams) {
                        ngramValue = String(meta.ngrams[0]);
                        $(`.control-group-ngram input[value="${ngramValue}"]`).prop('checked', true);
                    }
                    if (pubmedSourceValue === undefined || ngramValue === undefined) {
                        return "not-ready";
                    }
                    $("#pubmed-datasource-in-title").text(pubmedDatasourceLookup[pubmedSourceValue]);
                    $("#ngram-size-in-title").text(supportsNgrams ? ngramSizeLookup[ngramValue] : "");
                    return `${pubmedSourceValue}-ngram_${ngramValue}-`;
                }

                const selectedSourceId = $('.control-group-pubmed-source input[type=radio]:checked').val();
                const selectedMeta = SOURCE_META[selectedSourceId];
                const supportsNgrams = selectedMeta ? selectedMeta.supportsNgrams : true;

                const updateNgramControl = (enable) => {
                    // Dim/disable the n-gram control for single-size datasets, and
                    // disable any individual size the selected dataset lacks.
                    $("#ngram-line").toggleClass("is-disabled", !enable);
                    $(".control-group-ngram").toggleClass("is-disabled", !enable);
                    $("#ngram-hint").prop("hidden", enable);
                    $(".control-group-ngram").attr("aria-describedby", enable ? null : "ngram-hint");
                    $(".control-group-ngram input[type=radio]").each(function () {
                        const available = !selectedMeta || selectedMeta.ngrams.includes(parseInt(this.value, 10));
                        this.disabled = !enable || !available;
                    });
                }
                const keepPapersVisible = papersShowing &&
                    ((!stateObj.initialDrawing && !stateObj.extractionMethodChanged && !stateObj.resizing) ||
                        (stateObj.resizing && papersShowing));
                setPaperAndTop20Showing(keepPapersVisible, false);
                const transitionDuration = prefersReducedMotion() ? '0s' : '2s';

                updateNgramControl(supportsNgrams);

                const baseFilename = getBaseFilename()
                started = baseFilename != "not-ready"
                if (started) {
                    $("#topic-limit-in-title").text(getTopicLimit());

                    const countsCsvFilename = `${baseFilename}counts.csv`;
                    const papersJsonFilename = `${baseFilename}papers.json`;
                    updateDownloadLinks(baseFilename);
                    hideVizError();
                    $(".hide-on-start").css("visibility", "visible");


                    $("#please-header, #instruction-line").hide()


                    $("#info-row").css({'position': 'unset', 'flex': '0 1 275px', 'transition': transitionDuration})
                    $("#chart-row").css({'opacity': '1', 'align-items': 'center', 'transition': transitionDuration})
                    $(".paper-instructions").css({'opacity': '1', 'transition': transitionDuration})

                    alreadyAnimatedResize = true;

                    drawRiver("./data/" + countsCsvFilename, "./data/" + papersJsonFilename);
                }
            }

            let stateObj = new Object()
            stateObj.resizing = false
            stateObj.extractionMethodChanged = false
            stateObj.initialDrawing = !alreadyAnimatedResize
            redrawThemeRiver = () => {
                stateObj.extractionMethodChanged = false;
                stateObj.initialDrawing = false
                stateObj.resizing = false
                updateOptions(stateObj)
            }
            $('.control-group-ngram input[type=radio], .control-group-pubmed-source input[type=radio]').change(() => {
                resetPaperSelection();
                stateObj.extractionMethodChanged = true;
                stateObj.initialDrawing = false
                stateObj.resizing = false
                updateOptions(stateObj)
            })

            $('.control-group-layout input[type=radio]').change(() => {
                stateObj.extractionMethodChanged = false;
                stateObj.initialDrawing = false
                stateObj.resizing = false
                updateOptions(stateObj)
            })

            $('#show-other-toggle').change(() => {
                stateObj.extractionMethodChanged = false;
                stateObj.initialDrawing = false
                stateObj.resizing = false
                updateOptions(stateObj)
            })

            $('.control-group-topic-limit input[type=radio]').change(() => {
                resetPaperSelection();
                stateObj.extractionMethodChanged = false;
                stateObj.initialDrawing = false
                stateObj.resizing = false
                updateOptions(stateObj)
            })

            $(window).on("resize", function () {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(function () {
                    stateObj.resizing = true
                    stateObj.extractionMethodChanged = false;
                    stateObj.initialDrawing = false
                    updateOptions(stateObj)
                }, prefersReducedMotion() ? 0 : 120);
            })

            updateOptions(stateObj);

        }
    });

});
