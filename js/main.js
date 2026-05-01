const svg = d3.select('#main-svg');
const width = +svg.attr('width');
const height = +svg.attr('height');

let up_max = 5000;
let yScale;
let maxX, maxY;
let dates;
let currentColor = 0;
let xScale, limited_dataset;

let mouseOutTimeout;
let fadeInDuration = 750;
let papersJsonFilename2;
let flashTimer, flashTimer2, hoverTimer;
let started = false;
let alreadyAnimatedResize = false;
let papersShowing = false;
const base_opacity = 0.7;

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
const pubmedDatasourceLookup = {
    'meshTerms': 'MeSH Terms',
    'pubmedKeywords': 'Pubmed Keyword',
    'paperAbstract': 'Title + Abstracts'
}
const ngramSizeLookup = {

    '1': 'Unigrams',
    '2': 'Bigrams',
    '3': 'Trigrams'
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
        date_index = Math.round(xScale.invert(d3.mouse(that)[0]));
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

$(document).ready(function () {

    $('.nav-tabs a').on('shown.bs.tab', function (event) {
        var x = $(event.target).text();
        let stateObj;
        if (x == "Visualization") {
            const drawRiver = (countsCsvFilename, papersJsonFilename, tension) => {
                papersJsonFilename2 = papersJsonFilename


                const renderInit = function (data) {

                    const graphHeight = $("#wrapper")[0].offsetHeight;
                    const graphWidth = $("#wrapper")[0].offsetWidth;
                    const heightOfXAxis = 30;
                    // Linear Scale: Data Space -> Screen Space
                    xScale = d3.scaleLinear()
                        .domain([0, dates.length - 1])
                        .range([$("#main-svg")[0].getBoundingClientRect().x + 50, $("#main-svg")[0].getBoundingClientRect().width - 50]);

                    // Introducing y-Scale
                    yScale = d3.scaleLinear()
                        .domain([0, 100])
                        .range([$("#main-svg")[0].getBoundingClientRect().height - 50, 0]) // height 107 -> figure out height of x-axis
                    //  .nice();

                    // generate maxX and maxY
                    maxX = xScale(d3.max(data, xValue));
                    maxY = yScale(d3.max(data, yValue));

                    const gForXAxis = svg.append('g')
                        .attr('transform', `translate(0,0)`)
                        //.attr('transform', `translate(${graphWidth * .3}, ${graphHeight * .1})`)
                        .attr('id', 'xaxisgroup')

                    const g = svg.append('g')
                        .attr('transform', 'translate(0,0)')
                        //.attr('transform', `translate(${graphWidth * .3}, ${graphHeight * .1})`)
                        .attr('id', 'maingroup')


                    // Adding axes

                    const yAxis = d3.axisLeft(yScale)

                        .tickSize(0)
                    // .tickFormat("ASD")
                    // .tickPadding(1);


                    const xAxis = d3.axisBottom(xScale)
                        .tickFormat((d, i) => dates[i].substring(0, 4))


                    let yAxisGroup = gForXAxis.append('g').call(yAxis).attr('id', 'yaxis')
                    // d3.selectAll('#yaxis .tick text').attr('transform', `translate(${0}, ${-3})`); // transform shifts the labels on y axis toward the left
                    // yAxisGroup.append('text')
                    //     .attr('transform', 'rotate(-90)')
                    //     .attr('x', -graphHeight / 2)
                    //     .attr('y', -80)
                    //     .attr('fill', 'black')
                    //     .text(yAxisLabel)
                    //     .attr('text-anchor', 'middle'); // Make label at the middle of the axis (seemingly in conjunction with the x attribute)
                    //yAxisGroup.selectAll('.domain').remove(); // [Not sure what this is doing] We can select multiple tags using comma to seperate them and we can use space to signify nesting
                    gForXAxis.append('g').call(xAxis).attr('transform', `translate(0, ${$("#main-svg")[0].getBoundingClientRect().height - heightOfXAxis})`).attr('id', 'xaxis');

                    //let xAxisGroup =

                    // let xAxisGroup = g.append('g').call(xAxis).attr('transform', `translate(0,0)`).attr('id', 'xaxis');
                    //  d3.selectAll('#xaxis .tick text').attr('transform', `translate(${0}, ${5})`);
                    // xAxisGroup.append('text')
                    //     .attr('y', 60)
                    //     .attr('x', $("svg")[0].getBoundingClientRect().width / 2)
                    //     .attr('fill', 'black')
                    //     .text(xAxisLabel)
                    // xAxisGroup.selectAll('.domain').remove();

                };

                const render = function (dataset, keys, area) {

                    let g = d3.select('#maingroup');

                    let layers = d3.stack()
                        .keys(keys)
                        .offset(d3.stackOffsetWiggle)
                        .order(d3.stackOrderAscending)
                        (dataset);

                    const clippedrect = g.append("clipPath")
                        .attr('id', 'rectClip')
                        .append('rect')
                        .attr('class', 'rect-clip')
                        .attr('width', 0)
                        .attr('height', $("#main-svg")[0].getBoundingClientRect().height + 1000)
                    // .attr('height', height)

                    g.selectAll('path')
                        .data(layers)
                        .join('path')
                        .attr('opacity', base_opacity)
                        .attr('d', function (d, i) {
                            // if(d.key=='Epidemics')
                            //     { debugger;}
                            return area(d);
                        })
                        .attr('clip-path', 'url(#rectClip)')
                        .attr('fill', function (d, i) {
                            return next_bar_color(d, i);
                        })
                        .attr('class', function (d, i) {
                            return d['key']
                        })
                        .on("mousemove", onMouseMove)
                        .on("mouseout", onMouseOut)
                        .on("click", onMouseClick);

                    // Add the X Axis
                    // Show label on hover
                    function onMouseOut(e) {
                        const elem = $('#word-box')
                        mouseOutTimeout = setTimeout(() => {
                            elem.fadeTo(750, 0);
                            fadeInDuration = 750
                        }, 250);
                    }

                    function onMouseMove(e) {
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
                        let date_index = Math.round(xScale.invert(d3.mouse(this)[0])),
                            topic_count = this.__data__[date_index]['data'][this.classList[0]];
                        for (let i = 0; i < limited_dataset.length; i++) {
                            if (limited_dataset[i]['date'] === dates[date_index] && limited_dataset[i]['topic'] === this.classList['value']) {
                                topic_count = limited_dataset[i]['count'];
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

                    function onMouseClick(e) {
                        showPapers(this)

                    }

                    clippedrect.transition().ease(d3.easeLinear).duration(0).attr("width", $("#main-svg")[0].getBoundingClientRect().width);
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
                    svg.selectAll("*").remove()
                    renderInit(limited_dataset);

                    let top_side = 0
                    let bot_side = 0
                    for (const x of Array(sequential[up_max_index].length).keys()) {
                        if (x % 2 === 1) {
                            bot_side += yRaw(sequential[up_max_index][x])
                        } else {
                            top_side += yRaw(sequential[up_max_index][x])
                        }
                    }

                    let offset = (top_side / ((top_side + bot_side) / 2))
                    const getYScale = (yScaleVal) => {
                        const height_of_screen = window.innerHeight
                        const height_of_info_row = $("#info-row").get(0).getBoundingClientRect().height
                        const height_of_xaxis = $("g#xaxis").get(0).getBoundingClientRect().height + 25
                        const height_of_svg_wrapper = $("#wrapper").get(0).getBoundingClientRect().height

                        const yHalfOfTheScreen = (height_of_svg_wrapper - height_of_xaxis) * (height_of_info_row / height_of_screen); // height of wrapper-height of x-axis times height of info box/height of screen
                        const heightOffset = 100
                        const yScreenPercentage = 1
                        return ((yScale(yScaleVal) - (yHalfOfTheScreen)) + heightOffset) * yScreenPercentage
                        // return ((yScale(yScaleVal) + heightOffset) * yScreenPercentage)
                    }
                    const area = d3.area()
                        .curve(d3.curveCardinal.tension(tension)) // default is d3.curveLinear, d3.curveBundle.beta(1.0)
                        .x(d => xScale(xValue(d.data)))
                        .y0(d => getYScale(d[0]))
                        .y1(d => getYScale(d[1]))
                    render(prestack, keys, area);

                    function fixTranslate() {
                        const maingroupHeight = $('g#maingroup').get(0).getBoundingClientRect().top
                        const svgHeight = $('#main-svg #rectClip').get(0).getBoundingClientRect().top
                        $("#maingroup").attr("transform", 'translate(0,' + (svgHeight - maingroupHeight) + ')')
                    }

                    fixTranslate()
                }).catch(err => {
                    console.error('Failed to load visualization data:', err);
                });
            }

            function updateOptions(stateObj) {
                function getBaseFilename() {
                    //get the values of the radio buttons
                    const pubmedSourceValue = $('.control-group-pubmed-source input[type=radio]:checked').val();
                    let ngramValue = $('.control-group-ngram input[type=radio]:checked').val();

                    if (pubmedSourceValue === 'meshTerms') {
                        ngramValue = '1'
                        $("#options > div.control-group-ngram > label:nth-child(1) > input[type=radio]").prop('checked', true);
                    }
                    if (pubmedSourceValue === undefined || ngramValue === undefined) {
                        return "not-ready";
                    }
                    $("#pubmed-datasource-in-title").text(pubmedDatasourceLookup[pubmedSourceValue]);
                    let ngramText
                    if (pubmedDatasourceLookup[pubmedSourceValue] == 'MeSH Terms') {
                        ngramText = ""
                    } else {
                        ngramText = ngramSizeLookup[ngramValue]
                    }
                    $("#ngram-size-in-title").text(ngramText);
                    return `${pubmedSourceValue}-ngram_${ngramValue}-`;
                }

                const updateNgramControl = (enable) => {
                    const color = enable ? "white" : "lightgray"
                    $("#ngram-line").css("color", color)
                    $(".control-group-ngram label").css("color", color)
                    $(".control-group-ngram .control input").prop("disabled", isMeshTerms)
                }
                setPaperAndTop20Showing((!stateObj.initialDrawing && !stateObj.extractionMethodChanged && !stateObj.resizing) || (stateObj.resizing && papersShowing));

                const isMeshTerms = $('.control-group-pubmed-source input[type=radio]:checked').val() === 'meshTerms';

                const tension = 0 //$("#myRange").val() / 100

                updateNgramControl(!isMeshTerms);

                const baseFilename = getBaseFilename()
                started = baseFilename != "not-ready"
                if (started) {

                    const countsCsvFilename = `${baseFilename}counts.csv`;
                    const papersJsonFilename = `${baseFilename}papers.json`;
                    $(".hide-on-start").css("visibility", "visible");


                    $("#please-header, #instruction-line").hide()


                    $("#info-row").css({'position': 'unset', 'flex': '0 1 275px', 'transition': '2s'})
                    $("#chart-row").css({'opacity': '1', 'align-items': 'center', 'transition': '2s'})
                    $(".paper-instructions").css({'opacity': '1', 'transition': '2s'})
                    $("#options").css({'margin-top': '40px', 'transition': '2s'})

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
