function chart(div_id, chart_data){
    var container = document.getElementById(div_id);

    var chart_id = div_id;
    container.innerHTML = "<canvas id='" + chart_id + "_chart' class='chart_canvas'></canvas>"
        + "<canvas id='" + chart_id + "_scroll' class='chart_canvas,chart_scroll'></canvas>"
        + "<div id='" + chart_id + "_legend' class='chart_legend'></div>";

    var legend_div = document.getElementById(chart_id + "_legend");
    for (var i in chart_data.columns){
        var chart_column_id = chart_data.columns[i][0];
        if (chart_data.types[chart_column_id] == "x"){
            continue;
        }
        var chart_column_name = chart_data.names[chart_column_id];
        var chart_column_color = chart_data.colors[chart_column_id];
        legend_div.innerHTML += "<label class='chart_legend_checkbox' style='--main-bg-color:" + chart_column_color + ";'>" + chart_column_name
            + "<input type='checkbox' checked='checked'>"
            + "<span class='chart_legend_checkbox_customized'></span>"
            + "</label>";
    }
}
