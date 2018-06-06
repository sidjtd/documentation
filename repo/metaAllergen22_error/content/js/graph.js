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
        data: {"result": {"minY": 2430.0, "minX": 0.0, "maxY": 110275.0, "series": [{"data": [[0.0, 2430.0], [0.1, 2430.0], [0.2, 2430.0], [0.3, 2430.0], [0.4, 2430.0], [0.5, 2430.0], [0.6, 2430.0], [0.7, 2430.0], [0.8, 2651.0], [0.9, 2651.0], [1.0, 2651.0], [1.1, 2651.0], [1.2, 2651.0], [1.3, 2651.0], [1.4, 2651.0], [1.5, 2762.0], [1.6, 2762.0], [1.7, 2762.0], [1.8, 2762.0], [1.9, 2762.0], [2.0, 2762.0], [2.1, 2762.0], [2.2, 2970.0], [2.3, 2970.0], [2.4, 2970.0], [2.5, 2970.0], [2.6, 2970.0], [2.7, 2970.0], [2.8, 2970.0], [2.9, 3084.0], [3.0, 3084.0], [3.1, 3084.0], [3.2, 3084.0], [3.3, 3084.0], [3.4, 3084.0], [3.5, 3084.0], [3.6, 3183.0], [3.7, 3183.0], [3.8, 3183.0], [3.9, 3183.0], [4.0, 3183.0], [4.1, 3183.0], [4.2, 3183.0], [4.3, 3874.0], [4.4, 3874.0], [4.5, 3874.0], [4.6, 3874.0], [4.7, 3874.0], [4.8, 3874.0], [4.9, 3874.0], [5.0, 4019.0], [5.1, 4019.0], [5.2, 4019.0], [5.3, 4019.0], [5.4, 4019.0], [5.5, 4019.0], [5.6, 4019.0], [5.7, 4246.0], [5.8, 4246.0], [5.9, 4246.0], [6.0, 4246.0], [6.1, 4246.0], [6.2, 4246.0], [6.3, 4246.0], [6.4, 4553.0], [6.5, 4553.0], [6.6, 4553.0], [6.7, 4553.0], [6.8, 4553.0], [6.9, 4553.0], [7.0, 4553.0], [7.1, 4930.0], [7.2, 4930.0], [7.3, 4930.0], [7.4, 4930.0], [7.5, 4930.0], [7.6, 4930.0], [7.7, 4930.0], [7.8, 5422.0], [7.9, 5422.0], [8.0, 5422.0], [8.1, 5422.0], [8.2, 5422.0], [8.3, 5422.0], [8.4, 5422.0], [8.5, 5492.0], [8.6, 5492.0], [8.7, 5492.0], [8.8, 5492.0], [8.9, 5492.0], [9.0, 5492.0], [9.1, 5492.0], [9.2, 5722.0], [9.3, 5722.0], [9.4, 5722.0], [9.5, 5722.0], [9.6, 5722.0], [9.7, 5722.0], [9.8, 5722.0], [9.9, 6341.0], [10.0, 6341.0], [10.1, 6341.0], [10.2, 6341.0], [10.3, 6341.0], [10.4, 6341.0], [10.5, 6341.0], [10.6, 6611.0], [10.7, 6611.0], [10.8, 6611.0], [10.9, 6611.0], [11.0, 6611.0], [11.1, 6611.0], [11.2, 6611.0], [11.3, 7650.0], [11.4, 7650.0], [11.5, 7650.0], [11.6, 7650.0], [11.7, 7650.0], [11.8, 7650.0], [11.9, 7650.0], [12.0, 7779.0], [12.1, 7779.0], [12.2, 7779.0], [12.3, 7779.0], [12.4, 7779.0], [12.5, 7779.0], [12.6, 7779.0], [12.7, 8204.0], [12.8, 8204.0], [12.9, 8204.0], [13.0, 8204.0], [13.1, 8204.0], [13.2, 8204.0], [13.3, 8204.0], [13.4, 8473.0], [13.5, 8473.0], [13.6, 8473.0], [13.7, 8473.0], [13.8, 8473.0], [13.9, 8473.0], [14.0, 8473.0], [14.1, 8612.0], [14.2, 8612.0], [14.3, 8612.0], [14.4, 8612.0], [14.5, 8612.0], [14.6, 8612.0], [14.7, 8612.0], [14.8, 8957.0], [14.9, 8957.0], [15.0, 8957.0], [15.1, 8957.0], [15.2, 8957.0], [15.3, 8957.0], [15.4, 8957.0], [15.5, 9523.0], [15.6, 9523.0], [15.7, 9523.0], [15.8, 9523.0], [15.9, 9523.0], [16.0, 9523.0], [16.1, 9523.0], [16.2, 9535.0], [16.3, 9535.0], [16.4, 9535.0], [16.5, 9535.0], [16.6, 9535.0], [16.7, 9535.0], [16.8, 9535.0], [16.9, 9535.0], [17.0, 9564.0], [17.1, 9564.0], [17.2, 9564.0], [17.3, 9564.0], [17.4, 9564.0], [17.5, 9564.0], [17.6, 9564.0], [17.7, 10237.0], [17.8, 10237.0], [17.9, 10237.0], [18.0, 10237.0], [18.1, 10237.0], [18.2, 10237.0], [18.3, 10237.0], [18.4, 10252.0], [18.5, 10252.0], [18.6, 10252.0], [18.7, 10252.0], [18.8, 10252.0], [18.9, 10252.0], [19.0, 10252.0], [19.1, 10438.0], [19.2, 10438.0], [19.3, 10438.0], [19.4, 10438.0], [19.5, 10438.0], [19.6, 10438.0], [19.7, 10438.0], [19.8, 10478.0], [19.9, 10478.0], [20.0, 10478.0], [20.1, 10478.0], [20.2, 10478.0], [20.3, 10478.0], [20.4, 10478.0], [20.5, 10650.0], [20.6, 10650.0], [20.7, 10650.0], [20.8, 10650.0], [20.9, 10650.0], [21.0, 10650.0], [21.1, 10650.0], [21.2, 10713.0], [21.3, 10713.0], [21.4, 10713.0], [21.5, 10713.0], [21.6, 10713.0], [21.7, 10713.0], [21.8, 10713.0], [21.9, 10795.0], [22.0, 10795.0], [22.1, 10795.0], [22.2, 10795.0], [22.3, 10795.0], [22.4, 10795.0], [22.5, 10795.0], [22.6, 11275.0], [22.7, 11275.0], [22.8, 11275.0], [22.9, 11275.0], [23.0, 11275.0], [23.1, 11275.0], [23.2, 11275.0], [23.3, 11668.0], [23.4, 11668.0], [23.5, 11668.0], [23.6, 11668.0], [23.7, 11668.0], [23.8, 11668.0], [23.9, 11668.0], [24.0, 11833.0], [24.1, 11833.0], [24.2, 11833.0], [24.3, 11833.0], [24.4, 11833.0], [24.5, 11833.0], [24.6, 11833.0], [24.7, 11885.0], [24.8, 11885.0], [24.9, 11885.0], [25.0, 11885.0], [25.1, 11885.0], [25.2, 11885.0], [25.3, 11885.0], [25.4, 12646.0], [25.5, 12646.0], [25.6, 12646.0], [25.7, 12646.0], [25.8, 12646.0], [25.9, 12646.0], [26.0, 12646.0], [26.1, 13237.0], [26.2, 13237.0], [26.3, 13237.0], [26.4, 13237.0], [26.5, 13237.0], [26.6, 13237.0], [26.7, 13237.0], [26.8, 13353.0], [26.9, 13353.0], [27.0, 13353.0], [27.1, 13353.0], [27.2, 13353.0], [27.3, 13353.0], [27.4, 13353.0], [27.5, 14074.0], [27.6, 14074.0], [27.7, 14074.0], [27.8, 14074.0], [27.9, 14074.0], [28.0, 14074.0], [28.1, 14074.0], [28.2, 14389.0], [28.3, 14389.0], [28.4, 14389.0], [28.5, 14389.0], [28.6, 14389.0], [28.7, 14389.0], [28.8, 14389.0], [28.9, 14491.0], [29.0, 14491.0], [29.1, 14491.0], [29.2, 14491.0], [29.3, 14491.0], [29.4, 14491.0], [29.5, 14491.0], [29.6, 14642.0], [29.7, 14642.0], [29.8, 14642.0], [29.9, 14642.0], [30.0, 14642.0], [30.1, 14642.0], [30.2, 14642.0], [30.3, 15386.0], [30.4, 15386.0], [30.5, 15386.0], [30.6, 15386.0], [30.7, 15386.0], [30.8, 15386.0], [30.9, 15386.0], [31.0, 15638.0], [31.1, 15638.0], [31.2, 15638.0], [31.3, 15638.0], [31.4, 15638.0], [31.5, 15638.0], [31.6, 15638.0], [31.7, 16444.0], [31.8, 16444.0], [31.9, 16444.0], [32.0, 16444.0], [32.1, 16444.0], [32.2, 16444.0], [32.3, 16444.0], [32.4, 16896.0], [32.5, 16896.0], [32.6, 16896.0], [32.7, 16896.0], [32.8, 16896.0], [32.9, 16896.0], [33.0, 16896.0], [33.1, 17364.0], [33.2, 17364.0], [33.3, 17364.0], [33.4, 17364.0], [33.5, 17364.0], [33.6, 17364.0], [33.7, 17364.0], [33.8, 17364.0], [33.9, 17501.0], [34.0, 17501.0], [34.1, 17501.0], [34.2, 17501.0], [34.3, 17501.0], [34.4, 17501.0], [34.5, 17501.0], [34.6, 18412.0], [34.7, 18412.0], [34.8, 18412.0], [34.9, 18412.0], [35.0, 18412.0], [35.1, 18412.0], [35.2, 18412.0], [35.3, 18781.0], [35.4, 18781.0], [35.5, 18781.0], [35.6, 18781.0], [35.7, 18781.0], [35.8, 18781.0], [35.9, 18781.0], [36.0, 19433.0], [36.1, 19433.0], [36.2, 19433.0], [36.3, 19433.0], [36.4, 19433.0], [36.5, 19433.0], [36.6, 19433.0], [36.7, 19615.0], [36.8, 19615.0], [36.9, 19615.0], [37.0, 19615.0], [37.1, 19615.0], [37.2, 19615.0], [37.3, 19615.0], [37.4, 20161.0], [37.5, 20161.0], [37.6, 20161.0], [37.7, 20161.0], [37.8, 20161.0], [37.9, 20161.0], [38.0, 20161.0], [38.1, 20418.0], [38.2, 20418.0], [38.3, 20418.0], [38.4, 20418.0], [38.5, 20418.0], [38.6, 20418.0], [38.7, 20418.0], [38.8, 20523.0], [38.9, 20523.0], [39.0, 20523.0], [39.1, 20523.0], [39.2, 20523.0], [39.3, 20523.0], [39.4, 20523.0], [39.5, 20677.0], [39.6, 20677.0], [39.7, 20677.0], [39.8, 20677.0], [39.9, 20677.0], [40.0, 20677.0], [40.1, 20677.0], [40.2, 20684.0], [40.3, 20684.0], [40.4, 20684.0], [40.5, 20684.0], [40.6, 20684.0], [40.7, 20684.0], [40.8, 20684.0], [40.9, 20703.0], [41.0, 20703.0], [41.1, 20703.0], [41.2, 20703.0], [41.3, 20703.0], [41.4, 20703.0], [41.5, 20703.0], [41.6, 20908.0], [41.7, 20908.0], [41.8, 20908.0], [41.9, 20908.0], [42.0, 20908.0], [42.1, 20908.0], [42.2, 20908.0], [42.3, 21073.0], [42.4, 21073.0], [42.5, 21073.0], [42.6, 21073.0], [42.7, 21073.0], [42.8, 21073.0], [42.9, 21073.0], [43.0, 21088.0], [43.1, 21088.0], [43.2, 21088.0], [43.3, 21088.0], [43.4, 21088.0], [43.5, 21088.0], [43.6, 21088.0], [43.7, 21195.0], [43.8, 21195.0], [43.9, 21195.0], [44.0, 21195.0], [44.1, 21195.0], [44.2, 21195.0], [44.3, 21195.0], [44.4, 22009.0], [44.5, 22009.0], [44.6, 22009.0], [44.7, 22009.0], [44.8, 22009.0], [44.9, 22009.0], [45.0, 22009.0], [45.1, 22528.0], [45.2, 22528.0], [45.3, 22528.0], [45.4, 22528.0], [45.5, 22528.0], [45.6, 22528.0], [45.7, 22528.0], [45.8, 22679.0], [45.9, 22679.0], [46.0, 22679.0], [46.1, 22679.0], [46.2, 22679.0], [46.3, 22679.0], [46.4, 22679.0], [46.5, 22802.0], [46.6, 22802.0], [46.7, 22802.0], [46.8, 22802.0], [46.9, 22802.0], [47.0, 22802.0], [47.1, 22802.0], [47.2, 23387.0], [47.3, 23387.0], [47.4, 23387.0], [47.5, 23387.0], [47.6, 23387.0], [47.7, 23387.0], [47.8, 23387.0], [47.9, 23400.0], [48.0, 23400.0], [48.1, 23400.0], [48.2, 23400.0], [48.3, 23400.0], [48.4, 23400.0], [48.5, 23400.0], [48.6, 23445.0], [48.7, 23445.0], [48.8, 23445.0], [48.9, 23445.0], [49.0, 23445.0], [49.1, 23445.0], [49.2, 23445.0], [49.3, 23707.0], [49.4, 23707.0], [49.5, 23707.0], [49.6, 23707.0], [49.7, 23707.0], [49.8, 23707.0], [49.9, 23707.0], [50.0, 24328.0], [50.1, 24328.0], [50.2, 24328.0], [50.3, 24328.0], [50.4, 24328.0], [50.5, 24328.0], [50.6, 24328.0], [50.7, 24328.0], [50.8, 26226.0], [50.9, 26226.0], [51.0, 26226.0], [51.1, 26226.0], [51.2, 26226.0], [51.3, 26226.0], [51.4, 26226.0], [51.5, 26632.0], [51.6, 26632.0], [51.7, 26632.0], [51.8, 26632.0], [51.9, 26632.0], [52.0, 26632.0], [52.1, 26632.0], [52.2, 26801.0], [52.3, 26801.0], [52.4, 26801.0], [52.5, 26801.0], [52.6, 26801.0], [52.7, 26801.0], [52.8, 26801.0], [52.9, 26839.0], [53.0, 26839.0], [53.1, 26839.0], [53.2, 26839.0], [53.3, 26839.0], [53.4, 26839.0], [53.5, 26839.0], [53.6, 27442.0], [53.7, 27442.0], [53.8, 27442.0], [53.9, 27442.0], [54.0, 27442.0], [54.1, 27442.0], [54.2, 27442.0], [54.3, 27726.0], [54.4, 27726.0], [54.5, 27726.0], [54.6, 27726.0], [54.7, 27726.0], [54.8, 27726.0], [54.9, 27726.0], [55.0, 28113.0], [55.1, 28113.0], [55.2, 28113.0], [55.3, 28113.0], [55.4, 28113.0], [55.5, 28113.0], [55.6, 28113.0], [55.7, 28587.0], [55.8, 28587.0], [55.9, 28587.0], [56.0, 28587.0], [56.1, 28587.0], [56.2, 28587.0], [56.3, 28587.0], [56.4, 28991.0], [56.5, 28991.0], [56.6, 28991.0], [56.7, 28991.0], [56.8, 28991.0], [56.9, 28991.0], [57.0, 28991.0], [57.1, 30975.0], [57.2, 30975.0], [57.3, 30975.0], [57.4, 30975.0], [57.5, 30975.0], [57.6, 30975.0], [57.7, 30975.0], [57.8, 32914.0], [57.9, 32914.0], [58.0, 32914.0], [58.1, 32914.0], [58.2, 32914.0], [58.3, 32914.0], [58.4, 32914.0], [58.5, 33087.0], [58.6, 33087.0], [58.7, 33087.0], [58.8, 33087.0], [58.9, 33087.0], [59.0, 33087.0], [59.1, 33087.0], [59.2, 33774.0], [59.3, 33774.0], [59.4, 33774.0], [59.5, 33774.0], [59.6, 33774.0], [59.7, 33774.0], [59.8, 33774.0], [59.9, 33818.0], [60.0, 33818.0], [60.1, 33818.0], [60.2, 33818.0], [60.3, 33818.0], [60.4, 33818.0], [60.5, 33818.0], [60.6, 34559.0], [60.7, 34559.0], [60.8, 34559.0], [60.9, 34559.0], [61.0, 34559.0], [61.1, 34559.0], [61.2, 34559.0], [61.3, 34830.0], [61.4, 34830.0], [61.5, 34830.0], [61.6, 34830.0], [61.7, 34830.0], [61.8, 34830.0], [61.9, 34830.0], [62.0, 36330.0], [62.1, 36330.0], [62.2, 36330.0], [62.3, 36330.0], [62.4, 36330.0], [62.5, 36330.0], [62.6, 36330.0], [62.7, 36463.0], [62.8, 36463.0], [62.9, 36463.0], [63.0, 36463.0], [63.1, 36463.0], [63.2, 36463.0], [63.3, 36463.0], [63.4, 37642.0], [63.5, 37642.0], [63.6, 37642.0], [63.7, 37642.0], [63.8, 37642.0], [63.9, 37642.0], [64.0, 37642.0], [64.1, 37705.0], [64.2, 37705.0], [64.3, 37705.0], [64.4, 37705.0], [64.5, 37705.0], [64.6, 37705.0], [64.7, 37705.0], [64.8, 38223.0], [64.9, 38223.0], [65.0, 38223.0], [65.1, 38223.0], [65.2, 38223.0], [65.3, 38223.0], [65.4, 38223.0], [65.5, 39376.0], [65.6, 39376.0], [65.7, 39376.0], [65.8, 39376.0], [65.9, 39376.0], [66.0, 39376.0], [66.1, 39376.0], [66.2, 39477.0], [66.3, 39477.0], [66.4, 39477.0], [66.5, 39477.0], [66.6, 39477.0], [66.7, 39477.0], [66.8, 39477.0], [66.9, 39477.0], [67.0, 39689.0], [67.1, 39689.0], [67.2, 39689.0], [67.3, 39689.0], [67.4, 39689.0], [67.5, 39689.0], [67.6, 39689.0], [67.7, 39798.0], [67.8, 39798.0], [67.9, 39798.0], [68.0, 39798.0], [68.1, 39798.0], [68.2, 39798.0], [68.3, 39798.0], [68.4, 41380.0], [68.5, 41380.0], [68.6, 41380.0], [68.7, 41380.0], [68.8, 41380.0], [68.9, 41380.0], [69.0, 41380.0], [69.1, 41617.0], [69.2, 41617.0], [69.3, 41617.0], [69.4, 41617.0], [69.5, 41617.0], [69.6, 41617.0], [69.7, 41617.0], [69.8, 42208.0], [69.9, 42208.0], [70.0, 42208.0], [70.1, 42208.0], [70.2, 42208.0], [70.3, 42208.0], [70.4, 42208.0], [70.5, 42348.0], [70.6, 42348.0], [70.7, 42348.0], [70.8, 42348.0], [70.9, 42348.0], [71.0, 42348.0], [71.1, 42348.0], [71.2, 43703.0], [71.3, 43703.0], [71.4, 43703.0], [71.5, 43703.0], [71.6, 43703.0], [71.7, 43703.0], [71.8, 43703.0], [71.9, 44396.0], [72.0, 44396.0], [72.1, 44396.0], [72.2, 44396.0], [72.3, 44396.0], [72.4, 44396.0], [72.5, 44396.0], [72.6, 44459.0], [72.7, 44459.0], [72.8, 44459.0], [72.9, 44459.0], [73.0, 44459.0], [73.1, 44459.0], [73.2, 44459.0], [73.3, 44694.0], [73.4, 44694.0], [73.5, 44694.0], [73.6, 44694.0], [73.7, 44694.0], [73.8, 44694.0], [73.9, 44694.0], [74.0, 46009.0], [74.1, 46009.0], [74.2, 46009.0], [74.3, 46009.0], [74.4, 46009.0], [74.5, 46009.0], [74.6, 46009.0], [74.7, 46064.0], [74.8, 46064.0], [74.9, 46064.0], [75.0, 46064.0], [75.1, 46064.0], [75.2, 46064.0], [75.3, 46064.0], [75.4, 47433.0], [75.5, 47433.0], [75.6, 47433.0], [75.7, 47433.0], [75.8, 47433.0], [75.9, 47433.0], [76.0, 47433.0], [76.1, 48479.0], [76.2, 48479.0], [76.3, 48479.0], [76.4, 48479.0], [76.5, 48479.0], [76.6, 48479.0], [76.7, 48479.0], [76.8, 63540.0], [76.9, 63540.0], [77.0, 63540.0], [77.1, 63540.0], [77.2, 63540.0], [77.3, 63540.0], [77.4, 63540.0], [77.5, 65730.0], [77.6, 65730.0], [77.7, 65730.0], [77.8, 65730.0], [77.9, 65730.0], [78.0, 65730.0], [78.1, 65730.0], [78.2, 70013.0], [78.3, 70013.0], [78.4, 70013.0], [78.5, 70013.0], [78.6, 70013.0], [78.7, 70013.0], [78.8, 70013.0], [78.9, 73642.0], [79.0, 73642.0], [79.1, 73642.0], [79.2, 73642.0], [79.3, 73642.0], [79.4, 73642.0], [79.5, 73642.0], [79.6, 74804.0], [79.7, 74804.0], [79.8, 74804.0], [79.9, 74804.0], [80.0, 74804.0], [80.1, 74804.0], [80.2, 74804.0], [80.3, 79286.0], [80.4, 79286.0], [80.5, 79286.0], [80.6, 79286.0], [80.7, 79286.0], [80.8, 79286.0], [80.9, 79286.0], [81.0, 79325.0], [81.1, 79325.0], [81.2, 79325.0], [81.3, 79325.0], [81.4, 79325.0], [81.5, 79325.0], [81.6, 79325.0], [81.7, 79345.0], [81.8, 79345.0], [81.9, 79345.0], [82.0, 79345.0], [82.1, 79345.0], [82.2, 79345.0], [82.3, 79345.0], [82.4, 79854.0], [82.5, 79854.0], [82.6, 79854.0], [82.7, 79854.0], [82.8, 79854.0], [82.9, 79854.0], [83.0, 79854.0], [83.1, 83625.0], [83.2, 83625.0], [83.3, 83625.0], [83.4, 83625.0], [83.5, 83625.0], [83.6, 83625.0], [83.7, 83625.0], [83.8, 83625.0], [83.9, 84577.0], [84.0, 84577.0], [84.1, 84577.0], [84.2, 84577.0], [84.3, 84577.0], [84.4, 84577.0], [84.5, 84577.0], [84.6, 84911.0], [84.7, 84911.0], [84.8, 84911.0], [84.9, 84911.0], [85.0, 84911.0], [85.1, 84911.0], [85.2, 84911.0], [85.3, 85017.0], [85.4, 85017.0], [85.5, 85017.0], [85.6, 85017.0], [85.7, 85017.0], [85.8, 85017.0], [85.9, 85017.0], [86.0, 88177.0], [86.1, 88177.0], [86.2, 88177.0], [86.3, 88177.0], [86.4, 88177.0], [86.5, 88177.0], [86.6, 88177.0], [86.7, 89908.0], [86.8, 89908.0], [86.9, 89908.0], [87.0, 89908.0], [87.1, 89908.0], [87.2, 89908.0], [87.3, 89908.0], [87.4, 90828.0], [87.5, 90828.0], [87.6, 90828.0], [87.7, 90828.0], [87.8, 90828.0], [87.9, 90828.0], [88.0, 90828.0], [88.1, 90865.0], [88.2, 90865.0], [88.3, 90865.0], [88.4, 90865.0], [88.5, 90865.0], [88.6, 90865.0], [88.7, 90865.0], [88.8, 91102.0], [88.9, 91102.0], [89.0, 91102.0], [89.1, 91102.0], [89.2, 91102.0], [89.3, 91102.0], [89.4, 91102.0], [89.5, 92733.0], [89.6, 92733.0], [89.7, 92733.0], [89.8, 92733.0], [89.9, 92733.0], [90.0, 92733.0], [90.1, 92733.0], [90.2, 93370.0], [90.3, 93370.0], [90.4, 93370.0], [90.5, 93370.0], [90.6, 93370.0], [90.7, 93370.0], [90.8, 93370.0], [90.9, 95076.0], [91.0, 95076.0], [91.1, 95076.0], [91.2, 95076.0], [91.3, 95076.0], [91.4, 95076.0], [91.5, 95076.0], [91.6, 97160.0], [91.7, 97160.0], [91.8, 97160.0], [91.9, 97160.0], [92.0, 97160.0], [92.1, 97160.0], [92.2, 97160.0], [92.3, 97988.0], [92.4, 97988.0], [92.5, 97988.0], [92.6, 97988.0], [92.7, 97988.0], [92.8, 97988.0], [92.9, 97988.0], [93.0, 99179.0], [93.1, 99179.0], [93.2, 99179.0], [93.3, 99179.0], [93.4, 99179.0], [93.5, 99179.0], [93.6, 99179.0], [93.7, 100802.0], [93.8, 100802.0], [93.9, 100802.0], [94.0, 100802.0], [94.1, 100802.0], [94.2, 100802.0], [94.3, 100802.0], [94.4, 101136.0], [94.5, 101136.0], [94.6, 101136.0], [94.7, 101136.0], [94.8, 101136.0], [94.9, 101136.0], [95.0, 101136.0], [95.1, 101344.0], [95.2, 101344.0], [95.3, 101344.0], [95.4, 101344.0], [95.5, 101344.0], [95.6, 101344.0], [95.7, 101344.0], [95.8, 101432.0], [95.9, 101432.0], [96.0, 101432.0], [96.1, 101432.0], [96.2, 101432.0], [96.3, 101432.0], [96.4, 101432.0], [96.5, 104946.0], [96.6, 104946.0], [96.7, 104946.0], [96.8, 104946.0], [96.9, 104946.0], [97.0, 104946.0], [97.1, 104946.0], [97.2, 106031.0], [97.3, 106031.0], [97.4, 106031.0], [97.5, 106031.0], [97.6, 106031.0], [97.7, 106031.0], [97.8, 106031.0], [97.9, 107210.0], [98.0, 107210.0], [98.1, 107210.0], [98.2, 107210.0], [98.3, 107210.0], [98.4, 107210.0], [98.5, 107210.0], [98.6, 107761.0], [98.7, 107761.0], [98.8, 107761.0], [98.9, 107761.0], [99.0, 107761.0], [99.1, 107761.0], [99.2, 107761.0], [99.3, 110275.0], [99.4, 110275.0], [99.5, 110275.0], [99.6, 110275.0], [99.7, 110275.0], [99.8, 110275.0], [99.9, 110275.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 2400.0, "maxY": 3.0, "series": [{"data": [[89900.0, 1.0], [92700.0, 1.0], [91100.0, 1.0], [97100.0, 1.0], [97900.0, 1.0], [99100.0, 1.0], [101100.0, 1.0], [32900.0, 1.0], [33700.0, 1.0], [34500.0, 1.0], [36300.0, 1.0], [37700.0, 1.0], [39700.0, 1.0], [39300.0, 1.0], [41300.0, 1.0], [42300.0, 1.0], [43700.0, 1.0], [44300.0, 1.0], [63500.0, 1.0], [79800.0, 1.0], [85000.0, 1.0], [95000.0, 1.0], [101400.0, 1.0], [110200.0, 1.0], [2400.0, 1.0], [2600.0, 1.0], [2700.0, 1.0], [2900.0, 1.0], [3000.0, 1.0], [3100.0, 1.0], [3800.0, 1.0], [4000.0, 1.0], [4200.0, 1.0], [65700.0, 1.0], [4500.0, 1.0], [4900.0, 1.0], [79300.0, 2.0], [84900.0, 1.0], [84500.0, 1.0], [5400.0, 2.0], [88100.0, 1.0], [5700.0, 1.0], [93300.0, 1.0], [6300.0, 1.0], [101300.0, 1.0], [6600.0, 1.0], [104900.0, 1.0], [107700.0, 1.0], [7600.0, 1.0], [7700.0, 1.0], [8200.0, 1.0], [8400.0, 1.0], [8600.0, 1.0], [8900.0, 1.0], [9500.0, 3.0], [10200.0, 2.0], [10400.0, 2.0], [10600.0, 1.0], [10700.0, 2.0], [11200.0, 1.0], [11600.0, 1.0], [11800.0, 2.0], [12600.0, 1.0], [13200.0, 1.0], [13300.0, 1.0], [14000.0, 1.0], [14300.0, 1.0], [14400.0, 1.0], [14600.0, 1.0], [15300.0, 1.0], [15600.0, 1.0], [16800.0, 1.0], [16400.0, 1.0], [17300.0, 1.0], [17500.0, 1.0], [18400.0, 1.0], [18700.0, 1.0], [19400.0, 1.0], [19600.0, 1.0], [20100.0, 1.0], [20400.0, 1.0], [20900.0, 1.0], [21000.0, 2.0], [20600.0, 2.0], [20500.0, 1.0], [20700.0, 1.0], [21100.0, 1.0], [22000.0, 1.0], [22500.0, 1.0], [22600.0, 1.0], [23300.0, 1.0], [22800.0, 1.0], [23400.0, 2.0], [23700.0, 1.0], [24300.0, 1.0], [26200.0, 1.0], [26600.0, 1.0], [26800.0, 2.0], [27400.0, 1.0], [27700.0, 1.0], [28100.0, 1.0], [28500.0, 1.0], [28900.0, 1.0], [30900.0, 1.0], [33000.0, 1.0], [33800.0, 1.0], [34800.0, 1.0], [36400.0, 1.0], [38200.0, 1.0], [37600.0, 1.0], [39400.0, 1.0], [39600.0, 1.0], [42200.0, 1.0], [41600.0, 1.0], [44400.0, 1.0], [44600.0, 1.0], [46000.0, 2.0], [47400.0, 1.0], [48400.0, 1.0], [70000.0, 1.0], [73600.0, 1.0], [74800.0, 1.0], [79200.0, 1.0], [83600.0, 1.0], [90800.0, 2.0], [100800.0, 1.0], [106000.0, 1.0], [107200.0, 1.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 110200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 32.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 110.0, "series": [{"data": [[3.0, 32.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 110.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 4.199999999999999, "minX": 1.52711982E12, "maxY": 29.8, "series": [{"data": [[1.52712E12, 29.8], [1.52711988E12, 10.916666666666666], [1.52712006E12, 19.48484848484848], [1.52711994E12, 20.787878787878793], [1.52711982E12, 4.199999999999999]], "isOverall": false, "label": "jp@gc Ultima Thread - Meta Allergen Only", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712006E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 2721.6666666666665, "minX": 1.0, "maxY": 76524.6, "series": [{"data": [[2.0, 2721.6666666666665], [32.0, 76524.6], [33.0, 57432.8], [3.0, 3511.5], [4.0, 4576.333333333333], [5.0, 20256.25], [6.0, 24180.4], [7.0, 9513.6], [8.0, 10194.0], [9.0, 67037.0], [10.0, 44183.57142857143], [11.0, 13554.666666666666], [12.0, 44850.6], [13.0, 37078.0], [14.0, 35534.25], [15.0, 19852.0], [1.0, 2762.0], [16.0, 20739.25], [17.0, 35808.0], [18.0, 63570.0], [19.0, 22905.666666666668], [20.0, 43194.75], [21.0, 66860.0], [22.0, 45008.42857142857], [23.0, 47150.0], [24.0, 31609.714285714286], [25.0, 64820.5], [26.0, 36463.0], [27.0, 43480.4], [28.0, 63144.25], [29.0, 52691.0], [30.0, 42556.0], [31.0, 65355.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}, {"data": [[16.915492957746476, 37215.683098591544]], "isOverall": false, "label": "Get ALLERGY allergens-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 33.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 2.8666666666666667, "minX": 1.52711982E12, "maxY": 2434941.0, "series": [{"data": [[1.52712E12, 1352745.0], [1.52711988E12, 2434941.0], [1.52712006E12, 68795.65], [1.52711994E12, 2232029.25], [1.52711982E12, 1352745.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52712E12, 57.333333333333336], [1.52711988E12, 103.2], [1.52712006E12, 2.8666666666666667], [1.52711994E12, 94.6], [1.52711982E12, 57.333333333333336]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712006E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 5044.0, "minX": 1.52711982E12, "maxY": 90030.06060606061, "series": [{"data": [[1.52712E12, 42051.50000000001], [1.52711988E12, 13881.11111111111], [1.52712006E12, 90030.06060606061], [1.52711994E12, 26424.39393939394], [1.52711982E12, 5044.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712006E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2285.9393939393944, "minX": 1.52711982E12, "maxY": 40720.55, "series": [{"data": [[1.52712E12, 40720.55], [1.52711988E12, 13649.083333333334], [1.52712006E12, 2285.9393939393944], [1.52711994E12, 25614.54545454546], [1.52711982E12, 4983.75]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712006E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.42424242424242425, "minX": 1.52711982E12, "maxY": 2.5500000000000003, "series": [{"data": [[1.52712E12, 0.6], [1.52711988E12, 0.6944444444444445], [1.52712006E12, 0.5757575757575759], [1.52711994E12, 0.42424242424242425], [1.52711982E12, 2.5500000000000003]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712006E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 2430.0, "minX": 1.52711982E12, "maxY": 99179.0, "series": [{"data": [[1.52712E12, 48479.0], [1.52711988E12, 20908.0], [1.52712006E12, 99179.0], [1.52711994E12, 36463.0], [1.52711982E12, 8957.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52712E12, 36330.0], [1.52711988E12, 8473.0], [1.52712006E12, 99179.0], [1.52711994E12, 20523.0], [1.52711982E12, 2430.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52712E12, 41617.0], [1.52711988E12, 18976.600000000002], [1.52712006E12, 42148.9], [1.52711994E12, 28991.0], [1.52711982E12, 8161.500000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52712E12, 48374.40000000001], [1.52711988E12, 20908.0], [1.52712006E12, 93602.00000000003], [1.52711994E12, 36463.0], [1.52711982E12, 8957.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52712E12, 44576.5], [1.52711988E12, 20199.55], [1.52712006E12, 45285.749999999985], [1.52711994E12, 33796.0], [1.52711982E12, 8919.349999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712006E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 20470.5, "minX": 0.0, "maxY": 90846.5, "series": [{"data": [[0.0, 20470.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 90846.5]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 19998.5, "series": [{"data": [[0.0, 19998.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.4166666666666667, "minX": 1.52711982E12, "maxY": 0.7666666666666667, "series": [{"data": [[1.52712E12, 0.45], [1.52711988E12, 0.7666666666666667], [1.52711994E12, 0.7333333333333333], [1.52711982E12, 0.4166666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52711982E12, "maxY": 0.6, "series": [{"data": [[1.52712E12, 0.3333333333333333], [1.52711988E12, 0.6], [1.52712006E12, 0.016666666666666666], [1.52711994E12, 0.55], [1.52711982E12, 0.3333333333333333]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52712006E12, 0.5333333333333333]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712006E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52711982E12, "maxY": 0.6, "series": [{"data": [[1.52712006E12, 0.5333333333333333]], "isOverall": false, "label": "Get ALLERGY allergens-failure", "isController": false}, {"data": [[1.52712E12, 0.3333333333333333], [1.52711988E12, 0.6], [1.52712006E12, 0.016666666666666666], [1.52711994E12, 0.55], [1.52711982E12, 0.3333333333333333]], "isOverall": false, "label": "Get ALLERGY allergens-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712006E12, "title": "Transactions Per Second"}},
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
