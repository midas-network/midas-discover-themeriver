
const getFilteredSet = (dataset) => {
    rollup = d3.nest()
               .key((d) => {return d.topic;})
               .rollup(v => d3.sum(v,d => d.count), d => d.topic)
               .entries(dataset)
               .sort((a,b) => {return d3.descending(a.value, b.value)})

    // return rollup.filter((d, i) => {return i < 20})
    return rollup
}

const rebalanceSet = (dataset, sorting_set, up_max) => {
    let year;
    for (year of dataset){
        year.sort((a,b) => sorting_set.indexOf(a['topic']) - sorting_set.indexOf(b['topic']));

        let total = 0;
        let term;
        for (term of year){
            total += term['count'];
        }
       
        // total = total + (total*0.1)
        let add_up = 0
        for (term of year){
            term['raw_percent'] = (term['count']/total || 0);
            term['year_total'] = total;
            if (term['count'] == 0)
                term['adjusted_percent'] = 0
            else
                // term['adjusted_percent'] = Math.max(.000001, Math.round((term['raw_percent']*(total/up_max) || 0) * 100));
                term['adjusted_percent'] = ((term['raw_percent']*(total/up_max) || 0) * 95);
            add_up += term['adjusted_percent']    
        }
        //console.log('year: ' + year[0]['date'] + ' total: ' + add_up)
    }




    return dataset;
}
