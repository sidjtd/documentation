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
var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

/*
 * Add header in statistics table to group metrics by category
 * format
 *
 */
function summaryTableHeader(header) {
    var newRow = header.insertRow(-1);
    newRow.className = "tablesorter-no-sort";
    var cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Requests";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 3;
    cell.innerHTML = "Executions";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 7;
    cell.innerHTML = "Response Times (ms)";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 2;
    cell.innerHTML = "Network (KB/sec)";
    newRow.appendChild(cell);
}

/*
 * Populates the table identified by id parameter with the specified data and
 * format
 *
 */
function createTable(table, info, formatter, defaultSorts, seriesIndex, headerCreator) {
    var tableRef = table[0];

    // Create header and populate it with data.titles array
    var header = tableRef.createTHead();

    // Call callback is available
    if(headerCreator) {
        headerCreator(header);
    }

    var newRow = header.insertRow(-1);
    for (var index = 0; index < info.titles.length; index++) {
        var cell = document.createElement('th');
        cell.innerHTML = info.titles[index];
        newRow.appendChild(cell);
    }

    var tBody;

    // Create overall body if defined
    if(info.overall){
        tBody = document.createElement('tbody');
        tBody.className = "tablesorter-no-sort";
        tableRef.appendChild(tBody);
        var newRow = tBody.insertRow(-1);
        var data = info.overall.data;
        for(var index=0;index < data.length; index++){
            var cell = newRow.insertCell(-1);
            cell.innerHTML = formatter ? formatter(index, data[index]): data[index];
        }
    }

    // Create regular body
    tBody = document.createElement('tbody');
    tableRef.appendChild(tBody);

    var regexp;
    if(seriesFilter) {
        regexp = new RegExp(seriesFilter, 'i');
    }
    // Populate body with data.items array
    for(var index=0; index < info.items.length; index++){
        var item = info.items[index];
        if((!regexp || filtersOnlySampleSeries && !info.supportsControllersDiscrimination || regexp.test(item.data[seriesIndex]))
                &&
                (!showControllersOnly || !info.supportsControllersDiscrimination || item.isController)){
            if(item.data.length > 0) {
                var newRow = tBody.insertRow(-1);
                for(var col=0; col < item.data.length; col++){
                    var cell = newRow.insertCell(-1);
                    cell.innerHTML = formatter ? formatter(col, item.data[col]) : item.data[col];
                }
            }
        }
    }

    // Add support of columns sort
    table.tablesorter({sortList : defaultSorts});
}

$(document).ready(function() {

    // Customize table sorter default options
    $.extend( $.tablesorter.defaults, {
        theme: 'blue',
        cssInfoBlock: "tablesorter-no-sort",
        widthFixed: true,
        widgets: ['zebra']
    });

    var data = {"OkPercent": 98.36779107725789, "KoPercent": 1.632208922742111};
    var dataset = [
        {
            "label" : "KO",
            "data" : data.KoPercent,
            "color" : "#FF6347"
        },
        {
            "label" : "OK",
            "data" : data.OkPercent,
            "color" : "#9ACD32"
        }];
    $.plot($("#flot-requests-summary"), dataset, {
        series : {
            pie : {
                show : true,
                radius : 1,
                label : {
                    show : true,
                    radius : 3 / 4,
                    formatter : function(label, series) {
                        return '<div style="font-size:8pt;text-align:center;padding:2px;color:white;">'
                            + label
                            + '<br/>'
                            + Math.round10(series.percent, -2)
                            + '%</div>';
                    },
                    background : {
                        opacity : 0.5,
                        color : '#000'
                    }
                }
            }
        },
        legend : {
            show : true
        }
    });

    // Creates APDEX table
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.26722887196227785, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [0.6378531073446327, 500, 1500, "Post PROB UNREMOVE"], "isController": false}, {"data": [0.07973251028806584, 500, 1500, "Post PROB"], "isController": false}, {"data": [0.35208098987626546, 500, 1500, "Delete PROB"], "isController": false}, {"data": [0.41097424412094063, 500, 1500, "Get PROB ID"], "isController": false}, {"data": [0.0808, 500, 1500, "Get PROB list"], "isController": false}]}, function(index, item){
        switch(index){
            case 0:
                item = item.toFixed(3);
                break;
            case 1:
            case 2:
                item = formatDuration(item);
                break;
        }
        return item;
    }, [[0, 0]], 3);

    // Create statistics table
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 5514, 90, 1.632208922742111, 4451.713456655791, 0, 37737, 15355.5, 29579.75, 35917.85, 13.940471103987218, 10960.099240174484, 4.330362235929959], "isController": false}, "titles": ["Label", "#Samples", "KO", "Error %", "Average", "Min", "Max", "90th pct", "95th pct", "99th pct", "Throughput", "Received", "Sent"], "items": [{"data": ["Post PROB UNREMOVE", 885, 20, 2.2598870056497176, 623.8531073446326, 0, 1446, 981.0, 1082.1, 1228.3599999999997, 2.2573536163570136, 0.6784789350328527, 0.4778568316511585], "isController": false}, {"data": ["Post PROB", 972, 17, 1.7489711934156378, 18327.698559670764, 0, 37737, 34862.0, 35959.7, 36851.35, 2.4630292218652126, 4.396268412537123, 2.2261663675513637], "isController": false}, {"data": ["Delete PROB", 889, 17, 1.9122609673790776, 1293.141732283463, 0, 2904, 1886.0, 2066.0, 2413.8, 2.264466220226345, 0.6731539362612619, 0.4664571165117541], "isController": false}, {"data": ["Get PROB ID", 893, 11, 1.2318029115341544, 1193.5039193728994, 0, 2633, 1739.8000000000002, 1880.9999999999995, 2317.18, 2.2718773135368777, 2.5593302954712556, 0.41945278254088997], "isController": false}, {"data": ["Get PROB list", 1875, 25, 1.3333333333333333, 2114.513599999998, 0, 4218, 2942.8, 3159.0, 3601.6000000000004, 4.74352098280695, 10959.115931119173, 0.756329714870116], "isController": false}]}, function(index, item){
        switch(index){
            // Errors pct
            case 3:
                item = item.toFixed(2) + '%';
                break;
            // Mean
            case 4:
            // Mean
            case 7:
            // Percentile 1
            case 8:
            // Percentile 2
            case 9:
            // Percentile 3
            case 10:
            // Throughput
            case 11:
            // Kbytes/s
            case 12:
            // Sent Kbytes/s
                item = item.toFixed(2);
                break;
        }
        return item;
    }, [[0, 0]], 0, summaryTableHeader);

    // Create error table
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 11, 12.222222222222221, 0.19949220166848022], "isController": false}, {"data": ["Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 5, 5.555555555555555, 0.09067827348567284], "isController": false}, {"data": ["500/Internal Server Error", 17, 18.88888888888889, 0.30830612985128764], "isController": false}, {"data": ["Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 57, 63.333333333333336, 1.0337323177366704], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 5514, 90, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 57, "500/Internal Server Error", 17, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 11, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 5, null, null], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": ["Post PROB UNREMOVE", 885, 20, "500/Internal Server Error", 10, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 7, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 2, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 1, null, null], "isController": false}, {"data": ["Post PROB", 972, 17, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 10, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 5, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 2, null, null, null, null], "isController": false}, {"data": ["Delete PROB", 889, 17, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 8, "500/Internal Server Error", 7, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 2, null, null, null, null], "isController": false}, {"data": ["Get PROB ID", 893, 11, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 11, null, null, null, null, null, null, null, null], "isController": false}, {"data": ["Get PROB list", 1875, 25, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 21, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 3, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 1, null, null, null, null], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
