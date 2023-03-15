const riverStats = {
    largest_count: 0,
    byYearCount: []
}

const getFilteredSet = (dataset) => {
    console.log('we are here')
    rollup = d3.nest()
               .key((d) => {return d.topic;})
               .rollup(v => d3.sum(v,d => d.count), d => d.topic)
               .entries(dataset)
               .sort((a,b) => {return d3.descending(a.value, b.value)})

    console.log(rollup)
    return rollup.filter((d, i) => {return i < 20})
}

