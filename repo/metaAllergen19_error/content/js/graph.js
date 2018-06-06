/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? -36000000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -36000000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 2388.0, "minX": 0.0, "maxY": 136785.0, "series": [{"data": [[0.0, 2388.0], [0.1, 2388.0], [0.2, 2388.0], [0.3, 2388.0], [0.4, 2388.0], [0.5, 2388.0], [0.6, 2388.0], [0.7, 2588.0], [0.8, 2588.0], [0.9, 2588.0], [1.0, 2588.0], [1.1, 2588.0], [1.2, 2588.0], [1.3, 3066.0], [1.4, 3066.0], [1.5, 3066.0], [1.6, 3066.0], [1.7, 3066.0], [1.8, 3066.0], [1.9, 3066.0], [2.0, 3085.0], [2.1, 3085.0], [2.2, 3085.0], [2.3, 3085.0], [2.4, 3085.0], [2.5, 3085.0], [2.6, 3564.0], [2.7, 3564.0], [2.8, 3564.0], [2.9, 3564.0], [3.0, 3564.0], [3.1, 3564.0], [3.2, 3564.0], [3.3, 3786.0], [3.4, 3786.0], [3.5, 3786.0], [3.6, 3786.0], [3.7, 3786.0], [3.8, 3786.0], [3.9, 4183.0], [4.0, 4183.0], [4.1, 4183.0], [4.2, 4183.0], [4.3, 4183.0], [4.4, 4183.0], [4.5, 4183.0], [4.6, 4275.0], [4.7, 4275.0], [4.8, 4275.0], [4.9, 4275.0], [5.0, 4275.0], [5.1, 4275.0], [5.2, 4446.0], [5.3, 4446.0], [5.4, 4446.0], [5.5, 4446.0], [5.6, 4446.0], [5.7, 4446.0], [5.8, 4446.0], [5.9, 4960.0], [6.0, 4960.0], [6.1, 4960.0], [6.2, 4960.0], [6.3, 4960.0], [6.4, 4960.0], [6.5, 5404.0], [6.6, 5404.0], [6.7, 5404.0], [6.8, 5404.0], [6.9, 5404.0], [7.0, 5404.0], [7.1, 5404.0], [7.2, 5730.0], [7.3, 5730.0], [7.4, 5730.0], [7.5, 5730.0], [7.6, 5730.0], [7.7, 5730.0], [7.8, 5786.0], [7.9, 5786.0], [8.0, 5786.0], [8.1, 5786.0], [8.2, 5786.0], [8.3, 5786.0], [8.4, 5786.0], [8.5, 6270.0], [8.6, 6270.0], [8.7, 6270.0], [8.8, 6270.0], [8.9, 6270.0], [9.0, 6270.0], [9.1, 6911.0], [9.2, 6911.0], [9.3, 6911.0], [9.4, 6911.0], [9.5, 6911.0], [9.6, 6911.0], [9.7, 6911.0], [9.8, 7623.0], [9.9, 7623.0], [10.0, 7623.0], [10.1, 7623.0], [10.2, 7623.0], [10.3, 7623.0], [10.4, 7749.0], [10.5, 7749.0], [10.6, 7749.0], [10.7, 7749.0], [10.8, 7749.0], [10.9, 7749.0], [11.0, 7749.0], [11.1, 7966.0], [11.2, 7966.0], [11.3, 7966.0], [11.4, 7966.0], [11.5, 7966.0], [11.6, 7966.0], [11.7, 8956.0], [11.8, 8956.0], [11.9, 8956.0], [12.0, 8956.0], [12.1, 8956.0], [12.2, 8956.0], [12.3, 8956.0], [12.4, 9000.0], [12.5, 9000.0], [12.6, 9000.0], [12.7, 9000.0], [12.8, 9000.0], [12.9, 9000.0], [13.0, 9014.0], [13.1, 9014.0], [13.2, 9014.0], [13.3, 9014.0], [13.4, 9014.0], [13.5, 9014.0], [13.6, 9014.0], [13.7, 10196.0], [13.8, 10196.0], [13.9, 10196.0], [14.0, 10196.0], [14.1, 10196.0], [14.2, 10196.0], [14.3, 10420.0], [14.4, 10420.0], [14.5, 10420.0], [14.6, 10420.0], [14.7, 10420.0], [14.8, 10420.0], [14.9, 10420.0], [15.0, 10475.0], [15.1, 10475.0], [15.2, 10475.0], [15.3, 10475.0], [15.4, 10475.0], [15.5, 10475.0], [15.6, 10555.0], [15.7, 10555.0], [15.8, 10555.0], [15.9, 10555.0], [16.0, 10555.0], [16.1, 10555.0], [16.2, 10555.0], [16.3, 10771.0], [16.4, 10771.0], [16.5, 10771.0], [16.6, 10771.0], [16.7, 10771.0], [16.8, 10771.0], [16.9, 11252.0], [17.0, 11252.0], [17.1, 11252.0], [17.2, 11252.0], [17.3, 11252.0], [17.4, 11252.0], [17.5, 11252.0], [17.6, 11330.0], [17.7, 11330.0], [17.8, 11330.0], [17.9, 11330.0], [18.0, 11330.0], [18.1, 11330.0], [18.2, 11409.0], [18.3, 11409.0], [18.4, 11409.0], [18.5, 11409.0], [18.6, 11409.0], [18.7, 11409.0], [18.8, 11409.0], [18.9, 11570.0], [19.0, 11570.0], [19.1, 11570.0], [19.2, 11570.0], [19.3, 11570.0], [19.4, 11570.0], [19.5, 11813.0], [19.6, 11813.0], [19.7, 11813.0], [19.8, 11813.0], [19.9, 11813.0], [20.0, 11813.0], [20.1, 11813.0], [20.2, 11921.0], [20.3, 11921.0], [20.4, 11921.0], [20.5, 11921.0], [20.6, 11921.0], [20.7, 11921.0], [20.8, 12374.0], [20.9, 12374.0], [21.0, 12374.0], [21.1, 12374.0], [21.2, 12374.0], [21.3, 12374.0], [21.4, 12374.0], [21.5, 12400.0], [21.6, 12400.0], [21.7, 12400.0], [21.8, 12400.0], [21.9, 12400.0], [22.0, 12400.0], [22.1, 12435.0], [22.2, 12435.0], [22.3, 12435.0], [22.4, 12435.0], [22.5, 12435.0], [22.6, 12435.0], [22.7, 12435.0], [22.8, 13248.0], [22.9, 13248.0], [23.0, 13248.0], [23.1, 13248.0], [23.2, 13248.0], [23.3, 13248.0], [23.4, 13375.0], [23.5, 13375.0], [23.6, 13375.0], [23.7, 13375.0], [23.8, 13375.0], [23.9, 13375.0], [24.0, 13375.0], [24.1, 14056.0], [24.2, 14056.0], [24.3, 14056.0], [24.4, 14056.0], [24.5, 14056.0], [24.6, 14056.0], [24.7, 14187.0], [24.8, 14187.0], [24.9, 14187.0], [25.0, 14187.0], [25.1, 14187.0], [25.2, 14187.0], [25.3, 14187.0], [25.4, 14459.0], [25.5, 14459.0], [25.6, 14459.0], [25.7, 14459.0], [25.8, 14459.0], [25.9, 14459.0], [26.0, 14914.0], [26.1, 14914.0], [26.2, 14914.0], [26.3, 14914.0], [26.4, 14914.0], [26.5, 14914.0], [26.6, 14914.0], [26.7, 15139.0], [26.8, 15139.0], [26.9, 15139.0], [27.0, 15139.0], [27.1, 15139.0], [27.2, 15139.0], [27.3, 15585.0], [27.4, 15585.0], [27.5, 15585.0], [27.6, 15585.0], [27.7, 15585.0], [27.8, 15585.0], [27.9, 15585.0], [28.0, 15808.0], [28.1, 15808.0], [28.2, 15808.0], [28.3, 15808.0], [28.4, 15808.0], [28.5, 15808.0], [28.6, 16217.0], [28.7, 16217.0], [28.8, 16217.0], [28.9, 16217.0], [29.0, 16217.0], [29.1, 16217.0], [29.2, 16217.0], [29.3, 17064.0], [29.4, 17064.0], [29.5, 17064.0], [29.6, 17064.0], [29.7, 17064.0], [29.8, 17064.0], [29.9, 17193.0], [30.0, 17193.0], [30.1, 17193.0], [30.2, 17193.0], [30.3, 17193.0], [30.4, 17193.0], [30.5, 17193.0], [30.6, 17389.0], [30.7, 17389.0], [30.8, 17389.0], [30.9, 17389.0], [31.0, 17389.0], [31.1, 17389.0], [31.2, 17862.0], [31.3, 17862.0], [31.4, 17862.0], [31.5, 17862.0], [31.6, 17862.0], [31.7, 17862.0], [31.8, 17862.0], [31.9, 18267.0], [32.0, 18267.0], [32.1, 18267.0], [32.2, 18267.0], [32.3, 18267.0], [32.4, 18267.0], [32.5, 19577.0], [32.6, 19577.0], [32.7, 19577.0], [32.8, 19577.0], [32.9, 19577.0], [33.0, 19577.0], [33.1, 19577.0], [33.2, 19675.0], [33.3, 19675.0], [33.4, 19675.0], [33.5, 19675.0], [33.6, 19675.0], [33.7, 19675.0], [33.8, 20197.0], [33.9, 20197.0], [34.0, 20197.0], [34.1, 20197.0], [34.2, 20197.0], [34.3, 20197.0], [34.4, 20197.0], [34.5, 20669.0], [34.6, 20669.0], [34.7, 20669.0], [34.8, 20669.0], [34.9, 20669.0], [35.0, 20669.0], [35.1, 20997.0], [35.2, 20997.0], [35.3, 20997.0], [35.4, 20997.0], [35.5, 20997.0], [35.6, 20997.0], [35.7, 20997.0], [35.8, 21023.0], [35.9, 21023.0], [36.0, 21023.0], [36.1, 21023.0], [36.2, 21023.0], [36.3, 21023.0], [36.4, 21590.0], [36.5, 21590.0], [36.6, 21590.0], [36.7, 21590.0], [36.8, 21590.0], [36.9, 21590.0], [37.0, 21590.0], [37.1, 21706.0], [37.2, 21706.0], [37.3, 21706.0], [37.4, 21706.0], [37.5, 21706.0], [37.6, 21706.0], [37.7, 22066.0], [37.8, 22066.0], [37.9, 22066.0], [38.0, 22066.0], [38.1, 22066.0], [38.2, 22066.0], [38.3, 22066.0], [38.4, 22864.0], [38.5, 22864.0], [38.6, 22864.0], [38.7, 22864.0], [38.8, 22864.0], [38.9, 22864.0], [39.0, 22881.0], [39.1, 22881.0], [39.2, 22881.0], [39.3, 22881.0], [39.4, 22881.0], [39.5, 22881.0], [39.6, 22881.0], [39.7, 23486.0], [39.8, 23486.0], [39.9, 23486.0], [40.0, 23486.0], [40.1, 23486.0], [40.2, 23486.0], [40.3, 23493.0], [40.4, 23493.0], [40.5, 23493.0], [40.6, 23493.0], [40.7, 23493.0], [40.8, 23493.0], [40.9, 23493.0], [41.0, 24316.0], [41.1, 24316.0], [41.2, 24316.0], [41.3, 24316.0], [41.4, 24316.0], [41.5, 24316.0], [41.6, 24335.0], [41.7, 24335.0], [41.8, 24335.0], [41.9, 24335.0], [42.0, 24335.0], [42.1, 24335.0], [42.2, 24335.0], [42.3, 24389.0], [42.4, 24389.0], [42.5, 24389.0], [42.6, 24389.0], [42.7, 24389.0], [42.8, 24389.0], [42.9, 24390.0], [43.0, 24390.0], [43.1, 24390.0], [43.2, 24390.0], [43.3, 24390.0], [43.4, 24390.0], [43.5, 24390.0], [43.6, 24647.0], [43.7, 24647.0], [43.8, 24647.0], [43.9, 24647.0], [44.0, 24647.0], [44.1, 24647.0], [44.2, 24711.0], [44.3, 24711.0], [44.4, 24711.0], [44.5, 24711.0], [44.6, 24711.0], [44.7, 24711.0], [44.8, 24711.0], [44.9, 25103.0], [45.0, 25103.0], [45.1, 25103.0], [45.2, 25103.0], [45.3, 25103.0], [45.4, 25103.0], [45.5, 25732.0], [45.6, 25732.0], [45.7, 25732.0], [45.8, 25732.0], [45.9, 25732.0], [46.0, 25732.0], [46.1, 25732.0], [46.2, 25822.0], [46.3, 25822.0], [46.4, 25822.0], [46.5, 25822.0], [46.6, 25822.0], [46.7, 25822.0], [46.8, 26041.0], [46.9, 26041.0], [47.0, 26041.0], [47.1, 26041.0], [47.2, 26041.0], [47.3, 26041.0], [47.4, 26041.0], [47.5, 26644.0], [47.6, 26644.0], [47.7, 26644.0], [47.8, 26644.0], [47.9, 26644.0], [48.0, 26644.0], [48.1, 27703.0], [48.2, 27703.0], [48.3, 27703.0], [48.4, 27703.0], [48.5, 27703.0], [48.6, 27703.0], [48.7, 27703.0], [48.8, 28416.0], [48.9, 28416.0], [49.0, 28416.0], [49.1, 28416.0], [49.2, 28416.0], [49.3, 28416.0], [49.4, 28928.0], [49.5, 28928.0], [49.6, 28928.0], [49.7, 28928.0], [49.8, 28928.0], [49.9, 28928.0], [50.0, 28928.0], [50.1, 29168.0], [50.2, 29168.0], [50.3, 29168.0], [50.4, 29168.0], [50.5, 29168.0], [50.6, 29168.0], [50.7, 29356.0], [50.8, 29356.0], [50.9, 29356.0], [51.0, 29356.0], [51.1, 29356.0], [51.2, 29356.0], [51.3, 29438.0], [51.4, 29438.0], [51.5, 29438.0], [51.6, 29438.0], [51.7, 29438.0], [51.8, 29438.0], [51.9, 29438.0], [52.0, 30369.0], [52.1, 30369.0], [52.2, 30369.0], [52.3, 30369.0], [52.4, 30369.0], [52.5, 30369.0], [52.6, 30980.0], [52.7, 30980.0], [52.8, 30980.0], [52.9, 30980.0], [53.0, 30980.0], [53.1, 30980.0], [53.2, 30980.0], [53.3, 31231.0], [53.4, 31231.0], [53.5, 31231.0], [53.6, 31231.0], [53.7, 31231.0], [53.8, 31231.0], [53.9, 31422.0], [54.0, 31422.0], [54.1, 31422.0], [54.2, 31422.0], [54.3, 31422.0], [54.4, 31422.0], [54.5, 31422.0], [54.6, 31928.0], [54.7, 31928.0], [54.8, 31928.0], [54.9, 31928.0], [55.0, 31928.0], [55.1, 31928.0], [55.2, 33225.0], [55.3, 33225.0], [55.4, 33225.0], [55.5, 33225.0], [55.6, 33225.0], [55.7, 33225.0], [55.8, 33225.0], [55.9, 33527.0], [56.0, 33527.0], [56.1, 33527.0], [56.2, 33527.0], [56.3, 33527.0], [56.4, 33527.0], [56.5, 33922.0], [56.6, 33922.0], [56.7, 33922.0], [56.8, 33922.0], [56.9, 33922.0], [57.0, 33922.0], [57.1, 33922.0], [57.2, 34027.0], [57.3, 34027.0], [57.4, 34027.0], [57.5, 34027.0], [57.6, 34027.0], [57.7, 34027.0], [57.8, 34641.0], [57.9, 34641.0], [58.0, 34641.0], [58.1, 34641.0], [58.2, 34641.0], [58.3, 34641.0], [58.4, 34641.0], [58.5, 35184.0], [58.6, 35184.0], [58.7, 35184.0], [58.8, 35184.0], [58.9, 35184.0], [59.0, 35184.0], [59.1, 35275.0], [59.2, 35275.0], [59.3, 35275.0], [59.4, 35275.0], [59.5, 35275.0], [59.6, 35275.0], [59.7, 35275.0], [59.8, 36537.0], [59.9, 36537.0], [60.0, 36537.0], [60.1, 36537.0], [60.2, 36537.0], [60.3, 36537.0], [60.4, 37208.0], [60.5, 37208.0], [60.6, 37208.0], [60.7, 37208.0], [60.8, 37208.0], [60.9, 37208.0], [61.0, 37208.0], [61.1, 37270.0], [61.2, 37270.0], [61.3, 37270.0], [61.4, 37270.0], [61.5, 37270.0], [61.6, 37270.0], [61.7, 38614.0], [61.8, 38614.0], [61.9, 38614.0], [62.0, 38614.0], [62.1, 38614.0], [62.2, 38614.0], [62.3, 38614.0], [62.4, 38911.0], [62.5, 38911.0], [62.6, 38911.0], [62.7, 38911.0], [62.8, 38911.0], [62.9, 38911.0], [63.0, 39415.0], [63.1, 39415.0], [63.2, 39415.0], [63.3, 39415.0], [63.4, 39415.0], [63.5, 39415.0], [63.6, 39415.0], [63.7, 39574.0], [63.8, 39574.0], [63.9, 39574.0], [64.0, 39574.0], [64.1, 39574.0], [64.2, 39574.0], [64.3, 40543.0], [64.4, 40543.0], [64.5, 40543.0], [64.6, 40543.0], [64.7, 40543.0], [64.8, 40543.0], [64.9, 40543.0], [65.0, 40742.0], [65.1, 40742.0], [65.2, 40742.0], [65.3, 40742.0], [65.4, 40742.0], [65.5, 40742.0], [65.6, 40899.0], [65.7, 40899.0], [65.8, 40899.0], [65.9, 40899.0], [66.0, 40899.0], [66.1, 40899.0], [66.2, 40899.0], [66.3, 41439.0], [66.4, 41439.0], [66.5, 41439.0], [66.6, 41439.0], [66.7, 41439.0], [66.8, 41439.0], [66.9, 42587.0], [67.0, 42587.0], [67.1, 42587.0], [67.2, 42587.0], [67.3, 42587.0], [67.4, 42587.0], [67.5, 42587.0], [67.6, 42829.0], [67.7, 42829.0], [67.8, 42829.0], [67.9, 42829.0], [68.0, 42829.0], [68.1, 42829.0], [68.2, 43113.0], [68.3, 43113.0], [68.4, 43113.0], [68.5, 43113.0], [68.6, 43113.0], [68.7, 43113.0], [68.8, 43113.0], [68.9, 43442.0], [69.0, 43442.0], [69.1, 43442.0], [69.2, 43442.0], [69.3, 43442.0], [69.4, 43442.0], [69.5, 43511.0], [69.6, 43511.0], [69.7, 43511.0], [69.8, 43511.0], [69.9, 43511.0], [70.0, 43511.0], [70.1, 43511.0], [70.2, 44702.0], [70.3, 44702.0], [70.4, 44702.0], [70.5, 44702.0], [70.6, 44702.0], [70.7, 44702.0], [70.8, 46975.0], [70.9, 46975.0], [71.0, 46975.0], [71.1, 46975.0], [71.2, 46975.0], [71.3, 46975.0], [71.4, 46975.0], [71.5, 47010.0], [71.6, 47010.0], [71.7, 47010.0], [71.8, 47010.0], [71.9, 47010.0], [72.0, 47010.0], [72.1, 47618.0], [72.2, 47618.0], [72.3, 47618.0], [72.4, 47618.0], [72.5, 47618.0], [72.6, 47618.0], [72.7, 47618.0], [72.8, 50895.0], [72.9, 50895.0], [73.0, 50895.0], [73.1, 50895.0], [73.2, 50895.0], [73.3, 50895.0], [73.4, 50983.0], [73.5, 50983.0], [73.6, 50983.0], [73.7, 50983.0], [73.8, 50983.0], [73.9, 50983.0], [74.0, 50983.0], [74.1, 55109.0], [74.2, 55109.0], [74.3, 55109.0], [74.4, 55109.0], [74.5, 55109.0], [74.6, 55109.0], [74.7, 55194.0], [74.8, 55194.0], [74.9, 55194.0], [75.0, 55194.0], [75.1, 55194.0], [75.2, 55194.0], [75.3, 55194.0], [75.4, 66088.0], [75.5, 66088.0], [75.6, 66088.0], [75.7, 66088.0], [75.8, 66088.0], [75.9, 66088.0], [76.0, 66478.0], [76.1, 66478.0], [76.2, 66478.0], [76.3, 66478.0], [76.4, 66478.0], [76.5, 66478.0], [76.6, 66478.0], [76.7, 69591.0], [76.8, 69591.0], [76.9, 69591.0], [77.0, 69591.0], [77.1, 69591.0], [77.2, 69591.0], [77.3, 70925.0], [77.4, 70925.0], [77.5, 70925.0], [77.6, 70925.0], [77.7, 70925.0], [77.8, 70925.0], [77.9, 70925.0], [78.0, 73629.0], [78.1, 73629.0], [78.2, 73629.0], [78.3, 73629.0], [78.4, 73629.0], [78.5, 73629.0], [78.6, 73863.0], [78.7, 73863.0], [78.8, 73863.0], [78.9, 73863.0], [79.0, 73863.0], [79.1, 73863.0], [79.2, 73863.0], [79.3, 108841.0], [79.4, 108841.0], [79.5, 108841.0], [79.6, 108841.0], [79.7, 108841.0], [79.8, 108841.0], [79.9, 111440.0], [80.0, 111440.0], [80.1, 111440.0], [80.2, 111440.0], [80.3, 111440.0], [80.4, 111440.0], [80.5, 111440.0], [80.6, 112229.0], [80.7, 112229.0], [80.8, 112229.0], [80.9, 112229.0], [81.0, 112229.0], [81.1, 112229.0], [81.2, 112349.0], [81.3, 112349.0], [81.4, 112349.0], [81.5, 112349.0], [81.6, 112349.0], [81.7, 112349.0], [81.8, 112349.0], [81.9, 116824.0], [82.0, 116824.0], [82.1, 116824.0], [82.2, 116824.0], [82.3, 116824.0], [82.4, 116824.0], [82.5, 116867.0], [82.6, 116867.0], [82.7, 116867.0], [82.8, 116867.0], [82.9, 116867.0], [83.0, 116867.0], [83.1, 116867.0], [83.2, 121001.0], [83.3, 121001.0], [83.4, 121001.0], [83.5, 121001.0], [83.6, 121001.0], [83.7, 121001.0], [83.8, 121194.0], [83.9, 121194.0], [84.0, 121194.0], [84.1, 121194.0], [84.2, 121194.0], [84.3, 121194.0], [84.4, 121194.0], [84.5, 121332.0], [84.6, 121332.0], [84.7, 121332.0], [84.8, 121332.0], [84.9, 121332.0], [85.0, 121332.0], [85.1, 121850.0], [85.2, 121850.0], [85.3, 121850.0], [85.4, 121850.0], [85.5, 121850.0], [85.6, 121850.0], [85.7, 121850.0], [85.8, 122092.0], [85.9, 122092.0], [86.0, 122092.0], [86.1, 122092.0], [86.2, 122092.0], [86.3, 122092.0], [86.4, 122098.0], [86.5, 122098.0], [86.6, 122098.0], [86.7, 122098.0], [86.8, 122098.0], [86.9, 122098.0], [87.0, 122098.0], [87.1, 122138.0], [87.2, 122138.0], [87.3, 122138.0], [87.4, 122138.0], [87.5, 122138.0], [87.6, 122138.0], [87.7, 122237.0], [87.8, 122237.0], [87.9, 122237.0], [88.0, 122237.0], [88.1, 122237.0], [88.2, 122237.0], [88.3, 122237.0], [88.4, 122384.0], [88.5, 122384.0], [88.6, 122384.0], [88.7, 122384.0], [88.8, 122384.0], [88.9, 122384.0], [89.0, 122678.0], [89.1, 122678.0], [89.2, 122678.0], [89.3, 122678.0], [89.4, 122678.0], [89.5, 122678.0], [89.6, 122678.0], [89.7, 123159.0], [89.8, 123159.0], [89.9, 123159.0], [90.0, 123159.0], [90.1, 123159.0], [90.2, 123159.0], [90.3, 123447.0], [90.4, 123447.0], [90.5, 123447.0], [90.6, 123447.0], [90.7, 123447.0], [90.8, 123447.0], [90.9, 123447.0], [91.0, 123672.0], [91.1, 123672.0], [91.2, 123672.0], [91.3, 123672.0], [91.4, 123672.0], [91.5, 123672.0], [91.6, 125708.0], [91.7, 125708.0], [91.8, 125708.0], [91.9, 125708.0], [92.0, 125708.0], [92.1, 125708.0], [92.2, 125708.0], [92.3, 125716.0], [92.4, 125716.0], [92.5, 125716.0], [92.6, 125716.0], [92.7, 125716.0], [92.8, 125716.0], [92.9, 126254.0], [93.0, 126254.0], [93.1, 126254.0], [93.2, 126254.0], [93.3, 126254.0], [93.4, 126254.0], [93.5, 126254.0], [93.6, 126430.0], [93.7, 126430.0], [93.8, 126430.0], [93.9, 126430.0], [94.0, 126430.0], [94.1, 126430.0], [94.2, 126503.0], [94.3, 126503.0], [94.4, 126503.0], [94.5, 126503.0], [94.6, 126503.0], [94.7, 126503.0], [94.8, 126503.0], [94.9, 126615.0], [95.0, 126615.0], [95.1, 126615.0], [95.2, 126615.0], [95.3, 126615.0], [95.4, 126615.0], [95.5, 127573.0], [95.6, 127573.0], [95.7, 127573.0], [95.8, 127573.0], [95.9, 127573.0], [96.0, 127573.0], [96.1, 127573.0], [96.2, 129397.0], [96.3, 129397.0], [96.4, 129397.0], [96.5, 129397.0], [96.6, 129397.0], [96.7, 129397.0], [96.8, 129616.0], [96.9, 129616.0], [97.0, 129616.0], [97.1, 129616.0], [97.2, 129616.0], [97.3, 129616.0], [97.4, 129616.0], [97.5, 133396.0], [97.6, 133396.0], [97.7, 133396.0], [97.8, 133396.0], [97.9, 133396.0], [98.0, 133396.0], [98.1, 135458.0], [98.2, 135458.0], [98.3, 135458.0], [98.4, 135458.0], [98.5, 135458.0], [98.6, 135458.0], [98.7, 135458.0], [98.8, 135727.0], [98.9, 135727.0], [99.0, 135727.0], [99.1, 135727.0], [99.2, 135727.0], [99.3, 135727.0], [99.4, 136785.0], [99.5, 136785.0], [99.6, 136785.0], [99.7, 136785.0], [99.8, 136785.0], [99.9, 136785.0], [100.0, 136785.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 2300.0, "maxY": 4.0, "series": [{"data": [[69500.0, 1.0], [112300.0, 1.0], [122300.0, 1.0], [121100.0, 1.0], [123100.0, 1.0], [127500.0, 1.0], [135400.0, 1.0], [33900.0, 1.0], [33500.0, 1.0], [35100.0, 1.0], [36500.0, 1.0], [38900.0, 1.0], [40500.0, 1.0], [40700.0, 1.0], [39500.0, 1.0], [42500.0, 1.0], [43500.0, 1.0], [44700.0, 1.0], [43100.0, 1.0], [46900.0, 1.0], [50900.0, 1.0], [55100.0, 2.0], [73800.0, 1.0], [111400.0, 1.0], [112200.0, 1.0], [122200.0, 1.0], [121000.0, 1.0], [122600.0, 1.0], [121800.0, 1.0], [126600.0, 1.0], [123400.0, 1.0], [126200.0, 1.0], [135700.0, 1.0], [133300.0, 1.0], [2300.0, 1.0], [2500.0, 1.0], [3000.0, 2.0], [3500.0, 1.0], [3700.0, 1.0], [4200.0, 1.0], [4100.0, 1.0], [4400.0, 1.0], [70900.0, 1.0], [4900.0, 1.0], [5400.0, 1.0], [5700.0, 2.0], [6200.0, 1.0], [6900.0, 1.0], [7600.0, 1.0], [121300.0, 1.0], [122100.0, 1.0], [7700.0, 1.0], [7900.0, 1.0], [125700.0, 2.0], [126500.0, 1.0], [129300.0, 1.0], [9000.0, 2.0], [8900.0, 1.0], [10100.0, 1.0], [10400.0, 2.0], [10500.0, 1.0], [10700.0, 1.0], [11200.0, 1.0], [11400.0, 1.0], [11500.0, 1.0], [11300.0, 1.0], [11900.0, 1.0], [11800.0, 1.0], [12400.0, 2.0], [12300.0, 1.0], [13300.0, 1.0], [13200.0, 1.0], [14000.0, 1.0], [14100.0, 1.0], [14400.0, 1.0], [14900.0, 1.0], [15100.0, 1.0], [15800.0, 1.0], [15500.0, 1.0], [16200.0, 1.0], [17100.0, 1.0], [17000.0, 1.0], [17300.0, 1.0], [17800.0, 1.0], [18200.0, 1.0], [19500.0, 1.0], [19600.0, 1.0], [20100.0, 1.0], [20600.0, 1.0], [21000.0, 1.0], [20900.0, 1.0], [21500.0, 1.0], [22000.0, 1.0], [21700.0, 1.0], [22800.0, 2.0], [23400.0, 2.0], [24300.0, 4.0], [24700.0, 1.0], [24600.0, 1.0], [25100.0, 1.0], [25700.0, 1.0], [25800.0, 1.0], [26600.0, 1.0], [26000.0, 1.0], [27700.0, 1.0], [28400.0, 1.0], [29300.0, 1.0], [29400.0, 1.0], [28900.0, 1.0], [29100.0, 1.0], [30300.0, 1.0], [31400.0, 1.0], [30900.0, 1.0], [31200.0, 1.0], [31900.0, 1.0], [33200.0, 1.0], [34000.0, 1.0], [34600.0, 1.0], [136700.0, 1.0], [35200.0, 1.0], [37200.0, 2.0], [38600.0, 1.0], [39400.0, 1.0], [40800.0, 1.0], [41400.0, 1.0], [42800.0, 1.0], [43400.0, 1.0], [47000.0, 1.0], [47600.0, 1.0], [50800.0, 1.0], [66000.0, 1.0], [66400.0, 1.0], [73600.0, 1.0], [108800.0, 1.0], [116800.0, 2.0], [122000.0, 2.0], [123600.0, 1.0], [126400.0, 1.0], [129600.0, 1.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 136700.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 30.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 124.0, "series": [{"data": [[3.0, 30.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 124.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 5.838709677419355, "minX": 1.52711838E12, "maxY": 31.526315789473685, "series": [{"data": [[1.52711856E12, 31.526315789473685], [1.52711862E12, 30.499999999999996], [1.52711844E12, 14.702702702702702], [1.5271185E12, 24.272727272727273], [1.52711838E12, 5.838709677419355], [1.52711868E12, 15.34615384615385]], "isOverall": false, "label": "jp@gc Ultima Thread - Meta Allergen Only", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711868E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 2588.0, "minX": 1.0, "maxY": 101591.0, "series": [{"data": [[2.0, 2846.3333333333335], [32.0, 60688.375], [3.0, 32123.0], [4.0, 4314.5], [5.0, 5470.0], [6.0, 75841.75], [7.0, 39527.75], [8.0, 10461.8], [9.0, 11625.5], [10.0, 12195.666666666666], [11.0, 13278.5], [12.0, 52905.666666666664], [13.0, 15247.75], [14.0, 92555.55555555556], [15.0, 43969.75], [1.0, 2588.0], [16.0, 30959.8], [17.0, 23183.5], [18.0, 23928.75], [19.0, 25476.0], [20.0, 24602.666666666668], [21.0, 26066.0], [22.0, 101591.0], [23.0, 29222.5], [24.0, 51923.0], [25.0, 34344.75], [26.0, 70309.2], [27.0, 66617.66666666667], [28.0, 39524.0], [29.0, 40820.5], [30.0, 82626.66666666667], [31.0, 60074.5]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}, {"data": [[17.97402597402597, 45806.70129870128]], "isOverall": false, "label": "Get ALLERGY allergens-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 32.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 0.0, "minX": 1.52711838E12, "maxY": 2502578.25, "series": [{"data": [[1.52711856E12, 1285107.75], [1.52711862E12, 270693.8], [1.52711844E12, 2502578.25], [1.5271185E12, 2232029.25], [1.52711838E12, 2096754.75], [1.52711868E12, 941.2]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52711856E12, 54.46666666666667], [1.52711862E12, 11.466666666666667], [1.52711844E12, 106.06666666666666], [1.5271185E12, 94.6], [1.52711838E12, 88.86666666666666], [1.52711868E12, 0.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711868E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 7311.25806451613, "minX": 1.52711838E12, "maxY": 124531.57692307692, "series": [{"data": [[1.52711856E12, 51105.31578947369], [1.52711862E12, 107467.875], [1.52711844E12, 18643.108108108107], [1.5271185E12, 32400.696969696968], [1.52711838E12, 7311.25806451613], [1.52711868E12, 124531.57692307692]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711868E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 0.0, "minX": 1.52711838E12, "maxY": 49251.63157894737, "series": [{"data": [[1.52711856E12, 49251.63157894737], [1.52711862E12, 42257.37500000001], [1.52711844E12, 18241.216216216217], [1.5271185E12, 31632.9393939394], [1.52711838E12, 7211.129032258065], [1.52711868E12, 0.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711868E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.3783783783783784, "minX": 1.52711838E12, "maxY": 1.9354838709677415, "series": [{"data": [[1.52711856E12, 0.5789473684210525], [1.52711862E12, 0.5], [1.52711844E12, 0.3783783783783784], [1.5271185E12, 0.4242424242424243], [1.52711838E12, 1.9354838709677415], [1.52711868E12, 0.576923076923077]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711868E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 2388.0, "minX": 1.52711838E12, "maxY": 111440.0, "series": [{"data": [[1.52711856E12, 73863.0], [1.52711862E12, 111440.0], [1.52711844E12, 27703.0], [1.5271185E12, 40899.0], [1.52711838E12, 11921.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52711856E12, 39574.0], [1.52711862E12, 70925.0], [1.52711844E12, 11813.0], [1.5271185E12, 24316.0], [1.52711838E12, 2388.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52711856E12, 44582.90000000001], [1.52711862E12, 49256.5], [1.52711844E12, 23486.7], [1.5271185E12, 35256.8], [1.52711838E12, 11393.2]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52711856E12, 72965.87999999996], [1.52711862E12, 110790.25], [1.52711844E12, 27703.0], [1.5271185E12, 40895.86], [1.52711838E12, 11921.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52711856E12, 54902.69999999995], [1.52711862E12, 68812.75], [1.52711844E12, 24531.35], [1.5271185E12, 38881.299999999996], [1.52711838E12, 11710.4]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711862E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 23489.5, "minX": 0.0, "maxY": 123303.0, "series": [{"data": [[0.0, 23489.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 123303.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 22873.5, "series": [{"data": [[0.0, 22873.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.03333333333333333, "minX": 1.52711838E12, "maxY": 0.7833333333333333, "series": [{"data": [[1.52711856E12, 0.36666666666666664], [1.52711862E12, 0.03333333333333333], [1.52711844E12, 0.7833333333333333], [1.5271185E12, 0.7166666666666667], [1.52711838E12, 0.6666666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711862E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.52711838E12, "maxY": 0.6166666666666667, "series": [{"data": [[1.52711856E12, 0.31666666666666665], [1.52711862E12, 0.06666666666666667], [1.52711844E12, 0.6166666666666667], [1.5271185E12, 0.55], [1.52711838E12, 0.5166666666666667]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52711862E12, 0.06666666666666667], [1.52711868E12, 0.43333333333333335]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711868E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.52711838E12, "maxY": 0.6166666666666667, "series": [{"data": [[1.52711862E12, 0.06666666666666667], [1.52711868E12, 0.43333333333333335]], "isOverall": false, "label": "Get ALLERGY allergens-failure", "isController": false}, {"data": [[1.52711856E12, 0.31666666666666665], [1.52711862E12, 0.06666666666666667], [1.52711844E12, 0.6166666666666667], [1.5271185E12, 0.55], [1.52711838E12, 0.5166666666666667]], "isOverall": false, "label": "Get ALLERGY allergens-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711868E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -36000000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
