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

    var data = {"OkPercent": 88.79624804585721, "KoPercent": 11.203751954142783};
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
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.2807017543859649, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [0.3576233183856502, 500, 1500, "Get VITALS ID"], "isController": false}, {"data": [0.5463609172482552, 500, 1500, "Delete ALLERGY"], "isController": false}, {"data": [0.3271954674220963, 500, 1500, "Post ALLERGY"], "isController": false}, {"data": [0.43602693602693604, 500, 1500, "Delete VITALS"], "isController": false}, {"data": [0.0016198704103671706, 500, 1500, "Get VITALS list"], "isController": false}, {"data": [0.012677484787018255, 500, 1500, "Post VITALS"], "isController": false}]}, function(index, item){
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
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 5757, 645, 11.203751954142783, 11554.829772450961, 0, 115550, 38751.599999999984, 84813.59999999999, 112026.2, 11.156306500966027, 6873.20421512649, 3.431532880292076], "isController": false}, "titles": ["Label", "#Samples", "KO", "Error %", "Average", "Min", "Max", "90th pct", "95th pct", "99th pct", "Throughput", "Received", "Sent"], "items": [{"data": ["Get VITALS ID", 892, 40, 4.484304932735426, 1371.8206278026917, 0, 4552, 2570.300000000022, 3672.7999999999975, 4355.6799999999985, 1.807929758280602, 1.2073179510247638, 0.3101282956208374], "isController": false}, {"data": ["Delete ALLERGY", 1003, 73, 7.278165503489531, 832.9032901296108, 0, 4552, 1292.0000000000002, 1666.5999999999995, 3650.440000000008, 2.024111751956507, 0.8085217621022913, 0.38305649577418743], "isController": false}, {"data": ["Post ALLERGY", 1059, 61, 5.760151085930123, 1870.6836638338068, 0, 8298, 4381.0, 6156.0, 7953.200000000004, 2.1234019345214223, 0.838935031971335, 1.6278404448416772], "isController": false}, {"data": ["Delete VITALS", 891, 11, 1.2345679012345678, 1379.5780022446686, 0, 4962, 3577.8000000000006, 4232.0, 4577.200000000002, 1.8029721723082899, 1.104412937539459, 0.31889690884366956], "isController": false}, {"data": ["Get VITALS list", 926, 218, 23.542116630669547, 6745.809935205187, 0, 25031, 16042.800000000001, 16740.4, 24900.11, 1.798079200922729, 6880.703276776647, 0.2201785360606143], "isController": false}, {"data": ["Post VITALS", 986, 242, 24.543610547667342, 55786.21805273831, 0, 115550, 107910.10000000003, 112624.95, 114962.6, 1.9129621617636503, 2.5319488386903384, 0.6695701024967454], "isController": false}]}, function(index, item){
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
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 389, 60.310077519379846, 6.756991488622546], "isController": false}, {"data": ["Non HTTP response code: org.apache.http.ConnectionClosedException/Non HTTP response message: Premature end of Content-Length delimited message body (expected: 5282236; received: 932263", 1, 0.15503875968992248, 0.01737015806843842], "isController": false}, {"data": ["Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 28, 4.341085271317829, 0.4863644259162758], "isController": false}, {"data": ["Non HTTP response code: org.apache.http.ConnectionClosedException/Non HTTP response message: Premature end of Content-Length delimited message body (expected: 5281250; received: 4180795", 1, 0.15503875968992248, 0.01737015806843842], "isController": false}, {"data": ["Non HTTP response code: org.apache.http.ConnectionClosedException/Non HTTP response message: Premature end of Content-Length delimited message body (expected: 5282236; received: 637403", 1, 0.15503875968992248, 0.01737015806843842], "isController": false}, {"data": ["Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 225, 34.883720930232556, 3.908285565398645], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 5757, 645, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 389, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 225, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 28, "Non HTTP response code: org.apache.http.ConnectionClosedException/Non HTTP response message: Premature end of Content-Length delimited message body (expected: 5282236; received: 932263", 1, "Non HTTP response code: org.apache.http.ConnectionClosedException/Non HTTP response message: Premature end of Content-Length delimited message body (expected: 5281250; received: 4180795", 1], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": ["Get VITALS ID", 892, 40, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 39, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 1, null, null, null, null, null, null], "isController": false}, {"data": ["Delete ALLERGY", 1003, 73, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 33, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 21, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 19, null, null, null, null], "isController": false}, {"data": ["Post ALLERGY", 1059, 61, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 57, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 4, null, null, null, null, null, null], "isController": false}, {"data": ["Delete VITALS", 891, 11, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 7, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 2, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 2, null, null, null, null], "isController": false}, {"data": ["Get VITALS list", 926, 218, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 107, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 107, "Non HTTP response code: org.apache.http.ConnectionClosedException/Non HTTP response message: Premature end of Content-Length delimited message body (expected: 5282236; received: 932263", 1, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 1, "Non HTTP response code: org.apache.http.ConnectionClosedException/Non HTTP response message: Premature end of Content-Length delimited message body (expected: 5281250; received: 4180795", 1], "isController": false}, {"data": ["Post VITALS", 986, 242, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: localhost:8888 failed to respond", 203, "Non HTTP response code: java.net.ConnectException/Non HTTP response message: Connection refused (Connection refused)", 35, "Non HTTP response code: java.net.SocketException/Non HTTP response message: Connection reset", 4, null, null, null, null], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
