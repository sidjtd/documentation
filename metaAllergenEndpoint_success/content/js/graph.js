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
        data: {"result": {"minY": 2412.0, "minX": 0.0, "maxY": 90968.0, "series": [{"data": [[0.0, 2412.0], [0.1, 2412.0], [0.2, 2412.0], [0.3, 2412.0], [0.4, 2412.0], [0.5, 2412.0], [0.6, 2412.0], [0.7, 2611.0], [0.8, 2611.0], [0.9, 2611.0], [1.0, 2611.0], [1.1, 2611.0], [1.2, 2611.0], [1.3, 2779.0], [1.4, 2779.0], [1.5, 2779.0], [1.6, 2779.0], [1.7, 2779.0], [1.8, 2779.0], [1.9, 2779.0], [2.0, 2988.0], [2.1, 2988.0], [2.2, 2988.0], [2.3, 2988.0], [2.4, 2988.0], [2.5, 2988.0], [2.6, 3154.0], [2.7, 3154.0], [2.8, 3154.0], [2.9, 3154.0], [3.0, 3154.0], [3.1, 3154.0], [3.2, 3255.0], [3.3, 3255.0], [3.4, 3255.0], [3.5, 3255.0], [3.6, 3255.0], [3.7, 3255.0], [3.8, 3255.0], [3.9, 3538.0], [4.0, 3538.0], [4.1, 3538.0], [4.2, 3538.0], [4.3, 3538.0], [4.4, 3538.0], [4.5, 4087.0], [4.6, 4087.0], [4.7, 4087.0], [4.8, 4087.0], [4.9, 4087.0], [5.0, 4087.0], [5.1, 4403.0], [5.2, 4403.0], [5.3, 4403.0], [5.4, 4403.0], [5.5, 4403.0], [5.6, 4403.0], [5.7, 4403.0], [5.8, 4664.0], [5.9, 4664.0], [6.0, 4664.0], [6.1, 4664.0], [6.2, 4664.0], [6.3, 4664.0], [6.4, 4785.0], [6.5, 4785.0], [6.6, 4785.0], [6.7, 4785.0], [6.8, 4785.0], [6.9, 4785.0], [7.0, 4785.0], [7.1, 5183.0], [7.2, 5183.0], [7.3, 5183.0], [7.4, 5183.0], [7.5, 5183.0], [7.6, 5183.0], [7.7, 5405.0], [7.8, 5405.0], [7.9, 5405.0], [8.0, 5405.0], [8.1, 5405.0], [8.2, 5405.0], [8.3, 5595.0], [8.4, 5595.0], [8.5, 5595.0], [8.6, 5595.0], [8.7, 5595.0], [8.8, 5595.0], [8.9, 5595.0], [9.0, 5666.0], [9.1, 5666.0], [9.2, 5666.0], [9.3, 5666.0], [9.4, 5666.0], [9.5, 5666.0], [9.6, 6757.0], [9.7, 6757.0], [9.8, 6757.0], [9.9, 6757.0], [10.0, 6757.0], [10.1, 6757.0], [10.2, 6871.0], [10.3, 6871.0], [10.4, 6871.0], [10.5, 6871.0], [10.6, 6871.0], [10.7, 6871.0], [10.8, 6871.0], [10.9, 7636.0], [11.0, 7636.0], [11.1, 7636.0], [11.2, 7636.0], [11.3, 7636.0], [11.4, 7636.0], [11.5, 8243.0], [11.6, 8243.0], [11.7, 8243.0], [11.8, 8243.0], [11.9, 8243.0], [12.0, 8243.0], [12.1, 8243.0], [12.2, 8381.0], [12.3, 8381.0], [12.4, 8381.0], [12.5, 8381.0], [12.6, 8381.0], [12.7, 8381.0], [12.8, 8707.0], [12.9, 8707.0], [13.0, 8707.0], [13.1, 8707.0], [13.2, 8707.0], [13.3, 8707.0], [13.4, 9596.0], [13.5, 9596.0], [13.6, 9596.0], [13.7, 9596.0], [13.8, 9596.0], [13.9, 9596.0], [14.0, 9596.0], [14.1, 9702.0], [14.2, 9702.0], [14.3, 9702.0], [14.4, 9702.0], [14.5, 9702.0], [14.6, 9702.0], [14.7, 10074.0], [14.8, 10074.0], [14.9, 10074.0], [15.0, 10074.0], [15.1, 10074.0], [15.2, 10074.0], [15.3, 10078.0], [15.4, 10078.0], [15.5, 10078.0], [15.6, 10078.0], [15.7, 10078.0], [15.8, 10078.0], [15.9, 10078.0], [16.0, 10408.0], [16.1, 10408.0], [16.2, 10408.0], [16.3, 10408.0], [16.4, 10408.0], [16.5, 10408.0], [16.6, 10536.0], [16.7, 10536.0], [16.8, 10536.0], [16.9, 10536.0], [17.0, 10536.0], [17.1, 10536.0], [17.2, 10718.0], [17.3, 10718.0], [17.4, 10718.0], [17.5, 10718.0], [17.6, 10718.0], [17.7, 10718.0], [17.8, 10718.0], [17.9, 10771.0], [18.0, 10771.0], [18.1, 10771.0], [18.2, 10771.0], [18.3, 10771.0], [18.4, 10771.0], [18.5, 11065.0], [18.6, 11065.0], [18.7, 11065.0], [18.8, 11065.0], [18.9, 11065.0], [19.0, 11065.0], [19.1, 11065.0], [19.2, 11437.0], [19.3, 11437.0], [19.4, 11437.0], [19.5, 11437.0], [19.6, 11437.0], [19.7, 11437.0], [19.8, 11506.0], [19.9, 11506.0], [20.0, 11506.0], [20.1, 11506.0], [20.2, 11506.0], [20.3, 11506.0], [20.4, 11552.0], [20.5, 11552.0], [20.6, 11552.0], [20.7, 11552.0], [20.8, 11552.0], [20.9, 11552.0], [21.0, 11552.0], [21.1, 12039.0], [21.2, 12039.0], [21.3, 12039.0], [21.4, 12039.0], [21.5, 12039.0], [21.6, 12039.0], [21.7, 12166.0], [21.8, 12166.0], [21.9, 12166.0], [22.0, 12166.0], [22.1, 12166.0], [22.2, 12166.0], [22.3, 12264.0], [22.4, 12264.0], [22.5, 12264.0], [22.6, 12264.0], [22.7, 12264.0], [22.8, 12264.0], [22.9, 12264.0], [23.0, 12590.0], [23.1, 12590.0], [23.2, 12590.0], [23.3, 12590.0], [23.4, 12590.0], [23.5, 12590.0], [23.6, 12694.0], [23.7, 12694.0], [23.8, 12694.0], [23.9, 12694.0], [24.0, 12694.0], [24.1, 12694.0], [24.2, 12694.0], [24.3, 13323.0], [24.4, 13323.0], [24.5, 13323.0], [24.6, 13323.0], [24.7, 13323.0], [24.8, 13323.0], [24.9, 14068.0], [25.0, 14068.0], [25.1, 14068.0], [25.2, 14068.0], [25.3, 14068.0], [25.4, 14068.0], [25.5, 14489.0], [25.6, 14489.0], [25.7, 14489.0], [25.8, 14489.0], [25.9, 14489.0], [26.0, 14489.0], [26.1, 14489.0], [26.2, 14824.0], [26.3, 14824.0], [26.4, 14824.0], [26.5, 14824.0], [26.6, 14824.0], [26.7, 14824.0], [26.8, 14845.0], [26.9, 14845.0], [27.0, 14845.0], [27.1, 14845.0], [27.2, 14845.0], [27.3, 14845.0], [27.4, 14900.0], [27.5, 14900.0], [27.6, 14900.0], [27.7, 14900.0], [27.8, 14900.0], [27.9, 14900.0], [28.0, 14900.0], [28.1, 15347.0], [28.2, 15347.0], [28.3, 15347.0], [28.4, 15347.0], [28.5, 15347.0], [28.6, 15347.0], [28.7, 15628.0], [28.8, 15628.0], [28.9, 15628.0], [29.0, 15628.0], [29.1, 15628.0], [29.2, 15628.0], [29.3, 15944.0], [29.4, 15944.0], [29.5, 15944.0], [29.6, 15944.0], [29.7, 15944.0], [29.8, 15944.0], [29.9, 15944.0], [30.0, 15995.0], [30.1, 15995.0], [30.2, 15995.0], [30.3, 15995.0], [30.4, 15995.0], [30.5, 15995.0], [30.6, 16437.0], [30.7, 16437.0], [30.8, 16437.0], [30.9, 16437.0], [31.0, 16437.0], [31.1, 16437.0], [31.2, 16437.0], [31.3, 16683.0], [31.4, 16683.0], [31.5, 16683.0], [31.6, 16683.0], [31.7, 16683.0], [31.8, 16683.0], [31.9, 16798.0], [32.0, 16798.0], [32.1, 16798.0], [32.2, 16798.0], [32.3, 16798.0], [32.4, 16798.0], [32.5, 17049.0], [32.6, 17049.0], [32.7, 17049.0], [32.8, 17049.0], [32.9, 17049.0], [33.0, 17049.0], [33.1, 17049.0], [33.2, 17271.0], [33.3, 17271.0], [33.4, 17271.0], [33.5, 17271.0], [33.6, 17271.0], [33.7, 17271.0], [33.8, 17506.0], [33.9, 17506.0], [34.0, 17506.0], [34.1, 17506.0], [34.2, 17506.0], [34.3, 17506.0], [34.4, 18332.0], [34.5, 18332.0], [34.6, 18332.0], [34.7, 18332.0], [34.8, 18332.0], [34.9, 18332.0], [35.0, 18332.0], [35.1, 18721.0], [35.2, 18721.0], [35.3, 18721.0], [35.4, 18721.0], [35.5, 18721.0], [35.6, 18721.0], [35.7, 19436.0], [35.8, 19436.0], [35.9, 19436.0], [36.0, 19436.0], [36.1, 19436.0], [36.2, 19436.0], [36.3, 19436.0], [36.4, 19503.0], [36.5, 19503.0], [36.6, 19503.0], [36.7, 19503.0], [36.8, 19503.0], [36.9, 19503.0], [37.0, 19509.0], [37.1, 19509.0], [37.2, 19509.0], [37.3, 19509.0], [37.4, 19509.0], [37.5, 19509.0], [37.6, 19626.0], [37.7, 19626.0], [37.8, 19626.0], [37.9, 19626.0], [38.0, 19626.0], [38.1, 19626.0], [38.2, 19626.0], [38.3, 19671.0], [38.4, 19671.0], [38.5, 19671.0], [38.6, 19671.0], [38.7, 19671.0], [38.8, 19671.0], [38.9, 19689.0], [39.0, 19689.0], [39.1, 19689.0], [39.2, 19689.0], [39.3, 19689.0], [39.4, 19689.0], [39.5, 19896.0], [39.6, 19896.0], [39.7, 19896.0], [39.8, 19896.0], [39.9, 19896.0], [40.0, 19896.0], [40.1, 19896.0], [40.2, 19997.0], [40.3, 19997.0], [40.4, 19997.0], [40.5, 19997.0], [40.6, 19997.0], [40.7, 19997.0], [40.8, 20024.0], [40.9, 20024.0], [41.0, 20024.0], [41.1, 20024.0], [41.2, 20024.0], [41.3, 20024.0], [41.4, 20024.0], [41.5, 21110.0], [41.6, 21110.0], [41.7, 21110.0], [41.8, 21110.0], [41.9, 21110.0], [42.0, 21110.0], [42.1, 21230.0], [42.2, 21230.0], [42.3, 21230.0], [42.4, 21230.0], [42.5, 21230.0], [42.6, 21230.0], [42.7, 21252.0], [42.8, 21252.0], [42.9, 21252.0], [43.0, 21252.0], [43.1, 21252.0], [43.2, 21252.0], [43.3, 21252.0], [43.4, 22569.0], [43.5, 22569.0], [43.6, 22569.0], [43.7, 22569.0], [43.8, 22569.0], [43.9, 22569.0], [44.0, 22704.0], [44.1, 22704.0], [44.2, 22704.0], [44.3, 22704.0], [44.4, 22704.0], [44.5, 22704.0], [44.6, 23172.0], [44.7, 23172.0], [44.8, 23172.0], [44.9, 23172.0], [45.0, 23172.0], [45.1, 23172.0], [45.2, 23172.0], [45.3, 23222.0], [45.4, 23222.0], [45.5, 23222.0], [45.6, 23222.0], [45.7, 23222.0], [45.8, 23222.0], [45.9, 23294.0], [46.0, 23294.0], [46.1, 23294.0], [46.2, 23294.0], [46.3, 23294.0], [46.4, 23294.0], [46.5, 23314.0], [46.6, 23314.0], [46.7, 23314.0], [46.8, 23314.0], [46.9, 23314.0], [47.0, 23314.0], [47.1, 23314.0], [47.2, 24074.0], [47.3, 24074.0], [47.4, 24074.0], [47.5, 24074.0], [47.6, 24074.0], [47.7, 24074.0], [47.8, 24521.0], [47.9, 24521.0], [48.0, 24521.0], [48.1, 24521.0], [48.2, 24521.0], [48.3, 24521.0], [48.4, 24521.0], [48.5, 24751.0], [48.6, 24751.0], [48.7, 24751.0], [48.8, 24751.0], [48.9, 24751.0], [49.0, 24751.0], [49.1, 26389.0], [49.2, 26389.0], [49.3, 26389.0], [49.4, 26389.0], [49.5, 26389.0], [49.6, 26389.0], [49.7, 26578.0], [49.8, 26578.0], [49.9, 26578.0], [50.0, 26578.0], [50.1, 26578.0], [50.2, 26578.0], [50.3, 26578.0], [50.4, 26656.0], [50.5, 26656.0], [50.6, 26656.0], [50.7, 26656.0], [50.8, 26656.0], [50.9, 26656.0], [51.0, 26981.0], [51.1, 26981.0], [51.2, 26981.0], [51.3, 26981.0], [51.4, 26981.0], [51.5, 26981.0], [51.6, 27932.0], [51.7, 27932.0], [51.8, 27932.0], [51.9, 27932.0], [52.0, 27932.0], [52.1, 27932.0], [52.2, 27932.0], [52.3, 28328.0], [52.4, 28328.0], [52.5, 28328.0], [52.6, 28328.0], [52.7, 28328.0], [52.8, 28328.0], [52.9, 28792.0], [53.0, 28792.0], [53.1, 28792.0], [53.2, 28792.0], [53.3, 28792.0], [53.4, 28792.0], [53.5, 28792.0], [53.6, 30160.0], [53.7, 30160.0], [53.8, 30160.0], [53.9, 30160.0], [54.0, 30160.0], [54.1, 30160.0], [54.2, 30161.0], [54.3, 30161.0], [54.4, 30161.0], [54.5, 30161.0], [54.6, 30161.0], [54.7, 30161.0], [54.8, 30252.0], [54.9, 30252.0], [55.0, 30252.0], [55.1, 30252.0], [55.2, 30252.0], [55.3, 30252.0], [55.4, 30252.0], [55.5, 30333.0], [55.6, 30333.0], [55.7, 30333.0], [55.8, 30333.0], [55.9, 30333.0], [56.0, 30333.0], [56.1, 30346.0], [56.2, 30346.0], [56.3, 30346.0], [56.4, 30346.0], [56.5, 30346.0], [56.6, 30346.0], [56.7, 30376.0], [56.8, 30376.0], [56.9, 30376.0], [57.0, 30376.0], [57.1, 30376.0], [57.2, 30376.0], [57.3, 30376.0], [57.4, 31381.0], [57.5, 31381.0], [57.6, 31381.0], [57.7, 31381.0], [57.8, 31381.0], [57.9, 31381.0], [58.0, 31998.0], [58.1, 31998.0], [58.2, 31998.0], [58.3, 31998.0], [58.4, 31998.0], [58.5, 31998.0], [58.6, 32312.0], [58.7, 32312.0], [58.8, 32312.0], [58.9, 32312.0], [59.0, 32312.0], [59.1, 32312.0], [59.2, 32312.0], [59.3, 32607.0], [59.4, 32607.0], [59.5, 32607.0], [59.6, 32607.0], [59.7, 32607.0], [59.8, 32607.0], [59.9, 33118.0], [60.0, 33118.0], [60.1, 33118.0], [60.2, 33118.0], [60.3, 33118.0], [60.4, 33118.0], [60.5, 33118.0], [60.6, 33893.0], [60.7, 33893.0], [60.8, 33893.0], [60.9, 33893.0], [61.0, 33893.0], [61.1, 33893.0], [61.2, 34552.0], [61.3, 34552.0], [61.4, 34552.0], [61.5, 34552.0], [61.6, 34552.0], [61.7, 34552.0], [61.8, 34605.0], [61.9, 34605.0], [62.0, 34605.0], [62.1, 34605.0], [62.2, 34605.0], [62.3, 34605.0], [62.4, 34605.0], [62.5, 34937.0], [62.6, 34937.0], [62.7, 34937.0], [62.8, 34937.0], [62.9, 34937.0], [63.0, 34937.0], [63.1, 35408.0], [63.2, 35408.0], [63.3, 35408.0], [63.4, 35408.0], [63.5, 35408.0], [63.6, 35408.0], [63.7, 35437.0], [63.8, 35437.0], [63.9, 35437.0], [64.0, 35437.0], [64.1, 35437.0], [64.2, 35437.0], [64.3, 35437.0], [64.4, 35543.0], [64.5, 35543.0], [64.6, 35543.0], [64.7, 35543.0], [64.8, 35543.0], [64.9, 35543.0], [65.0, 36048.0], [65.1, 36048.0], [65.2, 36048.0], [65.3, 36048.0], [65.4, 36048.0], [65.5, 36048.0], [65.6, 36048.0], [65.7, 37337.0], [65.8, 37337.0], [65.9, 37337.0], [66.0, 37337.0], [66.1, 37337.0], [66.2, 37337.0], [66.3, 37833.0], [66.4, 37833.0], [66.5, 37833.0], [66.6, 37833.0], [66.7, 37833.0], [66.8, 37833.0], [66.9, 38050.0], [67.0, 38050.0], [67.1, 38050.0], [67.2, 38050.0], [67.3, 38050.0], [67.4, 38050.0], [67.5, 38050.0], [67.6, 38099.0], [67.7, 38099.0], [67.8, 38099.0], [67.9, 38099.0], [68.0, 38099.0], [68.1, 38099.0], [68.2, 38951.0], [68.3, 38951.0], [68.4, 38951.0], [68.5, 38951.0], [68.6, 38951.0], [68.7, 38951.0], [68.8, 39352.0], [68.9, 39352.0], [69.0, 39352.0], [69.1, 39352.0], [69.2, 39352.0], [69.3, 39352.0], [69.4, 39352.0], [69.5, 43960.0], [69.6, 43960.0], [69.7, 43960.0], [69.8, 43960.0], [69.9, 43960.0], [70.0, 43960.0], [70.1, 46193.0], [70.2, 46193.0], [70.3, 46193.0], [70.4, 46193.0], [70.5, 46193.0], [70.6, 46193.0], [70.7, 46193.0], [70.8, 46262.0], [70.9, 46262.0], [71.0, 46262.0], [71.1, 46262.0], [71.2, 46262.0], [71.3, 46262.0], [71.4, 46774.0], [71.5, 46774.0], [71.6, 46774.0], [71.7, 46774.0], [71.8, 46774.0], [71.9, 46774.0], [72.0, 47678.0], [72.1, 47678.0], [72.2, 47678.0], [72.3, 47678.0], [72.4, 47678.0], [72.5, 47678.0], [72.6, 47678.0], [72.7, 48520.0], [72.8, 48520.0], [72.9, 48520.0], [73.0, 48520.0], [73.1, 48520.0], [73.2, 48520.0], [73.3, 50055.0], [73.4, 50055.0], [73.5, 50055.0], [73.6, 50055.0], [73.7, 50055.0], [73.8, 50055.0], [73.9, 51555.0], [74.0, 51555.0], [74.1, 51555.0], [74.2, 51555.0], [74.3, 51555.0], [74.4, 51555.0], [74.5, 51555.0], [74.6, 52028.0], [74.7, 52028.0], [74.8, 52028.0], [74.9, 52028.0], [75.0, 52028.0], [75.1, 52028.0], [75.2, 52846.0], [75.3, 52846.0], [75.4, 52846.0], [75.5, 52846.0], [75.6, 52846.0], [75.7, 52846.0], [75.8, 53158.0], [75.9, 53158.0], [76.0, 53158.0], [76.1, 53158.0], [76.2, 53158.0], [76.3, 53158.0], [76.4, 53158.0], [76.5, 54114.0], [76.6, 54114.0], [76.7, 54114.0], [76.8, 54114.0], [76.9, 54114.0], [77.0, 54114.0], [77.1, 56511.0], [77.2, 56511.0], [77.3, 56511.0], [77.4, 56511.0], [77.5, 56511.0], [77.6, 56511.0], [77.7, 56511.0], [77.8, 57045.0], [77.9, 57045.0], [78.0, 57045.0], [78.1, 57045.0], [78.2, 57045.0], [78.3, 57045.0], [78.4, 59609.0], [78.5, 59609.0], [78.6, 59609.0], [78.7, 59609.0], [78.8, 59609.0], [78.9, 59609.0], [79.0, 61028.0], [79.1, 61028.0], [79.2, 61028.0], [79.3, 61028.0], [79.4, 61028.0], [79.5, 61028.0], [79.6, 61028.0], [79.7, 61368.0], [79.8, 61368.0], [79.9, 61368.0], [80.0, 61368.0], [80.1, 61368.0], [80.2, 61368.0], [80.3, 61543.0], [80.4, 61543.0], [80.5, 61543.0], [80.6, 61543.0], [80.7, 61543.0], [80.8, 61543.0], [80.9, 61763.0], [81.0, 61763.0], [81.1, 61763.0], [81.2, 61763.0], [81.3, 61763.0], [81.4, 61763.0], [81.5, 61763.0], [81.6, 62575.0], [81.7, 62575.0], [81.8, 62575.0], [81.9, 62575.0], [82.0, 62575.0], [82.1, 62575.0], [82.2, 64455.0], [82.3, 64455.0], [82.4, 64455.0], [82.5, 64455.0], [82.6, 64455.0], [82.7, 64455.0], [82.8, 64455.0], [82.9, 66790.0], [83.0, 66790.0], [83.1, 66790.0], [83.2, 66790.0], [83.3, 66790.0], [83.4, 66790.0], [83.5, 67140.0], [83.6, 67140.0], [83.7, 67140.0], [83.8, 67140.0], [83.9, 67140.0], [84.0, 67140.0], [84.1, 69321.0], [84.2, 69321.0], [84.3, 69321.0], [84.4, 69321.0], [84.5, 69321.0], [84.6, 69321.0], [84.7, 69321.0], [84.8, 69569.0], [84.9, 69569.0], [85.0, 69569.0], [85.1, 69569.0], [85.2, 69569.0], [85.3, 69569.0], [85.4, 73598.0], [85.5, 73598.0], [85.6, 73598.0], [85.7, 73598.0], [85.8, 73598.0], [85.9, 73598.0], [86.0, 74124.0], [86.1, 74124.0], [86.2, 74124.0], [86.3, 74124.0], [86.4, 74124.0], [86.5, 74124.0], [86.6, 74124.0], [86.7, 74460.0], [86.8, 74460.0], [86.9, 74460.0], [87.0, 74460.0], [87.1, 74460.0], [87.2, 74460.0], [87.3, 75128.0], [87.4, 75128.0], [87.5, 75128.0], [87.6, 75128.0], [87.7, 75128.0], [87.8, 75128.0], [87.9, 75188.0], [88.0, 75188.0], [88.1, 75188.0], [88.2, 75188.0], [88.3, 75188.0], [88.4, 75188.0], [88.5, 75188.0], [88.6, 76186.0], [88.7, 76186.0], [88.8, 76186.0], [88.9, 76186.0], [89.0, 76186.0], [89.1, 76186.0], [89.2, 76269.0], [89.3, 76269.0], [89.4, 76269.0], [89.5, 76269.0], [89.6, 76269.0], [89.7, 76269.0], [89.8, 76269.0], [89.9, 76430.0], [90.0, 76430.0], [90.1, 76430.0], [90.2, 76430.0], [90.3, 76430.0], [90.4, 76430.0], [90.5, 76625.0], [90.6, 76625.0], [90.7, 76625.0], [90.8, 76625.0], [90.9, 76625.0], [91.0, 76625.0], [91.1, 79044.0], [91.2, 79044.0], [91.3, 79044.0], [91.4, 79044.0], [91.5, 79044.0], [91.6, 79044.0], [91.7, 79044.0], [91.8, 80104.0], [91.9, 80104.0], [92.0, 80104.0], [92.1, 80104.0], [92.2, 80104.0], [92.3, 80104.0], [92.4, 80861.0], [92.5, 80861.0], [92.6, 80861.0], [92.7, 80861.0], [92.8, 80861.0], [92.9, 80861.0], [93.0, 82864.0], [93.1, 82864.0], [93.2, 82864.0], [93.3, 82864.0], [93.4, 82864.0], [93.5, 82864.0], [93.6, 82864.0], [93.7, 82935.0], [93.8, 82935.0], [93.9, 82935.0], [94.0, 82935.0], [94.1, 82935.0], [94.2, 82935.0], [94.3, 83358.0], [94.4, 83358.0], [94.5, 83358.0], [94.6, 83358.0], [94.7, 83358.0], [94.8, 83358.0], [94.9, 83358.0], [95.0, 84186.0], [95.1, 84186.0], [95.2, 84186.0], [95.3, 84186.0], [95.4, 84186.0], [95.5, 84186.0], [95.6, 88274.0], [95.7, 88274.0], [95.8, 88274.0], [95.9, 88274.0], [96.0, 88274.0], [96.1, 88274.0], [96.2, 88737.0], [96.3, 88737.0], [96.4, 88737.0], [96.5, 88737.0], [96.6, 88737.0], [96.7, 88737.0], [96.8, 88737.0], [96.9, 90045.0], [97.0, 90045.0], [97.1, 90045.0], [97.2, 90045.0], [97.3, 90045.0], [97.4, 90045.0], [97.5, 90068.0], [97.6, 90068.0], [97.7, 90068.0], [97.8, 90068.0], [97.9, 90068.0], [98.0, 90068.0], [98.1, 90212.0], [98.2, 90212.0], [98.3, 90212.0], [98.4, 90212.0], [98.5, 90212.0], [98.6, 90212.0], [98.7, 90212.0], [98.8, 90874.0], [98.9, 90874.0], [99.0, 90874.0], [99.1, 90874.0], [99.2, 90874.0], [99.3, 90874.0], [99.4, 90968.0], [99.5, 90968.0], [99.6, 90968.0], [99.7, 90968.0], [99.8, 90968.0], [99.9, 90968.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 2400.0, "maxY": 3.0, "series": [{"data": [[67100.0, 1.0], [69500.0, 1.0], [66700.0, 1.0], [73500.0, 1.0], [75100.0, 2.0], [88700.0, 1.0], [33100.0, 1.0], [34500.0, 1.0], [34900.0, 1.0], [35500.0, 1.0], [37300.0, 1.0], [38900.0, 1.0], [39300.0, 1.0], [43900.0, 1.0], [46100.0, 1.0], [46700.0, 1.0], [48500.0, 1.0], [51500.0, 1.0], [53100.0, 1.0], [54100.0, 1.0], [56500.0, 1.0], [61300.0, 1.0], [61500.0, 1.0], [62500.0, 1.0], [61700.0, 1.0], [76200.0, 1.0], [76600.0, 1.0], [79000.0, 1.0], [88200.0, 1.0], [90200.0, 1.0], [2400.0, 1.0], [2600.0, 1.0], [2700.0, 1.0], [2900.0, 1.0], [3100.0, 1.0], [3200.0, 1.0], [3500.0, 1.0], [4000.0, 1.0], [69300.0, 1.0], [4400.0, 1.0], [4600.0, 1.0], [4700.0, 1.0], [74100.0, 1.0], [76100.0, 1.0], [5100.0, 1.0], [80100.0, 1.0], [83300.0, 1.0], [84100.0, 1.0], [82900.0, 1.0], [5400.0, 1.0], [5500.0, 1.0], [5600.0, 1.0], [90900.0, 1.0], [6800.0, 1.0], [6700.0, 1.0], [7600.0, 1.0], [8200.0, 1.0], [8300.0, 1.0], [8700.0, 1.0], [9500.0, 1.0], [9700.0, 1.0], [10000.0, 2.0], [10400.0, 1.0], [10700.0, 2.0], [10500.0, 1.0], [11000.0, 1.0], [11500.0, 2.0], [11400.0, 1.0], [12000.0, 1.0], [12100.0, 1.0], [12200.0, 1.0], [12500.0, 1.0], [12600.0, 1.0], [13300.0, 1.0], [14000.0, 1.0], [14800.0, 2.0], [14400.0, 1.0], [14900.0, 1.0], [15300.0, 1.0], [15600.0, 1.0], [15900.0, 2.0], [16600.0, 1.0], [16700.0, 1.0], [16400.0, 1.0], [17200.0, 1.0], [17000.0, 1.0], [17500.0, 1.0], [18300.0, 1.0], [19400.0, 1.0], [18700.0, 1.0], [19500.0, 2.0], [19600.0, 3.0], [19800.0, 1.0], [19900.0, 1.0], [20000.0, 1.0], [21200.0, 2.0], [21100.0, 1.0], [22500.0, 1.0], [23200.0, 2.0], [23300.0, 1.0], [23100.0, 1.0], [22700.0, 1.0], [24000.0, 1.0], [24500.0, 1.0], [24700.0, 1.0], [26300.0, 1.0], [26600.0, 1.0], [26500.0, 1.0], [26900.0, 1.0], [27900.0, 1.0], [28300.0, 1.0], [28700.0, 1.0], [30300.0, 3.0], [30100.0, 2.0], [30200.0, 1.0], [31300.0, 1.0], [32300.0, 1.0], [31900.0, 1.0], [32600.0, 1.0], [33800.0, 1.0], [34600.0, 1.0], [35400.0, 2.0], [36000.0, 1.0], [38000.0, 2.0], [37800.0, 1.0], [46200.0, 1.0], [47600.0, 1.0], [50000.0, 1.0], [52800.0, 1.0], [52000.0, 1.0], [57000.0, 1.0], [59600.0, 1.0], [61000.0, 1.0], [64400.0, 1.0], [76400.0, 1.0], [74400.0, 1.0], [80800.0, 1.0], [82800.0, 1.0], [90000.0, 2.0], [90800.0, 1.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 90900.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 157.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 157.0, "series": [{"data": [[2.0, 157.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 2.1666666666666665, "minX": 1.52711934E12, "maxY": 29.34782608695652, "series": [{"data": [[1.52711952E12, 25.16666666666667], [1.5271194E12, 7.4054054054054035], [1.52711958E12, 29.34782608695652], [1.52711946E12, 16.24324324324324], [1.52711964E12, 12.5], [1.52711934E12, 2.1666666666666665]], "isOverall": false, "label": "jp@gc Ultima Thread - Meta Allergen Only", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711964E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 15589.545454545456, "minX": 1.0, "maxY": 55086.0, "series": [{"data": [[2.0, 17386.25], [3.0, 16131.6], [4.0, 20793.25], [5.0, 18283.6], [6.0, 22101.0], [7.0, 15589.545454545456], [8.0, 27346.25], [9.0, 27864.5], [10.0, 25963.6], [11.0, 29558.75], [12.0, 27558.6], [13.0, 29022.2], [14.0, 24398.8], [15.0, 35793.0], [1.0, 33617.0], [16.0, 32458.0], [17.0, 41946.66666666667], [18.0, 44816.33333333333], [19.0, 33953.0], [20.0, 46597.66666666667], [21.0, 41944.5], [22.0, 35502.0], [23.0, 45667.0], [24.0, 41919.16666666667], [25.0, 47209.333333333336], [26.0, 45090.75], [27.0, 44514.6], [28.0, 55086.0], [29.0, 49827.0], [30.0, 51977.14285714286]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}, {"data": [[16.675159235668787, 34230.46496815287]], "isOverall": false, "label": "Get ALLERGY allergens-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 30.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 17.2, "minX": 1.52711934E12, "maxY": 2502578.25, "series": [{"data": [[1.52711952E12, 2029117.5], [1.5271194E12, 2502578.25], [1.52711958E12, 1555656.75], [1.52711946E12, 2502578.25], [1.52711964E12, 1623294.0], [1.52711934E12, 405823.5]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52711952E12, 86.0], [1.5271194E12, 106.06666666666666], [1.52711958E12, 65.93333333333334], [1.52711946E12, 106.06666666666666], [1.52711964E12, 68.8], [1.52711934E12, 17.2]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711964E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2866.5, "minX": 1.52711934E12, "maxY": 79328.16666666667, "series": [{"data": [[1.52711952E12, 33636.066666666666], [1.5271194E12, 9499.945945945945], [1.52711958E12, 58459.21739130434], [1.52711946E12, 20215.297297297293], [1.52711964E12, 79328.16666666667], [1.52711934E12, 2866.5]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711964E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 2851.3333333333335, "minX": 1.52711934E12, "maxY": 78599.58333333333, "series": [{"data": [[1.52711952E12, 32741.53333333333], [1.5271194E12, 9325.000000000002], [1.52711958E12, 56416.82608695653], [1.52711946E12, 19729.567567567567], [1.52711964E12, 78599.58333333333], [1.52711934E12, 2851.3333333333335]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711964E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.43333333333333335, "minX": 1.52711934E12, "maxY": 7.5, "series": [{"data": [[1.52711952E12, 0.43333333333333335], [1.5271194E12, 0.5675675675675675], [1.52711958E12, 0.47826086956521735], [1.52711946E12, 0.5675675675675675], [1.52711964E12, 0.6666666666666665], [1.52711934E12, 7.5]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711964E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 2412.0, "minX": 1.52711934E12, "maxY": 90968.0, "series": [{"data": [[1.52711952E12, 43960.0], [1.5271194E12, 14900.0], [1.52711958E12, 76269.0], [1.52711946E12, 26656.0], [1.52711964E12, 90968.0], [1.52711934E12, 3255.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52711952E12, 26981.0], [1.5271194E12, 3538.0], [1.52711958E12, 46193.0], [1.52711946E12, 14068.0], [1.52711964E12, 61368.0], [1.52711934E12, 2412.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52711952E12, 35360.9], [1.5271194E12, 14022.600000000002], [1.52711958E12, 53731.600000000006], [1.52711946E12, 23286.8], [1.52711964E12, 76469.0], [1.52711934E12, 3255.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52711952E12, 43453.12], [1.5271194E12, 14900.0], [1.52711958E12, 76240.78], [1.52711946E12, 26656.0], [1.52711964E12, 90913.48], [1.52711934E12, 3255.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52711952E12, 37930.649999999994], [1.5271194E12, 14840.8], [1.52711958E12, 62006.6], [1.52711946E12, 24739.5], [1.52711964E12, 84594.79999999997], [1.52711934E12, 3255.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711964E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 26578.0, "minX": 0.0, "maxY": 26578.0, "series": [{"data": [[0.0, 26578.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 25912.0, "minX": 0.0, "maxY": 25912.0, "series": [{"data": [[0.0, 25912.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.15, "minX": 1.52711934E12, "maxY": 0.7666666666666667, "series": [{"data": [[1.52711952E12, 0.65], [1.5271194E12, 0.7666666666666667], [1.52711958E12, 0.2833333333333333], [1.52711946E12, 0.7666666666666667], [1.52711934E12, 0.15]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711958E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.1, "minX": 1.52711934E12, "maxY": 0.6166666666666667, "series": [{"data": [[1.52711952E12, 0.5], [1.5271194E12, 0.6166666666666667], [1.52711958E12, 0.38333333333333336], [1.52711946E12, 0.6166666666666667], [1.52711964E12, 0.4], [1.52711934E12, 0.1]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52711964E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.1, "minX": 1.52711934E12, "maxY": 0.6166666666666667, "series": [{"data": [[1.52711952E12, 0.5], [1.5271194E12, 0.6166666666666667], [1.52711958E12, 0.38333333333333336], [1.52711946E12, 0.6166666666666667], [1.52711964E12, 0.4], [1.52711934E12, 0.1]], "isOverall": false, "label": "Get ALLERGY allergens-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52711964E12, "title": "Transactions Per Second"}},
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
