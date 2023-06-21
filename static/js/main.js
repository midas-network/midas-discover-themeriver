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
let mouseOutEnabled = false;
let mouseOutTimeout;
let fadeInDuration = 750;
const year_select = $('#year-list');

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

    const drawRiver = (countsCsvFilename, papersJsonFilename, tension) => {
        const renderInit = function (data) {

            const graphHeight = $("#wrapper")[0].offsetHeight;
            const graphWidth = $("#wrapper")[0].offsetWidth;
            const heightOfXAxis = 30;
            // Linear Scale: Data Space -> Screen Space
            xScale = d3.scaleLinear()
                .domain([0, dates.length - 1])
                .range([$("svg")[0].getBoundingClientRect().x + 50, $("svg")[0].getBoundingClientRect().width - 50]);

            // Introducing y-Scale
            yScale = d3.scaleLinear()
                .domain([0, 100])
                .range([$("svg")[0].getBoundingClientRect().height-50, 0]) // height 107 -> figure out height of x-axis
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
 gForXAxis.append('g').call(xAxis).attr('transform', `translate(0, ${$("svg")[0].getBoundingClientRect().height - heightOfXAxis})`).attr('id', 'xaxis');

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
                .attr('height', $("svg")[0].getBoundingClientRect().height + 100)
            // .attr('height', height)

            g.selectAll('path')
                .data(layers)
                .join('path')
                .attr('opacity', 0.9)
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


                // elem.css('left', g_width + 20 + 'px');
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

                // Color label box
                elem.css('backgroundColor', 'transparent');
                $('#tooltip-inner').css('border-color', d3.event.currentTarget.getAttribute('fill'));
                  $('#word-label').css('border-color', d3.event.currentTarget.getAttribute('fill'));
                //$('#theme-color').css('color', d3.event.currentTarget.getAttribute('fill'));
                const fill = d3.event.currentTarget.getAttribute('fill')


                //  styleElem.innerHTML = "." + cssClass+ ":after {border-"+nonArrowSide+"-color: " + fill + " :before {border-"+nonArrowSide+"-color: " + fill + "}";

                // Get count
                let date_index = Math.round(xScale.invert(d3.mouse(this)[0])),
                    topic_count = this.__data__[date_index]['data'][this.classList[0]];
                for (i = 0; i < limited_dataset.length; i++) {
                    if (limited_dataset[i]['date'] === dates[date_index] && limited_dataset[i]['topic'] === this.classList['value']) {
                        topic_count = limited_dataset[i]['count'];
                    }
                }
                $('#river-word').html(this.classList['value']);
                if (topic_count==0){
                    $('#word-label').html("Not in top 20 in " + dates[date_index].substr(0, 4));
                } else{
                    $('#word-label').html(topic_count + " papers in " + dates[date_index].substr(0, 4));
                }

                $('#word-box').fadeTo(fadeInDuration, 1);


                fadeInDuration = 0
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
                            // topic_count_elem.text(topic_count)
                            topic_count_elem.text(papers[dates[date_index].substr(0, 4)][this.classList['value']].length)
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

            let filtered_set = getFilteredSet(dataset);

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
            up_max_index = d3.maxIndex(sequential, seq => {
                result = 0;
                seq.forEach(s => {
                    result += yRaw(s)
                })
                // result = result + (result*.1)
                return result;
            });

            up_max = 0
            sequential[up_max_index].forEach( s => {
                up_max += yRaw(s)
            })
            // up_max = up_max + (up_max*.1)

            console.log(up_max_index)
            console.log(up_max)
            // put arrays in correct display order and get adjusted counts
            sequential = rebalanceSet(sequential, sorting_set, up_max);

            // stack data
            let prestack = seqgen(limited_dataset);
            let keys = sorting_set;
svg.selectAll("*").remove()
            renderInit(limited_dataset);

            top_side = 0
            bot_side = 0
            for (const x of Array(sequential[up_max_index].length).keys()){
                if(x % 2 === 1){
                    bot_side += yRaw(sequential[up_max_index][x])
                }
                else {
                    top_side += yRaw(sequential[up_max_index][x])
                }
            }
            console.log(top_side)
            console.log(bot_side)
            offset = (top_side/((top_side+bot_side)/2))
            const getYScale = (yScaleVal) => {
                // const yHalfOfTheScreen = ((innerHeight / 3)); // 178
                const yHalfOfTheScreen = (534-107)*(301/890); // height of wrapper-height of x-axis times height of info box/height of screen
                const heightOffset = 0 //offset;
                const yScreenPercentage = 1 //0.75;
                return ((yScale(yScaleVal) - (yHalfOfTheScreen)) + heightOffset) * yScreenPercentage
                // return ((yScale(yScaleVal) + heightOffset) * yScreenPercentage)
            }
            const area = d3.area()
                .curve(d3.curveCardinal.tension(tension)) // default is d3.curveLinear, d3.curveBundle.beta(1.0)
                .x(d => xScale(xValue(d.data)))
                .y0(d => getYScale(d[0]))
                .y1(d => getYScale(d[1]))
            // .x(d => {if (d[0]==d[1]) return 0;
            //             return xScale(xValue(d.data))})
            // .y0(d => {if (d[0]==d[1]) return 0;
            //             return getYScale(d[0])})
            // .y1(d => {if (d[0]==d[1]) return 0;
            //             return getYScale(d[1])})
            render(prestack, keys, area);

            function fixTranslate() {
                const maingroupHeight =  $('g#maingroup').get(0).getBoundingClientRect().top
                const svgHeight = $('#rectClip').get(0).getBoundingClientRect().top
                $("#maingroup").attr("transform", 'translate(0,' + (svgHeight - maingroupHeight) + ')')
            }
            fixTranslate()

            // write out year list for dropdown select
            let year_options = ''
            for(var i in dates){
                let date = dates[i].substr(0,4)
                year_options += '<option value="' + date + '">' + date + '</option>'
            }
           
           year_select[0].innerHTML = year_options 
           fillTopics()
        });
    }

    function updateOptions() {
        function getBaseFilename() {
            //get the values of the radio buttons
            const pubmedSourceValue = $('.control-group-pubmed-source input[type=radio]:checked').val();
            let ngramValue;
            if (pubmedSourceValue == 'meshTerms'){
                ngramValue = '1'}
            else{
                ngramValue = $('.control-group-ngram input[type=radio]:checked').val();}
            $("#pubmed-datasource-in-title").text(pubmedDatasourceLookup[pubmedSourceValue]);
            $("#ngram-size-in-title").text(ngramSizeLookup[ngramValue]);
            return `${pubmedSourceValue}-ngram_${ngramValue}-`;
        }

        const updateNgramControl = (enable) => {
            const color = enable ? "white" : "lightgray"
            $("#ngram-line").css("color", color)
            $(".control-group-ngram label").css("color", color)
            $(".control-group-ngram .control input").prop("disabled", isMeshTerms)
        }

        const isMeshTerms = $('.control-group-pubmed-source input[type=radio]:checked').val() === 'meshTerms';

        const tension = $("#myRange").val()/100

        updateNgramControl(!isMeshTerms);


        // open file based on Pubmed Source + N-gram Size
        // csv filename format: {field}-ngram_{ngram number}-counts.csv
        // json filename format: {field}-ngram_{ngram number}-papers.json
        // Possible Pubmed Sources: pubmedDatasourceLookup keys
        // Possible N-gram Sizes: ngramSizeLookup keys

        //clear the svg
       // svg.selectAll("*").remove()

        const baseFilename = getBaseFilename()
        const countsCsvFilename = `${baseFilename}counts.csv`;
        const papersJsonFilename = `${baseFilename}papers.json`;

        // log the filenames if you want
        // console.log("countsCsvFilename", countsCsvFilename)
        // console.log("papersJsonFilename", papersJsonFilename)

        //NAOMI, uncomment the next line once you have the csv and json files created --- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        drawRiver("./data/" + countsCsvFilename, "./data/" + papersJsonFilename, tension);


        //NAMOI, delete the next 3 lines of code once you have the csv and json files created --- !!!!!!!!!!!!!!!!!!!!!!
        //this is just a hack to make things work with the old data --- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // const oldBadCSVFilename = './data/year_counts_full.csv';
        // const oldBadJSONFilename = "./data/papers_per_word_full.json"
        // drawRiver(oldBadCSVFilename, oldBadJSONFilename);


        $('#term-list')[0].onclick = function(event){
            if (event.target.tagName !='LI') return;

            toggleSelect(event.target)

            const topic_elem = $('#current-topic')
            const topic_count_elem = $('#current-topic-count')
            const year_elem = $('#current-year')
            const paper_elem = $('#paper-list')
            let s_date = year_select[0].value+'/1/1'
            let date_index = dates.findIndex(x => x==s_date);
            let topic_count; 
            let topic = event.target.innerHTML

            fetch("./data/" + papersJsonFilename)
                .then(response => {
                    return response.json()
                })
                .then(papers => {
                        let paper_list = "<ul>"
                        for (let article of papers[year_select[0].value][topic]) {
                            paper_list += "<li><a href='" + article['uri'] + "' target='_blank'>" + article['title'] + "</a></li>"
                        }
                        for (let i = 0; i < limited_dataset.length; i++) {
                            if (limited_dataset[i]['date'] === s_date && limited_dataset[i]['topic'] === topic) {
                                topic_count = limited_dataset[i]['count'];
                            }
                        }
                        paper_list += "</ul>"
                        year_elem.text(year_select[0].value)
                        // topic_count_elem.text(topic_count)
                        topic_count_elem.text(papers[year_select[0].value][topic].length)
                        topic_elem[0].innerHTML = topic
                        paper_elem[0].innerHTML = paper_list;
                        paper_elem[0].scrollTop = 0;
                        $("#instruction-line").hide()
                        $("#topic-line").show()
                    }
                )
        }

    }

    function fillTopics(){
        console.log(year_select[0].value)
        let s_date = year_select[0].value+'/1/1'
        let year_topics = limited_dataset.filter(d => d.date== s_date && d.count !=0)
                                    .map(function(d) {return d.topic})

        topic_list = "<ul>"
        for(var i in year_topics){
            topic_list += "<li>" + year_topics[i] + "</li>"
        }
        topic_list += "</ul>"
        $("#term-list")[0].innerHTML = topic_list
    }

    function toggleSelect(li){
        let selected = $('#term-list').find('.selected');
        for (let elem of selected){
            elem.classList.remove('selected');
        }
        li.classList.toggle('selected');
    }

    function showPapers(topic, baseFilename){
        const papersJsonFilename = `${baseFilename}papers.json`;

        const topic_elem = $('#current-topic')
        const topic_count_elem = $('#current-topic-count')
        const year_elem = $('#current-year')
        const paper_elem = $('#paper-list')
        let s_date = year_select[0].value+'/1/1'
        let date_index = dates.findIndex(x => x==s_date);
        let topic_count; 

        fetch(papersJsonFilename)
            .then(response => {
                return response.json()
            })
            .then(papers => {
                    let paper_list = "<ul>"
                    for (let article of papers[year_select[0]][topic]) {
                        paper_list += "<li><a href='" + article['uri'] + "' target='_blank'>" + article['title'] + "</a></li>"
                    }
                    for (let i = 0; i < limited_dataset.length; i++) {
                        if (limited_dataset[i]['date'] === s_date && limited_dataset[i]['topic'] === topic) {
                            topic_count = limited_dataset[i]['count'];
                        }
                    }
                    paper_list += "</ul>"
                    year_elem.text(dates[date_index].substr(0, 4))
                    // topic_count_elem.text(topic_count)
                    topic_count_elem.text(papers[dates[date_index].substr(0, 4)][this.classList['value']].length)
                    topic_elem[0].innerHTML = this.classList['value']
                    paper_elem[0].innerHTML = paper_list;
                    paper_elem[0].scrollTop = 0;
                    $("#instruction-line").hide()
                    $("#topic-line").show()
                }
            )
    }

    $('.control-group-ngram input[type=radio], .control-group-pubmed-source input[type=radio]').change(() => {
        updateOptions()
    })

    $("#myRange").on("input", function () {
        updateOptions()
    })

    $(window).on("resize", function () {
        updateOptions()
    })
    updateOptions();

    year_select.change(() => {
        fillTopics()
    })
});
