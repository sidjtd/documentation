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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 503.0, "series": [{"data": [[0.0, 1.0], [0.1, 1.0], [0.2, 1.0], [0.3, 1.0], [0.4, 1.0], [0.5, 1.0], [0.6, 1.0], [0.7, 1.0], [0.8, 1.0], [0.9, 1.0], [1.0, 1.0], [1.1, 1.0], [1.2, 1.0], [1.3, 1.0], [1.4, 1.0], [1.5, 1.0], [1.6, 1.0], [1.7, 1.0], [1.8, 1.0], [1.9, 1.0], [2.0, 1.0], [2.1, 1.0], [2.2, 1.0], [2.3, 1.0], [2.4, 1.0], [2.5, 1.0], [2.6, 1.0], [2.7, 1.0], [2.8, 1.0], [2.9, 1.0], [3.0, 1.0], [3.1, 1.0], [3.2, 1.0], [3.3, 1.0], [3.4, 1.0], [3.5, 1.0], [3.6, 1.0], [3.7, 1.0], [3.8, 1.0], [3.9, 1.0], [4.0, 1.0], [4.1, 1.0], [4.2, 1.0], [4.3, 1.0], [4.4, 1.0], [4.5, 1.0], [4.6, 1.0], [4.7, 1.0], [4.8, 1.0], [4.9, 1.0], [5.0, 1.0], [5.1, 1.0], [5.2, 1.0], [5.3, 1.0], [5.4, 1.0], [5.5, 1.0], [5.6, 1.0], [5.7, 1.0], [5.8, 1.0], [5.9, 1.0], [6.0, 1.0], [6.1, 1.0], [6.2, 1.0], [6.3, 1.0], [6.4, 1.0], [6.5, 1.0], [6.6, 1.0], [6.7, 1.0], [6.8, 1.0], [6.9, 1.0], [7.0, 1.0], [7.1, 1.0], [7.2, 1.0], [7.3, 1.0], [7.4, 1.0], [7.5, 1.0], [7.6, 1.0], [7.7, 1.0], [7.8, 1.0], [7.9, 2.0], [8.0, 2.0], [8.1, 2.0], [8.2, 2.0], [8.3, 2.0], [8.4, 2.0], [8.5, 2.0], [8.6, 2.0], [8.7, 2.0], [8.8, 2.0], [8.9, 2.0], [9.0, 2.0], [9.1, 2.0], [9.2, 2.0], [9.3, 2.0], [9.4, 2.0], [9.5, 2.0], [9.6, 2.0], [9.7, 2.0], [9.8, 2.0], [9.9, 2.0], [10.0, 2.0], [10.1, 2.0], [10.2, 2.0], [10.3, 2.0], [10.4, 2.0], [10.5, 2.0], [10.6, 2.0], [10.7, 2.0], [10.8, 2.0], [10.9, 2.0], [11.0, 2.0], [11.1, 2.0], [11.2, 2.0], [11.3, 2.0], [11.4, 2.0], [11.5, 2.0], [11.6, 2.0], [11.7, 2.0], [11.8, 2.0], [11.9, 2.0], [12.0, 2.0], [12.1, 2.0], [12.2, 2.0], [12.3, 2.0], [12.4, 2.0], [12.5, 2.0], [12.6, 2.0], [12.7, 2.0], [12.8, 2.0], [12.9, 2.0], [13.0, 2.0], [13.1, 2.0], [13.2, 2.0], [13.3, 2.0], [13.4, 2.0], [13.5, 2.0], [13.6, 2.0], [13.7, 2.0], [13.8, 2.0], [13.9, 2.0], [14.0, 2.0], [14.1, 2.0], [14.2, 2.0], [14.3, 2.0], [14.4, 2.0], [14.5, 2.0], [14.6, 2.0], [14.7, 2.0], [14.8, 2.0], [14.9, 2.0], [15.0, 2.0], [15.1, 2.0], [15.2, 2.0], [15.3, 2.0], [15.4, 2.0], [15.5, 2.0], [15.6, 2.0], [15.7, 2.0], [15.8, 2.0], [15.9, 2.0], [16.0, 2.0], [16.1, 2.0], [16.2, 2.0], [16.3, 2.0], [16.4, 2.0], [16.5, 2.0], [16.6, 2.0], [16.7, 2.0], [16.8, 2.0], [16.9, 2.0], [17.0, 2.0], [17.1, 2.0], [17.2, 2.0], [17.3, 2.0], [17.4, 2.0], [17.5, 2.0], [17.6, 2.0], [17.7, 2.0], [17.8, 2.0], [17.9, 2.0], [18.0, 2.0], [18.1, 2.0], [18.2, 2.0], [18.3, 2.0], [18.4, 2.0], [18.5, 2.0], [18.6, 2.0], [18.7, 2.0], [18.8, 2.0], [18.9, 2.0], [19.0, 2.0], [19.1, 2.0], [19.2, 2.0], [19.3, 2.0], [19.4, 2.0], [19.5, 2.0], [19.6, 2.0], [19.7, 2.0], [19.8, 2.0], [19.9, 2.0], [20.0, 2.0], [20.1, 2.0], [20.2, 2.0], [20.3, 2.0], [20.4, 2.0], [20.5, 2.0], [20.6, 2.0], [20.7, 2.0], [20.8, 2.0], [20.9, 2.0], [21.0, 2.0], [21.1, 2.0], [21.2, 2.0], [21.3, 2.0], [21.4, 2.0], [21.5, 2.0], [21.6, 2.0], [21.7, 2.0], [21.8, 2.0], [21.9, 2.0], [22.0, 2.0], [22.1, 2.0], [22.2, 2.0], [22.3, 2.0], [22.4, 2.0], [22.5, 2.0], [22.6, 2.0], [22.7, 2.0], [22.8, 2.0], [22.9, 2.0], [23.0, 2.0], [23.1, 2.0], [23.2, 2.0], [23.3, 2.0], [23.4, 2.0], [23.5, 2.0], [23.6, 2.0], [23.7, 2.0], [23.8, 2.0], [23.9, 2.0], [24.0, 2.0], [24.1, 2.0], [24.2, 2.0], [24.3, 2.0], [24.4, 2.0], [24.5, 2.0], [24.6, 2.0], [24.7, 2.0], [24.8, 2.0], [24.9, 2.0], [25.0, 2.0], [25.1, 2.0], [25.2, 2.0], [25.3, 2.0], [25.4, 2.0], [25.5, 2.0], [25.6, 2.0], [25.7, 2.0], [25.8, 2.0], [25.9, 2.0], [26.0, 2.0], [26.1, 2.0], [26.2, 2.0], [26.3, 2.0], [26.4, 2.0], [26.5, 2.0], [26.6, 2.0], [26.7, 2.0], [26.8, 2.0], [26.9, 2.0], [27.0, 2.0], [27.1, 2.0], [27.2, 2.0], [27.3, 2.0], [27.4, 2.0], [27.5, 2.0], [27.6, 2.0], [27.7, 2.0], [27.8, 2.0], [27.9, 2.0], [28.0, 2.0], [28.1, 2.0], [28.2, 2.0], [28.3, 2.0], [28.4, 2.0], [28.5, 2.0], [28.6, 2.0], [28.7, 2.0], [28.8, 2.0], [28.9, 2.0], [29.0, 2.0], [29.1, 2.0], [29.2, 2.0], [29.3, 2.0], [29.4, 2.0], [29.5, 2.0], [29.6, 2.0], [29.7, 2.0], [29.8, 2.0], [29.9, 2.0], [30.0, 2.0], [30.1, 2.0], [30.2, 2.0], [30.3, 2.0], [30.4, 2.0], [30.5, 2.0], [30.6, 2.0], [30.7, 2.0], [30.8, 2.0], [30.9, 2.0], [31.0, 2.0], [31.1, 2.0], [31.2, 2.0], [31.3, 2.0], [31.4, 2.0], [31.5, 2.0], [31.6, 2.0], [31.7, 2.0], [31.8, 2.0], [31.9, 2.0], [32.0, 2.0], [32.1, 2.0], [32.2, 2.0], [32.3, 2.0], [32.4, 2.0], [32.5, 2.0], [32.6, 2.0], [32.7, 2.0], [32.8, 2.0], [32.9, 2.0], [33.0, 2.0], [33.1, 2.0], [33.2, 2.0], [33.3, 2.0], [33.4, 2.0], [33.5, 2.0], [33.6, 2.0], [33.7, 2.0], [33.8, 2.0], [33.9, 2.0], [34.0, 2.0], [34.1, 2.0], [34.2, 2.0], [34.3, 2.0], [34.4, 2.0], [34.5, 2.0], [34.6, 2.0], [34.7, 2.0], [34.8, 2.0], [34.9, 2.0], [35.0, 2.0], [35.1, 2.0], [35.2, 2.0], [35.3, 2.0], [35.4, 2.0], [35.5, 2.0], [35.6, 2.0], [35.7, 2.0], [35.8, 2.0], [35.9, 2.0], [36.0, 2.0], [36.1, 2.0], [36.2, 2.0], [36.3, 2.0], [36.4, 2.0], [36.5, 2.0], [36.6, 2.0], [36.7, 2.0], [36.8, 2.0], [36.9, 2.0], [37.0, 2.0], [37.1, 2.0], [37.2, 2.0], [37.3, 2.0], [37.4, 2.0], [37.5, 2.0], [37.6, 2.0], [37.7, 2.0], [37.8, 2.0], [37.9, 2.0], [38.0, 2.0], [38.1, 2.0], [38.2, 2.0], [38.3, 2.0], [38.4, 2.0], [38.5, 2.0], [38.6, 2.0], [38.7, 2.0], [38.8, 2.0], [38.9, 2.0], [39.0, 2.0], [39.1, 2.0], [39.2, 2.0], [39.3, 2.0], [39.4, 2.0], [39.5, 2.0], [39.6, 2.0], [39.7, 2.0], [39.8, 2.0], [39.9, 2.0], [40.0, 2.0], [40.1, 2.0], [40.2, 2.0], [40.3, 2.0], [40.4, 2.0], [40.5, 2.0], [40.6, 2.0], [40.7, 2.0], [40.8, 2.0], [40.9, 2.0], [41.0, 2.0], [41.1, 2.0], [41.2, 2.0], [41.3, 2.0], [41.4, 2.0], [41.5, 2.0], [41.6, 2.0], [41.7, 2.0], [41.8, 2.0], [41.9, 2.0], [42.0, 2.0], [42.1, 2.0], [42.2, 2.0], [42.3, 2.0], [42.4, 2.0], [42.5, 2.0], [42.6, 2.0], [42.7, 2.0], [42.8, 2.0], [42.9, 2.0], [43.0, 2.0], [43.1, 2.0], [43.2, 2.0], [43.3, 2.0], [43.4, 2.0], [43.5, 2.0], [43.6, 2.0], [43.7, 2.0], [43.8, 2.0], [43.9, 2.0], [44.0, 2.0], [44.1, 2.0], [44.2, 2.0], [44.3, 2.0], [44.4, 2.0], [44.5, 2.0], [44.6, 2.0], [44.7, 2.0], [44.8, 2.0], [44.9, 2.0], [45.0, 2.0], [45.1, 2.0], [45.2, 2.0], [45.3, 2.0], [45.4, 2.0], [45.5, 2.0], [45.6, 2.0], [45.7, 2.0], [45.8, 2.0], [45.9, 2.0], [46.0, 2.0], [46.1, 2.0], [46.2, 2.0], [46.3, 2.0], [46.4, 2.0], [46.5, 2.0], [46.6, 2.0], [46.7, 2.0], [46.8, 2.0], [46.9, 2.0], [47.0, 2.0], [47.1, 2.0], [47.2, 2.0], [47.3, 2.0], [47.4, 2.0], [47.5, 2.0], [47.6, 2.0], [47.7, 2.0], [47.8, 2.0], [47.9, 2.0], [48.0, 2.0], [48.1, 2.0], [48.2, 2.0], [48.3, 2.0], [48.4, 2.0], [48.5, 2.0], [48.6, 2.0], [48.7, 3.0], [48.8, 3.0], [48.9, 3.0], [49.0, 3.0], [49.1, 3.0], [49.2, 3.0], [49.3, 3.0], [49.4, 3.0], [49.5, 3.0], [49.6, 3.0], [49.7, 3.0], [49.8, 3.0], [49.9, 3.0], [50.0, 3.0], [50.1, 3.0], [50.2, 3.0], [50.3, 3.0], [50.4, 3.0], [50.5, 3.0], [50.6, 3.0], [50.7, 3.0], [50.8, 3.0], [50.9, 3.0], [51.0, 3.0], [51.1, 3.0], [51.2, 3.0], [51.3, 3.0], [51.4, 3.0], [51.5, 3.0], [51.6, 3.0], [51.7, 3.0], [51.8, 3.0], [51.9, 3.0], [52.0, 3.0], [52.1, 3.0], [52.2, 3.0], [52.3, 3.0], [52.4, 3.0], [52.5, 3.0], [52.6, 3.0], [52.7, 3.0], [52.8, 3.0], [52.9, 3.0], [53.0, 3.0], [53.1, 3.0], [53.2, 3.0], [53.3, 3.0], [53.4, 3.0], [53.5, 3.0], [53.6, 3.0], [53.7, 3.0], [53.8, 3.0], [53.9, 3.0], [54.0, 3.0], [54.1, 3.0], [54.2, 3.0], [54.3, 3.0], [54.4, 3.0], [54.5, 3.0], [54.6, 3.0], [54.7, 3.0], [54.8, 3.0], [54.9, 3.0], [55.0, 3.0], [55.1, 3.0], [55.2, 3.0], [55.3, 3.0], [55.4, 3.0], [55.5, 3.0], [55.6, 3.0], [55.7, 3.0], [55.8, 3.0], [55.9, 3.0], [56.0, 3.0], [56.1, 3.0], [56.2, 3.0], [56.3, 3.0], [56.4, 3.0], [56.5, 3.0], [56.6, 3.0], [56.7, 3.0], [56.8, 3.0], [56.9, 3.0], [57.0, 3.0], [57.1, 3.0], [57.2, 3.0], [57.3, 3.0], [57.4, 3.0], [57.5, 3.0], [57.6, 3.0], [57.7, 3.0], [57.8, 3.0], [57.9, 3.0], [58.0, 3.0], [58.1, 3.0], [58.2, 3.0], [58.3, 3.0], [58.4, 3.0], [58.5, 3.0], [58.6, 3.0], [58.7, 3.0], [58.8, 3.0], [58.9, 3.0], [59.0, 3.0], [59.1, 3.0], [59.2, 3.0], [59.3, 3.0], [59.4, 3.0], [59.5, 3.0], [59.6, 3.0], [59.7, 3.0], [59.8, 3.0], [59.9, 3.0], [60.0, 3.0], [60.1, 3.0], [60.2, 3.0], [60.3, 3.0], [60.4, 3.0], [60.5, 3.0], [60.6, 3.0], [60.7, 3.0], [60.8, 3.0], [60.9, 3.0], [61.0, 3.0], [61.1, 3.0], [61.2, 3.0], [61.3, 3.0], [61.4, 3.0], [61.5, 3.0], [61.6, 3.0], [61.7, 3.0], [61.8, 3.0], [61.9, 3.0], [62.0, 3.0], [62.1, 3.0], [62.2, 3.0], [62.3, 3.0], [62.4, 3.0], [62.5, 3.0], [62.6, 3.0], [62.7, 3.0], [62.8, 3.0], [62.9, 3.0], [63.0, 3.0], [63.1, 3.0], [63.2, 3.0], [63.3, 3.0], [63.4, 3.0], [63.5, 3.0], [63.6, 3.0], [63.7, 3.0], [63.8, 3.0], [63.9, 3.0], [64.0, 3.0], [64.1, 3.0], [64.2, 3.0], [64.3, 3.0], [64.4, 3.0], [64.5, 3.0], [64.6, 3.0], [64.7, 3.0], [64.8, 3.0], [64.9, 3.0], [65.0, 3.0], [65.1, 3.0], [65.2, 3.0], [65.3, 3.0], [65.4, 3.0], [65.5, 3.0], [65.6, 3.0], [65.7, 3.0], [65.8, 3.0], [65.9, 3.0], [66.0, 3.0], [66.1, 3.0], [66.2, 3.0], [66.3, 3.0], [66.4, 3.0], [66.5, 3.0], [66.6, 3.0], [66.7, 3.0], [66.8, 3.0], [66.9, 3.0], [67.0, 3.0], [67.1, 3.0], [67.2, 3.0], [67.3, 3.0], [67.4, 3.0], [67.5, 3.0], [67.6, 3.0], [67.7, 3.0], [67.8, 3.0], [67.9, 3.0], [68.0, 3.0], [68.1, 3.0], [68.2, 3.0], [68.3, 3.0], [68.4, 3.0], [68.5, 3.0], [68.6, 3.0], [68.7, 3.0], [68.8, 3.0], [68.9, 3.0], [69.0, 3.0], [69.1, 3.0], [69.2, 3.0], [69.3, 3.0], [69.4, 3.0], [69.5, 3.0], [69.6, 3.0], [69.7, 3.0], [69.8, 3.0], [69.9, 3.0], [70.0, 3.0], [70.1, 3.0], [70.2, 3.0], [70.3, 3.0], [70.4, 3.0], [70.5, 3.0], [70.6, 3.0], [70.7, 3.0], [70.8, 3.0], [70.9, 3.0], [71.0, 3.0], [71.1, 3.0], [71.2, 3.0], [71.3, 3.0], [71.4, 3.0], [71.5, 3.0], [71.6, 3.0], [71.7, 3.0], [71.8, 3.0], [71.9, 3.0], [72.0, 3.0], [72.1, 3.0], [72.2, 3.0], [72.3, 3.0], [72.4, 3.0], [72.5, 3.0], [72.6, 3.0], [72.7, 3.0], [72.8, 3.0], [72.9, 4.0], [73.0, 4.0], [73.1, 4.0], [73.2, 4.0], [73.3, 4.0], [73.4, 4.0], [73.5, 4.0], [73.6, 4.0], [73.7, 4.0], [73.8, 4.0], [73.9, 4.0], [74.0, 4.0], [74.1, 4.0], [74.2, 4.0], [74.3, 4.0], [74.4, 4.0], [74.5, 4.0], [74.6, 4.0], [74.7, 4.0], [74.8, 4.0], [74.9, 4.0], [75.0, 4.0], [75.1, 4.0], [75.2, 4.0], [75.3, 4.0], [75.4, 4.0], [75.5, 4.0], [75.6, 4.0], [75.7, 4.0], [75.8, 4.0], [75.9, 4.0], [76.0, 4.0], [76.1, 4.0], [76.2, 4.0], [76.3, 4.0], [76.4, 4.0], [76.5, 4.0], [76.6, 4.0], [76.7, 4.0], [76.8, 4.0], [76.9, 4.0], [77.0, 4.0], [77.1, 4.0], [77.2, 4.0], [77.3, 4.0], [77.4, 4.0], [77.5, 4.0], [77.6, 4.0], [77.7, 4.0], [77.8, 4.0], [77.9, 4.0], [78.0, 4.0], [78.1, 4.0], [78.2, 4.0], [78.3, 4.0], [78.4, 4.0], [78.5, 4.0], [78.6, 4.0], [78.7, 4.0], [78.8, 4.0], [78.9, 4.0], [79.0, 4.0], [79.1, 4.0], [79.2, 4.0], [79.3, 4.0], [79.4, 4.0], [79.5, 4.0], [79.6, 4.0], [79.7, 4.0], [79.8, 4.0], [79.9, 4.0], [80.0, 4.0], [80.1, 4.0], [80.2, 4.0], [80.3, 4.0], [80.4, 4.0], [80.5, 4.0], [80.6, 4.0], [80.7, 4.0], [80.8, 4.0], [80.9, 4.0], [81.0, 4.0], [81.1, 4.0], [81.2, 4.0], [81.3, 4.0], [81.4, 4.0], [81.5, 4.0], [81.6, 4.0], [81.7, 4.0], [81.8, 5.0], [81.9, 5.0], [82.0, 5.0], [82.1, 5.0], [82.2, 5.0], [82.3, 5.0], [82.4, 5.0], [82.5, 5.0], [82.6, 5.0], [82.7, 5.0], [82.8, 5.0], [82.9, 5.0], [83.0, 5.0], [83.1, 5.0], [83.2, 5.0], [83.3, 5.0], [83.4, 5.0], [83.5, 5.0], [83.6, 5.0], [83.7, 5.0], [83.8, 5.0], [83.9, 5.0], [84.0, 5.0], [84.1, 5.0], [84.2, 5.0], [84.3, 5.0], [84.4, 5.0], [84.5, 5.0], [84.6, 5.0], [84.7, 5.0], [84.8, 5.0], [84.9, 5.0], [85.0, 5.0], [85.1, 5.0], [85.2, 5.0], [85.3, 5.0], [85.4, 5.0], [85.5, 5.0], [85.6, 5.0], [85.7, 5.0], [85.8, 5.0], [85.9, 5.0], [86.0, 5.0], [86.1, 5.0], [86.2, 6.0], [86.3, 6.0], [86.4, 6.0], [86.5, 6.0], [86.6, 6.0], [86.7, 6.0], [86.8, 6.0], [86.9, 6.0], [87.0, 6.0], [87.1, 6.0], [87.2, 6.0], [87.3, 6.0], [87.4, 6.0], [87.5, 6.0], [87.6, 6.0], [87.7, 6.0], [87.8, 6.0], [87.9, 6.0], [88.0, 6.0], [88.1, 6.0], [88.2, 6.0], [88.3, 6.0], [88.4, 6.0], [88.5, 6.0], [88.6, 6.0], [88.7, 6.0], [88.8, 6.0], [88.9, 6.0], [89.0, 7.0], [89.1, 7.0], [89.2, 7.0], [89.3, 7.0], [89.4, 7.0], [89.5, 7.0], [89.6, 7.0], [89.7, 7.0], [89.8, 7.0], [89.9, 7.0], [90.0, 7.0], [90.1, 7.0], [90.2, 7.0], [90.3, 7.0], [90.4, 7.0], [90.5, 7.0], [90.6, 7.0], [90.7, 7.0], [90.8, 7.0], [90.9, 8.0], [91.0, 8.0], [91.1, 8.0], [91.2, 8.0], [91.3, 8.0], [91.4, 8.0], [91.5, 8.0], [91.6, 8.0], [91.7, 8.0], [91.8, 8.0], [91.9, 8.0], [92.0, 8.0], [92.1, 8.0], [92.2, 8.0], [92.3, 8.0], [92.4, 9.0], [92.5, 9.0], [92.6, 9.0], [92.7, 9.0], [92.8, 9.0], [92.9, 9.0], [93.0, 9.0], [93.1, 9.0], [93.2, 9.0], [93.3, 9.0], [93.4, 10.0], [93.5, 10.0], [93.6, 10.0], [93.7, 10.0], [93.8, 10.0], [93.9, 10.0], [94.0, 10.0], [94.1, 10.0], [94.2, 10.0], [94.3, 11.0], [94.4, 11.0], [94.5, 11.0], [94.6, 11.0], [94.7, 11.0], [94.8, 11.0], [94.9, 11.0], [95.0, 12.0], [95.1, 12.0], [95.2, 12.0], [95.3, 12.0], [95.4, 12.0], [95.5, 12.0], [95.6, 13.0], [95.7, 13.0], [95.8, 13.0], [95.9, 13.0], [96.0, 14.0], [96.1, 14.0], [96.2, 14.0], [96.3, 14.0], [96.4, 15.0], [96.5, 15.0], [96.6, 15.0], [96.7, 16.0], [96.8, 16.0], [96.9, 16.0], [97.0, 17.0], [97.1, 17.0], [97.2, 17.0], [97.3, 18.0], [97.4, 18.0], [97.5, 19.0], [97.6, 20.0], [97.7, 20.0], [97.8, 21.0], [97.9, 22.0], [98.0, 22.0], [98.1, 23.0], [98.2, 24.0], [98.3, 25.0], [98.4, 26.0], [98.5, 27.0], [98.6, 28.0], [98.7, 30.0], [98.8, 32.0], [98.9, 33.0], [99.0, 36.0], [99.1, 39.0], [99.2, 42.0], [99.3, 46.0], [99.4, 49.0], [99.5, 54.0], [99.6, 59.0], [99.7, 67.0], [99.8, 80.0], [99.9, 146.0]], "isOverall": false, "label": "Get VITALS list", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 44650.0, "series": [{"data": [[0.0, 44650.0], [300.0, 8.0], [100.0, 34.0], [200.0, 13.0], [400.0, 4.0], [500.0, 2.0]], "isOverall": false, "label": "Get VITALS list", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 44710.0, "series": [{"data": [[1.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 44710.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 1.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 589.185297549591, "minX": 1.52762898E12, "maxY": 3900.0, "series": [{"data": [[1.52762922E12, 2850.576468543626], [1.52762904E12, 1191.2461401952032], [1.5276291E12, 1889.87092481703], [1.5276294E12, 3900.0], [1.52762898E12, 589.185297549591], [1.52762946E12, 3899.995269071553], [1.52762928E12, 3389.5697830677677], [1.52762934E12, 3636.7878286449754], [1.52762916E12, 2583.0922722029895]], "isOverall": false, "label": "jp@gc Ultima Thread - Allergy Vitals", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52762946E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1.0, "minX": 23.0, "maxY": 406.0, "series": [{"data": [[23.0, 112.41176470588233], [27.0, 5.0], [28.0, 3.5], [31.0, 4.0], [33.0, 3.0], [32.0, 3.0], [35.0, 3.5], [34.0, 4.0], [37.0, 3.6666666666666665], [41.0, 4.0], [40.0, 4.0], [43.0, 4.0], [42.0, 3.5], [45.0, 6.5], [49.0, 4.5], [48.0, 5.0], [51.0, 4.666666666666667], [50.0, 5.0], [53.0, 2.0], [52.0, 3.0], [54.0, 5.0], [55.0, 4.0], [57.0, 4.5], [56.0, 5.0], [59.0, 4.5], [58.0, 4.0], [61.0, 4.25], [60.0, 3.5], [62.0, 6.0], [63.0, 3.0], [67.0, 3.0], [66.0, 4.5], [65.0, 21.0], [64.0, 2.0], [71.0, 4.333333333333333], [75.0, 4.666666666666667], [74.0, 3.0], [73.0, 3.3333333333333335], [72.0, 4.0], [79.0, 3.0], [77.0, 7.0], [76.0, 3.0], [80.0, 3.5], [83.0, 5.0], [82.0, 4.333333333333333], [81.0, 48.5], [87.0, 4.5], [86.0, 4.0], [84.0, 5.0], [91.0, 2.6666666666666665], [90.0, 5.0], [89.0, 5.5], [88.0, 6.0], [95.0, 12.166666666666666], [94.0, 5.6], [99.0, 23.8], [97.0, 13.0], [96.0, 6.0], [103.0, 9.0], [101.0, 8.5], [107.0, 3.0], [106.0, 3.5], [105.0, 3.0], [104.0, 10.5], [110.0, 2.0], [109.0, 3.0], [108.0, 3.0], [114.0, 5.5], [113.0, 3.6666666666666665], [112.0, 11.0], [116.0, 4.5], [119.0, 3.0], [118.0, 2.75], [117.0, 3.0], [122.0, 5.0], [123.0, 5.0], [121.0, 4.0], [120.0, 3.0], [127.0, 4.4], [125.0, 3.0], [124.0, 2.5], [135.0, 3.5], [134.0, 5.25], [133.0, 5.0], [131.0, 4.0], [130.0, 3.25], [128.0, 7.333333333333333], [141.0, 2.25], [143.0, 24.666666666666668], [140.0, 2.2], [139.0, 2.0], [138.0, 3.5], [151.0, 43.4], [150.0, 84.0], [145.0, 4.0], [144.0, 3.3333333333333335], [158.0, 4.0], [157.0, 65.0], [155.0, 8.25], [152.0, 3.75], [160.0, 12.0], [167.0, 5.5], [165.0, 13.0], [164.0, 25.0], [163.0, 6.0], [162.0, 4.0], [161.0, 3.5], [174.0, 4.0], [172.0, 2.4], [170.0, 4.666666666666667], [169.0, 6.0], [168.0, 3.0], [183.0, 4.5], [182.0, 4.0], [181.0, 4.0], [180.0, 5.0], [179.0, 8.333333333333334], [178.0, 7.75], [177.0, 12.5], [191.0, 10.5], [190.0, 2.0], [189.0, 2.8], [188.0, 3.0], [187.0, 2.0], [186.0, 2.5], [185.0, 3.0], [184.0, 5.0], [199.0, 3.0], [198.0, 5.0], [197.0, 4.0], [195.0, 7.0], [194.0, 6.0], [193.0, 3.3333333333333335], [202.0, 2.3333333333333335], [207.0, 4.5], [206.0, 7.0], [205.0, 4.0], [204.0, 3.0], [201.0, 7.0], [200.0, 8.0], [215.0, 3.25], [214.0, 4.0], [213.0, 4.0], [211.0, 7.0], [210.0, 4.0], [209.0, 3.0], [208.0, 2.0], [222.0, 7.666666666666666], [223.0, 13.5], [221.0, 13.0], [220.0, 2.0], [219.0, 3.0], [218.0, 2.5], [217.0, 9.666666666666666], [216.0, 12.0], [231.0, 5.0], [230.0, 6.6], [229.0, 8.0], [227.0, 4.333333333333333], [239.0, 3.2], [238.0, 11.0], [236.0, 3.5], [235.0, 2.0], [234.0, 7.666666666666667], [233.0, 2.0], [232.0, 3.0], [240.0, 2.0], [243.0, 4.25], [247.0, 6.333333333333333], [246.0, 2.6666666666666665], [245.0, 3.0], [244.0, 12.0], [242.0, 5.2], [241.0, 7.333333333333333], [253.0, 2.0], [252.0, 3.0], [248.0, 3.5], [249.0, 3.0], [250.0, 2.0], [251.0, 2.0], [270.0, 18.5], [266.0, 58.0], [262.0, 5.75], [256.0, 20.666666666666664], [264.0, 4.0], [276.0, 27.0], [286.0, 3.0], [284.0, 2.5], [282.0, 51.0], [280.0, 3.0], [302.0, 2.0], [300.0, 4.666666666666667], [298.0, 2.6666666666666665], [296.0, 4.0], [288.0, 13.5], [290.0, 5.0], [294.0, 2.6666666666666665], [292.0, 3.0], [318.0, 4.0], [308.0, 1.75], [314.0, 30.5], [312.0, 2.6666666666666665], [304.0, 3.25], [310.0, 2.0], [332.0, 228.0], [326.0, 246.0], [328.0, 68.8], [330.0, 406.0], [348.0, 4.0], [350.0, 5.0], [340.0, 169.25], [346.0, 3.6666666666666665], [344.0, 2.0], [338.0, 4.0], [336.0, 6.0], [342.0, 3.0], [354.0, 2.3333333333333335], [366.0, 4.666666666666667], [352.0, 3.0], [358.0, 1.6666666666666665], [356.0, 2.5], [364.0, 3.0], [362.0, 2.6666666666666665], [360.0, 5.0], [380.0, 24.285714285714285], [368.0, 3.3333333333333335], [378.0, 13.0], [374.0, 5.0], [372.0, 3.8333333333333335], [396.0, 3.6666666666666665], [398.0, 4.25], [386.0, 13.0], [394.0, 7.5], [392.0, 6.0], [384.0, 56.0], [390.0, 3.0], [388.0, 8.0], [406.0, 2.4], [402.0, 3.0], [404.0, 6.0], [400.0, 2.0], [414.0, 7.0], [408.0, 1.5], [412.0, 28.363636363636363], [430.0, 4.0], [426.0, 3.0], [428.0, 12.0], [424.0, 6.0], [418.0, 4.0], [422.0, 5.0], [420.0, 2.0], [434.0, 7.333333333333333], [446.0, 2.0], [432.0, 4.0], [444.0, 3.0], [442.0, 5.0], [440.0, 5.25], [438.0, 4.0], [436.0, 3.0], [462.0, 2.833333333333333], [456.0, 2.0], [454.0, 5.333333333333333], [452.0, 2.5], [450.0, 3.0], [448.0, 1.75], [478.0, 5.4], [476.0, 13.0], [474.0, 3.0], [472.0, 4.833333333333334], [470.0, 8.0], [464.0, 2.0], [466.0, 4.5], [468.0, 2.0], [494.0, 2.0], [492.0, 4.4], [490.0, 4.5], [488.0, 2.6], [480.0, 4.0], [482.0, 4.0], [486.0, 5.75], [484.0, 2.0], [508.0, 12.0], [510.0, 2.25], [498.0, 3.0], [496.0, 4.5], [506.0, 4.749999999999999], [504.0, 3.0], [502.0, 1.75], [500.0, 2.0], [516.0, 14.5], [540.0, 3.0], [512.0, 4.833333333333333], [568.0, 11.333333333333334], [572.0, 2.0], [548.0, 6.5], [544.0, 3.0], [556.0, 11.249999999999998], [552.0, 3.0], [576.0, 3.2], [580.0, 3.666666666666667], [588.0, 2.5], [584.0, 8.5], [596.0, 3.0], [604.0, 2.5], [600.0, 5.4], [608.0, 2.0], [612.0, 4.25], [620.0, 3.6666666666666665], [632.0, 8.0], [616.0, 2.0], [624.0, 2.0], [636.0, 1.0], [668.0, 3.0], [660.0, 3.6666666666666665], [664.0, 1.6666666666666667], [644.0, 3.0], [640.0, 6.0], [652.0, 5.0], [648.0, 5.0], [656.0, 2.5], [700.0, 5.565789473684219], [688.0, 5.0], [696.0, 11.0], [672.0, 2.3333333333333335], [680.0, 3.0], [704.0, 4.0], [712.0, 5.0], [708.0, 4.0], [716.0, 2.166666666666667], [728.0, 2.0], [724.0, 6.0], [720.0, 2.0], [732.0, 5.0], [740.0, 4.5], [736.0, 12.0], [764.0, 2.888888888888889], [748.0, 6.0], [744.0, 5.0], [752.0, 2.0], [756.0, 4.25], [760.0, 5.0], [780.0, 3.3333333333333335], [776.0, 2.0], [784.0, 9.8], [788.0, 6.0], [796.0, 2.0], [792.0, 1.6], [772.0, 6.0], [804.0, 5.25], [800.0, 2.0], [828.0, 2.5], [812.0, 2.0], [808.0, 1.5], [816.0, 11.333333333333334], [820.0, 8.0], [824.0, 2.0], [832.0, 7.0], [860.0, 5.5], [840.0, 2.3333333333333335], [848.0, 3.0], [852.0, 2.0], [856.0, 1.5], [836.0, 13.25], [864.0, 5.0], [868.0, 3.3333333333333335], [872.0, 3.0], [880.0, 3.0], [884.0, 8.0], [892.0, 8.0], [888.0, 2.6666666666666665], [900.0, 1.0], [924.0, 11.333333333333334], [908.0, 1.6], [904.0, 2.75], [896.0, 8.636363636363637], [912.0, 2.8333333333333335], [916.0, 2.25], [920.0, 4.25], [940.0, 7.285714285714286], [928.0, 14.5], [936.0, 3.0], [932.0, 2.0], [944.0, 2.6666666666666665], [948.0, 2.0], [952.0, 7.0], [964.0, 2.0], [972.0, 5.0], [968.0, 3.3333333333333335], [984.0, 2.5], [960.0, 3.0], [980.0, 2.0], [976.0, 2.0], [988.0, 7.0], [1008.0, 3.6666666666666665], [1012.0, 2.5], [992.0, 7.0], [996.0, 2.0], [1016.0, 2.5], [1004.0, 5.0], [1000.0, 2.0], [1032.0, 2.0], [1080.0, 3.5], [1024.0, 3.1666666666666665], [1072.0, 4.5], [1040.0, 2.0], [1048.0, 2.0], [1056.0, 1.6666666666666667], [1064.0, 8.0], [1088.0, 1.5], [1112.0, 12.0], [1096.0, 2.0], [1120.0, 2.6666666666666665], [1128.0, 2.0], [1144.0, 8.0], [1136.0, 2.0], [1152.0, 2.0], [1160.0, 4.0], [1168.0, 3.75], [1192.0, 8.833333333333334], [1184.0, 2.0], [1208.0, 1.8333333333333335], [1232.0, 5.000000000000001], [1240.0, 1.75], [1272.0, 2.666666666666667], [1264.0, 2.6666666666666665], [1224.0, 3.0], [1216.0, 3.0], [1336.0, 3.2], [1296.0, 2.0], [1312.0, 3.0], [1320.0, 1.5], [1328.0, 2.3333333333333335], [1280.0, 5.333333333333334], [1288.0, 17.0], [1304.0, 4.333333333333334], [1392.0, 2.0], [1400.0, 4.845972185778025], [1368.0, 2.5], [1360.0, 2.0], [1376.0, 10.5], [1384.0, 2.0], [1352.0, 3.0], [1344.0, 2.0], [1408.0, 3.0], [1416.0, 2.5], [1432.0, 2.0], [1424.0, 1.5], [1440.0, 2.0], [1448.0, 2.0], [1464.0, 2.0], [1456.0, 2.5], [1472.0, 1.857142857142857], [1520.0, 2.333333333333333], [1496.0, 3.6153846153846154], [1488.0, 2.2], [1480.0, 4.0], [1528.0, 11.0], [1504.0, 2.0], [1560.0, 3.5], [1552.0, 1.0], [1568.0, 1.0], [1576.0, 4.0], [1592.0, 12.5], [1584.0, 4.0], [1536.0, 3.25], [1656.0, 2.0], [1624.0, 6.2], [1616.0, 1.6666666666666667], [1632.0, 8.0], [1608.0, 3.0], [1600.0, 13.833333333333334], [1664.0, 1.5], [1688.0, 6.5], [1680.0, 2.5], [1712.0, 2.0], [1672.0, 9.2], [1720.0, 4.75], [1728.0, 2.3333333333333335], [1736.0, 5.0], [1744.0, 2.0], [1752.0, 2.0], [1776.0, 2.0], [1768.0, 3.0], [1760.0, 5.5], [1840.0, 2.3333333333333335], [1848.0, 1.5], [1808.0, 7.75], [1800.0, 2.6666666666666665], [1792.0, 7.6], [1832.0, 2.2], [1816.0, 1.3333333333333333], [1912.0, 2.5], [1904.0, 6.0], [1896.0, 2.5], [1888.0, 2.0], [1856.0, 2.0], [1864.0, 3.0], [1880.0, 1.8], [1976.0, 2.6666666666666665], [1968.0, 4.285714285714286], [1960.0, 5.333333333333333], [1952.0, 6.333333333333333], [1920.0, 5.0], [1928.0, 2.25], [1944.0, 2.0], [1936.0, 3.5], [2008.0, 2.1666666666666665], [2040.0, 3.0], [2000.0, 2.75], [1992.0, 2.0], [1984.0, 3.0], [2024.0, 1.0], [2016.0, 2.0], [2096.0, 1.5], [2080.0, 2.0], [2064.0, 2.0], [2048.0, 4.0], [2112.0, 2.75], [2160.0, 2.0], [2144.0, 14.0], [2176.0, 21.857142857142858], [2192.0, 1.5], [2208.0, 2.625], [2224.0, 3.333333333333333], [2240.0, 4.0], [2288.0, 2.0], [2272.0, 1.5], [2256.0, 2.0], [2320.0, 2.0], [2304.0, 3.0], [2416.0, 4.0], [2384.0, 2.5], [2368.0, 2.0], [2352.0, 3.2], [2336.0, 2.0], [2544.0, 2.25], [2528.0, 3.3333333333333335], [2512.0, 3.0], [2496.0, 2.3333333333333335], [2448.0, 3.0], [2480.0, 1.6666666666666667], [2464.0, 2.0], [2624.0, 2.0], [2656.0, 1.75], [2640.0, 11.333333333333334], [2608.0, 2.0], [2592.0, 1.0], [2576.0, 2.5], [2560.0, 1.8], [2688.0, 2.0], [2720.0, 3.3333333333333335], [2800.0, 3.6281035393555237], [2768.0, 1.8], [2752.0, 3.0], [2928.0, 2.3333333333333335], [2912.0, 2.5], [2880.0, 12.0], [2816.0, 3.0], [2832.0, 2.0], [2864.0, 3.5], [2848.0, 2.5], [3056.0, 2.75], [3040.0, 3.0], [2960.0, 3.0], [2944.0, 3.4], [3024.0, 27.0], [2992.0, 2.0], [3072.0, 2.6666666666666665], [3184.0, 4.0], [3104.0, 3.0], [3088.0, 3.333333333333333], [3120.0, 1.5], [3168.0, 3.0], [3152.0, 2.0], [3136.0, 1.75], [3312.0, 2.0], [3296.0, 2.6], [3280.0, 1.6], [3264.0, 2.0], [3248.0, 2.5], [3216.0, 2.0], [3200.0, 2.0], [3344.0, 6.0], [3392.0, 3.0], [3376.0, 2.0], [3360.0, 2.0], [3328.0, 2.0], [3440.0, 7.0], [3568.0, 2.3333333333333335], [3552.0, 2.0], [3536.0, 2.0], [3520.0, 3.0], [3504.0, 1.0], [3456.0, 31.0], [3616.0, 2.0], [3696.0, 2.3333333333333335], [3680.0, 2.0], [3664.0, 2.5], [3648.0, 1.5], [3632.0, 2.0], [3584.0, 2.0], [3728.0, 1.4], [3744.0, 3.0], [3824.0, 6.0], [3808.0, 2.5], [3792.0, 2.0], [3776.0, 3.25], [3888.0, 2.0], [3872.0, 2.5], [3856.0, 2.3333333333333335], [3840.0, 1.6666666666666667], [2097.0, 2.3333333333333335], [2081.0, 1.8333333333333333], [2049.0, 2.6666666666666665], [2129.0, 11.166666666666666], [2113.0, 2.0], [2161.0, 1.75], [2145.0, 2.0], [2289.0, 2.0], [2273.0, 2.3333333333333335], [2241.0, 2.4], [2257.0, 3.0], [2177.0, 11.0], [2193.0, 3.0], [2225.0, 2.0], [2209.0, 2.0], [2417.0, 2.0], [2401.0, 3.0], [2385.0, 2.3333333333333335], [2369.0, 3.5], [2305.0, 2.0], [2321.0, 3.0], [2353.0, 6.333333333333333], [2337.0, 2.0], [2433.0, 11.583333333333334], [2465.0, 2.0], [2449.0, 2.0], [2481.0, 4.0], [2545.0, 2.0], [2529.0, 2.0], [2513.0, 2.25], [2497.0, 2.25], [2673.0, 2.6], [2641.0, 3.0], [2657.0, 3.6], [2577.0, 2.8333333333333335], [2561.0, 1.6666666666666667], [2625.0, 2.25], [2609.0, 2.0], [2593.0, 1.6666666666666667], [2705.0, 4.666666666666666], [2737.0, 24.0], [2721.0, 1.8], [2689.0, 5.0], [2801.0, 2.0], [2753.0, 2.75], [2769.0, 1.5], [2785.0, 8.25], [2929.0, 1.6666666666666667], [2913.0, 2.0], [2897.0, 1.0], [2881.0, 2.0], [2817.0, 2.0], [2833.0, 1.5], [2865.0, 1.75], [2849.0, 2.333333333333333], [3057.0, 1.0], [3041.0, 2.4], [3025.0, 6.0], [3009.0, 29.555555555555557], [2945.0, 2.833333333333333], [2961.0, 1.75], [2993.0, 2.0], [2977.0, 10.666666666666666], [3185.0, 2.3333333333333335], [3169.0, 1.75], [3153.0, 2.2], [3137.0, 2.0], [3073.0, 2.5], [3089.0, 1.3333333333333333], [3121.0, 2.0], [3105.0, 2.0], [3313.0, 2.0], [3297.0, 2.0], [3281.0, 1.3333333333333333], [3265.0, 2.5], [3201.0, 2.0], [3217.0, 2.0], [3249.0, 3.75], [3233.0, 3.0], [3345.0, 1.8], [3393.0, 2.25], [3377.0, 2.0], [3361.0, 2.25], [3329.0, 1.75], [3441.0, 6.0], [3425.0, 2.0], [3569.0, 2.0], [3537.0, 2.0], [3521.0, 2.0], [3489.0, 7.0], [3457.0, 4.0], [3697.0, 2.0], [3681.0, 2.0], [3665.0, 2.0], [3649.0, 1.5], [3617.0, 1.75], [3601.0, 2.25], [3585.0, 3.0], [3825.0, 5.7], [3809.0, 2.0], [3793.0, 3.75], [3761.0, 14.166666666666666], [3745.0, 1.6666666666666667], [3729.0, 2.0], [3713.0, 2.5], [3889.0, 2.0], [3873.0, 2.5], [3857.0, 3.0], [1073.0, 4.0], [1081.0, 1.5], [1049.0, 2.0], [1041.0, 1.3333333333333333], [1057.0, 3.75], [1065.0, 7.0], [1025.0, 3.0], [1033.0, 2.5], [1089.0, 2.5], [1097.0, 2.6], [1113.0, 2.4], [1105.0, 1.6666666666666667], [1121.0, 3.0], [1129.0, 3.0], [1145.0, 8.5], [1137.0, 3.25], [1153.0, 2.6666666666666665], [1161.0, 1.6666666666666667], [1177.0, 6.333333333333333], [1169.0, 1.0], [1193.0, 3.75], [1185.0, 4.0], [1209.0, 2.0], [1273.0, 3.0], [1241.0, 4.666666666666667], [1233.0, 4.5], [1257.0, 6.0], [1265.0, 4.0], [1289.0, 2.6666666666666665], [1305.0, 2.5], [1297.0, 8.0], [1281.0, 2.0], [1313.0, 2.6], [1321.0, 2.2], [1337.0, 2.0], [1329.0, 3.3333333333333335], [1401.0, 2.25], [1377.0, 3.75], [1369.0, 1.75], [1361.0, 2.0], [1393.0, 4.0], [1353.0, 6.0], [1345.0, 6.0], [1385.0, 2.0], [1433.0, 1.0], [1409.0, 2.4], [1425.0, 2.0], [1441.0, 1.0], [1449.0, 2.0], [1465.0, 4.0], [1457.0, 2.0], [1481.0, 3.25], [1529.0, 8.0], [1497.0, 3.0], [1489.0, 3.0], [1473.0, 2.0], [1505.0, 1.5], [1513.0, 4.333333333333333], [1521.0, 1.6], [1593.0, 9.5], [1585.0, 8.5], [1569.0, 2.6666666666666665], [1577.0, 4.0], [1537.0, 4.0], [1545.0, 6.0], [1561.0, 3.0], [1553.0, 2.0], [1609.0, 2.6666666666666665], [1657.0, 2.0], [1625.0, 5.0], [1617.0, 1.3333333333333333], [1601.0, 2.1666666666666665], [1633.0, 4.4], [1641.0, 4.4], [1649.0, 2.0], [1721.0, 2.0], [1705.0, 2.0], [1713.0, 3.0], [1665.0, 1.0], [1673.0, 7.333333333333333], [1689.0, 2.0], [1681.0, 3.5], [1753.0, 2.0], [1769.0, 3.6666666666666665], [1745.0, 2.5], [1777.0, 2.0], [1737.0, 2.25], [1729.0, 1.3333333333333333], [1761.0, 2.3333333333333335], [1785.0, 2.5], [1801.0, 1.0], [1849.0, 1.5], [1817.0, 2.25], [1809.0, 3.5], [1841.0, 3.0], [1833.0, 2.25], [1825.0, 3.0], [1905.0, 5.333333333333333], [1873.0, 3.0], [1913.0, 8.5], [1897.0, 2.0], [1889.0, 2.0], [1881.0, 2.0], [1857.0, 3.5], [1865.0, 2.0], [1969.0, 1.6666666666666667], [1977.0, 1.0], [1929.0, 2.4], [1921.0, 4.0], [1961.0, 2.2], [1953.0, 5.5], [1945.0, 1.6666666666666667], [1937.0, 5.333333333333333], [2041.0, 2.0], [2025.0, 1.6666666666666667], [2033.0, 1.8], [2017.0, 2.0], [1985.0, 2.0], [2009.0, 1.0], [2001.0, 3.6], [2098.0, 2.6666666666666665], [2066.0, 5.25], [2082.0, 1.3333333333333333], [2050.0, 2.0], [2114.0, 1.5], [2146.0, 6.333333333333333], [2130.0, 2.0], [2242.0, 2.0], [2274.0, 2.5], [2258.0, 2.5], [2178.0, 1.6666666666666667], [2194.0, 2.0], [2226.0, 2.0], [2210.0, 2.0], [2418.0, 2.0], [2402.0, 4.0], [2386.0, 2.5], [2370.0, 4.0], [2306.0, 12.2], [2322.0, 8.333333333333334], [2354.0, 5.25], [2338.0, 2.0], [2530.0, 4.333333333333333], [2546.0, 2.5], [2450.0, 3.75], [2434.0, 3.0], [2498.0, 1.0], [2482.0, 3.3333333333333335], [2466.0, 2.0], [2578.0, 2.6666666666666665], [2674.0, 2.0000000000000004], [2594.0, 10.5], [2562.0, 2.5], [2610.0, 2.0], [2642.0, 5.5], [2626.0, 3.0], [2706.0, 2.0], [2738.0, 8.125], [2690.0, 14.0], [2802.0, 2.5], [2786.0, 1.25], [2770.0, 1.5], [2930.0, 3.0], [2914.0, 2.1428571428571432], [2898.0, 2.0], [2882.0, 2.3333333333333335], [2834.0, 2.5], [2866.0, 2.0], [2962.0, 3.0], [3042.0, 2.0], [2946.0, 2.0], [3026.0, 4.0], [3010.0, 3.0], [2994.0, 2.2857142857142856], [2978.0, 3.0], [3170.0, 2.3333333333333335], [3186.0, 2.75], [3090.0, 1.6666666666666667], [3074.0, 1.5], [3154.0, 2.5], [3138.0, 1.5], [3122.0, 1.75], [3106.0, 2.0], [3314.0, 2.0], [3298.0, 2.0], [3282.0, 3.0], [3266.0, 1.4], [3202.0, 1.8], [3250.0, 2.0], [3234.0, 1.25], [3346.0, 2.0], [3394.0, 2.2857142857142856], [3378.0, 3.0], [3362.0, 2.25], [3330.0, 1.8], [3442.0, 5.0], [3426.0, 2.0], [3410.0, 5.0], [3570.0, 2.0], [3554.0, 2.0], [3538.0, 2.3333333333333335], [3506.0, 2.5], [3490.0, 3.0], [3474.0, 2.0], [3458.0, 5.0], [3698.0, 1.3333333333333333], [3666.0, 2.0], [3634.0, 3.0], [3602.0, 1.5], [3586.0, 2.0], [3826.0, 2.0], [3810.0, 3.0], [3794.0, 2.0], [3778.0, 4.333333333333333], [3762.0, 2.0], [3746.0, 2.0], [3842.0, 2.0], [3890.0, 2.0], [3874.0, 2.0], [3858.0, 1.5], [2099.0, 3.0], [2083.0, 2.0], [2051.0, 2.5], [2147.0, 2.3333333333333335], [2131.0, 2.125], [2195.0, 2.5], [2179.0, 1.5], [2259.0, 8.0], [2275.0, 2.75], [2291.0, 3.0], [2243.0, 1.3333333333333333], [2211.0, 2.0], [2419.0, 1.7142857142857144], [2387.0, 4.4], [2403.0, 2.75], [2323.0, 1.8333333333333335], [2307.0, 4.0], [2355.0, 3.0], [2371.0, 3.0], [2339.0, 2.6666666666666665], [2547.0, 14.0], [2435.0, 2.0], [2531.0, 3.0], [2515.0, 2.6666666666666665], [2483.0, 2.0], [2467.0, 1.75], [2611.0, 2.6666666666666665], [2595.0, 3.75], [2563.0, 3.0], [2643.0, 2.0], [2675.0, 2.5], [2659.0, 4.0], [2579.0, 3.0], [2627.0, 2.0], [2739.0, 3.25], [2707.0, 3.0], [2723.0, 2.75], [2691.0, 2.0], [2803.0, 2.0], [2755.0, 2.9], [2787.0, 2.8], [2931.0, 4.0], [2835.0, 3.0], [2899.0, 1.8], [2819.0, 3.0], [2867.0, 2.0], [2851.0, 2.0], [3043.0, 2.5], [3059.0, 9.0], [2963.0, 2.0], [2947.0, 2.75], [3027.0, 42.0], [3011.0, 2.2], [2995.0, 2.0], [2979.0, 2.5], [3091.0, 1.6666666666666667], [3187.0, 5.0], [3075.0, 1.5], [3171.0, 1.75], [3155.0, 2.0], [3139.0, 2.0], [3123.0, 2.0], [3107.0, 3.0], [3315.0, 2.0], [3299.0, 2.4285714285714284], [3283.0, 2.0], [3267.0, 1.6666666666666667], [3219.0, 4.800000000000001], [3251.0, 1.8333333333333335], [3235.0, 2.0], [3395.0, 2.0], [3363.0, 1.5], [3347.0, 3.0], [3331.0, 2.0], [3571.0, 1.6666666666666667], [3539.0, 2.0], [3523.0, 2.0], [3491.0, 1.0], [3459.0, 4.0], [3667.0, 2.0], [3699.0, 2.0], [3683.0, 2.25], [3635.0, 1.0], [3619.0, 2.0], [3603.0, 1.6666666666666667], [3827.0, 1.5], [3811.0, 4.0], [3795.0, 2.3333333333333335], [3763.0, 1.5], [3747.0, 3.0], [3731.0, 2.5], [3715.0, 2.0], [3875.0, 6.666666666666667], [3843.0, 2.0], [517.0, 5.0], [521.0, 4.25], [513.0, 6.5], [525.0, 3.0], [533.0, 3.0], [537.0, 5.0], [569.0, 8.5], [573.0, 1.75], [545.0, 205.14285714285714], [557.0, 3.0], [553.0, 3.0], [565.0, 14.833333333333334], [561.0, 1.5], [601.0, 39.5], [605.0, 5.0], [577.0, 3.0], [581.0, 6.5], [589.0, 1.0], [593.0, 3.5], [597.0, 5.5], [609.0, 3.0], [633.0, 20.0], [621.0, 2.0], [613.0, 2.8], [617.0, 1.6666666666666667], [625.0, 2.0], [629.0, 5.285714285714286], [637.0, 17.75], [665.0, 1.0], [669.0, 2.0], [645.0, 2.0], [653.0, 3.0], [661.0, 4.5], [657.0, 5.0], [697.0, 5.666666666666667], [701.0, 2.3333333333333335], [689.0, 4.0], [673.0, 7.571428571428571], [693.0, 2.5], [705.0, 1.5], [717.0, 2.0], [709.0, 6.75], [729.0, 1.5714285714285714], [725.0, 3.0], [721.0, 2.5], [733.0, 6.0], [737.0, 12.75], [765.0, 3.0], [749.0, 2.0], [745.0, 1.5], [753.0, 1.3333333333333333], [761.0, 2.0], [741.0, 8.333333333333334], [785.0, 5.0], [781.0, 5.333333333333333], [789.0, 5.0], [797.0, 2.3333333333333335], [793.0, 1.5], [769.0, 4.0], [773.0, 7.333333333333333], [801.0, 3.6666666666666665], [805.0, 3.25], [813.0, 2.75], [809.0, 1.3333333333333333], [817.0, 14.666666666666666], [821.0, 2.0], [829.0, 4.0], [825.0, 2.3333333333333335], [857.0, 4.5], [833.0, 4.0], [845.0, 54.25], [841.0, 3.0], [849.0, 2.5], [853.0, 2.5], [861.0, 3.5], [837.0, 8.0], [865.0, 4.285714285714286], [869.0, 2.4], [877.0, 9.166666666666666], [873.0, 6.0], [881.0, 8.0], [885.0, 2.5], [889.0, 4.0], [909.0, 3.8], [905.0, 4.0], [901.0, 2.0], [913.0, 5.0], [917.0, 3.0], [925.0, 10.0], [921.0, 4.25], [953.0, 3.6], [929.0, 6.333333333333334], [945.0, 7.0], [949.0, 1.0], [973.0, 3.3333333333333335], [965.0, 2.4], [969.0, 3.4], [961.0, 2.0], [977.0, 6.666666666666667], [981.0, 1.6666666666666667], [989.0, 3.4], [1017.0, 2.3333333333333335], [1021.0, 4.0], [1013.0, 7.0], [1009.0, 2.0], [993.0, 2.0], [997.0, 1.0], [1005.0, 3.25], [1001.0, 4.285714285714286], [1026.0, 3.0], [1034.0, 2.0], [1074.0, 7.0], [1058.0, 1.75], [1066.0, 5.333333333333333], [1082.0, 2.0], [1098.0, 4.8], [1146.0, 6.571428571428571], [1114.0, 1.75], [1106.0, 3.0], [1090.0, 1.0], [1122.0, 4.833333333333333], [1138.0, 2.5], [1154.0, 3.0], [1162.0, 2.3333333333333335], [1178.0, 1.5], [1202.0, 8.5], [1170.0, 5.0], [1194.0, 3.0], [1186.0, 3.6666666666666665], [1210.0, 2.0], [1266.0, 2.0], [1274.0, 2.75], [1234.0, 4.2], [1242.0, 6.0], [1258.0, 2.4], [1226.0, 2.5555555555555554], [1218.0, 2.0], [1330.0, 2.0], [1298.0, 3.5], [1314.0, 2.5], [1322.0, 2.6], [1338.0, 1.8], [1282.0, 3.6666666666666665], [1290.0, 2.4], [1306.0, 1.6666666666666667], [1370.0, 2.0], [1386.0, 2.0], [1362.0, 9.5], [1394.0, 2.0], [1402.0, 1.8333333333333335], [1378.0, 6.4], [1354.0, 2.0], [1346.0, 8.0], [1410.0, 1.6666666666666667], [1418.0, 3.25], [1426.0, 1.25], [1442.0, 4.2], [1450.0, 1.6666666666666667], [1466.0, 3.4285714285714284], [1458.0, 1.75], [1474.0, 2.0], [1482.0, 8.0], [1490.0, 2.0], [1498.0, 7.0], [1530.0, 8.5], [1514.0, 2.2], [1506.0, 2.0], [1586.0, 4.5], [1554.0, 2.0], [1562.0, 4.166666666666667], [1570.0, 3.0], [1578.0, 8.0], [1594.0, 3.0], [1546.0, 9.5], [1538.0, 7.0], [1650.0, 2.0], [1618.0, 1.5], [1626.0, 2.75], [1634.0, 2.0], [1642.0, 3.75], [1658.0, 2.0], [1610.0, 2.0], [1602.0, 2.0], [1714.0, 2.5], [1722.0, 2.3333333333333335], [1690.0, 1.4285714285714286], [1682.0, 1.3333333333333333], [1698.0, 12.357142857142858], [1706.0, 2.0], [1666.0, 10.5], [1674.0, 2.3333333333333335], [1738.0, 1.75], [1778.0, 3.0], [1746.0, 6.0], [1754.0, 2.25], [1730.0, 2.0], [1770.0, 2.6666666666666665], [1762.0, 3.8], [1786.0, 1.8333333333333335], [1850.0, 1.4], [1842.0, 7.2], [1834.0, 2.0], [1826.0, 2.0], [1794.0, 3.0], [1802.0, 2.0], [1818.0, 4.0], [1810.0, 2.0], [1858.0, 2.6666666666666665], [1914.0, 1.0], [1882.0, 2.6666666666666665], [1866.0, 2.0], [1874.0, 3.0], [1906.0, 5.8], [1898.0, 1.3333333333333333], [1890.0, 5.0], [1946.0, 1.6666666666666667], [1938.0, 2.0], [1970.0, 2.6666666666666665], [1922.0, 2.0], [1962.0, 2.0], [1954.0, 2.25], [2034.0, 2.0], [2042.0, 3.0], [1994.0, 2.5], [1986.0, 2.0], [2026.0, 1.75], [2018.0, 2.6666666666666665], [2010.0, 2.0], [2002.0, 2.5], [2068.0, 4.5], [2100.0, 3.808232684249448], [2084.0, 1.5], [2052.0, 2.0], [2164.0, 2.857142857142857], [2116.0, 17.8], [2132.0, 2.25], [2148.0, 2.0], [2228.0, 3.5], [2292.0, 2.0], [2212.0, 3.0], [2260.0, 3.6666666666666665], [2276.0, 2.6666666666666665], [2196.0, 2.0], [2180.0, 2.4], [2244.0, 1.5], [2420.0, 2.25], [2388.0, 4.5], [2404.0, 11.6], [2372.0, 3.0], [2308.0, 2.6], [2340.0, 3.0], [2484.0, 2.0], [2468.0, 1.5], [2516.0, 1.75], [2532.0, 2.3333333333333335], [2500.0, 1.6], [2436.0, 5.0], [2452.0, 11.6], [2564.0, 1.75], [2676.0, 3.3333333333333335], [2612.0, 2.0], [2596.0, 2.0], [2660.0, 3.0], [2644.0, 1.5], [2628.0, 2.5], [2708.0, 3.5], [2740.0, 2.333333333333333], [2724.0, 2.25], [2692.0, 2.0], [2804.0, 2.0], [2756.0, 1.8], [2772.0, 2.0], [2788.0, 3.3333333333333335], [2932.0, 2.5], [2916.0, 3.0], [2900.0, 2.3333333333333335], [2884.0, 2.0], [2820.0, 3.5], [2868.0, 6.75], [2852.0, 3.0], [2996.0, 2.0], [2980.0, 2.6666666666666665], [3060.0, 2.0], [3044.0, 2.0], [2964.0, 2.0], [2948.0, 2.0], [3028.0, 2.3333333333333335], [3012.0, 3.0], [3188.0, 3.2857142857142856], [3172.0, 3.0], [3156.0, 54.0], [3140.0, 13.0], [3076.0, 1.5], [3092.0, 1.75], [3124.0, 1.5], [3108.0, 2.0], [3204.0, 2.1666666666666665], [3220.0, 2.0], [3252.0, 3.0], [3236.0, 1.5], [3316.0, 2.2], [3300.0, 2.2], [3284.0, 1.75], [3268.0, 6.0], [3396.0, 2.5], [3380.0, 1.8333333333333335], [3364.0, 1.6666666666666667], [3348.0, 3.3333333333333335], [3332.0, 2.0], [3444.0, 5.6], [3412.0, 9.0], [3572.0, 2.0], [3540.0, 2.0], [3524.0, 6.0], [3492.0, 2.0], [3476.0, 2.0], [3460.0, 3.0], [3588.0, 2.4], [3700.0, 2.0], [3684.0, 2.0], [3636.0, 1.6666666666666667], [3620.0, 1.5], [3604.0, 2.5], [3828.0, 2.0], [3796.0, 4.0], [3780.0, 2.0], [3764.0, 2.0], [3748.0, 2.0], [3716.0, 1.6666666666666667], [3844.0, 1.0], [3892.0, 2.3333333333333335], [3876.0, 2.0], [3860.0, 3.0], [2069.0, 3.666666666666667], [2149.0, 2.3333333333333335], [2085.0, 1.3333333333333333], [2053.0, 3.0], [2101.0, 2.0], [2133.0, 2.0], [2117.0, 9.454545454545455], [2165.0, 4.5], [2277.0, 2.0], [2181.0, 4.0], [2293.0, 1.5], [2197.0, 1.3333333333333333], [2245.0, 2.0], [2229.0, 5.333333333333333], [2213.0, 4.0], [2357.0, 6.8], [2341.0, 2.5], [2421.0, 2.5], [2405.0, 1.0], [2309.0, 7.0], [2325.0, 2.2], [2389.0, 4.0], [2373.0, 2.6666666666666665], [2453.0, 2.0], [2549.0, 2.75], [2485.0, 3.0], [2469.0, 2.0], [2437.0, 3.5], [2533.0, 3.0], [2517.0, 1.5], [2501.0, 2.75], [2613.0, 1.5], [2629.0, 2.75], [2661.0, 4.0], [2645.0, 4.0], [2565.0, 1.75], [2581.0, 2.0], [2741.0, 3.5], [2725.0, 2.8], [2693.0, 2.6666666666666665], [2789.0, 2.5], [2773.0, 2.0], [2805.0, 4.0], [2917.0, 2.0], [2869.0, 3.6666666666666665], [2933.0, 2.0], [2837.0, 3.0], [2821.0, 2.6666666666666665], [2901.0, 2.6], [2853.0, 2.0], [3045.0, 2.0], [3061.0, 2.571428571428571], [2965.0, 1.5], [3029.0, 5.333333333333333], [3013.0, 2.0], [2997.0, 2.0], [2981.0, 2.5], [3189.0, 3.0], [3173.0, 2.0], [3141.0, 2.0], [3077.0, 1.5], [3125.0, 1.8], [3109.0, 3.3333333333333335], [3317.0, 1.7142857142857144], [3301.0, 2.3333333333333335], [3221.0, 9.166666666666666], [3269.0, 2.0], [3253.0, 2.0], [3237.0, 2.0], [3397.0, 1.6666666666666667], [3381.0, 1.5], [3365.0, 2.3333333333333335], [3349.0, 2.0], [3413.0, 5.0], [3541.0, 2.0], [3573.0, 2.0], [3557.0, 10.571428571428571], [3509.0, 3.0], [3493.0, 3.0], [3477.0, 2.0], [3701.0, 1.5], [3685.0, 1.75], [3669.0, 2.0], [3621.0, 2.0], [3605.0, 1.5], [3589.0, 2.5], [3829.0, 2.0], [3813.0, 2.3333333333333335], [3797.0, 2.0], [3781.0, 2.5], [3765.0, 2.25], [3733.0, 3.0], [3717.0, 2.0], [3893.0, 1.0], [3845.0, 2.0], [1043.0, 2.0], [1051.0, 13.0], [1059.0, 3.6666666666666665], [1067.0, 3.0], [1075.0, 3.833333333333333], [1035.0, 2.0], [1099.0, 14.0], [1091.0, 2.75], [1147.0, 8.0], [1115.0, 1.3333333333333333], [1107.0, 4.666666666666667], [1123.0, 5.0], [1131.0, 8.5], [1203.0, 2.833333333333333], [1163.0, 2.0], [1211.0, 2.25], [1155.0, 3.0], [1179.0, 2.0], [1171.0, 3.4], [1195.0, 4.666666666666666], [1187.0, 3.6666666666666665], [1243.0, 2.0], [1235.0, 2.0], [1259.0, 4.5], [1275.0, 2.0], [1267.0, 2.0], [1227.0, 2.0], [1219.0, 2.6666666666666665], [1283.0, 1.75], [1339.0, 2.0], [1307.0, 5.333333333333334], [1299.0, 4.0], [1291.0, 2.0], [1315.0, 2.0], [1323.0, 1.5], [1331.0, 3.0], [1355.0, 5.5], [1371.0, 2.6666666666666665], [1395.0, 1.25], [1387.0, 2.0], [1379.0, 3.5], [1435.0, 15.166666666666666], [1427.0, 2.0], [1411.0, 2.2], [1451.0, 7.0], [1467.0, 2.0], [1459.0, 2.0], [1419.0, 4.5], [1499.0, 6.333333333333333], [1475.0, 2.0], [1491.0, 7.0], [1531.0, 9.0], [1507.0, 2.25], [1515.0, 2.3333333333333335], [1483.0, 6.4], [1571.0, 7.5], [1595.0, 3.5], [1579.0, 5.0], [1539.0, 3.75], [1547.0, 4.0], [1563.0, 2.3333333333333335], [1555.0, 1.25], [1611.0, 1.6666666666666667], [1619.0, 1.5], [1627.0, 2.0], [1603.0, 1.3333333333333333], [1635.0, 1.6666666666666667], [1643.0, 1.4], [1659.0, 2.375], [1651.0, 1.5], [1715.0, 5.333333333333333], [1699.0, 8.0], [1707.0, 2.0], [1723.0, 2.6], [1667.0, 2.0], [1675.0, 3.5], [1691.0, 1.25], [1683.0, 2.0], [1739.0, 3.0], [1779.0, 3.8333333333333335], [1747.0, 2.3333333333333335], [1755.0, 2.0], [1771.0, 7.0], [1763.0, 8.0], [1787.0, 2.5], [1851.0, 2.0], [1843.0, 3.25], [1835.0, 2.3333333333333335], [1827.0, 2.4], [1795.0, 4.0], [1803.0, 2.0], [1819.0, 6.333333333333334], [1811.0, 3.0], [1867.0, 4.8], [1915.0, 1.8571428571428572], [1859.0, 6.0], [1883.0, 1.5], [1907.0, 5.25], [1899.0, 2.0], [1891.0, 4.0], [1931.0, 3.0], [1971.0, 2.0], [1923.0, 3.0], [1963.0, 1.5], [1955.0, 1.75], [1947.0, 1.5], [1939.0, 2.0], [2035.0, 1.5], [2043.0, 14.714285714285714], [1995.0, 2.5], [1987.0, 2.5], [2027.0, 1.75], [2019.0, 2.25], [2011.0, 1.0], [2003.0, 2.0], [2070.0, 1.6666666666666667], [2086.0, 2.1428571428571432], [2054.0, 8.333333333333334], [2102.0, 2.0], [2166.0, 6.333333333333333], [2150.0, 1.6666666666666667], [2278.0, 2.3333333333333335], [2214.0, 7.5], [2294.0, 3.0], [2262.0, 20.2], [2246.0, 3.0], [2182.0, 3.0], [2198.0, 2.0], [2230.0, 1.5], [2422.0, 3.5], [2342.0, 3.375], [2374.0, 2.5], [2406.0, 2.25], [2326.0, 2.25], [2310.0, 2.0], [2390.0, 2.0], [2550.0, 2.0], [2534.0, 3.5], [2518.0, 2.6], [2502.0, 2.0], [2438.0, 2.0], [2454.0, 2.0], [2486.0, 2.0], [2470.0, 2.0], [2678.0, 2.8], [2582.0, 2.0], [2630.0, 2.333333333333333], [2662.0, 1.8], [2646.0, 2.3333333333333335], [2566.0, 2.5], [2614.0, 3.0], [2742.0, 5.8], [2726.0, 2.5], [2694.0, 4.25], [2806.0, 4.166666666666666], [2758.0, 2.0], [2774.0, 3.3333333333333335], [2790.0, 3.0], [2934.0, 1.8], [2918.0, 2.5], [2902.0, 2.0], [2886.0, 3.2], [2822.0, 3.8], [2838.0, 2.0], [2870.0, 2.3333333333333335], [2854.0, 10.75], [3046.0, 1.6666666666666665], [3062.0, 2.5], [2966.0, 2.5], [2950.0, 4.333333333333333], [3030.0, 3.6666666666666665], [3014.0, 2.5], [2998.0, 1.75], [2982.0, 3.0], [3190.0, 2.6], [3174.0, 1.25], [3158.0, 3.3], [3142.0, 2.25], [3078.0, 2.0], [3094.0, 3.0], [3126.0, 1.857142857142857], [3270.0, 3.0], [3222.0, 2.0], [3206.0, 2.5], [3286.0, 2.0], [3254.0, 1.6], [3238.0, 2.0], [3382.0, 1.5714285714285714], [3366.0, 1.6], [3350.0, 2.0], [3446.0, 6.0], [3414.0, 11.5], [3574.0, 2.0], [3542.0, 2.0], [3510.0, 2.0], [3494.0, 2.0], [3702.0, 2.0], [3686.0, 3.0], [3670.0, 2.0], [3638.0, 2.0], [3622.0, 2.6666666666666665], [3606.0, 2.6666666666666665], [3590.0, 2.6666666666666665], [3830.0, 2.0], [3814.0, 5.0], [3766.0, 2.0], [3750.0, 2.0], [3734.0, 3.3333333333333335], [3718.0, 1.0], [3878.0, 3.0], [3846.0, 3.0], [2103.0, 1.75], [2071.0, 1.0], [2087.0, 2.0], [2055.0, 2.2], [2167.0, 8.833333333333334], [2151.0, 1.6666666666666667], [2135.0, 5.0], [2295.0, 5.333333333333333], [2279.0, 2.0], [2247.0, 4.666666666666667], [2183.0, 2.0], [2199.0, 2.0], [2231.0, 1.5], [2215.0, 2.0], [2407.0, 4.0], [2311.0, 2.0], [2423.0, 2.0], [2327.0, 2.5], [2391.0, 2.5], [2375.0, 2.0], [2359.0, 15.75], [2343.0, 3.6666666666666665], [2535.0, 2.0], [2551.0, 2.0], [2455.0, 4.4], [2439.0, 1.5], [2519.0, 2.0], [2503.0, 6.0], [2487.0, 3.3333333333333335], [2471.0, 2.4], [2663.0, 3.0], [2679.0, 1.8], [2583.0, 2.0], [2567.0, 4.0], [2647.0, 2.5], [2631.0, 2.0], [2615.0, 2.25], [2599.0, 32.333333333333336], [2711.0, 2.75], [2743.0, 3.0], [2791.0, 4.2], [2695.0, 2.0], [2759.0, 2.0], [2807.0, 9.25], [2823.0, 15.0], [2855.0, 2.2], [2919.0, 2.0], [2839.0, 3.0], [2903.0, 4.5], [2887.0, 9.0], [3063.0, 3.6666666666666665], [3047.0, 2.75], [3031.0, 2.3333333333333335], [3015.0, 1.5], [2951.0, 2.6666666666666665], [2967.0, 3.5], [2999.0, 3.0], [2983.0, 3.1428571428571432], [3079.0, 2.0], [3191.0, 2.0], [3127.0, 2.25], [3111.0, 2.3333333333333335], [3175.0, 2.0], [3159.0, 2.0], [3143.0, 3.0], [3223.0, 2.5], [3319.0, 2.5], [3207.0, 2.4], [3255.0, 2.0], [3239.0, 1.8], [3303.0, 8.2], [3287.0, 2.0], [3271.0, 2.5], [3351.0, 2.5], [3335.0, 46.0], [3399.0, 2.5], [3383.0, 1.25], [3367.0, 2.4], [3447.0, 4.0], [3431.0, 3.0], [3415.0, 5.0], [3479.0, 5.833333333333333], [3575.0, 3.0], [3559.0, 1.0], [3543.0, 2.3333333333333335], [3511.0, 2.142857142857143], [3495.0, 2.0], [3463.0, 2.5], [3703.0, 1.6666666666666667], [3687.0, 3.0], [3671.0, 2.0], [3639.0, 1.5], [3623.0, 2.0], [3735.0, 2.0], [3831.0, 1.0], [3799.0, 2.0], [3783.0, 4.0], [3751.0, 2.6666666666666665], [3719.0, 2.3333333333333335], [3895.0, 3.0], [3879.0, 1.5], [267.0, 157.2], [265.0, 141.5], [257.0, 22.0], [263.0, 59.66666666666667], [285.0, 5.0], [277.0, 3.75], [275.0, 43.25], [283.0, 2.0], [281.0, 3.6], [279.0, 3.5], [303.0, 3.0], [301.0, 8.5], [299.0, 2.0], [297.0, 4.0], [295.0, 4.5], [289.0, 12.5], [291.0, 6.6], [293.0, 7.0], [319.0, 87.0], [313.0, 2.6666666666666665], [311.0, 2.5], [307.0, 2.3333333333333335], [305.0, 3.0], [309.0, 5.0], [333.0, 381.0], [335.0, 108.16666666666666], [321.0, 46.0], [323.0, 172.0], [327.0, 140.0], [331.0, 12.0], [341.0, 4.5], [351.0, 2.0], [349.0, 2.5], [347.0, 4.0], [343.0, 3.0], [353.0, 3.0], [355.0, 2.6666666666666665], [359.0, 3.0], [357.0, 2.0], [367.0, 3.0], [365.0, 2.833333333333333], [363.0, 3.0], [361.0, 2.0], [369.0, 2.0], [377.0, 16.714285714285715], [379.0, 22.0], [375.0, 26.0], [373.0, 2.3333333333333335], [399.0, 3.0], [387.0, 6.0], [395.0, 5.0], [393.0, 5.0], [391.0, 5.5], [385.0, 44.6], [389.0, 5.0], [405.0, 5.0], [403.0, 2.5], [401.0, 2.0], [415.0, 2.0], [409.0, 2.0], [413.0, 3.0], [431.0, 10.0], [429.0, 15.0], [427.0, 8.0], [425.0, 6.5], [423.0, 7.333333333333333], [417.0, 2.3333333333333335], [419.0, 2.4], [421.0, 2.0], [435.0, 4.0], [433.0, 14.125], [447.0, 2.25], [445.0, 4.333333333333334], [441.0, 2.5], [439.0, 3.6666666666666665], [437.0, 5.0], [451.0, 2.0], [455.0, 2.6666666666666665], [457.0, 4.4], [461.0, 3.6666666666666665], [459.0, 4.5], [449.0, 4.0], [479.0, 4.666666666666667], [477.0, 9.0], [475.0, 10.5], [473.0, 4.0], [465.0, 4.0], [467.0, 1.3333333333333333], [469.0, 5.0], [495.0, 3.0], [493.0, 2.3333333333333335], [491.0, 4.0], [489.0, 2.3333333333333335], [487.0, 3.0], [483.0, 2.5], [485.0, 3.5], [499.0, 2.5], [509.0, 2.8], [497.0, 2.0], [507.0, 5.0], [505.0, 4.0], [503.0, 3.6666666666666665], [501.0, 2.6666666666666665], [526.0, 4.5], [514.0, 2.0], [542.0, 355.0], [538.0, 4.5], [518.0, 6.6], [574.0, 6.666666666666666], [570.0, 2.0], [550.0, 4.0], [558.0, 1.5], [566.0, 2.75], [562.0, 3.8], [578.0, 3.5], [582.0, 5.0], [590.0, 15.666666666666666], [586.0, 13.857142857142856], [594.0, 5.000000000000001], [602.0, 8.333333333333334], [598.0, 10.0], [610.0, 3.0], [622.0, 3.5], [614.0, 4.0], [618.0, 2.333333333333334], [626.0, 3.5], [630.0, 4.333333333333333], [638.0, 2.0], [634.0, 2.5], [670.0, 4.4], [666.0, 2.0], [658.0, 11.4], [646.0, 2.0], [642.0, 2.0], [650.0, 21.0], [662.0, 6.25], [702.0, 1.0], [698.0, 2.6666666666666665], [690.0, 2.0], [686.0, 3.0], [682.0, 10.0], [674.0, 9.0], [694.0, 5.0], [706.0, 3.0], [730.0, 2.0], [734.0, 6.0], [714.0, 6.0], [710.0, 15.5], [726.0, 8.666666666666666], [762.0, 4.0], [738.0, 5.0], [750.0, 1.2], [746.0, 1.5], [754.0, 2.3333333333333335], [758.0, 3.2], [766.0, 1.3333333333333333], [742.0, 10.0], [794.0, 1.0], [798.0, 2.3333333333333335], [778.0, 2.0], [782.0, 5.5], [786.0, 7.0], [790.0, 9.0], [770.0, 2.0], [774.0, 1.3333333333333333], [802.0, 3.0], [806.0, 5.0], [814.0, 2.0], [810.0, 1.8], [818.0, 2.0], [822.0, 2.5], [826.0, 2.0], [858.0, 2.25], [834.0, 6.4], [846.0, 21.2], [842.0, 2.0], [850.0, 3.0], [854.0, 2.0], [862.0, 1.0], [838.0, 2.0], [870.0, 3.0], [890.0, 1.0], [874.0, 2.5], [878.0, 8.0], [882.0, 7.75], [886.0, 2.0], [898.0, 8.0], [902.0, 2.0], [910.0, 6.0], [926.0, 6.0], [914.0, 9.2], [922.0, 12.0], [930.0, 9.0], [954.0, 4.0], [942.0, 4.0], [938.0, 2.0], [958.0, 15.428571428571429], [946.0, 9.0], [934.0, 2.0], [950.0, 3.5], [966.0, 6.0], [990.0, 4.0], [974.0, 9.0], [970.0, 4.5], [962.0, 1.5], [982.0, 2.25], [978.0, 3.75], [986.0, 3.0], [1010.0, 1.3333333333333333], [1014.0, 4.4], [994.0, 2.25], [998.0, 4.0], [1018.0, 5.714285714285714], [1022.0, 4.333333333333333], [1006.0, 2.0], [1002.0, 2.6666666666666665], [1028.0, 3.0], [1036.0, 2.6666666666666665], [1044.0, 2.3333333333333335], [1052.0, 5.285714285714286], [1060.0, 3.0], [1068.0, 9.0], [1084.0, 8.5], [1076.0, 9.333333333333334], [1092.0, 2.75], [1108.0, 5.0], [1116.0, 3.0], [1124.0, 4.0], [1148.0, 3.0], [1100.0, 3.25], [1156.0, 3.7500000000000004], [1164.0, 1.6666666666666667], [1180.0, 2.6666666666666665], [1204.0, 2.6666666666666665], [1172.0, 2.0], [1188.0, 3.5], [1212.0, 2.5], [1268.0, 2.3333333333333335], [1244.0, 2.0], [1236.0, 2.0], [1252.0, 68.10000000000001], [1260.0, 3.0], [1276.0, 2.0], [1228.0, 3.0], [1220.0, 2.0], [1300.0, 5.714285714285714], [1332.0, 5.333333333333333], [1316.0, 11.0], [1340.0, 2.0], [1292.0, 1.5], [1308.0, 4.5], [1388.0, 4.0], [1404.0, 2.0], [1380.0, 5.0], [1396.0, 2.0], [1356.0, 4.0], [1348.0, 1.75], [1436.0, 12.0], [1412.0, 2.3333333333333335], [1428.0, 1.3333333333333333], [1444.0, 7.6], [1452.0, 3.3333333333333335], [1460.0, 2.6666666666666665], [1420.0, 3.0], [1484.0, 6.5], [1492.0, 4.5], [1476.0, 1.0], [1516.0, 2.0], [1532.0, 7.875], [1564.0, 1.5], [1556.0, 2.0], [1596.0, 3.0], [1572.0, 2.0], [1588.0, 2.3333333333333335], [1548.0, 4.5], [1540.0, 1.75], [1580.0, 3.142857142857143], [1628.0, 2.6], [1612.0, 1.6666666666666667], [1620.0, 3.0], [1636.0, 1.6], [1660.0, 2.0], [1652.0, 3.0], [1604.0, 1.5], [1644.0, 2.0], [1692.0, 2.0], [1700.0, 6.25], [1708.0, 1.5], [1668.0, 5.5], [1716.0, 3.5], [1724.0, 3.0], [1732.0, 4.0], [1740.0, 2.0], [1748.0, 3.75], [1756.0, 1.8], [1772.0, 4.75], [1764.0, 6.666666666666667], [1788.0, 3.0], [1780.0, 4.166666666666666], [1804.0, 2.0], [1812.0, 3.0], [1852.0, 1.6666666666666667], [1796.0, 2.0], [1836.0, 3.0], [1828.0, 2.5], [1820.0, 4.0], [1916.0, 1.5], [1908.0, 1.5], [1892.0, 2.0], [1884.0, 2.0], [1868.0, 2.0], [1876.0, 4.0], [1980.0, 4.2727272727272725], [1972.0, 2.0], [1964.0, 2.3333333333333335], [1956.0, 2.5], [1948.0, 3.0], [1924.0, 2.0], [1932.0, 1.0], [1940.0, 2.0], [2036.0, 1.0], [2004.0, 2.0], [2044.0, 3.5], [1996.0, 5.333333333333334], [2028.0, 1.6666666666666667], [2020.0, 2.0], [2012.0, 2.0], [2104.0, 1.8], [2056.0, 1.6], [2088.0, 2.3333333333333335], [2168.0, 2.6666666666666665], [2136.0, 2.0], [2120.0, 3.0], [2152.0, 2.0], [2184.0, 1.6666666666666667], [2280.0, 2.0], [2216.0, 2.3333333333333335], [2232.0, 2.3333333333333335], [2248.0, 2.3333333333333335], [2296.0, 4.0], [2200.0, 2.25], [2328.0, 2.0], [2424.0, 2.0], [2312.0, 2.333333333333333], [2408.0, 3.5], [2392.0, 2.0], [2376.0, 2.5], [2360.0, 4.0], [2344.0, 3.0], [2552.0, 1.8], [2536.0, 3.0], [2520.0, 2.0], [2504.0, 3.0], [2488.0, 2.5], [2440.0, 2.3333333333333335], [2456.0, 12.0], [2472.0, 1.3333333333333333], [2680.0, 2.5], [2648.0, 2.0], [2632.0, 3.0], [2584.0, 2.0], [2568.0, 1.0], [2712.0, 1.8], [2728.0, 6.666666666666667], [2696.0, 4.666666666666667], [2792.0, 2.0], [2760.0, 1.3333333333333333], [2808.0, 2.0], [2936.0, 8.6], [2920.0, 2.4], [2904.0, 9.0], [2872.0, 5.571428571428571], [2824.0, 9.428571428571429], [2840.0, 2.0], [2856.0, 3.0], [3048.0, 3.0], [3064.0, 5.5], [3000.0, 3.0], [3032.0, 1.6666666666666667], [2968.0, 1.5], [2952.0, 1.6], [3016.0, 2.142857142857143], [2984.0, 9.0], [3096.0, 2.6999999999999997], [3112.0, 3.0], [3128.0, 1.75], [3080.0, 2.0], [3192.0, 1.0], [3176.0, 2.285714285714286], [3160.0, 1.5], [3144.0, 2.8], [3320.0, 1.2], [3304.0, 3.6666666666666665], [3288.0, 3.3333333333333335], [3272.0, 1.8333333333333335], [3224.0, 2.0], [3208.0, 2.3333333333333335], [3240.0, 1.6666666666666667], [3400.0, 3.8615079926439377], [3384.0, 11.666666666666666], [3368.0, 1.8], [3352.0, 2.0], [3336.0, 73.33333333333333], [3416.0, 7.0], [3560.0, 2.333333333333333], [3544.0, 1.5], [3528.0, 2.0], [3496.0, 2.0], [3672.0, 2.0], [3656.0, 6.166666666666667], [3640.0, 2.0], [3624.0, 2.0], [3608.0, 2.0], [3592.0, 2.0], [3752.0, 2.3333333333333335], [3816.0, 3.0], [3800.0, 3.0], [3784.0, 4.5], [3768.0, 5.0], [3736.0, 2.75], [3720.0, 3.0], [3896.0, 2.75], [3880.0, 1.0], [3864.0, 18.0], [3848.0, 3.0], [2057.0, 1.6666666666666667], [2089.0, 2.6], [2073.0, 1.5], [2105.0, 2.0], [2121.0, 2.5], [2137.0, 2.4285714285714284], [2153.0, 2.4], [2249.0, 3.5], [2297.0, 2.25], [2265.0, 20.857142857142858], [2233.0, 2.3333333333333335], [2185.0, 1.5], [2201.0, 1.5], [2217.0, 2.3333333333333335], [2425.0, 1.0], [2409.0, 8.0], [2393.0, 1.3333333333333333], [2377.0, 2.0], [2361.0, 2.6], [2313.0, 3.0], [2329.0, 2.0], [2345.0, 2.5], [2457.0, 10.11111111111111], [2537.0, 3.0], [2473.0, 2.0], [2489.0, 2.0], [2441.0, 1.6666666666666667], [2521.0, 2.25], [2505.0, 3.5], [2665.0, 2.6666666666666665], [2681.0, 7.0], [2585.0, 2.0], [2649.0, 4.5], [2633.0, 4.0], [2617.0, 3.666666666666667], [2601.0, 3.75], [2713.0, 2.0], [2745.0, 3.25], [2729.0, 3.666666666666667], [2697.0, 5.0], [2793.0, 1.4], [2809.0, 2.0], [2761.0, 2.0], [2777.0, 1.6666666666666667], [2937.0, 2.0], [2921.0, 1.5], [2905.0, 3.2], [2889.0, 8.25], [2873.0, 2.0], [2825.0, 3.0], [2841.0, 2.0], [2857.0, 1.5], [3065.0, 3.0], [3049.0, 3.0], [3033.0, 2.0], [3001.0, 3.0], [2953.0, 1.3333333333333333], [2969.0, 2.5], [2985.0, 2.0], [3193.0, 1.5], [3177.0, 1.0], [3161.0, 2.5], [3145.0, 3.0], [3129.0, 1.0], [3081.0, 1.6666666666666667], [3097.0, 2.0], [3113.0, 2.25], [3321.0, 2.375], [3305.0, 2.0], [3289.0, 2.0], [3273.0, 2.0], [3257.0, 3.25], [3225.0, 5.0], [3241.0, 2.166666666666667], [3385.0, 2.0], [3369.0, 1.0], [3353.0, 2.2], [3337.0, 3.230769230769231], [3449.0, 8.5], [3433.0, 2.5], [3417.0, 4.25], [3545.0, 1.0], [3529.0, 2.0], [3513.0, 8.25], [3465.0, 2.6666666666666665], [3705.0, 5.0], [3689.0, 2.0], [3673.0, 1.5], [3625.0, 2.0], [3609.0, 3.0], [3593.0, 2.0], [3721.0, 2.25], [3801.0, 2.0], [3785.0, 10.0], [3769.0, 4.0], [3737.0, 2.0], [3897.0, 2.5], [3881.0, 1.5], [3865.0, 2.0], [3849.0, 1.5], [1077.0, 3.75], [1045.0, 4.25], [1061.0, 5.0], [1069.0, 4.4], [1085.0, 8.0], [1053.0, 3.0], [1029.0, 4.0], [1037.0, 6.166666666666666], [1093.0, 2.0], [1101.0, 5.833333333333334], [1109.0, 3.0], [1125.0, 3.0], [1133.0, 5.25], [1149.0, 2.25], [1141.0, 223.0], [1157.0, 4.5], [1165.0, 9.0], [1181.0, 2.0], [1189.0, 1.5], [1197.0, 2.0], [1213.0, 5.833333333333334], [1205.0, 6.5], [1277.0, 3.0], [1253.0, 59.22222222222222], [1269.0, 5.5], [1229.0, 2.0], [1221.0, 4.0], [1261.0, 3.0], [1285.0, 3.5], [1293.0, 2.0], [1309.0, 3.0], [1317.0, 2.0], [1325.0, 2.5], [1341.0, 3.0], [1333.0, 12.0], [1373.0, 9.75], [1365.0, 5.333333333333333], [1389.0, 9.25], [1405.0, 4.5], [1357.0, 2.75], [1349.0, 3.0], [1381.0, 2.8], [1437.0, 15.0], [1429.0, 2.0], [1413.0, 2.0], [1469.0, 3.0], [1445.0, 3.0], [1453.0, 2.5], [1461.0, 1.6666666666666667], [1421.0, 9.333333333333334], [1501.0, 4.0], [1477.0, 4.5], [1509.0, 2.0], [1533.0, 4.666666666666667], [1525.0, 19.5], [1485.0, 3.8], [1597.0, 1.5], [1573.0, 2.5], [1589.0, 3.0], [1541.0, 2.3333333333333335], [1549.0, 3.25], [1565.0, 1.5], [1557.0, 1.6666666666666667], [1581.0, 2.0], [1653.0, 2.5714285714285716], [1605.0, 2.0], [1621.0, 7.0], [1629.0, 2.0], [1637.0, 2.0], [1645.0, 1.9999999999999998], [1661.0, 1.5], [1613.0, 4.2], [1725.0, 6.0], [1701.0, 4.0], [1717.0, 3.0], [1693.0, 2.25], [1669.0, 5.0], [1677.0, 4.6], [1685.0, 3.0], [1709.0, 1.5], [1757.0, 1.0], [1749.0, 1.6666666666666667], [1741.0, 1.8], [1733.0, 4.125], [1773.0, 5.0], [1765.0, 4.8], [1781.0, 3.3333333333333335], [1797.0, 2.0], [1805.0, 1.8333333333333335], [1821.0, 1.0], [1813.0, 6.0], [1853.0, 2.0], [1845.0, 2.0], [1837.0, 1.0], [1829.0, 4.0], [1909.0, 2.0], [1901.0, 2.0], [1893.0, 1.0], [1861.0, 2.0], [1869.0, 1.6666666666666667], [1877.0, 3.2857142857142856], [1981.0, 2.0], [1957.0, 2.0], [1973.0, 2.3333333333333335], [1933.0, 1.6666666666666667], [1965.0, 3.0], [1949.0, 8.5], [1941.0, 2.5], [2045.0, 2.5], [2021.0, 2.5], [2037.0, 1.6], [2029.0, 2.5], [2013.0, 3.5], [1997.0, 12.333333333333334], [2005.0, 3.0], [2074.0, 2.0], [2106.0, 2.0], [2154.0, 2.0], [2170.0, 3.2], [2122.0, 1.6666666666666667], [2138.0, 3.0], [2282.0, 3.2], [2202.0, 3.3333333333333335], [2298.0, 2.3333333333333335], [2250.0, 3.0], [2234.0, 2.0], [2186.0, 2.0], [2218.0, 3.0], [2426.0, 4.0], [2410.0, 8.0], [2394.0, 1.4], [2378.0, 2.0], [2362.0, 10.5], [2314.0, 5.666666666666667], [2330.0, 3.0], [2346.0, 2.3333333333333335], [2458.0, 1.75], [2442.0, 2.0], [2554.0, 3.3333333333333335], [2538.0, 3.0], [2522.0, 2.0], [2490.0, 3.6666666666666665], [2474.0, 4.0], [2618.0, 2.0], [2602.0, 3.75], [2570.0, 2.2], [2682.0, 4.5], [2666.0, 3.0], [2586.0, 1.8333333333333335], [2650.0, 6.0], [2634.0, 6.25], [2698.0, 2.75], [2746.0, 2.0], [2730.0, 3.0], [2794.0, 3.0], [2762.0, 1.75], [2778.0, 1.6666666666666667], [2938.0, 2.0], [2922.0, 2.0], [2906.0, 4.0], [2890.0, 4.0], [2874.0, 2.5], [2842.0, 3.0], [2858.0, 2.0], [3050.0, 2.0], [3066.0, 2.4285714285714284], [2970.0, 2.25], [2954.0, 2.0], [3034.0, 3.6666666666666665], [3018.0, 12.222222222222221], [3002.0, 2.0], [2986.0, 2.0], [3098.0, 1.6666666666666667], [3194.0, 3.0], [3082.0, 1.4], [3162.0, 2.4], [3146.0, 3.0], [3130.0, 1.5], [3114.0, 2.3333333333333335], [3322.0, 2.0], [3306.0, 2.3333333333333335], [3290.0, 1.0], [3274.0, 4.0], [3258.0, 1.75], [3226.0, 3.0], [3210.0, 1.8333333333333335], [3242.0, 1.9999999999999998], [3386.0, 2.0], [3370.0, 1.6666666666666667], [3354.0, 2.0], [3338.0, 1.6666666666666667], [3450.0, 8.5], [3418.0, 3.0], [3402.0, 2.0], [3578.0, 2.3333333333333335], [3546.0, 2.0], [3530.0, 3.0], [3514.0, 3.5], [3498.0, 2.0], [3482.0, 9.0], [3466.0, 2.6666666666666665], [3674.0, 2.0], [3642.0, 1.6666666666666667], [3626.0, 2.6666666666666665], [3610.0, 2.5], [3594.0, 2.0], [3802.0, 2.0], [3786.0, 7.25], [3770.0, 2.0], [3754.0, 2.0], [3722.0, 1.0], [3898.0, 3.0], [3882.0, 2.0], [3866.0, 2.0], [3850.0, 1.5], [2059.0, 2.0], [2091.0, 7.8], [2075.0, 1.3333333333333333], [2107.0, 2.0], [2171.0, 1.5], [2139.0, 2.0], [2203.0, 3.0], [2299.0, 3.6666666666666665], [2187.0, 1.5], [2267.0, 2.0], [2251.0, 1.6666666666666667], [2235.0, 2.0], [2219.0, 2.0], [2411.0, 2.833333333333333], [2427.0, 3.2], [2331.0, 2.3333333333333335], [2315.0, 12.5], [2395.0, 2.0], [2379.0, 2.6666666666666665], [2347.0, 1.5], [2443.0, 1.0], [2491.0, 2.6666666666666665], [2459.0, 1.5], [2507.0, 4.666666666666667], [2523.0, 2.75], [2555.0, 9.666666666666666], [2539.0, 2.0], [2475.0, 2.142857142857143], [2571.0, 2.0], [2683.0, 3.0], [2603.0, 1.0], [2619.0, 1.75], [2667.0, 2.8], [2651.0, 5.333333333333333], [2635.0, 4.0], [2715.0, 2.5], [2747.0, 2.5], [2731.0, 3.0], [2699.0, 2.25], [2795.0, 1.3333333333333333], [2811.0, 60.0], [2779.0, 1.5], [2763.0, 2.6666666666666665], [2923.0, 2.5], [2939.0, 2.3333333333333335], [2843.0, 2.6666666666666665], [2907.0, 2.666666666666667], [2891.0, 5.0], [2875.0, 2.0], [2827.0, 3.0], [2859.0, 2.0], [3051.0, 2.2], [3067.0, 2.3333333333333335], [2971.0, 2.3333333333333335], [2955.0, 3.0], [3035.0, 3.0], [3019.0, 2.0], [3003.0, 2.0], [2987.0, 2.3333333333333335], [3083.0, 1.5], [3195.0, 1.5], [3179.0, 2.3333333333333335], [3147.0, 2.0], [3131.0, 2.0], [3115.0, 2.75], [3323.0, 1.75], [3307.0, 2.0], [3291.0, 1.75], [3275.0, 2.2857142857142856], [3259.0, 2.6666666666666665], [3211.0, 2.0], [3227.0, 1.6666666666666665], [3243.0, 2.0], [3387.0, 2.0], [3371.0, 2.5], [3339.0, 2.2], [3419.0, 2.3333333333333335], [3579.0, 2.0], [3547.0, 2.5], [3531.0, 2.0], [3515.0, 2.3333333333333335], [3499.0, 3.0], [3483.0, 10.999999999999998], [3467.0, 2.0], [3691.0, 3.5], [3659.0, 35.23076923076923], [3643.0, 2.0], [3611.0, 2.0], [3595.0, 2.0], [3835.0, 4.0], [3803.0, 2.0], [3787.0, 2.0], [3771.0, 2.0], [3755.0, 1.5], [3739.0, 2.5], [3723.0, 2.0], [3883.0, 1.75], [3867.0, 2.0], [3851.0, 1.75], [3899.0, 12.25], [515.0, 2.0], [543.0, 4.333333333333333], [539.0, 6.0], [519.0, 4.666666666666667], [571.0, 2.5], [551.0, 2.0], [575.0, 2.5], [547.0, 4.0], [559.0, 7.25], [555.0, 14.5], [567.0, 4.333333333333333], [563.0, 2.0], [579.0, 3.0], [587.0, 3.0], [607.0, 8.5], [603.0, 3.0], [583.0, 6.0], [599.0, 9.5], [623.0, 2.5], [611.0, 8.333333333333334], [619.0, 1.5], [639.0, 8.75], [627.0, 3.5], [631.0, 6.5], [635.0, 1.5], [667.0, 2.5], [647.0, 3.0], [663.0, 1.6666666666666667], [671.0, 2.0], [655.0, 2.0], [651.0, 2.0], [659.0, 4.333333333333333], [703.0, 2.5], [691.0, 2.0], [699.0, 3.0], [675.0, 4.666666666666667], [687.0, 3.0], [683.0, 9.0], [695.0, 5.0], [707.0, 3.0], [715.0, 2.0], [711.0, 15.0], [723.0, 10.857142857142858], [727.0, 2.0], [735.0, 3.0], [731.0, 2.0], [739.0, 7.333333333333333], [747.0, 1.75], [755.0, 1.5], [767.0, 3.0], [763.0, 3.0], [743.0, 12.0], [799.0, 1.3333333333333333], [779.0, 3.0], [787.0, 10.0], [791.0, 2.0], [795.0, 5.0], [783.0, 3.0], [771.0, 3.0], [775.0, 2.3333333333333335], [803.0, 2.0], [807.0, 1.6666666666666667], [815.0, 3.0], [811.0, 3.25], [819.0, 3.0], [823.0, 2.0], [831.0, 7.5], [827.0, 5.5], [835.0, 8.75], [843.0, 8.0], [863.0, 7.5], [851.0, 5.8], [855.0, 2.0], [859.0, 3.0], [839.0, 1.6666666666666667], [867.0, 18.75], [871.0, 2.6], [875.0, 3.5], [879.0, 2.5], [883.0, 14.0], [887.0, 3.0], [895.0, 7.777777777777778], [903.0, 2.0], [911.0, 7.0], [907.0, 2.0], [899.0, 5.0], [927.0, 26.0], [915.0, 1.6666666666666667], [919.0, 4.0], [923.0, 6.0], [943.0, 3.25], [931.0, 5.25], [939.0, 3.0], [959.0, 3.25], [947.0, 2.0], [955.0, 3.0], [935.0, 2.0], [951.0, 3.0], [963.0, 4.333333333333333], [967.0, 4.5], [975.0, 5.333333333333334], [979.0, 2.0], [983.0, 1.8], [991.0, 4.5], [987.0, 2.0], [995.0, 2.3333333333333335], [1015.0, 2.0], [1007.0, 4.5], [1023.0, 3.0], [1003.0, 3.75], [1030.0, 4.0], [1038.0, 3.666666666666667], [1046.0, 4.0], [1054.0, 4.333333333333334], [1086.0, 4.0], [1062.0, 2.5], [1070.0, 12.5], [1078.0, 4.25], [1118.0, 4.333333333333334], [1110.0, 4.666666666666667], [1126.0, 2.5], [1134.0, 2.5555555555555554], [1150.0, 1.6666666666666667], [1142.0, 1.5], [1102.0, 1.0], [1166.0, 8.8], [1158.0, 3.0], [1206.0, 13.5], [1182.0, 2.0], [1174.0, 3.4], [1190.0, 2.0], [1198.0, 2.0], [1214.0, 2.6666666666666665], [1270.0, 3.6666666666666665], [1238.0, 3.0], [1246.0, 7.4], [1254.0, 2.0], [1262.0, 2.833333333333333], [1278.0, 3.6666666666666665], [1230.0, 2.5], [1222.0, 1.0], [1334.0, 9.0], [1342.0, 7.5], [1318.0, 2.0], [1326.0, 4.666666666666667], [1310.0, 2.3333333333333335], [1286.0, 2.5], [1294.0, 2.6], [1302.0, 1.75], [1358.0, 3.5], [1398.0, 3.5], [1374.0, 7.0], [1366.0, 2.8], [1382.0, 5.5], [1350.0, 3.5], [1390.0, 6.25], [1414.0, 2.0], [1462.0, 2.0], [1438.0, 14.333333333333332], [1430.0, 3.0], [1446.0, 2.75], [1454.0, 4.333333333333333], [1470.0, 2.375], [1422.0, 2.6666666666666665], [1478.0, 2.0], [1486.0, 2.0], [1502.0, 3.5], [1526.0, 2.0], [1534.0, 2.5], [1518.0, 2.5], [1510.0, 1.5], [1590.0, 1.75], [1558.0, 6.0], [1574.0, 2.5], [1550.0, 2.0], [1542.0, 2.3333333333333335], [1566.0, 2.3333333333333335], [1582.0, 2.0], [1654.0, 4.5], [1622.0, 5.666666666666666], [1662.0, 1.25], [1638.0, 2.6666666666666665], [1614.0, 1.6666666666666667], [1606.0, 2.6666666666666665], [1630.0, 4.0], [1646.0, 2.8], [1702.0, 3.0], [1686.0, 7.0], [1710.0, 2.3333333333333335], [1694.0, 2.0], [1678.0, 4.0], [1726.0, 3.0], [1718.0, 14.25], [1758.0, 1.3333333333333333], [1734.0, 6.0], [1750.0, 2.5], [1742.0, 1.0], [1774.0, 2.5], [1782.0, 1.3333333333333333], [1854.0, 3.5], [1846.0, 2.25], [1838.0, 3.2], [1830.0, 2.0], [1822.0, 1.8571428571428572], [1798.0, 2.0], [1806.0, 1.3333333333333333], [1814.0, 2.5], [1862.0, 2.3333333333333335], [1870.0, 1.5], [1878.0, 1.3333333333333333], [1918.0, 1.6666666666666667], [1910.0, 2.333333333333333], [1902.0, 9.2], [1894.0, 2.0], [1974.0, 2.0], [1942.0, 2.6666666666666665], [1982.0, 2.0], [1934.0, 2.0], [1926.0, 1.8571428571428572], [1966.0, 3.0], [1958.0, 3.0], [1950.0, 7.75], [2046.0, 3.0], [2030.0, 4.2], [2038.0, 2.0], [1998.0, 3.333333333333333], [1990.0, 2.0], [2022.0, 2.0], [2014.0, 2.6], [2006.0, 3.3333333333333335], [2108.0, 4.5], [2060.0, 3.5], [2092.0, 5.25], [2172.0, 2.5], [2124.0, 2.0], [2140.0, 2.0], [2156.0, 2.0], [2204.0, 4.25], [2220.0, 9.0], [2300.0, 2.25], [2188.0, 2.25], [2268.0, 5.4], [2252.0, 2.8], [2236.0, 1.625], [2428.0, 2.5], [2380.0, 5.666666666666667], [2412.0, 2.4], [2396.0, 2.5], [2364.0, 11.142857142857142], [2332.0, 2.25], [2348.0, 2.4], [2540.0, 8.75], [2556.0, 5.25], [2476.0, 2.2], [2524.0, 1.6666666666666667], [2508.0, 3.0], [2492.0, 3.0], [2460.0, 1.3333333333333333], [2620.0, 2.0], [2588.0, 6.4], [2604.0, 2.0], [2684.0, 2.6], [2668.0, 2.0], [2652.0, 3.0], [2636.0, 2.6666666666666665], [2716.0, 3.4], [2748.0, 1.5], [2732.0, 2.5], [2700.0, 1.6666666666666667], [2796.0, 2.0], [2812.0, 6.0], [2764.0, 5.0], [2780.0, 1.375], [2940.0, 2.6666666666666665], [2924.0, 3.25], [2908.0, 1.75], [2892.0, 3.25], [2876.0, 2.0], [2844.0, 3.0], [2828.0, 3.5], [2860.0, 3.0], [3052.0, 2.3333333333333335], [2988.0, 2.3333333333333335], [3068.0, 2.0], [2972.0, 3.0], [2956.0, 2.3333333333333335], [3036.0, 2.6666666666666665], [3020.0, 2.0], [3004.0, 2.0], [3196.0, 1.6], [3180.0, 2.0], [3164.0, 2.5], [3148.0, 2.0], [3132.0, 1.75], [3084.0, 2.0], [3100.0, 8.333333333333332], [3116.0, 1.8], [3228.0, 2.5714285714285716], [3324.0, 2.0], [3260.0, 2.166666666666667], [3212.0, 2.0], [3244.0, 2.0], [3276.0, 1.6666666666666667], [3308.0, 2.3333333333333335], [3292.0, 2.3333333333333335], [3388.0, 9.5], [3372.0, 2.4], [3356.0, 2.2], [3580.0, 2.0], [3564.0, 2.0], [3516.0, 4.0], [3500.0, 2.0], [3468.0, 2.5], [3692.0, 6.666666666666667], [3676.0, 2.0], [3660.0, 9.0], [3628.0, 3.0], [3612.0, 2.0], [3836.0, 6.0], [3804.0, 3.5], [3788.0, 4.0], [3756.0, 2.0], [3740.0, 3.0], [3724.0, 2.0], [3900.0, 4.153718420116238], [3884.0, 2.0], [3868.0, 2.5], [3852.0, 2.0], [2061.0, 3.0], [2077.0, 6.0], [2093.0, 1.6], [2109.0, 2.0], [2141.0, 1.75], [2125.0, 2.0], [2157.0, 4.857142857142858], [2173.0, 4.666666666666667], [2301.0, 2.3333333333333335], [2285.0, 5.2857142857142865], [2269.0, 5.25], [2189.0, 1.6666666666666667], [2253.0, 2.3333333333333335], [2237.0, 1.0], [2221.0, 2.0], [2429.0, 2.0], [2349.0, 2.0], [2381.0, 3.2], [2365.0, 2.0], [2317.0, 10.5], [2333.0, 9.5], [2397.0, 2.0], [2461.0, 4.5], [2477.0, 1.5], [2493.0, 2.428571428571429], [2445.0, 2.0], [2557.0, 8.5], [2541.0, 5.0], [2525.0, 2.0], [2509.0, 4.0], [2669.0, 2.6666666666666665], [2685.0, 2.0], [2605.0, 2.0], [2653.0, 3.0], [2637.0, 3.0], [2621.0, 1.5], [2589.0, 2.0], [2749.0, 2.6666666666666665], [2701.0, 2.0], [2733.0, 1.5], [2717.0, 2.5], [2781.0, 1.0], [2765.0, 2.0], [2813.0, 22.799999999999997], [2941.0, 2.6666666666666665], [2925.0, 3.6666666666666665], [2909.0, 3.5], [2845.0, 3.125], [2829.0, 6.0], [2893.0, 2.0], [2861.0, 1.75], [3021.0, 2.75], [3053.0, 1.6666666666666667], [3037.0, 2.0], [2973.0, 2.0], [2957.0, 1.6666666666666667], [3069.0, 3.0], [3005.0, 1.8], [2989.0, 3.0], [3197.0, 2.0], [3181.0, 3.8], [3165.0, 2.0], [3149.0, 2.4], [3133.0, 2.0], [3101.0, 1.5], [3085.0, 2.0], [3117.0, 2.6666666666666665], [3325.0, 2.0], [3309.0, 2.0], [3293.0, 2.0], [3229.0, 2.0], [3213.0, 1.8333333333333333], [3277.0, 2.0], [3261.0, 2.166666666666667], [3245.0, 2.0], [3389.0, 2.25], [3373.0, 2.6666666666666665], [3357.0, 1.8], [3341.0, 2.0], [3581.0, 2.0], [3565.0, 2.3333333333333335], [3549.0, 1.5], [3517.0, 4.5], [3501.0, 2.0], [3693.0, 3.0], [3677.0, 2.0], [3661.0, 2.0], [3645.0, 2.6666666666666665], [3613.0, 2.5], [3597.0, 2.0], [3837.0, 8.0], [3821.0, 4.0], [3805.0, 2.0], [3789.0, 4.5], [3773.0, 2.3333333333333335], [3757.0, 3.5], [3741.0, 2.0], [3725.0, 2.0], [3885.0, 2.0], [3869.0, 2.0], [3853.0, 2.0], [1039.0, 3.0], [1047.0, 2.2], [1063.0, 2.5], [1087.0, 2.3333333333333335], [1031.0, 3.0], [1095.0, 2.666666666666667], [1103.0, 1.5], [1119.0, 2.75], [1111.0, 4.333333333333333], [1127.0, 4.5], [1135.0, 3.666666666666667], [1151.0, 2.0], [1143.0, 2.5], [1167.0, 2.0], [1175.0, 2.3333333333333335], [1183.0, 2.0], [1191.0, 8.5], [1199.0, 1.5], [1215.0, 3.2], [1271.0, 3.0], [1239.0, 2.5], [1255.0, 1.0], [1223.0, 2.0], [1247.0, 4.0], [1263.0, 2.3333333333333335], [1287.0, 2.5], [1295.0, 7.0], [1311.0, 5.0], [1319.0, 2.0], [1327.0, 4.0], [1343.0, 5.5], [1335.0, 7.0], [1359.0, 2.0], [1367.0, 2.0], [1399.0, 2.0], [1351.0, 3.0], [1375.0, 5.5], [1391.0, 3.75], [1383.0, 1.5], [1423.0, 3.0], [1463.0, 2.0], [1415.0, 2.25], [1431.0, 2.0], [1439.0, 6.0], [1447.0, 2.0], [1487.0, 2.0], [1503.0, 1.5], [1479.0, 2.0], [1535.0, 2.0], [1511.0, 2.7142857142857144], [1527.0, 4.5], [1591.0, 2.333333333333333], [1567.0, 1.2], [1543.0, 1.3333333333333333], [1551.0, 2.75], [1559.0, 3.6666666666666665], [1583.0, 3.0], [1631.0, 3.0], [1623.0, 8.0], [1607.0, 3.0], [1655.0, 2.3333333333333335], [1663.0, 2.0], [1639.0, 5.0], [1647.0, 3.0], [1615.0, 2.0], [1719.0, 9.666666666666666], [1727.0, 3.5], [1703.0, 2.0], [1671.0, 11.0], [1679.0, 9.0], [1711.0, 1.6666666666666667], [1743.0, 2.3333333333333335], [1751.0, 1.3333333333333333], [1767.0, 5.666666666666666], [1759.0, 1.6666666666666667], [1775.0, 2.0], [1791.0, 25.1], [1783.0, 2.5], [1855.0, 4.0], [1847.0, 1.5], [1839.0, 3.5], [1831.0, 1.3333333333333333], [1823.0, 2.0], [1799.0, 1.5], [1807.0, 3.0], [1815.0, 2.5], [1863.0, 2.0], [1871.0, 2.5], [1887.0, 4.222222222222222], [1879.0, 1.5], [1919.0, 2.0], [1911.0, 2.0], [1903.0, 7.0], [1895.0, 4.0], [1935.0, 2.25], [1927.0, 1.25], [1983.0, 4.333333333333333], [1975.0, 2.0], [1959.0, 7.0], [1951.0, 3.0], [1943.0, 2.0], [1999.0, 5.5], [2047.0, 2.3333333333333335], [1991.0, 1.8333333333333335], [2031.0, 1.5], [2023.0, 2.166666666666667], [2015.0, 2.5], [2007.0, 6.666666666666667], [2078.0, 2.0], [2094.0, 3.666666666666667], [2062.0, 1.75], [2110.0, 1.5], [2142.0, 2.833333333333333], [2158.0, 1.75], [2302.0, 2.0], [2222.0, 6.25], [2270.0, 5.666666666666666], [2254.0, 3.0], [2238.0, 2.0], [2190.0, 2.0], [2206.0, 4.0], [2414.0, 2.0], [2430.0, 2.0], [2350.0, 2.0], [2334.0, 2.0], [2318.0, 2.2], [2366.0, 2.3333333333333335], [2398.0, 2.0], [2382.0, 2.0], [2558.0, 2.4], [2542.0, 4.0], [2526.0, 2.0], [2510.0, 90.0], [2494.0, 8.25], [2446.0, 3.6666666666666665], [2462.0, 2.0], [2478.0, 2.0], [2670.0, 3.6666666666666665], [2686.0, 2.6666666666666665], [2590.0, 2.0], [2654.0, 2.8], [2622.0, 2.75], [2574.0, 11.916666666666668], [2606.0, 2.25], [2750.0, 4.0], [2702.0, 2.25], [2734.0, 3.0], [2718.0, 2.0], [2798.0, 1.6666666666666667], [2814.0, 2.5], [2782.0, 2.6666666666666665], [2942.0, 2.6], [2926.0, 2.6], [2910.0, 3.5], [2878.0, 7.0], [2830.0, 2.25], [2846.0, 1.0], [2862.0, 3.0], [3054.0, 3.0], [3070.0, 2.0], [2974.0, 2.0], [3038.0, 2.5], [3022.0, 2.6666666666666665], [3006.0, 3.0], [2990.0, 2.4], [3198.0, 2.5], [3182.0, 1.5], [3166.0, 1.6666666666666667], [3150.0, 2.0], [3134.0, 1.0], [3086.0, 2.25], [3102.0, 4.333333333333333], [3118.0, 1.0], [3310.0, 1.6666666666666667], [3230.0, 2.8], [3326.0, 2.0], [3214.0, 2.0], [3294.0, 3.0], [3262.0, 10.0], [3246.0, 2.6666666666666665], [3374.0, 1.75], [3358.0, 2.0], [3342.0, 2.5], [3438.0, 8.125], [3406.0, 2.6666666666666665], [3582.0, 1.0], [3550.0, 2.0], [3534.0, 3.0], [3518.0, 2.0], [3502.0, 2.0], [3470.0, 4.0], [3694.0, 4.0], [3662.0, 1.0], [3646.0, 2.0], [3630.0, 2.5], [3614.0, 3.0], [3598.0, 2.0], [3838.0, 10.0], [3822.0, 5.0], [3790.0, 2.5], [3774.0, 1.6666666666666667], [3758.0, 1.6666666666666667], [3742.0, 2.0], [3726.0, 2.5], [3886.0, 2.0], [3870.0, 2.6], [3854.0, 3.0], [2111.0, 2.5], [2079.0, 2.3333333333333335], [2063.0, 3.0], [2159.0, 2.4], [2143.0, 2.0], [2303.0, 1.8333333333333335], [2287.0, 5.6], [2271.0, 2.75], [2255.0, 2.0], [2239.0, 1.75], [2191.0, 3.6], [2207.0, 3.0], [2223.0, 8.0], [2415.0, 2.0], [2335.0, 2.0], [2319.0, 2.0], [2399.0, 4.0], [2383.0, 1.0], [2367.0, 2.0], [2463.0, 4.0], [2543.0, 2.0], [2447.0, 9.8], [2527.0, 2.0], [2511.0, 2.0], [2495.0, 2.0], [2479.0, 2.25], [2607.0, 3.5], [2687.0, 9.0], [2591.0, 1.8], [2575.0, 3.0], [2655.0, 1.3333333333333333], [2751.0, 3.0], [2719.0, 2.0], [2735.0, 2.4], [2799.0, 1.5714285714285714], [2783.0, 4.0], [2767.0, 1.75], [2815.0, 2.6666666666666665], [2831.0, 2.75], [2927.0, 4.5], [2863.0, 8.4], [2943.0, 5.0], [2847.0, 4.0], [2911.0, 2.0], [2895.0, 5.2], [3055.0, 3.0], [2975.0, 1.75], [3071.0, 2.0], [3039.0, 2.5], [3023.0, 3.6], [3007.0, 3.5], [2959.0, 3.714285714285714], [2991.0, 2.0], [3087.0, 2.0], [3103.0, 5.666666666666667], [3135.0, 2.0], [3119.0, 2.3333333333333335], [3199.0, 2.0], [3183.0, 3.333333333333333], [3167.0, 2.888888888888889], [3151.0, 1.5], [3215.0, 1.5], [3231.0, 1.6666666666666667], [3263.0, 3.0], [3247.0, 2.0], [3327.0, 3.0], [3311.0, 2.75], [3295.0, 2.3333333333333335], [3279.0, 3.6], [3391.0, 6.0], [3375.0, 2.0], [3359.0, 2.0], [3343.0, 8.5], [3455.0, 36.5], [3423.0, 98.0], [3487.0, 12.5], [3567.0, 7.0], [3551.0, 2.6666666666666665], [3535.0, 1.6666666666666667], [3519.0, 2.0], [3503.0, 2.0], [3471.0, 4.5], [3711.0, 30.384615384615387], [3679.0, 2.8], [3663.0, 2.5], [3647.0, 1.5], [3631.0, 2.0], [3615.0, 1.0], [3807.0, 3.0], [3791.0, 3.0], [3775.0, 3.3333333333333335], [3759.0, 2.0], [3743.0, 2.0], [3727.0, 2.6666666666666665], [3871.0, 2.5]], "isOverall": false, "label": "Get VITALS list", "isController": false}, {"data": [[2565.7263089620205, 4.394310125025146]], "isOverall": false, "label": "Get VITALS list-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 3900.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 4622.066666666667, "minX": 1.52762898E12, "maxY": 21443.8, "series": [{"data": [[1.52762922E12, 20330.8], [1.52762904E12, 19910.333333333332], [1.5276291E12, 21242.4], [1.5276294E12, 16313.4], [1.52762898E12, 15140.333333333334], [1.52762946E12, 5974.866666666667], [1.52762928E12, 18405.133333333335], [1.52762934E12, 19217.8], [1.52762916E12, 21443.8]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52762922E12, 15727.6], [1.52762904E12, 15402.333333333334], [1.5276291E12, 16432.8], [1.5276294E12, 12619.8], [1.52762898E12, 11712.333333333334], [1.52762946E12, 4622.066666666667], [1.52762928E12, 14237.933333333332], [1.52762934E12, 14866.6], [1.52762916E12, 16588.6]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52762946E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3.6539798401112353, "minX": 1.52762898E12, "maxY": 8.024270711785261, "series": [{"data": [[1.52762922E12, 3.6539798401112353], [1.52762904E12, 4.884472049689444], [1.5276291E12, 3.8122089155023158], [1.5276294E12, 3.9254927442062013], [1.52762898E12, 8.024270711785261], [1.52762946E12, 4.480780603193386], [1.52762928E12, 3.766557880591286], [1.52762934E12, 4.192498621070041], [1.52762916E12, 3.7070357554786604]], "isOverall": false, "label": "Get VITALS list", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52762946E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3.651025373653109, "minX": 1.52762898E12, "maxY": 7.995099183197187, "series": [{"data": [[1.52762922E12, 3.651025373653109], [1.52762904E12, 4.877551020408169], [1.5276291E12, 3.8095475715236136], [1.5276294E12, 3.9202945635694117], [1.52762898E12, 7.995099183197187], [1.52762946E12, 4.475458308693078], [1.52762928E12, 3.762526396621233], [1.52762934E12, 4.189740761169327], [1.52762916E12, 3.704564178612629]], "isOverall": false, "label": "Get VITALS list", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52762946E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.3737355811889973, "minX": 1.52762898E12, "maxY": 1.5186280307510343, "series": [{"data": [[1.52762922E12, 0.9009384775808116], [1.52762904E12, 0.3737355811889973], [1.5276291E12, 0.5349301397205581], [1.5276294E12, 1.2285033571583301], [1.52762898E12, 1.1031505250875115], [1.52762946E12, 1.5186280307510343], [1.52762928E12, 1.0113265502015725], [1.52762934E12, 1.1877183305754733], [1.52762916E12, 0.7012687427912335]], "isOverall": false, "label": "Get VITALS list", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52762946E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.52762898E12, "maxY": 503.0, "series": [{"data": [[1.52762922E12, 161.0], [1.52762904E12, 503.0], [1.5276291E12, 278.0], [1.5276294E12, 88.0], [1.52762898E12, 433.0], [1.52762946E12, 87.0], [1.52762928E12, 110.0], [1.52762934E12, 132.0], [1.52762916E12, 175.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52762922E12, 1.0], [1.52762904E12, 1.0], [1.5276291E12, 1.0], [1.5276294E12, 1.0], [1.52762898E12, 1.0], [1.52762946E12, 1.0], [1.52762928E12, 1.0], [1.52762934E12, 1.0], [1.52762916E12, 1.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52762922E12, 8.0], [1.52762904E12, 11.0], [1.5276291E12, 9.0], [1.5276294E12, 6.0], [1.52762898E12, 13.0], [1.52762946E12, 7.0], [1.52762928E12, 7.0], [1.52762934E12, 6.0], [1.52762916E12, 8.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52762922E12, 36.0], [1.52762904E12, 59.590000000000146], [1.5276291E12, 47.0], [1.5276294E12, 32.0], [1.52762898E12, 95.56000000000131], [1.52762946E12, 33.0], [1.52762928E12, 33.0], [1.52762934E12, 34.9900000000016], [1.52762916E12, 44.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52762922E12, 12.0], [1.52762904E12, 16.0], [1.5276291E12, 14.0], [1.5276294E12, 11.0], [1.52762898E12, 23.0], [1.52762946E12, 11.0], [1.52762928E12, 11.0], [1.52762934E12, 11.0], [1.52762916E12, 13.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52762946E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2.0, "minX": 28.0, "maxY": 3.0, "series": [{"data": [[71.0, 3.0], [76.0, 3.0], [86.0, 2.0], [90.0, 3.0], [93.0, 3.0], [95.0, 2.0], [100.0, 2.0], [101.0, 2.0], [28.0, 3.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 101.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 2.0, "minX": 28.0, "maxY": 3.0, "series": [{"data": [[71.0, 3.0], [76.0, 3.0], [86.0, 2.0], [90.0, 3.0], [93.0, 3.0], [95.0, 2.0], [100.0, 2.0], [101.0, 2.0], [28.0, 3.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 101.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 28.183333333333334, "minX": 1.52762898E12, "maxY": 101.15, "series": [{"data": [[1.52762922E12, 95.91666666666667], [1.52762904E12, 93.91666666666667], [1.5276291E12, 100.2], [1.5276294E12, 76.95], [1.52762898E12, 71.41666666666667], [1.52762946E12, 28.183333333333334], [1.52762928E12, 86.8], [1.52762934E12, 90.65], [1.52762916E12, 101.15]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52762946E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 28.183333333333334, "minX": 1.52762898E12, "maxY": 101.15, "series": [{"data": [[1.52762922E12, 95.9], [1.52762904E12, 93.91666666666667], [1.5276291E12, 100.2], [1.5276294E12, 76.95], [1.52762898E12, 71.41666666666667], [1.52762946E12, 28.183333333333334], [1.52762928E12, 86.81666666666666], [1.52762934E12, 90.65], [1.52762916E12, 101.15]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52762946E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 28.183333333333334, "minX": 1.52762898E12, "maxY": 101.15, "series": [{"data": [[1.52762922E12, 95.9], [1.52762904E12, 93.91666666666667], [1.5276291E12, 100.2], [1.5276294E12, 76.95], [1.52762898E12, 71.41666666666667], [1.52762946E12, 28.183333333333334], [1.52762928E12, 86.81666666666666], [1.52762934E12, 90.65], [1.52762916E12, 101.15]], "isOverall": false, "label": "Get VITALS list-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52762946E12, "title": "Transactions Per Second"}},
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
