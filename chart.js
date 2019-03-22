function chart_create(chart_id, container){
    container.innerHTML = "<canvas id='" + chart_id + "_chart' class='chart_canvas'></canvas>"
        + "<canvas id='" + chart_id + "_scroll' class='chart_scroll'></canvas>"
        + "<div id='" + chart_id + "_legend' class='chart_legend'></div>";
}

function chart_column_foreach(chart_data, callback){
    for (const i in chart_data.columns){
        const column_id = chart_data.columns[i][0];
        if (chart_data.types[column_id] == "x"){
            continue;
        }
        callback(column_id, chart_data.columns[i]);
    }
}

function chart_legend_create(chart_id, chart_data){
    const legend_div = document.getElementById(chart_id + "_legend");
    chart_column_foreach(chart_data, function(column_id){
        const column_name = chart_data.names[column_id];
        const column_color = chart_data.colors[column_id];
        legend_div.innerHTML += "<label class='chart_legend_checkbox' style='--main-bg-color:" + column_color + ";'>" + column_name
            + "<input type='checkbox' checked='checked'>"
            + "<span class='chart_legend_checkbox_customized'></span>"
            + "</label>";
    });
}

const chart_vs_src = `
    attribute highp float a_x;
    attribute highp float a_y;
    uniform mat4 u_proj;
    uniform mat4 u_view;
    void main(void){
        gl_Position = vec4(a_x, a_y, 0.0, 1.0) * u_proj * u_view;
    }
`;

const chart_fs_src = `
    uniform lowp vec4 u_color;
    void main(void){
        gl_FragColor = u_color;
    }
`;

function chart_shader_init(gl, type, src){
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        throw gl.getShaderInfoLog(shader);
    }
    return shader;
}

function chart_program_init(gl){
    const vs = chart_shader_init(gl, gl.VERTEX_SHADER, chart_vs_src);
    const fs = chart_shader_init(gl, gl.FRAGMENT_SHADER, chart_fs_src);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)){
        throw gl.getProgramInfoLog(program);
    }
    return program;
}

function chart_color_css2rgbaf(css_color, alpha){
    return [parseInt(css_color.slice(1,3), 16) * 1.0 / 255, parseInt(css_color.slice(3,5), 16) * 1.0 / 255, parseInt(css_color.slice(5,7), 16) * 1.0 / 255, alpha];
}

function chart_proj_ortho(left, right, bottom, top){
    return [2.0/(right-left), 0.0, 0.0, -(right+left)/(right-left),
        0.0, 2.0/(top-bottom), 0.0, -(top+bottom)/(top-bottom),
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0];
}

function chart_max(arr, offset, accessor){
    if (!offset){
        offset = 0;
    }
    if (!accessor){
        accessor = function(x){return x;};
    }
    let max = null;
    for (const i in arr){
        if (--offset >= 0){
            continue;
        }
        if (max == null || max < accessor(arr[i])){
            max = accessor(arr[i]);
        }
    }
    return max;
}

function chart_gl_init(gl, chart_data){
    const gl_data = {};

    gl_data.count = chart_data.columns[0].length - 1;

    const program = chart_program_init(gl);
    gl.useProgram(program);

    const x_loc = gl.getAttribLocation(program, 'a_x');
    gl_data.y_loc = gl.getAttribLocation(program, 'a_y');
    gl_data.proj_loc = gl.getUniformLocation(program, 'u_proj');
    gl_data.view_loc = gl.getUniformLocation(program, 'u_view');
    gl_data.color_loc = gl.getUniformLocation(program, 'u_color');

    gl.enableVertexAttribArray(x_loc);
    gl.enableVertexAttribArray(gl_data.y_loc);

    const x_data = new Float32Array(gl_data.count);
    for (let i = 0; i < gl_data.count; ++i){
        x_data[i] = i;
    }
    const x_buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, x_buf);
    gl.bufferData(gl.ARRAY_BUFFER, x_data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(x_loc, 1, gl.FLOAT, false, 0, 0);

    gl_data.columns = {};
    chart_column_foreach(chart_data, function(column_id, column_data){
        const gl_column_data = gl_data.columns[column_id] = {};
        gl_column_data.color = new Float32Array(chart_color_css2rgbaf(chart_data.colors[column_id], 1.0));
        gl_column_data.y_buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gl_column_data.y_buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(column_data), gl.STATIC_DRAW);
        gl_column_data.y_max = chart_max(column_data, 1);
    });
    gl_data.y_max = chart_max(gl_data.columns, 0, function(v){return v.y_max;});

    const identity_data = new Float32Array([
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0
    ]);
    gl.uniformMatrix4fv(gl_data.proj_loc, false, identity_data);
    gl.uniformMatrix4fv(gl_data.view_loc, false, identity_data);

    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    return gl_data;
}

function chart_gl_draw(gl, gl_data){
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(gl_data.proj_loc, false, new Float32Array(chart_proj_ortho(0, gl_data.count, 0, gl_data.y_max)));
    for (const i in gl_data.columns){
        gl.bindBuffer(gl.ARRAY_BUFFER, gl_data.columns[i].y_buf);
        gl.vertexAttribPointer(gl_data.y_loc, 1, gl.FLOAT, false, 0, 4 /* skip the 1st element */);
        gl.uniform4fv(gl_data.color_loc, gl_data.columns[i].color);
        gl.drawArrays(gl.LINE_STRIP, 0, gl_data.count);
    }
}

function chart_chart_create(chart_id, chart_data){
    const chart_canvas = document.getElementById(chart_id + "_chart");
    const chart_gl = chart_canvas.getContext("webgl");
    const chart_gl_data = chart_gl_init(chart_gl, chart_data);
    chart_canvas.width = chart_canvas.clientWidth;
    chart_canvas.height = chart_canvas.clientHeight;
    chart_gl.viewport(0, 0, chart_canvas.width, chart_canvas.height);
    chart_gl_draw(chart_gl, chart_gl_data);
}

function chart_scroll_create(chart_id, chart_data){
    const scroll_canvas = document.getElementById(chart_id + "_scroll");
    const scroll_gl = scroll_canvas.getContext("webgl");
    const scroll_gl_data = chart_gl_init(scroll_gl, chart_data);
    scroll_canvas.width = scroll_canvas.clientWidth;
    scroll_canvas.height = scroll_canvas.clientHeight;
    scroll_gl.viewport(0, 0, scroll_canvas.clientWidth, scroll_canvas.clientHeight);
    chart_gl_draw(scroll_gl, scroll_gl_data);
}

function chart(div_id, chart_data){
    const container = document.getElementById(div_id);
    chart_create(div_id, container);
    chart_legend_create(div_id, chart_data);
    chart_chart_create(div_id, chart_data);
    chart_scroll_create(div_id, chart_data);
    console.log(chart_data); // DEBUG
    console.log(container); // DEBUG
}
