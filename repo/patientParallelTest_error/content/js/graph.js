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
        data: {"result": {"minY": 2395.0, "minX": 0.0, "maxY": 142572.0, "series": [{"data": [[0.0, 2395.0], [0.1, 2395.0], [0.2, 2395.0], [0.3, 2395.0], [0.4, 2395.0], [0.5, 2395.0], [0.6, 2395.0], [0.7, 2583.0], [0.8, 2583.0], [0.9, 2583.0], [1.0, 2583.0], [1.1, 2583.0], [1.2, 2583.0], [1.3, 2583.0], [1.4, 2590.0], [1.5, 2590.0], [1.6, 2590.0], [1.7, 2590.0], [1.8, 2590.0], [1.9, 2590.0], [2.0, 2590.0], [2.1, 2847.0], [2.2, 2847.0], [2.3, 2847.0], [2.4, 2847.0], [2.5, 2847.0], [2.6, 2847.0], [2.7, 2847.0], [2.8, 3088.0], [2.9, 3088.0], [3.0, 3088.0], [3.1, 3088.0], [3.2, 3088.0], [3.3, 3088.0], [3.4, 3088.0], [3.5, 3108.0], [3.6, 3108.0], [3.7, 3108.0], [3.8, 3108.0], [3.9, 3108.0], [4.0, 3108.0], [4.1, 3108.0], [4.2, 3745.0], [4.3, 3745.0], [4.4, 3745.0], [4.5, 3745.0], [4.6, 3745.0], [4.7, 3745.0], [4.8, 3745.0], [4.9, 4081.0], [5.0, 4081.0], [5.1, 4081.0], [5.2, 4081.0], [5.3, 4081.0], [5.4, 4081.0], [5.5, 4081.0], [5.6, 4103.0], [5.7, 4103.0], [5.8, 4103.0], [5.9, 4103.0], [6.0, 4103.0], [6.1, 4103.0], [6.2, 4103.0], [6.3, 4121.0], [6.4, 4121.0], [6.5, 4121.0], [6.6, 4121.0], [6.7, 4121.0], [6.8, 4121.0], [6.9, 4121.0], [7.0, 4772.0], [7.1, 4772.0], [7.2, 4772.0], [7.3, 4772.0], [7.4, 4772.0], [7.5, 4772.0], [7.6, 4772.0], [7.7, 4874.0], [7.8, 4874.0], [7.9, 4874.0], [8.0, 4874.0], [8.1, 4874.0], [8.2, 4874.0], [8.3, 4874.0], [8.4, 5402.0], [8.5, 5402.0], [8.6, 5402.0], [8.7, 5402.0], [8.8, 5402.0], [8.9, 5402.0], [9.0, 5402.0], [9.1, 5537.0], [9.2, 5537.0], [9.3, 5537.0], [9.4, 5537.0], [9.5, 5537.0], [9.6, 5537.0], [9.7, 5537.0], [9.8, 5612.0], [9.9, 5612.0], [10.0, 5612.0], [10.1, 5612.0], [10.2, 5612.0], [10.3, 5612.0], [10.4, 5612.0], [10.5, 6294.0], [10.6, 6294.0], [10.7, 6294.0], [10.8, 6294.0], [10.9, 6294.0], [11.0, 6294.0], [11.1, 6294.0], [11.2, 6684.0], [11.3, 6684.0], [11.4, 6684.0], [11.5, 6684.0], [11.6, 6684.0], [11.7, 6684.0], [11.8, 6684.0], [11.9, 6980.0], [12.0, 6980.0], [12.1, 6980.0], [12.2, 6980.0], [12.3, 6980.0], [12.4, 6980.0], [12.5, 6980.0], [12.6, 7034.0], [12.7, 7034.0], [12.8, 7034.0], [12.9, 7034.0], [13.0, 7034.0], [13.1, 7034.0], [13.2, 7034.0], [13.3, 7771.0], [13.4, 7771.0], [13.5, 7771.0], [13.6, 7771.0], [13.7, 7771.0], [13.8, 7771.0], [13.9, 7771.0], [14.0, 8065.0], [14.1, 8065.0], [14.2, 8065.0], [14.3, 8065.0], [14.4, 8065.0], [14.5, 8065.0], [14.6, 8065.0], [14.7, 8435.0], [14.8, 8435.0], [14.9, 8435.0], [15.0, 8435.0], [15.1, 8435.0], [15.2, 8435.0], [15.3, 8435.0], [15.4, 8583.0], [15.5, 8583.0], [15.6, 8583.0], [15.7, 8583.0], [15.8, 8583.0], [15.9, 8583.0], [16.0, 8583.0], [16.1, 8747.0], [16.2, 8747.0], [16.3, 8747.0], [16.4, 8747.0], [16.5, 8747.0], [16.6, 8747.0], [16.7, 8747.0], [16.8, 9075.0], [16.9, 9075.0], [17.0, 9075.0], [17.1, 9075.0], [17.2, 9075.0], [17.3, 9075.0], [17.4, 9075.0], [17.5, 9511.0], [17.6, 9511.0], [17.7, 9511.0], [17.8, 9511.0], [17.9, 9511.0], [18.0, 9511.0], [18.1, 9511.0], [18.2, 9744.0], [18.3, 9744.0], [18.4, 9744.0], [18.5, 9744.0], [18.6, 9744.0], [18.7, 9744.0], [18.8, 9744.0], [18.9, 9876.0], [19.0, 9876.0], [19.1, 9876.0], [19.2, 9876.0], [19.3, 9876.0], [19.4, 9876.0], [19.5, 9876.0], [19.6, 9959.0], [19.7, 9959.0], [19.8, 9959.0], [19.9, 9959.0], [20.0, 9959.0], [20.1, 9959.0], [20.2, 9959.0], [20.3, 10159.0], [20.4, 10159.0], [20.5, 10159.0], [20.6, 10159.0], [20.7, 10159.0], [20.8, 10159.0], [20.9, 10159.0], [21.0, 10187.0], [21.1, 10187.0], [21.2, 10187.0], [21.3, 10187.0], [21.4, 10187.0], [21.5, 10187.0], [21.6, 10187.0], [21.7, 10242.0], [21.8, 10242.0], [21.9, 10242.0], [22.0, 10242.0], [22.1, 10242.0], [22.2, 10242.0], [22.3, 10242.0], [22.4, 10337.0], [22.5, 10337.0], [22.6, 10337.0], [22.7, 10337.0], [22.8, 10337.0], [22.9, 10337.0], [23.0, 10337.0], [23.1, 10409.0], [23.2, 10409.0], [23.3, 10409.0], [23.4, 10409.0], [23.5, 10409.0], [23.6, 10409.0], [23.7, 10409.0], [23.8, 10422.0], [23.9, 10422.0], [24.0, 10422.0], [24.1, 10422.0], [24.2, 10422.0], [24.3, 10422.0], [24.4, 10422.0], [24.5, 11262.0], [24.6, 11262.0], [24.7, 11262.0], [24.8, 11262.0], [24.9, 11262.0], [25.0, 11262.0], [25.1, 11262.0], [25.2, 11401.0], [25.3, 11401.0], [25.4, 11401.0], [25.5, 11401.0], [25.6, 11401.0], [25.7, 11401.0], [25.8, 11401.0], [25.9, 11428.0], [26.0, 11428.0], [26.1, 11428.0], [26.2, 11428.0], [26.3, 11428.0], [26.4, 11428.0], [26.5, 11428.0], [26.6, 11544.0], [26.7, 11544.0], [26.8, 11544.0], [26.9, 11544.0], [27.0, 11544.0], [27.1, 11544.0], [27.2, 11544.0], [27.3, 12850.0], [27.4, 12850.0], [27.5, 12850.0], [27.6, 12850.0], [27.7, 12850.0], [27.8, 12850.0], [27.9, 12850.0], [28.0, 13108.0], [28.1, 13108.0], [28.2, 13108.0], [28.3, 13108.0], [28.4, 13108.0], [28.5, 13108.0], [28.6, 13108.0], [28.7, 13711.0], [28.8, 13711.0], [28.9, 13711.0], [29.0, 13711.0], [29.1, 13711.0], [29.2, 13711.0], [29.3, 13711.0], [29.4, 13996.0], [29.5, 13996.0], [29.6, 13996.0], [29.7, 13996.0], [29.8, 13996.0], [29.9, 13996.0], [30.0, 13996.0], [30.1, 14306.0], [30.2, 14306.0], [30.3, 14306.0], [30.4, 14306.0], [30.5, 14306.0], [30.6, 14306.0], [30.7, 14306.0], [30.8, 14448.0], [30.9, 14448.0], [31.0, 14448.0], [31.1, 14448.0], [31.2, 14448.0], [31.3, 14448.0], [31.4, 14448.0], [31.5, 14487.0], [31.6, 14487.0], [31.7, 14487.0], [31.8, 14487.0], [31.9, 14487.0], [32.0, 14487.0], [32.1, 14487.0], [32.2, 14547.0], [32.3, 14547.0], [32.4, 14547.0], [32.5, 14547.0], [32.6, 14547.0], [32.7, 14547.0], [32.8, 14547.0], [32.9, 15121.0], [33.0, 15121.0], [33.1, 15121.0], [33.2, 15121.0], [33.3, 15121.0], [33.4, 15121.0], [33.5, 15121.0], [33.6, 15470.0], [33.7, 15470.0], [33.8, 15470.0], [33.9, 15470.0], [34.0, 15470.0], [34.1, 15470.0], [34.2, 15470.0], [34.3, 16628.0], [34.4, 16628.0], [34.5, 16628.0], [34.6, 16628.0], [34.7, 16628.0], [34.8, 16628.0], [34.9, 16628.0], [35.0, 16726.0], [35.1, 16726.0], [35.2, 16726.0], [35.3, 16726.0], [35.4, 16726.0], [35.5, 16726.0], [35.6, 16726.0], [35.7, 17051.0], [35.8, 17051.0], [35.9, 17051.0], [36.0, 17051.0], [36.1, 17051.0], [36.2, 17051.0], [36.3, 17051.0], [36.4, 18250.0], [36.5, 18250.0], [36.6, 18250.0], [36.7, 18250.0], [36.8, 18250.0], [36.9, 18250.0], [37.0, 18250.0], [37.1, 18512.0], [37.2, 18512.0], [37.3, 18512.0], [37.4, 18512.0], [37.5, 18512.0], [37.6, 18512.0], [37.7, 18512.0], [37.8, 18608.0], [37.9, 18608.0], [38.0, 18608.0], [38.1, 18608.0], [38.2, 18608.0], [38.3, 18608.0], [38.4, 18608.0], [38.5, 18853.0], [38.6, 18853.0], [38.7, 18853.0], [38.8, 18853.0], [38.9, 18853.0], [39.0, 18853.0], [39.1, 18853.0], [39.2, 19361.0], [39.3, 19361.0], [39.4, 19361.0], [39.5, 19361.0], [39.6, 19361.0], [39.7, 19361.0], [39.8, 19361.0], [39.9, 20142.0], [40.0, 20142.0], [40.1, 20142.0], [40.2, 20142.0], [40.3, 20142.0], [40.4, 20142.0], [40.5, 20142.0], [40.6, 20592.0], [40.7, 20592.0], [40.8, 20592.0], [40.9, 20592.0], [41.0, 20592.0], [41.1, 20592.0], [41.2, 20592.0], [41.3, 20791.0], [41.4, 20791.0], [41.5, 20791.0], [41.6, 20791.0], [41.7, 20791.0], [41.8, 20791.0], [41.9, 20791.0], [42.0, 20838.0], [42.1, 20838.0], [42.2, 20838.0], [42.3, 20838.0], [42.4, 20838.0], [42.5, 20838.0], [42.6, 20838.0], [42.7, 21080.0], [42.8, 21080.0], [42.9, 21080.0], [43.0, 21080.0], [43.1, 21080.0], [43.2, 21080.0], [43.3, 21080.0], [43.4, 21139.0], [43.5, 21139.0], [43.6, 21139.0], [43.7, 21139.0], [43.8, 21139.0], [43.9, 21139.0], [44.0, 21139.0], [44.1, 21292.0], [44.2, 21292.0], [44.3, 21292.0], [44.4, 21292.0], [44.5, 21292.0], [44.6, 21292.0], [44.7, 21292.0], [44.8, 21789.0], [44.9, 21789.0], [45.0, 21789.0], [45.1, 21789.0], [45.2, 21789.0], [45.3, 21789.0], [45.4, 21789.0], [45.5, 21921.0], [45.6, 21921.0], [45.7, 21921.0], [45.8, 21921.0], [45.9, 21921.0], [46.0, 21921.0], [46.1, 21921.0], [46.2, 21924.0], [46.3, 21924.0], [46.4, 21924.0], [46.5, 21924.0], [46.6, 21924.0], [46.7, 21924.0], [46.8, 21924.0], [46.9, 22013.0], [47.0, 22013.0], [47.1, 22013.0], [47.2, 22013.0], [47.3, 22013.0], [47.4, 22013.0], [47.5, 22013.0], [47.6, 22050.0], [47.7, 22050.0], [47.8, 22050.0], [47.9, 22050.0], [48.0, 22050.0], [48.1, 22050.0], [48.2, 22050.0], [48.3, 22613.0], [48.4, 22613.0], [48.5, 22613.0], [48.6, 22613.0], [48.7, 22613.0], [48.8, 22613.0], [48.9, 22613.0], [49.0, 22699.0], [49.1, 22699.0], [49.2, 22699.0], [49.3, 22699.0], [49.4, 22699.0], [49.5, 22699.0], [49.6, 22699.0], [49.7, 22788.0], [49.8, 22788.0], [49.9, 22788.0], [50.0, 22788.0], [50.1, 22788.0], [50.2, 22788.0], [50.3, 22788.0], [50.4, 24016.0], [50.5, 24016.0], [50.6, 24016.0], [50.7, 24016.0], [50.8, 24016.0], [50.9, 24016.0], [51.0, 24016.0], [51.1, 24047.0], [51.2, 24047.0], [51.3, 24047.0], [51.4, 24047.0], [51.5, 24047.0], [51.6, 24047.0], [51.7, 24047.0], [51.8, 24092.0], [51.9, 24092.0], [52.0, 24092.0], [52.1, 24092.0], [52.2, 24092.0], [52.3, 24092.0], [52.4, 24092.0], [52.5, 24324.0], [52.6, 24324.0], [52.7, 24324.0], [52.8, 24324.0], [52.9, 24324.0], [53.0, 24324.0], [53.1, 24324.0], [53.2, 24356.0], [53.3, 24356.0], [53.4, 24356.0], [53.5, 24356.0], [53.6, 24356.0], [53.7, 24356.0], [53.8, 24356.0], [53.9, 24638.0], [54.0, 24638.0], [54.1, 24638.0], [54.2, 24638.0], [54.3, 24638.0], [54.4, 24638.0], [54.5, 24638.0], [54.6, 25068.0], [54.7, 25068.0], [54.8, 25068.0], [54.9, 25068.0], [55.0, 25068.0], [55.1, 25068.0], [55.2, 25068.0], [55.3, 26742.0], [55.4, 26742.0], [55.5, 26742.0], [55.6, 26742.0], [55.7, 26742.0], [55.8, 26742.0], [55.9, 26742.0], [56.0, 27438.0], [56.1, 27438.0], [56.2, 27438.0], [56.3, 27438.0], [56.4, 27438.0], [56.5, 27438.0], [56.6, 27438.0], [56.7, 27935.0], [56.8, 27935.0], [56.9, 27935.0], [57.0, 27935.0], [57.1, 27935.0], [57.2, 27935.0], [57.3, 27935.0], [57.4, 28239.0], [57.5, 28239.0], [57.6, 28239.0], [57.7, 28239.0], [57.8, 28239.0], [57.9, 28239.0], [58.0, 28239.0], [58.1, 29186.0], [58.2, 29186.0], [58.3, 29186.0], [58.4, 29186.0], [58.5, 29186.0], [58.6, 29186.0], [58.7, 29186.0], [58.8, 29296.0], [58.9, 29296.0], [59.0, 29296.0], [59.1, 29296.0], [59.2, 29296.0], [59.3, 29296.0], [59.4, 29296.0], [59.5, 30450.0], [59.6, 30450.0], [59.7, 30450.0], [59.8, 30450.0], [59.9, 30450.0], [60.0, 30450.0], [60.1, 30450.0], [60.2, 31387.0], [60.3, 31387.0], [60.4, 31387.0], [60.5, 31387.0], [60.6, 31387.0], [60.7, 31387.0], [60.8, 31387.0], [60.9, 31744.0], [61.0, 31744.0], [61.1, 31744.0], [61.2, 31744.0], [61.3, 31744.0], [61.4, 31744.0], [61.5, 31744.0], [61.6, 32016.0], [61.7, 32016.0], [61.8, 32016.0], [61.9, 32016.0], [62.0, 32016.0], [62.1, 32016.0], [62.2, 32016.0], [62.3, 32692.0], [62.4, 32692.0], [62.5, 32692.0], [62.6, 32692.0], [62.7, 32692.0], [62.8, 32692.0], [62.9, 32692.0], [63.0, 32966.0], [63.1, 32966.0], [63.2, 32966.0], [63.3, 32966.0], [63.4, 32966.0], [63.5, 32966.0], [63.6, 32966.0], [63.7, 33124.0], [63.8, 33124.0], [63.9, 33124.0], [64.0, 33124.0], [64.1, 33124.0], [64.2, 33124.0], [64.3, 33124.0], [64.4, 33412.0], [64.5, 33412.0], [64.6, 33412.0], [64.7, 33412.0], [64.8, 33412.0], [64.9, 33412.0], [65.0, 33412.0], [65.1, 33651.0], [65.2, 33651.0], [65.3, 33651.0], [65.4, 33651.0], [65.5, 33651.0], [65.6, 33651.0], [65.7, 33651.0], [65.8, 34925.0], [65.9, 34925.0], [66.0, 34925.0], [66.1, 34925.0], [66.2, 34925.0], [66.3, 34925.0], [66.4, 34925.0], [66.5, 35172.0], [66.6, 35172.0], [66.7, 35172.0], [66.8, 35172.0], [66.9, 35172.0], [67.0, 35172.0], [67.1, 35172.0], [67.2, 35399.0], [67.3, 35399.0], [67.4, 35399.0], [67.5, 35399.0], [67.6, 35399.0], [67.7, 35399.0], [67.8, 35399.0], [67.9, 36260.0], [68.0, 36260.0], [68.1, 36260.0], [68.2, 36260.0], [68.3, 36260.0], [68.4, 36260.0], [68.5, 36260.0], [68.6, 36463.0], [68.7, 36463.0], [68.8, 36463.0], [68.9, 36463.0], [69.0, 36463.0], [69.1, 36463.0], [69.2, 36463.0], [69.3, 37097.0], [69.4, 37097.0], [69.5, 37097.0], [69.6, 37097.0], [69.7, 37097.0], [69.8, 37097.0], [69.9, 37097.0], [70.0, 37311.0], [70.1, 37311.0], [70.2, 37311.0], [70.3, 37311.0], [70.4, 37311.0], [70.5, 37311.0], [70.6, 37311.0], [70.7, 38442.0], [70.8, 38442.0], [70.9, 38442.0], [71.0, 38442.0], [71.1, 38442.0], [71.2, 38442.0], [71.3, 38442.0], [71.4, 39865.0], [71.5, 39865.0], [71.6, 39865.0], [71.7, 39865.0], [71.8, 39865.0], [71.9, 39865.0], [72.0, 39865.0], [72.1, 40179.0], [72.2, 40179.0], [72.3, 40179.0], [72.4, 40179.0], [72.5, 40179.0], [72.6, 40179.0], [72.7, 40179.0], [72.8, 40523.0], [72.9, 40523.0], [73.0, 40523.0], [73.1, 40523.0], [73.2, 40523.0], [73.3, 40523.0], [73.4, 40523.0], [73.5, 41499.0], [73.6, 41499.0], [73.7, 41499.0], [73.8, 41499.0], [73.9, 41499.0], [74.0, 41499.0], [74.1, 41499.0], [74.2, 43764.0], [74.3, 43764.0], [74.4, 43764.0], [74.5, 43764.0], [74.6, 43764.0], [74.7, 43764.0], [74.8, 43764.0], [74.9, 45487.0], [75.0, 45487.0], [75.1, 45487.0], [75.2, 45487.0], [75.3, 45487.0], [75.4, 45487.0], [75.5, 45487.0], [75.6, 46344.0], [75.7, 46344.0], [75.8, 46344.0], [75.9, 46344.0], [76.0, 46344.0], [76.1, 46344.0], [76.2, 46344.0], [76.3, 84751.0], [76.4, 84751.0], [76.5, 84751.0], [76.6, 84751.0], [76.7, 84751.0], [76.8, 84751.0], [76.9, 84751.0], [77.0, 98025.0], [77.1, 98025.0], [77.2, 98025.0], [77.3, 98025.0], [77.4, 98025.0], [77.5, 98025.0], [77.6, 98025.0], [77.7, 98427.0], [77.8, 98427.0], [77.9, 98427.0], [78.0, 98427.0], [78.1, 98427.0], [78.2, 98427.0], [78.3, 98427.0], [78.4, 120503.0], [78.5, 120503.0], [78.6, 120503.0], [78.7, 120503.0], [78.8, 120503.0], [78.9, 120503.0], [79.0, 120503.0], [79.1, 120560.0], [79.2, 120560.0], [79.3, 120560.0], [79.4, 120560.0], [79.5, 120560.0], [79.6, 120560.0], [79.7, 120560.0], [79.8, 120911.0], [79.9, 120911.0], [80.0, 120911.0], [80.1, 120911.0], [80.2, 120911.0], [80.3, 120911.0], [80.4, 120911.0], [80.5, 121204.0], [80.6, 121204.0], [80.7, 121204.0], [80.8, 121204.0], [80.9, 121204.0], [81.0, 121204.0], [81.1, 121204.0], [81.2, 121451.0], [81.3, 121451.0], [81.4, 121451.0], [81.5, 121451.0], [81.6, 121451.0], [81.7, 121451.0], [81.8, 121451.0], [81.9, 123081.0], [82.0, 123081.0], [82.1, 123081.0], [82.2, 123081.0], [82.3, 123081.0], [82.4, 123081.0], [82.5, 123081.0], [82.6, 123556.0], [82.7, 123556.0], [82.8, 123556.0], [82.9, 123556.0], [83.0, 123556.0], [83.1, 123556.0], [83.2, 123556.0], [83.3, 123563.0], [83.4, 123563.0], [83.5, 123563.0], [83.6, 123563.0], [83.7, 123563.0], [83.8, 123563.0], [83.9, 123563.0], [84.0, 123864.0], [84.1, 123864.0], [84.2, 123864.0], [84.3, 123864.0], [84.4, 123864.0], [84.5, 123864.0], [84.6, 123864.0], [84.7, 124055.0], [84.8, 124055.0], [84.9, 124055.0], [85.0, 124055.0], [85.1, 124055.0], [85.2, 124055.0], [85.3, 124055.0], [85.4, 124475.0], [85.5, 124475.0], [85.6, 124475.0], [85.7, 124475.0], [85.8, 124475.0], [85.9, 124475.0], [86.0, 124475.0], [86.1, 124735.0], [86.2, 124735.0], [86.3, 124735.0], [86.4, 124735.0], [86.5, 124735.0], [86.6, 124735.0], [86.7, 124735.0], [86.8, 124886.0], [86.9, 124886.0], [87.0, 124886.0], [87.1, 124886.0], [87.2, 124886.0], [87.3, 124886.0], [87.4, 124886.0], [87.5, 125004.0], [87.6, 125004.0], [87.7, 125004.0], [87.8, 125004.0], [87.9, 125004.0], [88.0, 125004.0], [88.1, 125004.0], [88.2, 125052.0], [88.3, 125052.0], [88.4, 125052.0], [88.5, 125052.0], [88.6, 125052.0], [88.7, 125052.0], [88.8, 125052.0], [88.9, 125140.0], [89.0, 125140.0], [89.1, 125140.0], [89.2, 125140.0], [89.3, 125140.0], [89.4, 125140.0], [89.5, 125140.0], [89.6, 126098.0], [89.7, 126098.0], [89.8, 126098.0], [89.9, 126098.0], [90.0, 126098.0], [90.1, 126098.0], [90.2, 126098.0], [90.3, 126226.0], [90.4, 126226.0], [90.5, 126226.0], [90.6, 126226.0], [90.7, 126226.0], [90.8, 126226.0], [90.9, 126226.0], [91.0, 126438.0], [91.1, 126438.0], [91.2, 126438.0], [91.3, 126438.0], [91.4, 126438.0], [91.5, 126438.0], [91.6, 126438.0], [91.7, 127526.0], [91.8, 127526.0], [91.9, 127526.0], [92.0, 127526.0], [92.1, 127526.0], [92.2, 127526.0], [92.3, 127526.0], [92.4, 127555.0], [92.5, 127555.0], [92.6, 127555.0], [92.7, 127555.0], [92.8, 127555.0], [92.9, 127555.0], [93.0, 127555.0], [93.1, 127900.0], [93.2, 127900.0], [93.3, 127900.0], [93.4, 127900.0], [93.5, 127900.0], [93.6, 127900.0], [93.7, 127900.0], [93.8, 128085.0], [93.9, 128085.0], [94.0, 128085.0], [94.1, 128085.0], [94.2, 128085.0], [94.3, 128085.0], [94.4, 128085.0], [94.5, 128147.0], [94.6, 128147.0], [94.7, 128147.0], [94.8, 128147.0], [94.9, 128147.0], [95.0, 128147.0], [95.1, 128147.0], [95.2, 129396.0], [95.3, 129396.0], [95.4, 129396.0], [95.5, 129396.0], [95.6, 129396.0], [95.7, 129396.0], [95.8, 129396.0], [95.9, 130774.0], [96.0, 130774.0], [96.1, 130774.0], [96.2, 130774.0], [96.3, 130774.0], [96.4, 130774.0], [96.5, 130774.0], [96.6, 131319.0], [96.7, 131319.0], [96.8, 131319.0], [96.9, 131319.0], [97.0, 131319.0], [97.1, 131319.0], [97.2, 131319.0], [97.3, 131794.0], [97.4, 131794.0], [97.5, 131794.0], [97.6, 131794.0], [97.7, 131794.0], [97.8, 131794.0], [97.9, 131794.0], [98.0, 131894.0], [98.1, 131894.0], [98.2, 131894.0], [98.3, 131894.0], [98.4, 131894.0], [98.5, 131894.0], [98.6, 131894.0], [98.7, 133886.0], [98.8, 133886.0], [98.9, 133886.0], [99.0, 133886.0], [99.1, 133886.0], [99.2, 133886.0], [99.3, 133886.0], [99.4, 142572.0], [99.5, 142572.0], [99.6, 142572.0], [99.7, 142572.0], [99.8, 142572.0], [99.9, 142572.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 2300.0, "maxY": 3.0, "series": [{"data": [[131300.0, 1.0], [142500.0, 1.0], [84700.0, 1.0], [124700.0, 1.0], [123500.0, 2.0], [125100.0, 1.0], [130700.0, 1.0], [127500.0, 2.0], [127900.0, 1.0], [133800.0, 1.0], [32900.0, 1.0], [33100.0, 1.0], [34900.0, 1.0], [35300.0, 1.0], [35100.0, 1.0], [37300.0, 1.0], [40100.0, 1.0], [40500.0, 1.0], [43700.0, 1.0], [46300.0, 1.0], [121400.0, 1.0], [125000.0, 2.0], [126200.0, 1.0], [123000.0, 1.0], [123800.0, 1.0], [131700.0, 1.0], [2300.0, 1.0], [2500.0, 2.0], [2800.0, 1.0], [3000.0, 1.0], [3100.0, 1.0], [3700.0, 1.0], [4000.0, 1.0], [4100.0, 2.0], [4700.0, 1.0], [4800.0, 1.0], [5400.0, 1.0], [5600.0, 1.0], [5500.0, 1.0], [6200.0, 1.0], [6600.0, 1.0], [6900.0, 1.0], [7000.0, 1.0], [120900.0, 1.0], [120500.0, 2.0], [7700.0, 1.0], [8000.0, 1.0], [129300.0, 1.0], [128100.0, 1.0], [8400.0, 1.0], [8700.0, 1.0], [8500.0, 1.0], [131800.0, 1.0], [9000.0, 1.0], [9700.0, 1.0], [9500.0, 1.0], [9800.0, 1.0], [10200.0, 1.0], [9900.0, 1.0], [10100.0, 2.0], [10400.0, 2.0], [10300.0, 1.0], [11200.0, 1.0], [11400.0, 2.0], [11500.0, 1.0], [12800.0, 1.0], [13100.0, 1.0], [13700.0, 1.0], [14300.0, 1.0], [13900.0, 1.0], [14400.0, 2.0], [14500.0, 1.0], [15100.0, 1.0], [15400.0, 1.0], [16600.0, 1.0], [17000.0, 1.0], [16700.0, 1.0], [18200.0, 1.0], [18500.0, 1.0], [19300.0, 1.0], [18800.0, 1.0], [18600.0, 1.0], [20100.0, 1.0], [20500.0, 1.0], [20700.0, 1.0], [20800.0, 1.0], [21200.0, 1.0], [21000.0, 1.0], [21100.0, 1.0], [21900.0, 2.0], [22000.0, 2.0], [21700.0, 1.0], [22600.0, 2.0], [22700.0, 1.0], [24000.0, 3.0], [24300.0, 2.0], [24600.0, 1.0], [25000.0, 1.0], [26700.0, 1.0], [27400.0, 1.0], [28200.0, 1.0], [27900.0, 1.0], [29100.0, 1.0], [29200.0, 1.0], [30400.0, 1.0], [31700.0, 1.0], [31300.0, 1.0], [32000.0, 1.0], [32600.0, 1.0], [33400.0, 1.0], [33600.0, 1.0], [36200.0, 1.0], [36400.0, 1.0], [38400.0, 1.0], [37000.0, 1.0], [39800.0, 1.0], [41400.0, 1.0], [45400.0, 1.0], [98000.0, 1.0], [98400.0, 1.0], [121200.0, 1.0], [126000.0, 1.0], [124800.0, 1.0], [124400.0, 1.0], [124000.0, 1.0], [126400.0, 1.0], [128000.0, 1.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 142500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 29.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 114.0, "series": [{"data": [[3.0, 29.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 114.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.52712252E12, "maxY": 32.666666666666664, "series": [{"data": [[1.5271227E12, 26.928571428571427], [1.52712252E12, 2.0], [1.52712282E12, 18.13333333333334], [1.52712264E12, 16.8421052631579], [1.52712276E12, 32.666666666666664], [1.52712258E12, 7.078947368421051], [1.52712288E12, 1.0]], "isOverall": false, "label": "jp@gc Ultima Thread - Meta Allergen Only", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712288E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 2691.0, "minX": 1.0, "maxY": 97444.0, "series": [{"data": [[2.0, 2691.0], [32.0, 62845.0], [33.0, 76087.66666666667], [3.0, 3450.75], [4.0, 56211.57142857143], [5.0, 5517.0], [6.0, 30257.0], [7.0, 26702.076923076922], [8.0, 9835.0], [9.0, 10311.0], [10.0, 11408.75], [11.0, 41184.75], [12.0, 14064.666666666666], [13.0, 77636.66666666667], [14.0, 79600.0], [15.0, 19304.0], [1.0, 68234.5], [16.0, 21186.0], [17.0, 22613.0], [18.0, 21965.25], [19.0, 48983.5], [20.0, 24342.5], [21.0, 68669.28571428572], [22.0, 74977.0], [23.0, 58227.66666666667], [24.0, 59947.923076923085], [25.0, 66143.33333333334], [26.0, 34166.75], [27.0, 70042.8], [28.0, 37452.5], [29.0, 94517.33333333333], [30.0, 40189.0], [31.0, 97444.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}, {"data": [[16.195804195804193, 44161.62937062937]], "isOverall": false, "label": "Get ALLERGY allergens-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 33.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 0.0, "minX": 1.52712252E12, "maxY": 2570215.5, "series": [{"data": [[1.5271227E12, 1893843.0], [1.52712252E12, 338186.25], [1.52712282E12, 136288.1], [1.52712264E12, 2570215.5], [1.52712276E12, 202911.75], [1.52712258E12, 2570215.5], [1.52712288E12, 36.2]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5271227E12, 80.26666666666667], [1.52712252E12, 14.333333333333334], [1.52712282E12, 5.733333333333333], [1.52712264E12, 108.93333333333334], [1.52712276E12, 8.6], [1.52712258E12, 108.93333333333334], [1.52712288E12, 0.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712288E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2700.6, "minX": 1.52712252E12, "maxY": 133886.0, "series": [{"data": [[1.5271227E12, 35529.57142857143], [1.52712252E12, 2700.6], [1.52712282E12, 126258.8], [1.52712264E12, 20538.15789473684], [1.52712276E12, 93734.33333333333], [1.52712258E12, 8512.605263157893], [1.52712288E12, 133886.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712288E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 1.52712252E12, "maxY": 75581.0, "series": [{"data": [[1.5271227E12, 34482.535714285725], [1.52712252E12, 2681.4], [1.52712282E12, 8328.866666666669], [1.52712264E12, 19961.13157894736], [1.52712276E12, 75581.0], [1.52712258E12, 8365.078947368422], [1.52712288E12, 0.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712288E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.4, "minX": 1.52712252E12, "maxY": 9.2, "series": [{"data": [[1.5271227E12, 0.6071428571428572], [1.52712252E12, 9.2], [1.52712282E12, 0.4], [1.52712264E12, 0.5526315789473684], [1.52712276E12, 0.6666666666666667], [1.52712258E12, 0.5789473684210525], [1.52712288E12, 2.0]], "isOverall": false, "label": "Get ALLERGY allergens", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712288E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 2395.0, "minX": 1.52712252E12, "maxY": 142572.0, "series": [{"data": [[1.5271227E12, 46344.0], [1.52712252E12, 3088.0], [1.52712282E12, 142572.0], [1.52712264E12, 27438.0], [1.52712276E12, 98427.0], [1.52712258E12, 14306.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5271227E12, 27935.0], [1.52712252E12, 2395.0], [1.52712282E12, 131894.0], [1.52712264E12, 13996.0], [1.52712276E12, 84751.0], [1.52712258E12, 3108.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5271227E12, 36463.0], [1.52712252E12, 3088.0], [1.52712282E12, 40022.0], [1.52712264E12, 24040.8], [1.52712276E12, 38102.700000000004], [1.52712258E12, 12327.600000000002]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5271227E12, 46258.3], [1.52712252E12, 3088.0], [1.52712282E12, 140970.29999999993], [1.52712264E12, 27438.0], [1.52712276E12, 98374.74], [1.52712258E12, 14306.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5271227E12, 40351.0], [1.52712252E12, 3088.0], [1.52712282E12, 55945.75], [1.52712264E12, 24609.8], [1.52712276E12, 44367.04999999999], [1.52712258E12, 13590.399999999998]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712282E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 19751.5, "minX": 0.0, "maxY": 125052.0, "series": [{"data": [[0.0, 19751.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 125052.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 19155.5, "series": [{"data": [[0.0, 19155.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52712252E12, "maxY": 0.8333333333333334, "series": [{"data": [[1.5271227E12, 0.6333333333333333], [1.52712252E12, 0.1], [1.52712264E12, 0.8333333333333334], [1.52712276E12, 0.016666666666666666], [1.52712258E12, 0.8]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712276E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52712252E12, "maxY": 0.6333333333333333, "series": [{"data": [[1.5271227E12, 0.4666666666666667], [1.52712252E12, 0.08333333333333333], [1.52712282E12, 0.03333333333333333], [1.52712264E12, 0.6333333333333333], [1.52712276E12, 0.05], [1.52712258E12, 0.6333333333333333]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52712282E12, 0.4666666666666667], [1.52712288E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52712288E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52712252E12, "maxY": 0.6333333333333333, "series": [{"data": [[1.52712282E12, 0.4666666666666667], [1.52712288E12, 0.016666666666666666]], "isOverall": false, "label": "Get ALLERGY allergens-failure", "isController": false}, {"data": [[1.5271227E12, 0.4666666666666667], [1.52712252E12, 0.08333333333333333], [1.52712282E12, 0.03333333333333333], [1.52712264E12, 0.6333333333333333], [1.52712276E12, 0.05], [1.52712258E12, 0.6333333333333333]], "isOverall": false, "label": "Get ALLERGY allergens-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52712288E12, "title": "Transactions Per Second"}},
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
