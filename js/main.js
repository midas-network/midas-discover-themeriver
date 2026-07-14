const svg = d3.select('#main-svg');

let up_max = 5000;
let yScale;
let maxX, maxY;
let dates;
let currentColor = 0;
let xScale, limited_dataset;
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
let flashTimer, flashTimer2, hoverTimer;
let started = false;
let alreadyAnimatedResize = false;
let papersShowing = false;
const base_opacity = 0.7;

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

function setPaperAndTop20Showing(b) {
    let hideOnSelection, paperInstructions, paperDisplay, hideuntilSelection, termDisplay, paperDisplayOpacity;

    if (b) {
        hideOnSelection = "hidden";
        paperInstructions = "none";
        paperDisplay = "block";
        hideuntilSelection = "visible";
        termDisplay = "block";
        paperDisplayOpacity = 1


    } else {
        hideOnSelection = "visible";
        paperInstructions = "block";
        paperDisplay = "none";
        hideuntilSelection = "hidden";
        termDisplay = "none";
        paperDisplayOpacity = 0
    }
    $(".hide-on-selection").css("visibility", hideOnSelection);
    $(".paper-instructions").css("display", paperInstructions);
    $(".hide-until-selection").css("visibility", hideuntilSelection);
    $(".paper-display, .term-display").css({'display': paperDisplay});
    $(".paper-display, .term-display").css({'opacity': paperDisplayOpacity, 'transition': '2s'});
    papersShowing = b;
}

const showPapers = (that) => {


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
        $(".paper").on("mouseenter", function (event) {
            $("#hover-paper-title").text($(event.currentTarget).children("a").text())
            $("#hover-paper-abstract").text($(event.currentTarget).children("span").text())
            const elem = $('#abstract-hover');
            if (window.innerHeight - event.pageY < 500) {
                elem.css('top', event.pageY - elem.height());
            } else {
                elem.css('top', event.pageY);
            }
            // elem.css('left', event.pageX + 14);
            // elem.css('width', 'calc(vw - ' + event.pageX + 'px)');
            // elem.css('max-height', 'calc(vh - ' + event.pageY + 'px)');
            //all css elements in one array
            elem.css({
                'left': event.pageX + 14,
                'width': 'calc(vw - ' + event.pageX + 'px)',
                'max-height': 'calc(vh - ' + event.pageY + 'px)'
            });
            hoverTimer = setTimeout(function () {
                elem.show()
            }, 1000)


        }).on("mouseleave", function (event) {
            clearTimeout(hoverTimer)

            $("#abstract-hover").hide()
        });
    }

    function flash(topic, n) {

        if (n > 0) {
            $($("[class='" + topic + "']")[0]).css("filter", "brightness(0%)");
            flashTimer = setTimeout(function () {
                $($("[class='" + topic + "']")[0]).css("filter", "brightness(100%)");
                flashTimer2 = setTimeout(function () {
                    flash(topic, n - 1);
                }, 250);
            }, 250);
        }
    }

    function resetPaths() {
        clearTimeout(flashTimer)
        clearTimeout(flashTimer2)
        $("#main-svg path").attr("opacity", base_opacity);
        $("#main-svg path").css("filter", "");
    }

    $(".hide-on-start").css("visibility", "visible")
    let date_index, topic;
    if (d3.event === null) {
        let s_date = $('#current-year').text() + '/1/1'
        date_index = dates.findIndex(x => x == s_date);
        topic = event.target.textContent
    } else {
        date_index = getDateIndexFromTarget(that);
        topic = d3.event.target.classList.toString()
    }
    const year = dates[date_index].substr(0, 4)
    resetPaths()
    flash(topic, 10)
    setPaperAndTop20Showing(true)

    $($("[class='" + topic + "']")[0]).css("filter", "brightness(100%)");
    fetch(papersJsonFilename2)
        .then(response => {
            return response.json()
        })
        .then(papers => {
                let paper_list = "<ul>"
                for (let article of papers[year][topic]) {
                    paper_list += "<li class='paper'><a href='" + escapeHtml(article['uri']) + "' target='_blank'>" + escapeHtml(article['title']) + "</a>" +
                        "<span>" + escapeHtml(article['abstract']) + "</span></li>"
                }
                paper_list += "</ul>"
                updateInfoPanel(year, topic, paper_list, papers[year][topic].length)
            }
        )
        .catch(() => {
            updateInfoPanel(year, topic, '<p>Failed to load papers.</p>', 0);
        })
}

function fillTopics(year, selected_topic) {
    let s_date = year + '/1/1'
    let year_topics = limited_dataset.filter(d => d.date == s_date && d.count != 0)
        .sort((a, b) => (a.count < b.count) ? 1 : ((b.count < a.count) ? -1 : 0))
        .map(function (d) {
            return d.topic
        })
    let topic_list = "<table id='topic-list'>"
    topic_list += "<col class='topic-rank'>"
    topic_list += "<col class='topic-name'>"
    topic_list += "<col class='topic-color'>"
    let line = 0;
    year_topics.forEach((topic, i) => {
        topic_list += "<tr onclick='showPapers(this)'>"
        topic_list += "<td class='term-rank-number'>" + (i + 1) + ".</td>"
        let background = ""
        let id = ""
        if (selected_topic == topic) {
            id = "id=selected-topic"
            background = "background-color: #4fc02a52;"
            line = i;
        }
        topic_list += "<td " + id + " style='" + background + "'>" + escapeHtml(topic) + "</td>"
        const d = {}
        d.key = topic
        topic_list += "<td style='opacity: " + base_opacity + "; background:" + next_bar_color(d) + "'></td>"
        topic_list += "</tr>"
    })
    topic_list += "</table>"
    $("#term-list")[0].innerHTML = topic_list
    const elem = document.getElementById("selected-topic");
    elem.scrollIntoView({behavior: "smooth", block: "end", inline: "nearest"});
}

$(document).ready(async function () {

    // Build the option controls from the data manifest before wiring up the viz.
    applyManifest(await loadManifest());

    $('.nav-tabs a').on('shown.bs.tab', function (event) {
        var x = $(event.target).text();
        let stateObj;
        if (x == "Visualization") {
            const drawRiver = (countsCsvFilename, papersJsonFilename, tension) => {
                papersJsonFilename2 = papersJsonFilename

                const render = function (dataset, keys) {
                    let layers = d3.stack()
                        .keys(keys)
                        .offset(d3.stackOffsetWiggle)
                        .order(d3.stackOrderAscending)
                        (dataset);

                    svg.selectAll("*").remove();
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
                    const yDomain = [stackedMin - verticalPadding, stackedMax + verticalPadding];

                    yScale = d3.scaleLinear()
                        .domain(yDomain)
                        .range([yMaxPixel, yMinPixel]);

                    maxX = xScale(d3.max(dataset, xValue));
                    maxY = yScale(d3.max(dataset, yValue));

                    const area = d3.area()
                        .curve(d3.curveCardinal.tension(tension))
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

                    const yAxis = d3.axisLeft(yScale)
                        .tickSize(0);

                    gForXAxis.append('g')
                        .attr('id', 'yaxis')
                        .attr('transform', `translate(${xMin},0)`)
                        .call(yAxis);

                    const xAxisGroup = gForXAxis.append('g')
                        .attr('id', 'xaxis')
                        .attr('transform', `translate(0, ${yMaxPixel})`)
                        .call(xAxis);

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
                        .attr('class', function (d) {
                            return d['key']
                        })
                        .on("mousemove", onMouseMove)
                        .on("mouseout", onMouseOut)
                        .on("click", onMouseClick);

                    function onMouseOut() {
                        const elem = $('#word-box')
                        mouseOutTimeout = setTimeout(() => {
                            elem.fadeTo(750, 0);
                            fadeInDuration = 750
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
                        let topic_count = 0;
                        if (this.__data__[date_index] && this.__data__[date_index]['data']) {
                            topic_count = this.__data__[date_index]['data'][this.classList[0]] || 0;
                        }
                        for (let i = 0; i < limited_dataset.length; i++) {
                            if (limited_dataset[i]['date'] === dates[date_index] && limited_dataset[i]['topic'] === this.classList['value']) {
                                topic_count = limited_dataset[i]['count'];
                                break;
                            }
                        }
                        $('#river-word').html(this.classList['value']);
                        if (topic_count === 0) {
                            $('#word-label').html("Not in top 20 in " + dates[date_index].substr(0, 4));
                        } else {
                            $('#word-label').html(topic_count + " papers in " + dates[date_index].substr(0, 4));
                        }
                        $('#word-box').fadeTo(fadeInDuration, 1);
                        fadeInDuration = 0
                    }

                    function onMouseClick() {
                        showPapers(this)
                    }

                    const zoomBehavior = d3.zoom()
                        .scaleExtent(zoomScaleExtent)
                        .extent([[xMin, yMinPixel], [xMax, yMaxPixel]])
                        .translateExtent([[xMin, yMinPixel], [xMax, yMaxPixel]])
                        .on("zoom", function () {
                            const transform = d3.event.transform;
                            currentZoomTransform = transform;
                            g.attr("transform", transform.toString());
                            xAxisGroup.call(xAxis.scale(transform.rescaleX(xScale)));
                        });

                    svg.call(zoomBehavior)
                        .on("dblclick.zoom", null);
                };

                const seqgen = function (data) {
                    // re-arrange the data sequentially
                    let prestack = [];
                    dates.forEach(datum => {
                        prestack.push({'date': datum});
                    });
                    data.forEach(datum => {
                        prestack[dates.indexOf(datum['date'])][datum['topic']] = yValue(datum);
                    });
                    return prestack
                }

                currentColor = 0;
                d3.csv(countsCsvFilename).then(function (dataset) {
                    dataset.forEach(datum => {
                        datum['count'] = +(datum['count']);
                    });

                    let filtered_set = getFilteredSet(dataset);
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
                    sorting_set.push(filtered_set[0]['key'])
                    odds.forEach((index) => {
                        sorting_set.push(filtered_set[index]['key'])
                    })

                    limited_dataset = dataset.filter(d => filtered_set.map(d => d.key).includes(d.topic))

                    // remove duplicated items
                    let alldates = Array.from(new Set(limited_dataset.map(datum => datum['date'])));

                    // make sure dates are listed according to real time order
                    alldates = alldates.sort(function (a, b) {
                        return new Date(b.date) - new Date(a.date);
                    });
                    dates = alldates;

                    // generate sequential data
                    let sequential = [];
                    alldates.forEach(() => {
                        sequential.push([])
                    });
                    // place each datum into year-specific array
                    limited_dataset.forEach(datum => {
                        sequential[alldates.indexOf(datum['date'])].push(datum);
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
                    let prestack = seqgen(limited_dataset);
                    let keys = sorting_set;
                    render(prestack, keys);
                }).catch(err => {
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
                    $(".control-group-ngram input[type=radio]").each(function () {
                        const available = !selectedMeta || selectedMeta.ngrams.includes(parseInt(this.value, 10));
                        this.disabled = !enable || !available;
                    });
                }
                setPaperAndTop20Showing((!stateObj.initialDrawing && !stateObj.extractionMethodChanged && !stateObj.resizing) || (stateObj.resizing && papersShowing));

                const tension = 0 //$("#myRange").val() / 100

                updateNgramControl(supportsNgrams);

                const baseFilename = getBaseFilename()
                started = baseFilename != "not-ready"
                if (started) {

                    const countsCsvFilename = `${baseFilename}counts.csv`;
                    const papersJsonFilename = `${baseFilename}papers.json`;
                    updateDownloadLinks(baseFilename);
                    hideVizError();
                    $(".hide-on-start").css("visibility", "visible");


                    $("#please-header, #instruction-line").hide()


                    $("#info-row").css({'position': 'unset', 'flex': '0 1 275px', 'transition': '2s'})
                    $("#chart-row").css({'opacity': '1', 'align-items': 'center', 'transition': '2s'})
                    $(".paper-instructions").css({'opacity': '1', 'transition': '2s'})

                    alreadyAnimatedResize = true;

                    drawRiver("./data/" + countsCsvFilename, "./data/" + papersJsonFilename, tension);
                }
            }

            let stateObj = new Object()
            stateObj.resizing = false
            stateObj.extractionMethodChanged = false
            stateObj.initialDrawing = !alreadyAnimatedResize
            $('.control-group-ngram input[type=radio], .control-group-pubmed-source input[type=radio]').change(() => {
                stateObj.extractionMethodChanged = true;
                stateObj.initialDrawing = false
                      stateObj.resizing = false
                updateOptions(stateObj)
            })

            // $("#myRange").on("input", function () {
            //     updateOptions(false)
            // })

            $(window).on("resize", function () {
                stateObj.resizing = true
                      stateObj.extractionMethodChanged = false;

                updateOptions(stateObj)
            })

            updateOptions(stateObj);

        }
    });

});
