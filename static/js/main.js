const svg = d3.select('#main-svg');
const width = +svg.attr('width');
const height = +svg.attr('height');
const innerHeight = $("#wrapper")[0].offsetHeight;
const yAxisLabel = 'Topic Frequency'
let up_max = 5000;
let yScale;
let maxX, maxY;
let dates;
let currentColor = 0;
let xScale, limited_dataset;

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
    'meshTerms': 'MeSH Term',
    'pubmedKeywords': 'Pubmed Keyword',
    'paperAbstract': 'Paper Abstract'
}
const ngramSizeLookup = {
    '1': 'Words',
    '2': 'Bigrams',
    '3': 'Trigrams'
}

$(document).ready(function () {

    const drawRiver = (countsCsvFilename, papersJsonFilename) => {
        const renderInit = function (data, seq) {

            const graphHeight = $("#wrapper")[0].offsetHeight;
            const graphWidth = $("#wrapper")[0].offsetWidth;
            const heightOfXAxis = 75;

            // Linear Scale: Data Space -> Screen Space
            xScale = d3.scaleLinear()
                .domain([0, dates.length - 1])
                .range([$("svg")[0].getBoundingClientRect().x + 50, $("svg")[0].getBoundingClientRect().width - 50]);

            // Introducing y-Scale
            yScale = d3.scaleLinear()
                .domain([0, 100])
                .range([$("svg")[0].getBoundingClientRect().height, 0])
                .nice();

            // generate maxX and maxY
            maxX = xScale(d3.max(data, xValue));
            maxY = yScale(d3.max(data, yValue));

            const g = svg.append('g')
                .attr('transform', `translate(0,0)`)
                //.attr('transform', `translate(${graphWidth * .3}, ${graphHeight * .1})`)
                .attr('id', 'maingroup')


            // Adding axes

            const yAxis = d3.axisLeft(yScale)
                .tickSize(0)
                .tickFormat("")
                .tickPadding(10);


            const xAxis = d3.axisBottom(xScale)
                .tickFormat((d, i) => dates[i].substring(0, 4))


            let yAxisGroup = g.append('g').call(yAxis).attr('id', 'yaxis')
            // d3.selectAll('#yaxis .tick text').attr('transform', `translate(${0}, ${-3})`); // transform shifts the labels on y axis toward the left
            yAxisGroup.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -graphHeight / 2)
                .attr('y', -80)
                .attr('fill', 'black')
                .text(yAxisLabel)
                .attr('text-anchor', 'middle'); // Make label at the middle of the axis (seemingly in conjunction with the x attribute)
            yAxisGroup.selectAll('.domain').remove(); // [Not sure what this is doing] We can select multiple tags using comma to seperate them and we can use space to signify nesting

            let xAxisGroup = g.append('g').call(xAxis).attr('transform', `translate(0, ${$("svg")[0].getBoundingClientRect().height - heightOfXAxis})`).attr('id', 'xaxis');
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
                .attr('height', $("svg")[0].getBoundingClientRect().height)
            // .attr('height', height)

            g.selectAll('path')
                .data(layers)
                .join('path')
                .attr('opacity', 0.9)
                .attr('d', function (d, i) {
                    return area(d);
                })
                .attr('clip-path', 'url(#rectClip)')
                .attr('fill', function (d, i) {
                    return next_bar_color();
                })
                .attr('class', function (d, i) {
                    return d['key']
                })
                .on("mousemove", onMouseMove)
                .on("click", onMouseClick);

            // Show label on hover
            function onMouseMove(e) {
                const elem = $('#word-box')

                elem.css('display', 'block');
                // elem.css('left', g_width + 20 + 'px');
                if (d3.event.pageX + 10 + 80 > width) {
                    elem.css('left', (width - 45) + 'px')
                } else {
                    elem.css('left', d3.event.pageX + 20 + 'px');
                }
                elem.css('top', d3.event.pageY - (elem.height() / 2) + 'px');

                // Color label box
                elem.css('backgroundColor', d3.event.currentTarget.getAttribute('fill'));
                const arrowSide = "right"
                const nonArrowSide = "left"
                const cssClass = "box_with_arrow_on_" + arrowSide;
                elem.removeClass("box_with_arrow_on_" + nonArrowSide)
                elem.addClass(cssClass)
                const fill = d3.event.currentTarget.getAttribute('fill')

                document.styleSheets[0].addRule('.box_with_arrow_on_right:after', 'border-left-color: ' + fill + ';');


                //  styleElem.innerHTML = "." + cssClass+ ":after {border-"+nonArrowSide+"-color: " + fill + " :before {border-"+nonArrowSide+"-color: " + fill + "}";

                // Get count
                let date_index = Math.round(xScale.invert(d3.mouse(this)[0])),
                    topic_count = this.__data__[date_index]['data'][this.classList[0]];
                for (i = 0; i < limited_dataset.length; i++) {
                    if (limited_dataset[i]['date'] === dates[date_index] && limited_dataset[i]['topic'] === this.classList['value']) {
                        topic_count = limited_dataset[i]['count'];
                    }
                }


                $('#word-label').html(this.classList['value'] + "<br>year: " + dates[date_index].substr(0, 4) + "<br>count: " + topic_count);

            }

            function onMouseClick() {


                const topic_elem = $('#current-topic')
                const topic_count_elem = $('#current-topic-count')
                const year_elem = $('#current-year')
                const paper_elem = $('#paper-list')
                let date_index = Math.round(xScale.invert(d3.mouse(this)[0]));
                let topic_count = this.__data__[date_index]['data'][this.classList[0]];

                fetch(papersJsonFilename)
                    .then(response => {
                        return response.json()
                    })
                    .then(papers => {
                            let paper_list = "<ul>"
                            for (let article of papers[dates[date_index].substr(0, 4)][this.classList['value']]) {
                                paper_list += "<li><a href='" + article['uri'] + "' target='_blank'>" + article['title'] + "</a></li>"
                            }
                            for (let i = 0; i < limited_dataset.length; i++) {
                                if (limited_dataset[i]['date'] === dates[date_index] && limited_dataset[i]['topic'] === this.classList['value']) {
                                    topic_count = limited_dataset[i]['count'];
                                }
                            }
                            paper_list += "</ul>"
                            year_elem.text(dates[date_index].substr(0, 4))
                            topic_count_elem.text(topic_count)
                            topic_elem[0].innerHTML = this.classList['value']
                            paper_elem[0].innerHTML = paper_list;
                            paper_elem[0].scrollTop = 0;
                            $("#instruction-line").hide()
                            $("#topic-line").show()
                        }
                    )

            }

            clippedrect.transition().ease(d3.easeLinear).duration(0).attr("width", $("svg")[0].getBoundingClientRect().width);
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

            filtered_set = getFilteredSet(dataset);

            let odds = [],
                evens = []
            let sorting_set = [];

            for (const x of Array(filtered_set.length).keys()) {
                if (x === 0) {
                    continue
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

            // set up bar chart

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
            up_max = d3.max(sequential, seq => {
                result = 0;
                seq.forEach(s => {
                    result += yRaw(s)
                })
                return result;
            });

            // put arrays in correct display order and get adjusted counts
            sequential = rebalanceSet(sequential, sorting_set, up_max);


            // stack data
            let prestack = seqgen(limited_dataset);
            let keys = sorting_set;

            renderInit(limited_dataset);


            const yScreenPercentage = 0.5;

            const getYScale = (yScaleVal) => {
                const yQuarterOfTheScreen = ((innerHeight / 2));
                const heightOffset = 85;
                const yScreenPercentage = 0.78;
                return ((yScale(yScaleVal) - (yQuarterOfTheScreen)) + heightOffset) * yScreenPercentage
            }
            const area = d3.area()
                .curve(d3.curveCardinal.tension(0.0001)) // default is d3.curveLinear, d3.curveBundle.beta(1.0)
                .x(d => xScale(xValue(d.data)))
                .y0(d => getYScale(d[0]))
                .y1(d => getYScale(d[1]))

            render(prestack, keys, area);
        });
    }

    function updateOptions() {
        function getBaseFilename() {
            //get the values of the radio buttons
            const ngramValue = $('.control-group-ngram input[type=radio]:checked').val();
            const pubmedSourceValue = $('.control-group-pubmed-source input[type=radio]:checked').val();
            $("#pubmed-datasource-in-title").text(pubmedDatasourceLookup[pubmedSourceValue]);
            $("#ngram-size-in-title").text(ngramSizeLookup[ngramValue]);
            return `${pubmedSourceValue}-ngram_${ngramValue}-`;
        }

        // open file based on Pubmed Source + N-gram Size
        // csv filename format: {field}-ngram_{ngram number}-counts.csv
        // json filename format: {field}-ngram_{ngram number}-papers.json
        // Possible Pubmed Sources: pubmedDatasourceLookup keys
        // Possible N-gram Sizes: ngramSizeLookup keys

        //clear the svg
        svg.selectAll("*").remove()

        const baseFilename = getBaseFilename()
        const countsCsvFilename = `${baseFilename}counts.csv`;
        const papersJsonFilename = `${baseFilename}papers.json`;

        // log the filenames if you want
        console.log("countsCsvFilename", countsCsvFilename)
        console.log("papersJsonFilename", papersJsonFilename)

        //NAOMI, uncomment the next line once you have the csv and json files created --- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        drawRiver("./data/" + countsCsvFilename, "./data/" + papersJsonFilename);


        //NAMOI, delete the next 3 lines of code once you have the csv and json files created --- !!!!!!!!!!!!!!!!!!!!!!
        //this is just a hack to make things work with the old data --- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // const oldBadCSVFilename = './data/year_counts_full.csv';
        // const oldBadJSONFilename = "./data/papers_per_word_full.json"
        // drawRiver(oldBadCSVFilename, oldBadJSONFilename);


    }

    $('.control-group-ngram input[type=radio], .control-group-pubmed-source input[type=radio]').change(() => {
        updateOptions()
    })

    $(window).on("resize", function () {
        updateOptions()
    })
    updateOptions();
});
