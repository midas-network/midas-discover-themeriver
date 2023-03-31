const riverStats = {
    largest_count: 0,
    byYearCount: []
}

const getFilteredSet = (dataset) => {
    rollup = d3.nest()
               .key((d) => {return d.topic;})
               .rollup(v => d3.sum(v,d => d.count), d => d.topic)
               .entries(dataset)
               .sort((a,b) => {return d3.descending(a.value, b.value)})

    console.log(rollup)
    // return rollup.filter((d, i) => {return i < 20})
    return rollup
}

const rebalanceSet = (dataset, sorting_set, up_max) => {
    for (year of dataset){
        year.sort((a,b) => sorting_set.indexOf(a['topic']) - sorting_set.indexOf(b['topic']));

        let total = 0;
        for (term of year){
            total += term['count'];
        }
        
        for (term of year){
            term['raw_percent'] = (term['count']/total || 0);
            term['year_total'] = total;
            term['adjusted_percent'] = Math.round((term['raw_percent']*(total/up_max) || 0) * 100);
        }
    }

    return dataset;
}
